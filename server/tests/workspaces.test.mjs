import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { google } from 'googleapis';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve('server/data');
const directory = fs.mkdtempSync(path.join(root, 'accounts-test-'));
process.env.TUBEFLOW_DATA_DIR = directory;
const ws = await import('../dist/services/workspace.js');
const accounts = await import('../dist/services/accounts.js');
const auth = await import('../dist/services/youtube-auth.js');
const { store } = await import('../dist/services/store.js');
const { resolveInputPath } = await import('../dist/services/video.js');
const { workspacesRouter } = await import('../dist/routes/workspaces.js');
const { accountsRouter } = await import('../dist/routes/accounts.js');
const { youtubeAuthRouter } = await import('../dist/routes/youtube-auth.js');
const originalYoutube = google.youtube;
const originalGetToken = google.auth.OAuth2.prototype.getToken;
const uploads = [];
google.auth.OAuth2.prototype.getToken = async function(code) {
  return { tokens: { access_token: code, refresh_token: `refresh-${code}` } };
};
google.youtube = ({ auth: client }) => ({
  channels: { list: async () => ({ data: { items: [{ id: client.credentials.access_token, snippet: { title: `Channel ${client.credentials.access_token}` } }] } }) },
  videos: { insert: async options => {
    const data = []; for await (const chunk of options.media.body) data.push(chunk);
    uploads.push({ account: client.credentials.access_token, bytes: Buffer.concat(data).toString(), privacy: options.requestBody.status.privacyStatus });
    return { data: { id: `video-${uploads.length}` } };
  } },
  thumbnails: { set: async () => ({}) },
});
accounts.atomicJson(auth.CLIENT_SECRET_PATH, { installed: { client_id: 'test-client', client_secret: 'test-secret' } });
accounts.atomicJson(accounts.tokenPath('default'), { access_token: 'legacy', refresh_token: 'legacy-refresh' });
const app = express(); app.use(express.json());
app.use('/api/accounts', accountsRouter);
app.use('/api/accounts/:accountId/profiles/:profile', workspacesRouter);
app.use('/api/youtube', youtubeAuthRouter);
const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
const base = `http://localhost:${server.address().port}`;
const scope = (id, profile = 'shorts') => `/api/accounts/${id}/profiles/${profile}`;
async function request(route, body, method = 'POST', headers = {}) {
  return fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Host: 'localhost', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const a = accounts.createAccount('English channel');
const b = accounts.createAccount('Hindi channel');

test('three accounts and both profiles isolate scripts, pipelines, media, and async work', async () => {
  const all = await (await request('/api/accounts', undefined, 'GET')).json();
  assert.equal(all.accounts.length, 3);
  const scopes = [{accountId:'default',profile:'shorts'}, {accountId:a.id,profile:'shorts'}, {accountId:a.id,profile:'long'}, {accountId:b.id,profile:'long'}];
  await Promise.all(scopes.map(async (workspace, index) => {
    const prefix = scope(workspace.accountId, workspace.profile);
    const response = await request(`${prefix}/scripts`, { id: 'same-id', name: `Script ${index}`, accountId: 'spoof', section: 'bad', prompts: [] });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).accountId, workspace.accountId);
    await request(`${prefix}/scripts/same-id/pipeline`, [{ marker: index }]);
    await ws.workspaceContext.run(workspace, async () => {
      await new Promise(resolve => setTimeout(resolve, 10 * (4-index)));
      assert.equal(store.getById('scripts','same-id').name, `Script ${index}`);
      assert.deepEqual(store.get('pipeline_same-id'), [{marker:index}]);
      const dir = path.join(ws.generatedDir(), 'same-id'); fs.mkdirSync(dir, {recursive:true});
      fs.writeFileSync(path.join(dir,'image.png'), `image-${index}`);
      const url = ws.mediaUrl('generate/file/same-id/image.png');
      assert.equal(await (await request(url, undefined, 'GET')).text(), `image-${index}`);
      assert.equal(resolveInputPath(url,'same-id'), path.join(dir,'image.png'));
      assert.throws(() => resolveInputPath(`${scope('wrong')}/generate/file/same-id/image.png`,'same-id'));
    });
  }));
  assert.ok(fs.existsSync(path.join(directory,'scripts.json')), 'legacy default storage stays in place');
  assert.equal((await request(`${scope(b.id)}/scripts/same-id`,undefined,'GET')).status,404);
  assert.equal((await request(`${scope('missing')}/scripts`,undefined,'GET')).status,404);
  assert.equal((await request(`${scope(a.id,'wrong')}/scripts`,undefined,'GET')).status,404);
  await request(`${scope(a.id)}/scripts/same-id`,undefined,'DELETE');
  assert.equal((await request(`${scope(a.id,'long')}/scripts/same-id`,undefined,'GET')).status,200);
});

