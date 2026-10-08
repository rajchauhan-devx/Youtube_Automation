import { Router } from 'express';
import fs from 'node:fs';
import { atomicJson, getAccount, tokenPath } from '../services/accounts.js';
import { currentWorkspace } from '../services/workspace.js';
import { APP_ORIGIN, OAUTH_ORIGIN, bindChannel, connectionRevision, consumeOAuthState, createOAuth2Client, credentialInfo, credentialsPath, invalidateConnection, issueOAuthState, REDIRECT_URI, storedCredentials, verifyChannel } from '../services/youtube-auth.js';
import { fetchAccountStudioOverview, fetchAllAccountsStudioDashboard } from '../services/youtube-studio.js';

export const youtubeAuthRouter = Router();
youtubeAuthRouter.get('/status', async (_req, res) => {
  const { accountId } = currentWorkspace();
  try {
    const configured = !!storedCredentials(accountId);
    const client = createOAuth2Client(accountId);
    if (!configured || !client || !fs.existsSync(tokenPath(accountId))) {
      res.json({ accountId, configured, authenticated: false, channel: null }); return;
    }
    const channel = await verifyChannel(client, accountId);
    bindChannel(accountId, channel.id!, channel.snippet?.title || 'YouTube Channel');
    res.json({
      accountId,
      configured,
      authenticated: true,
      channel: {
        id: channel.id,
        title: channel.snippet?.title,
        customUrl: channel.snippet?.customUrl,
        avatar: channel.snippet?.thumbnails?.default?.url,
        subscriberCount: channel.statistics?.subscriberCount,
        videoCount: channel.statistics?.videoCount,
        viewCount: channel.statistics?.viewCount,
      },
    });
  } catch (error) {
    res.json({ accountId, configured: true, authenticated: false, channel: null, message: error instanceof Error ? error.message : 'Reconnect this YouTube account.' });
  }
});

youtubeAuthRouter.get('/studio', async (req, res) => {
  const { accountId } = currentWorkspace();
  const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
  try {
    const overview = await fetchAccountStudioOverview(accountId, { forceRefresh });
    res.json(overview);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Could not load YouTube Studio analytics' });
  }
});

youtubeAuthRouter.get('/dashboard', async (req, res) => {
  const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
  try {
    const dashboard = await fetchAllAccountsStudioDashboard({ forceRefresh });
    res.json(dashboard);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Could not load multi-account YouTube Studio dashboard' });
  }
});

youtubeAuthRouter.get('/auth-url', (req, res) => {
  const scope = currentWorkspace();
  const client = createOAuth2Client(scope.accountId, false);
  if (!client) { res.status(400).json({ error: 'Configure Google OAuth Client ID and Secret first.' }); return; }
  if (req.hostname !== new URL(REDIRECT_URI).hostname) {
    res.status(400).json({ error: `Open the app using ${new URL(REDIRECT_URI).hostname} so the secure sign-in cookie matches your OAuth redirect host.` }); return;
  }
  const issued = issueOAuthState(scope);
  res.cookie(issued.cookie, issued.nonce, { httpOnly: true, sameSite: 'lax', secure: REDIRECT_URI.startsWith('https:'), path: '/api', maxAge: 10 * 60_000 });
  const url = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent select_account', scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'], state: issued.state });
  res.json({ url, accountId: scope.accountId, callbackOrigin: OAUTH_ORIGIN });
});

youtubeAuthRouter.post('/credentials', (req, res) => {
  const { clientId, clientSecret } = req.body || {};
  if (typeof clientId !== 'string' || !clientId.trim() || typeof clientSecret !== 'string' || !clientSecret.trim()) {
    res.status(400).json({ error: 'Client ID and Secret are required' }); return;
  }
  if (clientId.trim().length > 200 || clientSecret.trim().length > 200) {
    res.status(400).json({ error: 'Client ID or Secret looks too long. Paste the values from Google Cloud Console.' }); return;
  }
  const { accountId } = currentWorkspace();
  if (fs.existsSync(tokenPath(accountId))) { res.status(409).json({ error: 'Disconnect this account before changing its OAuth configuration.' }); return; }
  invalidateConnection(accountId);
  atomicJson(credentialsPath(accountId), { installed: { client_id: clientId.trim(), client_secret: clientSecret.trim(), redirect_uris: [REDIRECT_URI] } });
  res.json({ success: true });
});

