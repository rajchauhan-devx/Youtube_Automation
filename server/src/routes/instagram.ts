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
  INSTAGRAM_REDIRECT_URI,
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

export const instagramRouter = Router();

function getApiKey(req: import('express').Request): string {
  return req.get('x-api-key') || process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY || '';
}

function igAccounts(connection: Awaited<ReturnType<typeof fetchMetaConnection>>) {
  return connection.pages
    .filter((p) => p.instagram_business_account?.id)
    .map((p) => ({
      id: p.instagram_business_account!.id,
      username: p.instagram_business_account!.username || '',
      pageId: p.id,
      pageName: p.name,
      hasPageToken: !!p.access_token,
    }));
}

// --- Connection status (mirrors /api/youtube/status) ---
instagramRouter.get('/status', async (_req, res) => {
  const { accountId } = currentWorkspace();
  try {
    const configured = !!storedMetaCredentials(accountId);
    const tokens = storedMetaTokens(accountId);
    if (!configured || !tokens) {
      res.json({ accountId, configured, authenticated: false, accounts: [], account: null, user: null });
      return;
    }
    const load = async () => {
      const connection = await fetchMetaConnection(tokens.access_token);
      bindMetaChannel(accountId, connection);
      const accounts = igAccounts(connection);
      return { connection, accounts };
    };
    try {
      const { connection, accounts } = await load();
      res.json({
        accountId, configured, authenticated: accounts.length > 0,
        user: connection.profile, accounts,
        account: accounts[0] || null,
        message: accounts.length ? undefined : 'Connected, but no Instagram Business/Creator account is linked to your Pages.',
      });
    } catch (err) {
      if (await refreshLongLivedToken(accountId)) {
        const retry = storedMetaTokens(accountId)!;
        const connection = await fetchMetaConnection(retry.access_token);
        bindMetaChannel(accountId, connection);
        const accounts = igAccounts(connection);
        res.json({ accountId, configured, authenticated: accounts.length > 0, user: connection.profile, accounts, account: accounts[0] || null });
        return;
      }
      throw err;
    }
  } catch (error) {
    res.json({
      accountId,
      configured: !!storedMetaCredentials(accountId),
      authenticated: false,
      accounts: [],
      account: null,
      user: null,
      message: error instanceof Error ? error.message : 'Reconnect this Instagram account.',
    });
  }
});

