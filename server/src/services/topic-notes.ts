import fs from 'node:fs';
import path from 'node:path';
import { atomicJson, getAccount, listAccounts, type Account } from './accounts.js';
import { accountDir, currentWorkspace, ROOT_DATA, type VideoProfile } from './workspace.js';
import type { ProductionMemory, RetentionPerformance } from './retention-types.js';

export interface TopicEntry {
  topic: string;
  scriptId: string;
  profile: VideoProfile;
  videoId: string;
  videoUrl: string;
  uploadedAt: string;
  production?: ProductionMemory;
  performance?: RetentionPerformance;
}
export interface TopicNotes {
  accountId: string;
  name: string;
  guidance: string;
  topics: TopicEntry[];
}

function profileGuidance(account: Account): string {
  const name = `${account.name} ${account.youtubeChannelTitle || ''}`.toLowerCase();
  if (/ancient dharma/.test(name)) return 'Ancient Dharma: carefully researched Indian history, Hindu philosophy, dharma, ancient texts, mythology and spiritual wisdom. Clearly distinguish traditional stories from established historical facts.';
  if (/rule zero|zero rule/.test(name)) return 'Rule Zero — Every world has a rule. Someone always breaks it. Original fictional microdramas focused strictly around ONE single ordinary protagonist facing one impossible world rule. The Rule itself is the antagonist. Other characters exist only as emotional stakes or faceless bystanders. Follow the 5-beat structure: Physical Burden -> Ordinary Goal -> Dead End -> Rule-Breaking Choice -> Irreversible Payoff. Create standalone worlds unless prior canon is provided. Do not present fictional premises as historical facts.';
  if (/against the odds/.test(name)) return 'Against the Odds: factual stories of survival, resilience, extraordinary comebacks and people overcoming adversity. Verify names, dates and outcomes.';
  return `Create videos relevant to ${account.youtubeChannelTitle || account.name}, using the selected script template to understand the audience and niche.`;
}

export function topicNotesPath(accountId = currentWorkspace().accountId): string {
  return path.join(accountDir(accountId), 'topic-notes.json');
}

export function readTopicNotes(accountId = currentWorkspace().accountId): TopicNotes {
  const account = getAccount(accountId);
  if (!account) throw new Error('Profile not found');
  const file = topicNotesPath(accountId);
  if (!fs.existsSync(file)) {
    atomicJson(file, { accountId, name: account.youtubeChannelTitle || account.name, guidance: profileGuidance(account), topics: [] });
  }
  // Fail closed: unreadable notes must never silently permit repeated topics.
  const notes = JSON.parse(fs.readFileSync(file, 'utf8')) as TopicNotes;
  if (notes.accountId !== accountId || typeof notes.guidance !== 'string' || !Array.isArray(notes.topics) ||
      notes.topics.some(entry => typeof entry?.topic !== 'string' || !entry.topic.trim())) {
    throw new Error('Profile topic notes are invalid. Restore the notes before running Auto-Pilot.');
  }
  return notes;
}

export function initializeTopicNotes(): void {
  for (const account of listAccounts()) readTopicNotes(account.id);
}

export function recordUploadedTopic(entry: TopicEntry, accountId = currentWorkspace().accountId): void {
  if (!entry.topic.trim() || !entry.videoId) throw new Error('A topic and successful YouTube upload are required');
  const notes = readTopicNotes(accountId);
  const existing = notes.topics.find(topic => topic.videoId === entry.videoId);
  if (existing) {
    if (!existing.production && entry.production) { existing.production = entry.production; atomicJson(topicNotesPath(accountId), notes); }
    return;
  }
  notes.topics.push({ ...entry, topic: entry.topic.trim() });
  atomicJson(topicNotesPath(accountId), notes);
}

export function updateTopicMemory(videoId: string, patch: Pick<TopicEntry, 'production' | 'performance'>, accountId = currentWorkspace().accountId): void {
  const notes = readTopicNotes(accountId);
  const entry = notes.topics.find(entry => entry.videoId === videoId);
  if (!entry) throw new Error('Video not found in this profile’s upload history');
  Object.assign(entry, patch);
  atomicJson(topicNotesPath(accountId), notes);
}

/** Recover successful exports from every format, including exports made before notes existed. */
export function syncTopicNotes(accountId = currentWorkspace().accountId): TopicNotes {
  readTopicNotes(accountId);
  for (const profile of ['shorts', 'long', 'mixed'] as const) {
    const directory = accountId === 'default' && profile === 'shorts'
      ? ROOT_DATA : path.join(accountDir(accountId), 'profiles', profile);
    const scriptsFile = path.join(directory, 'scripts.json');
    const scripts = fs.existsSync(scriptsFile) ? JSON.parse(fs.readFileSync(scriptsFile, 'utf8')) : [];
    for (const script of scripts) {
      const uploaded = script.youtubeExport;
      if (script.topicName && uploaded?.uploadedVideoId) recordUploadedTopic({
        topic: script.topicName, scriptId: script.id, profile, videoId: uploaded.uploadedVideoId,
        videoUrl: uploaded.uploadedVideoUrl || `https://youtu.be/${uploaded.uploadedVideoId}`,
        uploadedAt: uploaded.uploadedAt || '',
        production: script.retentionProduction,
      }, accountId);
    }
    const output = path.join(directory, 'output');
    if (!fs.existsSync(output)) continue;
    for (const folder of fs.readdirSync(output, { withFileTypes: true }).filter(item => item.isDirectory() && !item.isSymbolicLink())) {
      const script = scripts.find((item: { id: string }) => item.id === folder.name);
      const folderPath = path.join(output, folder.name);
      for (const file of fs.readdirSync(folderPath).filter(name => /^upload_[\w-]+\.json$/.test(name))) {
        const upload = JSON.parse(fs.readFileSync(path.join(folderPath, file), 'utf8'));
        const topic = upload.topic || script?.topicName;
        if (topic && upload.videoId) recordUploadedTopic({
          topic, scriptId: folder.name, profile, videoId: upload.videoId,
          videoUrl: `https://youtu.be/${upload.videoId}`, uploadedAt: upload.uploadedAt || '',
          production: upload.production,
        }, accountId);
      }
    }
  }
  return readTopicNotes(accountId);
}

export function normalizeTopic(topic: string): string {
  return topic.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function repeatedTopic(topic: string, history: Pick<TopicEntry, 'topic'>[]): string | undefined {
  const normalized = normalizeTopic(topic);
  const tokens = new Set(normalized.split(' ').filter(Boolean));
  return history.find(entry => {
    const previous = normalizeTopic(entry.topic);
    if (normalized === previous) return true;
    const previousTokens = new Set(previous.split(' ').filter(Boolean));
    const intersection = [...tokens].filter(token => previousTokens.has(token)).length;
    return intersection >= 3 && intersection / Math.max(tokens.size, previousTokens.size) >= 0.8;
  })?.topic;
}
