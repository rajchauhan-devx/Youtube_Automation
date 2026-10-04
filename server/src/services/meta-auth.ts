import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT_DATA, accountDir, type Workspace } from './workspace.js';
import { atomicJson, getAccount, updateAccount } from './accounts.js';

export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';
export const META_APP_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
export const FACEBOOK_REDIRECT_URI =
  process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3001/api/facebook/callback';
export const INSTAGRAM_REDIRECT_URI =
  process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:3001/api/instagram/callback';
export const META_OAUTH_ORIGIN = new URL(FACEBOOK_REDIRECT_URI).origin;

export const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
];

export const META_CLIENT_FILE = path.join(ROOT_DATA, 'meta_client.json');
export function metaCredentialsPath(accountId: string) {
  return accountId === 'default' ? META_CLIENT_FILE : path.join(accountDir(accountId), 'meta_client.json');
}
export function metaTokenPath(accountId: string) {
  return accountId === 'default'
    ? path.join(ROOT_DATA, 'meta-token.json')
    : path.join(accountDir(accountId), 'meta-token.json');
}

export interface MetaCredentials { appId: string; appSecret: string }

export function storedMetaCredentials(accountId: string): MetaCredentials | null {
  const ownFile = metaCredentialsPath(accountId);
  const file = fs.existsSync(ownFile) ? ownFile : META_CLIENT_FILE;
  if (fs.existsSync(file)) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const value = raw.installed || raw.web || raw;
      const appId = value.app_id || value.client_id || value.appId;
      const appSecret = value.app_secret || value.client_secret || value.appSecret;
      if (appId && appSecret) return { appId: String(appId), appSecret: String(appSecret) };
    } catch { /* corrupt file counts as unconfigured */ }
  }
  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    return { appId: process.env.FACEBOOK_APP_ID, appSecret: process.env.FACEBOOK_APP_SECRET };
  }
  return null;
}

export interface MetaTokens {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  obtained_at: string;
}

export function storedMetaTokens(accountId: string): MetaTokens | null {
  const file = metaTokenPath(accountId);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw && typeof raw.access_token === 'string' && raw.access_token) return raw as MetaTokens;
  } catch { /* treat as missing */ }
  return null;
}

export function saveMetaTokens(accountId: string, tokens: MetaTokens) {
  atomicJson(metaTokenPath(accountId), tokens);
}

const revisions = new Map<string, number>();
export function invalidateMetaConnection(id: string) { revisions.set(id, (revisions.get(id) || 0) + 1); }
export function metaConnectionRevision(id: string) { return revisions.get(id) || 0; }

type PendingMetaOAuth = Workspace & {
  nonce: string;
  expires: number;
  revision: number;
  platform: 'facebook' | 'instagram';
};
const pending = new Map<string, PendingMetaOAuth>();

export function issueMetaOAuthState(scope: Workspace, platform: 'facebook' | 'instagram') {
  for (const [key, entry] of pending) if (entry.expires < Date.now()) pending.delete(key);
  if (pending.size >= 100) throw new Error('Too many pending connections. Try again later.');
  const state = crypto.randomBytes(24).toString('hex');
  const nonce = crypto.randomBytes(24).toString('hex');
  pending.set(state, { ...scope, nonce, expires: Date.now() + 10 * 60_000, revision: metaConnectionRevision(scope.accountId), platform });
  return { state, nonce, cookie: `meta_oauth_${state}` };
}

export function consumeMetaOAuthState(state: unknown, cookieHeader: string | undefined) {
  if (typeof state !== 'string' || !/^[a-f0-9]{48}$/.test(state)) return null;
  const entry = pending.get(state);
  const cookies = Object.fromEntries((cookieHeader || '').split(';').map(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return [part.trim(), ''];
    return [part.slice(0, idx).trim(), part.slice(idx + 1).trim()];
  }));
  if (!entry || entry.expires < Date.now() || entry.nonce !== cookies[`meta_oauth_${state}`] ||
      metaConnectionRevision(entry.accountId) !== entry.revision) return null;
  pending.delete(state);
  return entry;
}