youtubeAuthRouter.get('/credentials', (_req, res) => {
  const { accountId } = currentWorkspace();
  res.json({ accountId, ...credentialInfo(accountId) });
});

youtubeAuthRouter.delete('/credentials', (_req, res) => {
  const { accountId } = currentWorkspace();
  if (fs.existsSync(tokenPath(accountId))) { res.status(409).json({ error: 'Disconnect this account before removing its OAuth configuration.' }); return; }
  const info = credentialInfo(accountId);
  if (info.hasOwnFile) {
    invalidateConnection(accountId);
    fs.rmSync(credentialsPath(accountId), { force: true });
    res.json({ success: true }); return;
  }
  if (info.source === 'env') { res.status(400).json({ error: 'This account uses YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET from server/.env. Clear the env vars and restart the backend to remove it.' }); return; }
  if (info.source === 'shared') { res.status(400).json({ error: accountId === 'default' ? 'No OAuth app file found.' : 'This account inherits the shared OAuth app. Configure its own app to override, or clear the default account’s app.' }); return; }
  res.status(404).json({ error: 'No OAuth configuration saved for this account.' });
});

youtubeAuthRouter.get('/callback', async (req, res) => {
  const scope = consumeOAuthState(req.query.state, req.get('cookie'));
  if (!scope) { res.status(400).send('This connection request is invalid or expired. Start again from the account you want to connect.'); return; }
  res.clearCookie(`yt_oauth_${req.query.state}`, { path: '/api' });
  if (req.query.error || typeof req.query.code !== 'string') { res.status(400).send('Google authorization was cancelled. You can close this window.'); return; }
  try {
    const client = createOAuth2Client(scope.accountId, false);
    if (!client || !getAccount(scope.accountId)) throw new Error('Account configuration is unavailable');
    const { tokens } = await client.getToken(req.query.code);
    client.setCredentials(tokens);
    const channel = await verifyChannel(client, scope.accountId);
    if (connectionRevision(scope.accountId) !== scope.revision) throw new Error('Account configuration changed. Connect again.');
    // Avoid accidentally retaining a different Google user's old refresh token.
    if (!tokens.refresh_token) throw new Error('Google did not return offline access. Reconnect with consent before using automation.');
    invalidateConnection(scope.accountId);
    bindChannel(scope.accountId, channel.id!, channel.snippet?.title || 'YouTube Channel');
    const credentials = storedCredentials(scope.accountId)!;
    atomicJson(credentialsPath(scope.accountId), { installed: { client_id: credentials.clientId, client_secret: credentials.clientSecret } });
    atomicJson(tokenPath(scope.accountId), tokens);
    const message = JSON.stringify({ type: 'youtube-connected', accountId: scope.accountId });
    res.send(`<!doctype html><html><head><title>YouTube connected</title></head><body style="font-family:system-ui;padding:48px;background:#111;color:white"><h1>YouTube account connected</h1><p>Return to TubeFlow. This connection is saved to the account you selected.</p><button onclick="window.close()">Close window</button><script>if(window.opener)window.opener.postMessage(${message},${JSON.stringify(APP_ORIGIN)});window.close();</script></body></html>`);
  } catch (error) { res.status(400).type('text').send(error instanceof Error ? error.message : 'Could not connect account'); }
});

youtubeAuthRouter.post('/disconnect', (_req, res) => {
  const { accountId } = currentWorkspace();
  invalidateConnection(accountId);
  fs.rmSync(tokenPath(accountId), { force: true });
  res.json({ success: true });
});
