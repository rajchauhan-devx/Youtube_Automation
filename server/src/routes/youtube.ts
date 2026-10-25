import { Router } from 'express';
import { isCurrentRender } from '../services/render-revision.js';
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { chat, getGeminiApiKey } from '../services/gemini.js';
import { youtubeAuthRouter } from './youtube-auth.js';
import { createOAuth2Client, verifyChannel } from '../services/youtube-auth.js';
import { tokenPath, atomicJson } from '../services/accounts.js';
import { currentWorkspace, generatedDir, outputDir } from '../services/workspace.js';
import { safeSegment, containedFile } from '../services/paths.js';
import { store } from '../services/store.js';
import { recordUploadedTopic, syncTopicNotes } from '../services/topic-notes.js';
import { productionHash, productionMemory } from '../services/retention.js';
import { renderFileHash } from '../services/retention-review.js';
import { claimUpload, uploadStatus, reconcileUpload, retryUncertainUpload, UploadConflict } from '../services/upload-jobs.js';

export const youtubeRouter = Router();
youtubeRouter.use(youtubeAuthRouter);
function getApiKey(req: import('express').Request): string {
  return getGeminiApiKey(req.get('x-api-key'));
}

// 6. Generate AI YouTube Metadata (Viral Titles, Description, Tags)
youtubeRouter.post('/generate-metadata', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    if (!apiKey) {
      res.status(401).json({ error: 'Missing Gemini API key' });
      return;
    }

    const { topic = '', script = '', narration = '', isShort = true, field = 'all' } = req.body || {};

    let prompt = '';
    if (field === 'title') {
      prompt = `You are a YouTube viral strategist. Generate an array of 3 distinct, high-CTR curiosity-driven titles for a YouTube ${isShort ? 'Short' : 'Video'}.
Topic: ${topic}
Narration/Context: ${narration || script || topic}

Return ONLY valid JSON in this exact shape:
{
  "titles": ["Title 1 #Shorts", "Title 2 #Shorts", "Title 3 #Shorts"]
}`;
    } else if (field === 'description') {
      prompt = `You are a YouTube algorithm specialist. Generate an engaging, high-converting description with hook above the fold, brief summary, and 5-8 hyper-relevant hashtags for a YouTube ${isShort ? 'Short' : 'Video'}.
Topic: ${topic}
Narration/Context: ${narration || script || topic}

Return ONLY valid JSON in this exact shape:
{
  "description": "Full formatted description text..."
}`;
    } else if (field === 'tags') {
      prompt = `You are a YouTube SEO expert. Generate an array of 12-18 comma-separated search keyword tags for YouTube Studio.
Topic: ${topic}
Narration/Context: ${narration || script || topic}

Return ONLY valid JSON in this exact shape:
{
  "tags": ["tag1", "tag2", "tag3"]
}`;
    } else {
      prompt = `You are a world-class YouTube strategist, algorithm engineer, and viral video consultant.
Generate an irresistible, algorithm-optimized packaging suite for a YouTube ${isShort ? 'Short' : 'Video'}.

Context:
Topic: ${topic}
Narration / Content:
${narration || script || topic}

Generate:
1. "titles": An array of 3 distinct, high-CTR viral titles.
2. "description": An engaging description with hook, summary, call-to-action, and hashtags.
3. "tags": An array of 12-18 search keyword tags.

Return ONLY valid JSON in this exact shape:
{
  "titles": ["Title 1", "Title 2", "Title 3"],
  "description": "Full formatted description text...",
  "tags": ["tag1", "tag2", "tag3"]
}`;
    }

    const result = await chat(apiKey, {
      model: 'gemini-3.6-flash',
      temperature: 0.8,
      messages: [
        { role: 'system', content: 'You are an elite YouTube growth specialist. Respond ONLY with valid JSON without markdown code blocks.' },
        { role: 'user', content: prompt },
      ],
    });

    let raw = result.choices?.[0]?.message?.content || '{}';
    raw = raw.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(raw);

    res.json({
      titles: Array.isArray(parsed.titles) ? parsed.titles : (parsed.title ? [parsed.title] : undefined),
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      tags: Array.isArray(parsed.tags) ? parsed.tags : undefined,
    });
  } catch (err: any) {
    console.error('Metadata generation error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate YouTube metadata' });
  }
});

