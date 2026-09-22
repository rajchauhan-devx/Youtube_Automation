import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { google } from 'googleapis';
import { ROOT_DATA, accountDir, currentWorkspace, type Workspace } from './workspace.js';
import { atomicJson, getAccount, tokenPath, updateAccount } from './accounts.js';

export const REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3001/api/youtube/callback';
export const OAUTH_ORIGIN = new URL(REDIRECT_URI).origin;
export const APP_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
export const CLIENT_SECRET_PATH = path.join(ROOT_DATA, 'client_secret.json');
export function credentialsPath(accountId: string) { return accountId === 'default' ? CLIENT_SECRET_PATH : path.join(accountDir(accountId), 'client_secret.json'); }
export function storedCredentials(accountId: string) {
  const ownFile = credentialsPath(accountId);
  // One Google OAuth application may connect many channels; channel tokens are never shared.
  const file = fs.existsSync(ownFile) ? ownFile : CLIENT_SECRET_PATH;
  if (fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const value = raw.web || raw.installed || raw;
    if (value.client_id && value.client_secret) return { clientId: String(value.client_id), clientSecret: String(value.client_secret) };
  }
  if (process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET) return { clientId: process.env.YOUTUBE_CLIENT_ID, clientSecret: process.env.YOUTUBE_CLIENT_SECRET };
  return null;
}

const revisions = new Map<string, number>();
export function invalidateConnection(id: string) { revisions.set(id, (revisions.get(id) || 0) + 1); }
export function connectionRevision(id: string) { return revisions.get(id) || 0; }
export function createOAuth2Client(accountId = currentWorkspace().accountId, loadTokens = true) {
  if (!getAccount(accountId)) throw new Error('Unknown YouTube account');
  const credentials = storedCredentials(accountId);
  if (!credentials) return null;
  const client = new google.auth.OAuth2(credentials.clientId, credentials.clientSecret, REDIRECT_URI);
  const file = tokenPath(accountId);
  const revision = connectionRevision(accountId);
  if (loadTokens && fs.existsSync(file)) {
    client.setCredentials(JSON.parse(fs.readFileSync(file, 'utf8')));
    client.on('tokens', tokens => {
      if (connectionRevision(accountId) !== revision || !fs.existsSync(file)) return;
      const current = JSON.parse(fs.readFileSync(file, 'utf8'));
      atomicJson(file, { ...current, ...tokens });
    });
  }
  return client;
}

type PendingOAuth = Workspace & { nonce: string; expires: number; revision: number };
const pending = new Map<string, PendingOAuth>();
export function issueOAuthState(scope: Workspace) {
  for (const [key, entry] of pending) if (entry.expires < Date.now()) pending.delete(key);
  if (pending.size >= 100) throw new Error('Too many pending connections. Try again later.');
  const state = crypto.randomBytes(24).toString('hex');
  const nonce = crypto.randomBytes(24).toString('hex');
  pending.set(state, { ...scope, nonce, expires: Date.now() + 10 * 60_000, revision: connectionRevision(scope.accountId) });
  return { state, nonce, cookie: `yt_oauth_${state}` };
}
export function consumeOAuthState(state: unknown, cookieHeader: string | undefined) {
  if (typeof state !== 'string' || !/^[a-f0-9]{48}$/.test(state)) return null;
  const entry = pending.get(state);
  const cookies = Object.fromEntries((cookieHeader || '').split(';').map(part => part.trim().split('=')));
  if (!entry || entry.expires < Date.now() || entry.nonce !== cookies[`yt_oauth_${state}`] || connectionRevision(entry.accountId) !== entry.revision) return null;
  pending.delete(state);
  return entry;
}

export async function verifyChannel(client: NonNullable<ReturnType<typeof createOAuth2Client>>, accountId: string) {
  const response = await google.youtube({ version: 'v3', auth: client }).channels.list({ part: ['snippet', 'statistics'], mine: true });
  const channels = response.data.items || [];
  if (channels.length !== 1 || !channels[0].id) throw new Error('Choose a single YouTube channel during Google sign-in.');
  const channel = channels[0];
  const account = getAccount(accountId);
  if (!account) throw new Error('Account not found');
  if (account.youtubeChannelId && account.youtubeChannelId !== channel.id) throw new Error('This workspace belongs to a different YouTube channel. Add a separate account for this channel.');
  return channel;
}
export function bindChannel(accountId: string, id: string, title: string) {
  updateAccount(accountId, { youtubeChannelId: id, youtubeChannelTitle: title });
}
