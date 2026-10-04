import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { atomicJson, getAccount } from '../services/accounts.js';
import { currentWorkspace, outputDir } from '../services/workspace.js';
import { safeSegment, containedFile } from '../services/paths.js';
import { store } from '../services/store.js';
import { isCurrentRender } from '../services/render-revision.js';
import { chat } from '../services/gemini.js';
import {
  FACEBOOK_REDIRECT_URI,
  META_APP_ORIGIN,
  META_GRAPH_VERSION,
  META_OAUTH_ORIGIN,
  bindMetaChannel,
  consumeMetaOAuthState,
  exchangeMetaCode,
  fetchMetaConnection,
  invalidateMetaConnection,
  issueMetaOAuthState,
  metaAuthUrl,
  metaConnectionRevision,
  metaCredentialsPath,
  metaTokenPath,
  refreshLongLivedToken,
  saveMetaTokens,
  storedMetaCredentials,
  storedMetaTokens,
} from '../services/meta-auth.js';

export const facebookRouter = Router();

function getApiKey(req: import('express').Request): string {
  return req.get('x-api-key') || process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY || '';
}

// --- Connection status (mirrors /api/youtube/status) ---
facebookRouter.get('/status', async (_req, res) => {
  const { accountId } = currentWorkspace();
  try {
    const configured = !!storedMetaCredentials(accountId);
    const tokens = storedMetaTokens(accountId);
    if (!configured || !tokens) {
      res.json({ accountId, configured, authenticated: false, pages: [], page: null, user: null });
      return;
    }
    try {
      const connection = await fetchMetaConnection(tokens.access_token);
      bindMetaChannel(accountId, connection);
      const pages = connection.pages.map((p) => ({
        id: p.id,
        name: p.name,
        hasInstagram: !!p.instagram_business_account,
        instagramUsername: p.instagram_business_account?.username,
      }));
      const first = connection.pages[0];
      res.json({
        accountId,
        configured,
        authenticated: true,
        user: connection.profile,
        pages,
        page: first ? { id: first.id, name: first.name } : null,
      });
    } catch (err) {
      // Try refreshing an expired long-lived token once before reporting failure.
      if (await refreshLongLivedToken(accountId)) {
        const retryTokens = storedMetaTokens(accountId)!;
        const connection = await fetchMetaConnection(retryTokens.access_token);
        bindMetaChannel(accountId, connection);
        const pages = connection.pages.map((p) => ({
          id: p.id,
          name: p.name,
          hasInstagram: !!p.instagram_business_account,
          instagramUsername: p.instagram_business_account?.username,
        }));
        const first = connection.pages[0];
        res.json({ accountId, configured, authenticated: true, user: connection.profile, pages, page: first ? { id: first.id, name: first.name } : null });
        return;
      }
      throw err;
    }
  } catch (error) {
    res.json({
      accountId,
      configured: !!storedMetaCredentials(accountId),
      authenticated: false,
      pages: [],
      page: null,
      user: null,
      message: error instanceof Error ? error.message : 'Reconnect this Facebook account.',
    });
  }
});