// 7. Upload Video Directly to YouTube
youtubeRouter.post('/upload', async (req, res) => {
  let upload: Awaited<ReturnType<typeof claimUpload>> | undefined;
  try {
  const { accountId } = currentWorkspace();
  const client = createOAuth2Client(accountId);
  if (!client || !fs.existsSync(tokenPath(accountId))) {
    res.status(401).json({ error: 'YouTube account not authenticated. Please connect your YouTube account first.' });
    return;
  }

  const {
    scriptId,
    videoFilename,
    title,
    description = '',
    tags = [],
    privacyStatus = 'private',
    publishAt,
    categoryId = '22', // Default to 22 (People & Blogs)
    thumbnailFilename,
  } = req.body || {};

  const safeThumbnail = (thumbnailFilename && typeof thumbnailFilename === 'string' && safeSegment(thumbnailFilename) && /\.(png|jpe?g)$/i.test(thumbnailFilename))
    ? thumbnailFilename : undefined;

  if (!safeSegment(scriptId) || typeof title !== 'string' || !title.trim() || typeof description !== 'string' ||
      !safeSegment(videoFilename) || !videoFilename.endsWith('.mp4') || videoFilename.endsWith('.partial.mp4')) {
    res.status(400).json({ error: 'A script, title and completed MP4 filename are required.' }); return;
  }
  let validatedPublishAt: string | undefined;
  if (publishAt !== undefined && publishAt !== null && publishAt !== '') {
    if (typeof publishAt !== 'string') {
      res.status(400).json({ error: 'Invalid scheduled publish time.' }); return;
    }
    const parsedTime = Date.parse(publishAt);
    if (Number.isNaN(parsedTime) || parsedTime <= Date.now() + 2 * 60_000) {
      res.status(400).json({ error: 'Scheduled publish time must be at least 5 minutes in the future.' }); return;
    }
    validatedPublishAt = new Date(parsedTime).toISOString();
  }
  const script = store.getById<any>('scripts', scriptId);
  if (!script) { res.status(404).json({ error: 'Script not found in this account and video profile' }); return; }
  const outputScriptDir = containedFile(outputDir(), scriptId);
  const genScriptDir = containedFile(generatedDir(), scriptId);
  const videoPath = containedFile(outputScriptDir, videoFilename);
  if (!fs.existsSync(videoPath)) {
    res.status(404).json({ error: 'The selected render does not exist in this workspace. Render the video first.' }); return;
  }
  if (!isCurrentRender(scriptId, videoPath)) { res.status(409).json({ error: 'The scene map, images or narration changed. Render the current video before uploading.' }); return; }
  if (req.body?.autoPilot === true && (!script.retentionPlan || script.retentionPlan.topic !== script.topicName || !script.retentionEdit || script.retentionReview?.status !== 'passed'
    || script.retentionReview.videoFilename !== videoFilename || script.retentionReview.renderHash !== renderFileHash(videoPath)
    || script.retentionReview.productionHash !== productionHash(script))) {
    res.status(409).json({ error: 'Auto-Pilot requires a passing review of this exact production and render before YouTube upload.' }); return;
  }
  // Check that history can be read before making an external upload.
  syncTopicNotes();

    const destination = await verifyChannel(client, accountId);
    upload = await claimUpload(videoPath, scriptId, destination.id!);
    if (upload.replay) { res.json({ ...upload.replay, reused: true }); return; }
    const youtube = google.youtube({ version: 'v3', auth: client });
    const fileSize = fs.statSync(videoPath).size;

    console.log(`Starting YouTube upload: "${title}" from ${videoPath} (${fileSize} bytes)`);

    const snippetPayload: Record<string, any> = {
      title: title.slice(0, 100),
      description: description.slice(0, 5000),
      tags: Array.isArray(tags) ? tags.map((t: string) => String(t).trim()).filter(Boolean).slice(0, 40) : [],
    };
    if (categoryId) {
      snippetPayload.categoryId = String(categoryId);
    }

    upload.sending!();
    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: snippetPayload,
        status: {
          privacyStatus: validatedPublishAt ? 'private' : (['public', 'unlisted', 'private'].includes(privacyStatus) ? privacyStatus : 'private'),
          selfDeclaredMadeForKids: false,
          ...(validatedPublishAt ? { publishAt: validatedPublishAt } : {}),
        },
      },
      media: {
        body: fs.createReadStream(videoPath),
      },
    }, { retry: false });

    const videoId = response.data.id;
    if (!videoId) {
      throw new Error('YouTube did not return a valid video ID.');
    }

    const videoUrl = `https://youtu.be/${videoId}`;
    const uploadedAt = new Date().toISOString();
    const topic = script.topicName?.trim() || title.trim();
    const production = productionMemory(script, script.retentionReview?.duration || script.duration || 30);
    if (production) production.title = title;
    const effectivePrivacy = validatedPublishAt ? 'private' : (['public', 'unlisted', 'private'].includes(privacyStatus) ? privacyStatus : 'private');
    const uploadResult = { accountId, channelId: destination.id, success: true, topicHistorySaved: false, videoId, videoUrl, title,
      privacyStatus: effectivePrivacy, scheduled: Boolean(validatedPublishAt), publishAt: validatedPublishAt, uploadedAt };
    upload.complete!(uploadResult);
    // Save the durable upload receipt before optional thumbnail work. History can
    // recover from this receipt even if a later write or the browser fails.
    atomicJson(path.join(outputScriptDir, `upload_${videoId}.json`), {
      accountId, channelId: destination.id, profile: currentWorkspace().profile,
      topic, videoId, videoFilename, publishAt: validatedPublishAt, uploadedAt, production,
      uploadId: upload.id,
    });
    let topicHistorySaved = false;
    try {
      recordUploadedTopic({ topic, scriptId, profile: currentWorkspace().profile, videoId, videoUrl, uploadedAt, production });
      topicHistorySaved = true;
    } catch (error) { console.error('YouTube upload succeeded; topic notes will recover from the upload receipt:', error); }
    const latestScript = store.getById<any>('scripts', scriptId);
    if (latestScript) store.add('scripts', { ...latestScript, retentionProduction: production, youtubeExport: {
      ...latestScript.youtubeExport, title, description, tags, privacyStatus: effectivePrivacy,
      uploadedVideoId: videoId, uploadedVideoUrl: videoUrl, uploadedAt,
    } });
    console.log(`YouTube upload successful! Video URL: ${videoUrl}`);

    // Optional Thumbnail Upload if provided
    if (safeThumbnail) {
      const thumbPath = fs.existsSync(path.join(genScriptDir, safeThumbnail))
        ? path.join(genScriptDir, safeThumbnail)
        : fs.existsSync(path.join(outputScriptDir, safeThumbnail))
        ? path.join(outputScriptDir, safeThumbnail)
        : null;

      if (thumbPath) {
        try {
          await youtube.thumbnails.set({
            videoId,
            media: {
              body: fs.createReadStream(thumbPath),
            },
          });
          console.log(`Custom thumbnail set for ${videoId}`);
        } catch (thumbErr) {
          console.warn('Could not set custom thumbnail (channel may need phone verification on YouTube):', thumbErr);
        }
      }
    }

    upload.complete!({ ...uploadResult, topicHistorySaved });
    res.json({ ...uploadResult, topicHistorySaved });
  } catch (err: any) {
    try { upload?.fail?.(err); } catch (storageError) { console.error('Upload journal could not be updated:', storageError); }
    console.error('YouTube upload failed:', err);
    res.status(err instanceof UploadConflict ? 409 : 500).json({
      error: err.message || 'YouTube upload failed',
      code: err instanceof UploadConflict ? err.code : undefined,
      details: err?.response?.data?.error || undefined,
    });
  }
});