test('OAuth connections bind to independent accounts with cookie/state protection and no default token fallback', async () => {
  assert.deepEqual(auth.createOAuth2Client(a.id).credentials, {});
  const pending = [];
  for (const account of [a,b]) {
    const response = await request(`${scope(account.id)}/youtube/auth-url`,undefined,'GET');
    assert.equal(response.status,200);
    const data = await response.json(); const url = new URL(data.url);
    assert.ok(url.searchParams.get('prompt').includes('select_account'));
    pending.push({ id:account.id, state:url.searchParams.get('state'), cookie:response.headers.get('set-cookie').split(';')[0] });
  }
  const [first,second] = pending;
  assert.equal((await request(`/api/youtube/callback?code=A&state=${first.state}`,undefined,'GET',{Cookie:second.cookie})).status,400);
  for (const [index,item] of pending.entries()) {
    const response = await request(`/api/youtube/callback?code=${index ? 'B':'A'}&state=${item.state}`,undefined,'GET',{Cookie:item.cookie});
    assert.equal(response.status,200,await response.text());
    assert.equal(auth.createOAuth2Client(item.id).credentials.access_token,index?'B':'A');
    assert.equal((await request(`/api/youtube/callback?code=wrong&state=${item.state}`,undefined,'GET',{Cookie:item.cookie})).status,400);
    assert.ok(fs.existsSync(auth.credentialsPath(item.id)));
  }
  assert.equal(auth.createOAuth2Client('default').credentials.access_token,'legacy');
  const status = await (await request(`${scope(a.id,'long')}/youtube/status`,undefined,'GET')).json();
  assert.equal(status.channel.id,'A');
});

test('uploads use exact scoped render and verify the channel before sending bytes', async () => {
  for (const account of [a,b]) ws.workspaceContext.run({accountId:account.id,profile:'long'}, () => {
    const dir = path.join(ws.outputDir(),'same-id'); fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(path.join(dir,'render.mp4'), account.id);
  });
  const payload = {scriptId:'same-id',videoFilename:'render.mp4',title:'Test'};
  assert.equal((await request(`${scope(a.id)}/youtube/upload`,payload)).status,404);
  assert.equal((await request(`${scope(a.id,'long')}/youtube/upload`,{...payload,videoFilename:'../render.mp4'})).status,400);
  assert.equal((await request(`${scope(a.id,'long')}/youtube/upload`,{...payload,videoFilename:undefined})).status,400);
  accounts.atomicJson(accounts.tokenPath(a.id), {access_token:'WRONG',refresh_token:'wrong'});
  assert.equal((await request(`${scope(a.id,'long')}/youtube/upload`,payload)).status,500);
  assert.equal(uploads.length,0);
  accounts.atomicJson(accounts.tokenPath(a.id), {access_token:'A',refresh_token:'a'});
  for (const account of [a,b]) {
    const response = await request(`${scope(account.id,'long')}/youtube/upload`,payload);
    assert.equal(response.status,200,await response.text());
    assert.equal(uploads.at(-1).bytes,account.id);
    assert.equal(uploads.at(-1).privacy,'private');
  }
  const oldClient = auth.createOAuth2Client(a.id);
  const pending = auth.issueOAuthState({accountId:a.id,profile:'long'});
  await request(`${scope(a.id)}/youtube/disconnect`,{});
  oldClient.emit('tokens',{access_token:'late-refresh'});
  assert.equal(fs.existsSync(accounts.tokenPath(a.id)),false);
  assert.equal(auth.consumeOAuthState(pending.state,`${pending.cookie}=${pending.nonce}`),null);
  assert.equal(auth.createOAuth2Client(b.id).credentials.access_token,'B');
  assert.equal(auth.createOAuth2Client('default').credentials.access_token,'legacy');
});

