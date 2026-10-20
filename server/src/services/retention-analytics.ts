import fs from 'node:fs';
import { google } from 'googleapis';
import { createOAuth2Client, verifyChannel } from './youtube-auth.js';
import { tokenPath } from './accounts.js';
import { currentWorkspace } from './workspace.js';
import { syncTopicNotes, updateTopicMemory, type TopicEntry } from './topic-notes.js';
import type { RetentionPerformance } from './retention-types.js';

export interface PerformanceSync {
  status: 'updated' | 'empty' | 'pending' | 'needs_connection' | 'unavailable';
  updated: number;
  message: string;
}

export function youtubeReportDate(value: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function reportRows(report: { columnHeaders?: { name?: string | null }[] | null; rows?: unknown[][] | null }): Record<string, number>[] {
  const headers = report.columnHeaders?.map(column => column.name || '') || [];
  return (report.rows || []).map(row => Object.fromEntries(headers.map((name, i) => [name, Number(row[i])])));
}

export function performanceFromReports(entry: TopicEntry, summary: Parameters<typeof reportRows>[0], retention: Parameters<typeof reportRows>[0], startDate: string, endDate: string): RetentionPerformance {
  const aggregate = reportRows(summary)[0];
  if (aggregate && (!Number.isFinite(aggregate.views) || !Number.isFinite(aggregate.averageViewDuration) || !Number.isFinite(aggregate.averageViewPercentage))) throw new Error('YouTube returned incomplete watch-time metrics');
  const curve = reportRows(retention).filter(row => Number.isFinite(row.elapsedVideoTimeRatio) && row.elapsedVideoTimeRatio >= 0 && row.elapsedVideoTimeRatio <= 1
    && Number.isFinite(row.audienceWatchRatio) && row.audienceWatchRatio >= 0).map(row => ({
    elapsed: row.elapsedVideoTimeRatio, watchRatio: row.audienceWatchRatio,
    ...(Number.isFinite(row.relativeRetentionPerformance) ? { relativePerformance: row.relativeRetentionPerformance } : {}),
  })).sort((a, b) => a.elapsed - b.elapsed);
  const dips: RetentionPerformance['dips'] = [];
  for (let i = 1; i < curve.length; i++) {
    const drop = curve[i - 1].watchRatio - curve[i].watchRatio;
    if (drop < 0.08) continue;
    const second = curve[i].elapsed * (entry.production?.duration || 0);
    const scene = entry.production?.scenes.find(scene => second >= scene.start && second < scene.end);
    dips.push({ elapsed: curve[i].elapsed, drop: Math.round(drop * 10000) / 10000,
      ...(scene ? { sceneId: scene.sceneId, purpose: scene.purpose } : {}) });
  }
  return { status: aggregate && aggregate.views >= 100 && curve.length ? 'ready' : 'insufficient_data',
    fetchedAt: new Date().toISOString(), startDate, endDate, views: aggregate?.views || 0,
    averageViewDuration: aggregate?.averageViewDuration || 0, averageViewPercentage: aggregate?.averageViewPercentage || 0,
    curve, dips: dips.sort((a, b) => b.drop - a.drop).slice(0, 5) };
}

export async function syncRetentionPerformance(force = false, signal?: AbortSignal): Promise<PerformanceSync> {
  const { accountId } = currentWorkspace();
  const notes = syncTopicNotes(accountId);
  if (!notes.topics.length) return { status: 'empty', updated: 0, message: 'Performance memory will fill after videos are exported and YouTube has watch-time data.' };
  const client = createOAuth2Client(accountId);
  if (!client || !fs.existsSync(tokenPath(accountId))) return { status: 'needs_connection', updated: 0, message: 'Connect this profile to YouTube to import retention data.' };
  const pending = notes.topics.filter(entry => {
    const uploadedAt = Date.parse(entry.uploadedAt);
    if (!Number.isFinite(uploadedAt) || Date.now() - uploadedAt < 48 * 60 * 60 * 1000) return false;
    return force || !entry.performance || Date.now() - Date.parse(entry.performance.fetchedAt) > 24 * 60 * 60 * 1000;
  }).sort((a, b) => (a.performance?.fetchedAt || '').localeCompare(b.performance?.fetchedAt || '')).slice(0, 20);
  if (!pending.length) return { status: 'pending', updated: 0, message: 'Saved reports are current, or YouTube needs more time to process these uploads.' };
  let updated = 0;
  try {
    signal?.throwIfAborted();
    await verifyChannel(client, accountId);
    const analytics = google.youtubeAnalytics({ version: 'v2', auth: client });
    const endDate = youtubeReportDate(new Date());
    for (const entry of pending) {
      signal?.throwIfAborted();
      const startDate = youtubeReportDate(entry.uploadedAt);
      const base = { ids: 'channel==MINE', startDate, endDate, filters: `video==${entry.videoId}` };
      const summary = await analytics.reports.query({ ...base, metrics: 'views,averageViewDuration,averageViewPercentage' }, { signal, timeout: 20000 });
      const retention = await analytics.reports.query({ ...base, dimensions: 'elapsedVideoTimeRatio', metrics: 'audienceWatchRatio,relativeRetentionPerformance' }, { signal, timeout: 20000 });
      signal?.throwIfAborted();
      if (!summary.data.rows?.length && entry.performance?.status === 'ready') continue;
      updateTopicMemory(entry.videoId, { performance: performanceFromReports(entry, summary.data, retention.data, startDate, endDate) }, accountId);
      updated++;
    }
    return { status: 'updated', updated, message: `Updated watch-time and retention reports for ${updated} video${updated === 1 ? '' : 's'}.` };
  } catch (error) {
    signal?.throwIfAborted();
    const code = (error as { code?: number }).code;
    if (code === 401 || code === 403) return { status: 'needs_connection', updated,
      message: 'Reconnect this profile to grant YouTube Analytics read access. Also enable YouTube Analytics API in the Google Cloud project if it is disabled. Saved observations remain available.' };
    return { status: 'unavailable', updated, message: 'YouTube retention reports are unavailable right now. Saved observations remain available.' };
  }
}