youtubeRouter.get('/upload-status/:scriptId', (req, res, next) => {
  try { if (!safeSegment(req.params.scriptId)) { res.status(400).json({ error: 'Invalid script ID' }); return; } res.json({ uploads: uploadStatus(req.params.scriptId) }); } catch (error) { next(error); }
});
youtubeRouter.post('/uploads/:uploadId/reconcile', async (req, res) => {
  try {
    const videoId = req.body?.videoId;
    if (typeof videoId !== 'string' || !/^[a-zA-Z0-9_-]{6,32}$/.test(videoId)) throw new Error('Enter the existing YouTube video ID.');
    const { accountId } = currentWorkspace(), client = createOAuth2Client(accountId);
    if (!client) throw new Error('Connect your YouTube channel first.');
    const destination = await verifyChannel(client, accountId), youtube = google.youtube({ version: 'v3', auth: client });
    const response = await youtube.videos.list({ part: ['snippet', 'status'], id: [videoId] });
    const video = response.data.items?.[0];
    if (!video || video.snippet?.channelId !== destination.id) throw new Error('The selected video does not belong to this connected channel.');
    const result = { success: true, accountId, channelId: destination.id, videoId, videoUrl: `https://youtu.be/${videoId}`, title: video.snippet?.title,
      privacyStatus: video.status?.privacyStatus, scheduled: Boolean(video.status?.publishAt), publishAt: video.status?.publishAt };
    const upload = reconcileUpload(req.params.uploadId, destination.id!, result);
    const script = store.getById<any>('scripts', upload.scriptId);
    if (script) {
      const uploadedAt = new Date().toISOString(), topic = script.topicName?.trim() || video.snippet?.title || 'Uploaded video';
      atomicJson(containedFile(outputDir(), upload.scriptId, `upload_${videoId}.json`), { accountId, channelId: destination.id, profile: currentWorkspace().profile, topic, videoId, videoFilename: upload.videoFilename, uploadedAt, uploadId: req.params.uploadId });
      store.add('scripts', { ...script, youtubeExport: { ...script.youtubeExport, uploadedVideoId: videoId, uploadedVideoUrl: result.videoUrl, uploadedAt } });
      recordUploadedTopic({ topic, scriptId: upload.scriptId, profile: currentWorkspace().profile, videoId, videoUrl: result.videoUrl, uploadedAt });
    }
    res.json(result);
  } catch (error) { res.status(error instanceof UploadConflict ? 409 : 400).json({ error: error instanceof Error ? error.message : 'Reconciliation failed' }); }
});
youtubeRouter.post('/uploads/:uploadId/retry', async (req, res) => {
  try {
    if (req.body?.confirmedNoVideo !== true) throw new Error('Check YouTube Studio and explicitly confirm that no uploaded video exists.');
    const { accountId } = currentWorkspace(), client = createOAuth2Client(accountId); if (!client) throw new Error('Connect YouTube first.');
    const channel = await verifyChannel(client, accountId); retryUncertainUpload(req.params.uploadId, channel.id!); res.json({ retryAllowed: true });
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : 'Upload recovery failed' }); }
});