facebookRouter.get('/pages', async (_req, res) => {
  const { accountId } = currentWorkspace();
  const tokens = storedMetaTokens(accountId);
  if (!tokens) { res.status(401).json({ error: 'Facebook account not connected.' }); return; }
  try {
    const connection = await fetchMetaConnection(tokens.access_token);
    res.json({
      pages: connection.pages.map((p) => ({
        id: p.id,
        name: p.name,
        hasInstagram: !!p.instagram_business_account,
        instagramUsername: p.instagram_business_account?.username,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Could not list Pages' });
  }
});

// --- Start Facebook Login (mirrors /api/youtube/auth-url) ---
facebookRouter.get('/auth-url', (req, res) => {
  const scope = currentWorkspace();
  if (!storedMetaCredentials(scope.accountId)) {
    res.status(400).json({ error: 'Configure Facebook App ID and Secret first.' });
    return;
  }
  if (req.hostname !== new URL(FACEBOOK_REDIRECT_URI).hostname) {
    res.status(400).json({
      error: `Open the app using ${new URL(FACEBOOK_REDIRECT_URI).hostname} so the secure sign-in cookie matches your OAuth redirect host.`,
    });
    return;
  }
  const issued = issueMetaOAuthState(scope, 'facebook');
  res.cookie(issued.cookie, issued.nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: FACEBOOK_REDIRECT_URI.startsWith('https:'),
    path: '/api',
    maxAge: 10 * 60_000,
  });
  res.json({ url: metaAuthUrl(scope.accountId, 'facebook', issued.state), accountId: scope.accountId, callbackOrigin: META_OAUTH_ORIGIN });
});

// --- Save Meta app credentials (mirrors /api/youtube/credentials) ---
facebookRouter.post('/credentials', (req, res) => {
  const { appId, appSecret, clientId, clientSecret } = req.body || {};
  const id = typeof appId === 'string' ? appId.trim() : typeof clientId === 'string' ? clientId.trim() : '';
  const secret = typeof appSecret === 'string' ? appSecret.trim() : typeof clientSecret === 'string' ? clientSecret.trim() : '';
  if (!id || !secret) { res.status(400).json({ error: 'App ID and App Secret are required' }); return; }
  const { accountId } = currentWorkspace();
  if (storedMetaTokens(accountId)) {
    res.status(409).json({ error: 'Disconnect this account before changing its Meta app configuration.' });
    return;
  }
  invalidateMetaConnection(accountId);
  atomicJson(metaCredentialsPath(accountId), { installed: { app_id: id, app_secret: secret } });
  res.json({ success: true });
});

// --- OAuth callback (mirrors /api/youtube/callback) ---
facebookRouter.get('/callback', async (req, res) => {
  const scope = consumeMetaOAuthState(req.query.state, req.get('cookie'));
  if (!scope) {
    res.status(400).send('This connection request is invalid or expired. Start again from the account you want to connect.');
    return;
  }
  res.clearCookie(`meta_oauth_${req.query.state}`, { path: '/api' });
  if (req.query.error || typeof req.query.code !== 'string') {
    res.status(400).send('Facebook authorization was cancelled. You can close this window.');
    return;
  }
  try {
    if (!getAccount(scope.accountId)) throw new Error('Account configuration is unavailable');
    const tokens = await exchangeMetaCode(scope.accountId, 'facebook', req.query.code);
    if (metaConnectionRevision(scope.accountId) !== scope.revision) throw new Error('Account configuration changed. Connect again.');
    invalidateMetaConnection(scope.accountId);
    const connection = await fetchMetaConnection(tokens.access_token);
    bindMetaChannel(scope.accountId, connection);
    saveMetaTokens(scope.accountId, tokens);
    const message = JSON.stringify({ type: 'facebook-connected', accountId: scope.accountId });
    res.send(`<!doctype html><html><head><title>Facebook connected</title></head><body style="font-family:system-ui;padding:48px;background:#111;color:white"><h1>Facebook account connected</h1><p>Return to TubeFlow. This connection is saved to the account you selected.</p><button onclick="window.close()">Close window</button><script>if(window.opener)window.opener.postMessage(${message},${JSON.stringify(META_APP_ORIGIN)});window.close();</script></body></html>`);
  } catch (error) {
    res.status(400).type('text').send(error instanceof Error ? error.message : 'Could not connect account');
  }
});

facebookRouter.post('/disconnect', (_req, res) => {
  const { accountId } = currentWorkspace();
  invalidateMetaConnection(accountId);
  // Facebook + Instagram share one Facebook Login token; disconnecting clears both.
  fs.rmSync(metaTokenPath(accountId), { force: true });
  res.json({ success: true });
});

// --- AI metadata for Facebook (mirrors /api/youtube/generate-metadata) ---
facebookRouter.post('/generate-metadata', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    if (!apiKey) { res.status(401).json({ error: 'Missing Gemini API key' }); return; }
    const { topic = '', script = '', narration = '', isShort = true, field = 'all' } = req.body || {};
    const context = narration || script || topic;
    let prompt = '';
    if (field === 'title') {
      prompt = `You are a Facebook growth strategist. Generate 3 scroll-stopping Facebook video titles (under 80 chars each).\nTopic: ${topic}\nContext: ${context}\nReturn ONLY valid JSON: {"titles": ["Title 1", "Title 2", "Title 3"]}`;
    } else if (field === 'description') {
      prompt = `You are a Facebook engagement specialist. Write a warm, conversational Facebook feed post (hook line, 2-4 short paragraphs, soft CTA, 3-5 hashtags) for ${isShort ? 'a vertical short video' : 'a video'}.\nTopic: ${topic}\nContext: ${context}\nReturn ONLY valid JSON: {"description": "Full post text..."}`;
    } else if (field === 'tags') {
      prompt = `You are a Facebook SEO expert. Generate 8-12 Facebook hashtag keywords (without # prefix needed, lowercase ok).\nTopic: ${topic}\nContext: ${context}\nReturn ONLY valid JSON: {"tags": ["tag1", "tag2"]}`;
    } else {
      prompt = `You are a world-class Facebook video strategist.\nTopic: ${topic}\nContext: ${context}\nGenerate:\n1. "titles": 3 scroll-stopping Facebook video titles.\n2. "description": engaging feed post with hook, short paragraphs, CTA and 3-5 hashtags.\n3. "tags": 8-12 hashtag keywords.\nReturn ONLY valid JSON: {"titles": [...], "description": "...", "tags": [...]}`;
    }
    const result = await chat(apiKey, {
      model: 'gemini-3.6-flash',
      temperature: 0.8,
      messages: [
        { role: 'system', content: 'You are an elite Facebook growth specialist. Respond ONLY with valid JSON without markdown code blocks.' },
        { role: 'user', content: prompt },
      ],
    });
    let raw = result.choices?.[0]?.message?.content || '{}';
    raw = raw.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(raw);
    res.json({
      titles: Array.isArray(parsed.titles) ? parsed.titles : parsed.title ? [parsed.title] : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      tags: Array.isArray(parsed.tags) ? parsed.tags : undefined,
    });
  } catch (err) {
    console.error('Facebook metadata generation error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate Facebook metadata' });
  }
});

// --- Upload rendered MP4 to a Facebook Page (mirrors /api/youtube/upload) ---
facebookRouter.post('/upload', async (req, res) => {
  try {
    const { accountId } = currentWorkspace();
    const tokens = storedMetaTokens(accountId);
    if (!tokens) {
      res.status(401).json({ error: 'Facebook account not authenticated. Please connect your Facebook account first.' });
      return;
    }
    const {
      scriptId,
      videoFilename,
      title = '',
      description = '',
      tags = [],
      pageId,
    } = req.body || {};

    if (!safeSegment(scriptId) || typeof title !== 'string' || !title.trim() ||
        typeof description !== 'string' || !safeSegment(videoFilename) ||
        !videoFilename.endsWith('.mp4') || videoFilename.endsWith('.partial.mp4')) {
      res.status(400).json({ error: 'A script, title and completed MP4 filename are required.' });
      return;
    }
    if (!store.getById('scripts', scriptId)) {
      res.status(404).json({ error: 'Script not found in this account and video profile' });
      return;
    }
    const outputScriptDir = containedFile(outputDir(), scriptId);
    const videoPath = containedFile(outputScriptDir, videoFilename);
    if (!fs.existsSync(videoPath)) {
      res.status(404).json({ error: 'The selected render does not exist in this workspace. Render the video first.' });
      return;
    }
    if (!isCurrentRender(scriptId, videoPath)) {
      res.status(409).json({ error: 'The scene map, images or narration changed. Render the current video before uploading.' });
      return;
    }

    const connection = await fetchMetaConnection(tokens.access_token);
    if (!connection.pages.length) {
      res.status(400).json({ error: 'No Facebook Pages found. Create a Page and grant pages_manage_posts, then reconnect.' });
      return;
    }
    const page = (typeof pageId === 'string' && pageId ? connection.pages.find((p) => p.id === pageId) : connection.pages[0]) || connection.pages[0];
    const pageToken = page.access_token;
    if (!pageToken) {
      res.status(401).json({ error: 'Missing Page access token. Reconnect Facebook and approve pages_manage_posts.' });
      return;
    }

    const tagText = Array.isArray(tags) ? tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 12).map((t) => `#${t.replace(/\s+/g, '')}`).join(' ') : '';
    const fullDescription = [description.slice(0, 4500), tagText].filter(Boolean).join('\n\n');
    console.log(`Starting Facebook upload: "${title}" from ${videoPath} to Page ${page.id}`);

    const buffer = fs.readFileSync(videoPath);
    const form = new FormData();
    form.append('title', title.slice(0, 255));
    form.append('description', fullDescription);
    form.append('access_token', pageToken);
    form.append('source', new Blob([new Uint8Array(buffer)], { type: 'video/mp4' }), videoFilename);

    const uploadRes = await fetch(`https://graph-video.facebook.com/${META_GRAPH_VERSION}/${page.id}/videos`, { method: 'POST', body: form });
    const uploadData = (await uploadRes.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!uploadRes.ok || uploadData?.error || !uploadData?.id) {
      throw new Error(uploadData?.error?.message || `Facebook upload failed (HTTP ${uploadRes.status})`);
    }
    const videoId = String(uploadData.id);
    const videoUrl = `https://www.facebook.com/${page.id}/videos/${videoId}`;
    console.log(`Facebook upload successful! Video ID: ${videoId}`);

    atomicJson(path.join(outputScriptDir, `facebook_upload_${videoId}.json`), {
      accountId, pageId: page.id, profile: currentWorkspace().profile,
      videoId, videoFilename, uploadedAt: new Date().toISOString(),
    });
    res.json({ accountId, pageId: page.id, pageName: page.name, success: true, videoId, videoUrl, title, uploadedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Facebook upload failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Facebook upload failed' });
  }
});