test('Long Video rejects portrait requests and renders 1080p landscape with scoped playback', async () => {
  const prefix = scope(b.id,'long');
  assert.equal((await request(`${prefix}/render/start`,{resolution:{width:1080,height:1920}})).status,400);
  let dir;
  ws.workspaceContext.run({accountId:b.id,profile:'long'}, () => {dir=path.join(ws.generatedDir(),'landscape'); fs.mkdirSync(dir,{recursive:true});});
  const ff = args => execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'pipe'});
  ff(['-f','lavfi','-i','color=c=blue:s=160x90','-frames:v','1',path.join(dir,'image.png')]);
  ff(['-f','lavfi','-i','sine=frequency=440:sample_rate=24000','-t','1',path.join(dir,'voice.wav')]);
  const { planHash } = await import('../dist/services/long-narration.js');
  ws.workspaceContext.run({accountId:b.id,profile:'long'}, () => {
    const scenePlan = { version:1, title:'Landscape', thumbnailPrompt:'Thumbnail', scenes:[{id:'scene1',chapter:'Chapter',role:'story',narration:'Test narration.',imagePrompt:'Blue image'}] };
    const sync = {version:1,timingMode:'narration',planHash:planHash(scenePlan),sampleRate:48000,totalSamples:48000,scenes:[{sceneId:'scene1',startSample:0,endSample:48000}],audioHash:createHash('sha256').update(fs.readFileSync(path.join(dir,'voice.wav'))).digest('hex')};
    fs.writeFileSync(path.join(dir,'voice.wav.sync.json'),JSON.stringify(sync));
    store.add('scripts',{id:'landscape',name:'Landscape',scenePlan,narration:'Test narration.',generatedAudio:[{filename:'voice.wav',url:ws.mediaUrl('generate/file/landscape/voice.wav'),sync}],generatedImages:[{index:0,status:'done',prompt:'Blue image',url:ws.mediaUrl('generate/file/landscape/image.png')}]});
  });
  const response = await request(`${prefix}/render/start`,{scriptId:'landscape',imagePaths:['image.png'],audioPath:'voice.wav',enableSfx:false,enableVignette:false,colorGrade:'none'});
  assert.equal(response.status,200,await response.text());
  let status;
  for (let attempt=0; attempt<120; attempt++) {
    status = await (await request(`${prefix}/render/status/landscape`,undefined,'GET')).json();
    if (status.videos?.length || status.status === 'error') break;
    await new Promise(resolve => setTimeout(resolve,250));
  }
  assert.ok(status.videos?.length,JSON.stringify(status));
  assert.equal(status.videos[0].resolution,'1920x1080');
  assert.ok(status.videos[0].url.startsWith(prefix));
  assert.equal((await request(status.videos[0].url,undefined,'GET')).status,200);
  const other = await (await request(`${scope(a.id,'long')}/render/status/landscape`,undefined,'GET')).json();
  assert.equal(other.videos.length,0);
});