export function metaAuthUrl(accountId: string, platform: 'facebook' | 'instagram', state: string): string {
  const creds = storedMetaCredentials(accountId);
  if (!creds) throw new Error('Configure Facebook App ID and Secret first.');
  const redirect = platform === 'facebook' ? FACEBOOK_REDIRECT_URI : INSTAGRAM_REDIRECT_URI;
  const params = new URLSearchParams({
    client_id: creds.appId,
    redirect_uri: redirect,
    state,
    scope: META_SCOPES.join(','),
    response_type: 'code',
    auth_type: 'rerequest',
  });
  return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

async function graphGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    const msg = data?.error?.message || `Meta Graph API error (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export async function exchangeMetaCode(accountId: string, platform: 'facebook' | 'instagram', code: string): Promise<MetaTokens> {
  const creds = storedMetaCredentials(accountId);
  if (!creds) throw new Error('Meta app credentials are not configured.');
  const redirect = platform === 'facebook' ? FACEBOOK_REDIRECT_URI : INSTAGRAM_REDIRECT_URI;
  const shortUrl =
    `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token` +
    `?client_id=${encodeURIComponent(creds.appId)}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&client_secret=${encodeURIComponent(creds.appSecret)}` +
    `&code=${encodeURIComponent(code)}`;
  const short = await graphGet<{ access_token: string }>(shortUrl);
  if (!short.access_token) throw new Error('Facebook did not return an access token.');
  // Exchange for a long-lived (~60 day) user token so uploads keep working.
  const longUrl =
    `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(creds.appId)}` +
    `&client_secret=${encodeURIComponent(creds.appSecret)}` +
    `&fb_exchange_token=${encodeURIComponent(short.access_token)}`;
  try {
    const long = await graphGet<{ access_token: string; token_type?: string; expires_in?: number }>(longUrl);
    return { access_token: long.access_token, token_type: long.token_type, expires_in: long.expires_in, obtained_at: new Date().toISOString() };
  } catch {
    // Fall back to the short-lived token if the exchange fails (e.g. test apps).
    return { access_token: short.access_token, obtained_at: new Date().toISOString() };
  }
}

export interface MetaPageInfo {
  id: string;
  name: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string };
}
export interface MetaProfile {
  id: string;
  name: string;
}
export interface MetaConnection {
  profile: MetaProfile;
  pages: MetaPageInfo[];
}

export async function fetchMetaConnection(userToken: string): Promise<MetaConnection> {
  const profile = await graphGet<MetaProfile>(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/me?fields=id,name&access_token=${encodeURIComponent(userToken)}`
  );
  let pages: MetaPageInfo[] = [];
  try {
    const data = await graphGet<{ data?: MetaPageInfo[] }>(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=50&access_token=${encodeURIComponent(userToken)}`
    );
    pages = Array.isArray(data.data) ? data.data : [];
  } catch (err) {
    // Missing pages permission surfaces here; keep profile but report no pages.
    if (!(err instanceof Error) || !/permission|authorized|scope/i.test(err.message)) throw err;
  }
  return { profile, pages };
}

export async function verifyMetaConnection(accountId: string): Promise<MetaConnection> {
  const tokens = storedMetaTokens(accountId);
  if (!tokens) throw new Error('Meta account not authenticated. Connect Facebook first.');
  const connection = await fetchMetaConnection(tokens.access_token);
  const account = getAccount(accountId);
  if (!account) throw new Error('Account not found');
  const firstPage = connection.pages[0];
  updateAccount(accountId, {
    facebookPageId: firstPage?.id,
    facebookPageName: firstPage?.name,
    instagramUserId: firstPage?.instagram_business_account?.id,
    instagramUsername: firstPage?.instagram_business_account?.username,
  });
  return connection;
}

export function bindMetaChannel(accountId: string, connection: MetaConnection) {
  const firstPage = connection.pages[0];
  updateAccount(accountId, {
    facebookPageId: firstPage?.id,
    facebookPageName: firstPage?.name || connection.profile.name,
    instagramUserId: firstPage?.instagram_business_account?.id,
    instagramUsername: firstPage?.instagram_business_account?.username,
  });
}

export async function refreshLongLivedToken(accountId: string): Promise<boolean> {
  const creds = storedMetaCredentials(accountId);
  const tokens = storedMetaTokens(accountId);
  if (!creds || !tokens) return false;
  try {
    const url =
      `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token` +
      `?grant_type=fb_exchange_token&client_id=${encodeURIComponent(creds.appId)}` +
      `&client_secret=${encodeURIComponent(creds.appSecret)}` +
      `&fb_exchange_token=${encodeURIComponent(tokens.access_token)}`;
    const data = await graphGet<{ access_token: string; expires_in?: number }>(url);
    saveMetaTokens(accountId, { ...tokens, access_token: data.access_token, expires_in: data.expires_in, obtained_at: new Date().toISOString() });
    return true;
  } catch {
    return false;
  }
}