instagramRouter.get('/accounts', async (_req, res) => {
  const { accountId } = currentWorkspace();
  const tokens = storedMetaTokens(accountId);
  if (!tokens) { res.status(401).json({ error: 'Instagram account not connected.' }); return; }
  try {
    const connection = await fetchMetaConnection(tokens.access_token);
    res.json({ accounts: igAccounts(connection) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Could not list Instagram accounts' });
  }
});

// --- Start Facebook Login for Instagram (same OAuth app, IG scopes included) ---
instagramRouter.get('/auth-url', (req, res) => {
  const scope = currentWorkspace();
  if (!storedMetaCredentials(scope.accountId)) {
    res.status(400).json({ error: 'Configure Facebook App ID and Secret first.' });
    return;
  }
  if (req.hostname !== new URL(INSTAGRAM_REDIRECT_URI).hostname) {
    res.status(400).json({
      error: `Open the app using ${new URL(INSTAGRAM_REDIRECT_URI).hostname} so the secure sign-in cookie matches your OAuth redirect host.`,
    });
    return;
  }
  const issued = issueMetaOAuthState(scope, 'instagram');
  res.cookie(issued.cookie, issued.nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: INSTAGRAM_REDIRECT_URI.startsWith('https:'),
    path: '/api',
    maxAge: 10 * 60_000,
  });
  res.json({ url: metaAuthUrl(scope.accountId, 'instagram', issued.state), accountId: scope.accountId, callbackOrigin: META_OAUTH_ORIGIN });
});

instagramRouter.post('/credentials', (req, res) => {
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

instagramRouter.get('/callback', async (req, res) => {
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
    const tokens = await exchangeMetaCode(scope.accountId, 'instagram', req.query.code);
    if (metaConnectionRevision(scope.accountId) !== scope.revision) throw new Error('Account configuration changed. Connect again.');
    invalidateMetaConnection(scope.accountId);
    const connection = await fetchMetaConnection(tokens.access_token);
    bindMetaChannel(scope.accountId, connection);
    saveMetaTokens(scope.accountId, tokens);
    const message = JSON.stringify({ type: 'instagram-connected', accountId: scope.accountId });
    res.send(`<!doctype html><html><head><title>Instagram connected</title></head><body style="font-family:system-ui;padding:48px;background:#111;color:white"><h1>Instagram account connected</h1><p>Return to TubeFlow. This connection is saved to the account you selected.</p><button onclick="window.close()">Close window</button><script>if(window.opener)window.opener.postMessage(${message},${JSON.stringify(META_APP_ORIGIN)});window.close();</script></body></html>`);
  } catch (error) {
    res.status(400).type('text').send(error instanceof Error ? error.message : 'Could not connect account');
  }
});

instagramRouter.post('/disconnect', (_req, res) => {
  const { accountId } = currentWorkspace();
  invalidateMetaConnection(accountId);
  // Facebook + Instagram share one Facebook Login token; disconnecting clears both.
  fs.rmSync(metaTokenPath(accountId), { force: true });
  res.json({ success: true });
});

// --- AI metadata for Instagram (mirrors /api/youtube/generate-metadata) ---
instagramRouter.post('/generate-metadata', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    if (!apiKey) { res.status(401).json({ error: 'Missing Gemini API key' }); return; }
    const { topic = '', script = '', narration = '', isShort = true, field = 'all' } = req.body || {};
    const context = narration || script || topic;
    let prompt = '';
    if (field === 'title') {
      prompt = `You are an Instagram Reels strategist. Generate 3 punchy Reel cover titles/hooks (under 60 chars each).\nTopic: ${topic}\nContext: ${context}\nReturn ONLY valid JSON: {"titles": ["Hook 1", "Hook 2", "Hook 3"]}`;
    } else if (field === 'description') {
      prompt = `You are an Instagram caption expert. Write a Reel caption (hook first line, value, CTA like "Save + Follow", 8-12 hashtags) for ${isShort ? 'a vertical reel' : 'a video'}.\nTopic: ${topic}\nContext: ${context}\nReturn ONLY valid JSON: {"description": "Full caption text..."}`;
    } else if (field === 'tags') {
      prompt = `You are an Instagram hashtag expert. Generate 12-18 high-reach hashtags (without # prefix).\nTopic: ${topic}\nContext: ${context}\nReturn ONLY valid JSON: {"tags": ["tag1", "tag2"]}`;
    } else {
      prompt = `You are a world-class Instagram Reels strategist.\nTopic: ${topic}\nContext: ${context}\nGenerate:\n1. "titles": 3 punchy cover hooks.\n2. "description": full Reel caption with hook, value, CTA and 8-12 hashtags.\n3. "tags": 12-18 hashtag keywords.\nReturn ONLY valid JSON: {"titles": [...], "description": "...", "tags": [...]}`;
    }
    const result = await chat(apiKey, {
      model: 'gemini-3.6-flash',
      temperature: 0.8,
      messages: [
        { role: 'system', content: 'You are an elite Instagram growth specialist. Respond ONLY with valid JSON without markdown code blocks.' },
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
    console.error('Instagram metadata generation error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate Instagram metadata' });
  }
});

interface GraphErrorBody { error?: { message?: string }; success?: boolean }

async function graphApiError(res: Response, data: GraphErrorBody, fallback: string): Promise<never> {
  throw new Error(data?.error?.message || `${fallback} (HTTP ${res.status})`);
}

async function pollContainerReady(containerId: string, token: string, tries = 20): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const data = (await res.json().catch(() => ({}))) as GraphErrorBody & { status_code?: string; status?: string };
    if (!res.ok || data?.error) throw new Error(data?.error?.message || 'Could not check Reel upload status');
    const code = String(data.status_code || data.status || '').toUpperCase();
    if (code === 'FINISHED') return;
    if (code === 'ERROR' || code === 'EXPIRED') throw new Error('Instagram could not process this video. Try a shorter MP4 under 90 seconds.');
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Instagram is still processing the video. Wait a minute, then publish from the Instagram app.');
}

// --- Publish rendered MP4 as an Instagram Reel (mirrors /api/youtube/upload) ---
instagramRouter.post('/upload', async (req, res) => {
  try {
    const { accountId } = currentWorkspace();
    const tokens = storedMetaTokens(accountId);
    if (!tokens) {
      res.status(401).json({ error: 'Instagram account not authenticated. Please connect your Instagram account first.' });
      return;
    }
    const { scriptId, videoFilename, caption = '', description = '', tags = [], igUserId } = req.body || {};
    const captionText = typeof caption === 'string' && caption ? caption : typeof description === 'string' ? description : '';

    if (!safeSegment(scriptId) || typeof captionText !== 'string' ||
        !safeSegment(videoFilename) || !videoFilename.endsWith('.mp4') || videoFilename.endsWith('.partial.mp4')) {
      res.status(400).json({ error: 'A script, caption and completed MP4 filename are required.' });
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
    const accounts = igAccounts(connection);
    if (!accounts.length) {
      res.status(400).json({
        error: 'No Instagram Business/Creator account found. Link Instagram to a Facebook Page in Meta Business settings, then reconnect.',
      });
      return;
    }
    const target = (typeof igUserId === 'string' && igUserId ? accounts.find((a) => a.id === igUserId) : accounts[0]) || accounts[0];
    const pageToken = connection.pages.find((p) => p.id === target.pageId)?.access_token || tokens.access_token;

    const tagText = Array.isArray(tags) ? tags.map((t: string) => String(t).trim()).filter(Boolean).slice(0, 18).map((t) => `#${t.replace(/\s+/g, '')}`).join(' ') : '';
    const fullCaption = [captionText.slice(0, 2000), tagText].filter(Boolean).join('\n\n').slice(0, 2200);
    console.log(`Starting Instagram Reel upload from ${videoPath} to IG user ${target.id}`);

    // 1. Create a resumable Reel container.
    const initParams = new URLSearchParams({
      media_type: 'REELS',
      caption: fullCaption,
      upload_type: 'resumable',
      access_token: pageToken,
    });
    const initRes = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${target.id}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: initParams.toString(),
    });
    const initData = (await initRes.json().catch(() => ({}))) as GraphErrorBody & { id?: string };
    if (!initRes.ok || initData?.error || !initData?.id) await graphApiError(initRes, initData, 'Instagram upload init failed');
    const containerId = String(initData.id);

    // 2. Upload the MP4 bytes in one chunk (renders are single files well under the resumable limit).
    const buffer = fs.readFileSync(videoPath);
    const uploadRes = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${containerId}?access_token=${encodeURIComponent(pageToken)}`, {
      method: 'POST',
      headers: {
        offset: '0',
        file_offset: '0',
        file_size: String(buffer.length),
        'Content-Type': 'application/octet-stream',
      },
      body: new Uint8Array(buffer) as unknown as BodyInit,
    });
    const uploadData = (await uploadRes.json().catch(() => ({}))) as GraphErrorBody;
    if (!uploadRes.ok || uploadData?.error || uploadData?.success === false) {
      await graphApiError(uploadRes, uploadData, 'Instagram video upload failed');
    }

    // 3. Wait until Meta finishes transcoding, then publish.
    await pollContainerReady(containerId, pageToken);
    const publishParams = new URLSearchParams({ creation_id: containerId, access_token: pageToken });
    const publishRes = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${target.id}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: publishParams.toString(),
    });
    const publishData = (await publishRes.json().catch(() => ({}))) as GraphErrorBody & { id?: string };
    if (!publishRes.ok || publishData?.error || !publishData?.id) {
      await graphApiError(publishRes, publishData, 'Instagram publish failed');
    }
    const mediaId = String(publishData.id);

    let mediaUrl = `https://www.instagram.com/reel/${mediaId}`;
    try {
      const metaRes = await fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(pageToken)}`
      );
      const meta = (await metaRes.json().catch(() => ({}))) as { permalink?: string };
      if (metaRes.ok && typeof meta?.permalink === 'string' && meta.permalink) mediaUrl = meta.permalink;
    } catch { /* keep fallback URL */ }

    console.log(`Instagram Reel published! Media ID: ${mediaId}`);
    atomicJson(path.join(outputScriptDir, `instagram_upload_${mediaId}.json`), {
      accountId, igUserId: target.id, profile: currentWorkspace().profile,
      mediaId, videoFilename, uploadedAt: new Date().toISOString(),
    });
    res.json({
      accountId, igUserId: target.id, username: target.username,
      success: true, mediaId, videoUrl: mediaUrl, caption: fullCaption,
      uploadedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Instagram upload failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Instagram upload failed' });
  }
});