test('clearing, rerunning, and deleting scripts remove only their own rendered videos', async () => {
  const id = 'reset-video';
  for (const profile of ['shorts', 'long']) {
    await request(`${scope(a.id, profile)}/scripts`, {
      id, name: 'Reset video', prompts: [], aiResponse: 'Old response',
      generatedImages: [{ filename: 'old.png' }], generatedAudio: [{ filename: 'old.wav' }],
      timelineConfig: { clips: [] }, sceneAnalysis: {}, youtubeExport: { uploadedVideoId: 'old' },
    });
    ws.workspaceContext.run({ accountId: a.id, profile }, () => {
      const output = path.join(ws.outputDir(), id);
      fs.mkdirSync(output, { recursive: true });
      fs.writeFileSync(path.join(output, 'old.mp4'), 'old video');
      fs.writeFileSync(path.join(output, 'old.mp4.json'), '{}');
    });
  }
  const prefix = scope(a.id);
  const previous = await (await request(`${prefix}/render/status/${id}`, undefined, 'GET')).json();
  assert.equal(previous.videos.length, 1);
  assert.equal((await request(`${prefix}/scripts/${id}`, { aiResponse: '', status: 'draft' }, 'PUT')).status, 200);
  const cleared = await (await request(`${prefix}/scripts/${id}`, undefined, 'GET')).json();
  assert.deepEqual(cleared.generatedImages, []);
  assert.deepEqual(cleared.generatedAudio, []);
  for (const key of ['timelineConfig', 'sceneAnalysis', 'youtubeExport']) assert.equal(cleared[key], undefined);
  const status = await (await request(`${prefix}/render/status/${id}`, undefined, 'GET')).json();
  assert.equal(status.status, 'idle');
  assert.deepEqual(status.videos, []);
  assert.equal((await request(previous.videos[0].url, undefined, 'GET')).status, 404);
  const other = await (await request(`${scope(a.id, 'long')}/render/status/${id}`, undefined, 'GET')).json();
  assert.equal(other.videos.length, 1);
  // Starting another run uses the same reset even without clicking Clear first.
  assert.equal((await request(`${scope(a.id, 'long')}/scripts/${id}`, { aiResponse: '', status: 'active' }, 'PUT')).status, 200);
  assert.equal((await request(other.videos[0].url, undefined, 'GET')).status, 404);
  ws.workspaceContext.run({ accountId: a.id, profile: 'shorts' }, () => {
    const output = path.join(ws.outputDir(), id);
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'new.mp4'), 'new video');
  });
  assert.equal((await request(`${prefix}/scripts/${id}`, undefined, 'DELETE')).status, 200);
  assert.deepEqual((await (await request(`${prefix}/render/status/${id}`, undefined, 'GET')).json()).videos, []);
});

test('clearing an active render waits for cancellation and cannot restore the old video', async () => {
  const prefix = scope(b.id, 'long');
  await request(`${prefix}/scripts`, { id: 'landscape', name: 'Active render reset', prompts: [], aiResponse: 'Old response' });
  const started = await request(`${prefix}/render/start`, {
    scriptId: 'landscape', imagePaths: ['image.png'], audioPath: 'voice.wav',
    enableVignette: false, enableSfx: false,
  });
  assert.equal(started.status, 200);
  assert.equal((await request(`${prefix}/scripts/landscape`, { aiResponse: '', status: 'draft' }, 'PUT')).status, 200);
  const status = await (await request(`${prefix}/render/status/landscape`, undefined, 'GET')).json();
  assert.equal(status.status, 'idle');
  assert.deepEqual(status.videos, []);
  ws.workspaceContext.run({ accountId: b.id, profile: 'long' }, () => {
    assert.equal(fs.existsSync(path.join(ws.outputDir(), 'landscape')), false);
  });
});

test.after(async () => {
  google.youtube=originalYoutube; google.auth.OAuth2.prototype.getToken=originalGetToken;
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  const relative = path.relative(root,directory);
  assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(directory).startsWith('accounts-test-'));
  fs.rmSync(directory,{recursive:true,force:true});
});
