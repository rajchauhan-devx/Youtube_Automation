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
  if (/ancient dharma/.test(name)) return 'Ancient Dharma: sacred epic stories and character dialogues from the Ramayana, Mahabharata and Puranas told through living multi-character conversation, emotional confrontation and spiritual wisdom. Strictly pure story and character dialogue, never engineering, metallurgy, or science documentaries.';
  if (/against the odds/.test(name)) return 'Against the Odds: factual stories of survival, resilience, extraordinary comebacks and people overcoming adversity. Verify names, dates and outcomes.';
  if (/talvora|talevora|suspense|thriller/.test(name)) return 'Talevora: cinematic high-stakes suspense thrillers and nocturnal mystery dramas. Center every story on a sharp, charismatic adult heroine (mid-20s, striking looks, razor-sharp intelligence, confident posture, signature elegant dark blazer/tailored jacket) opposite intense adult counterparts (e.g. tactical operative, investigative partner, or formidable adversary). Build the drama on REAL STORY SUBSTANCE: high-stakes secrets, undercover operations, betrayals, corporate conspiracies, dangerous confrontations, and sudden psychological twists. STRICT CHARACTER CONSISTENCY: Every scene must lock and maintain the exact same facial structure, signature hair, and wardrobe continuity for both the heroine and her counterpart across all cuts. NATURAL CRISP PACING: Dialogue delivery must be brisk, natural, and energetic (1.04x speed) — keep each spoken turn concise (under 12-15 words) with urgent, authentic Hindi conversational flow; characters must NEVER speak slowly or take dragging pauses. STRICT LIP-SYNC MANDATE: Every video scene must provide explicit speech framing: "The character speaks clearly in an authentic Hindi voice with strict frame-by-frame lip-sync matching the spoken Hindi dialogue: \\"[exact spoken Hindi line]\\". Natural mouth and jaw movements in sync with the spoken Hindi words, clean vocal dialogue audio, ambient room tone, no background music." ZERO NARRATOR & FULL VIDEO MANDATE: Strictly NO narrator (सूत्रधार). Every scene is 100% full video (<video_prompt>) with characters speaking directly to each other in dramatic tension ([नताशा], [विक्रम], etc.). Every episode needs a gripping hook, escalating danger, a shocking revelation, and a next-episode cliffhanger.';
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
