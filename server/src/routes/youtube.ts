import { Router } from 'express';
import { isCurrentRender } from '../services/render-revision.js';
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { chat } from '../services/gemini.js';
import { youtubeAuthRouter } from './youtube-auth.js';
import { createOAuth2Client, verifyChannel } from '../services/youtube-auth.js';
import { tokenPath, atomicJson } from '../services/accounts.js';
import { currentWorkspace, generatedDir, outputDir } from '../services/workspace.js';
import { safeSegment, containedFile } from '../services/paths.js';
import { store } from '../services/store.js';

export const youtubeRouter = Router();
youtubeRouter.use(youtubeAuthRouter);
function getApiKey(req: import('express').Request): string {
  return req.get('x-api-key') || process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY || '';
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
    categoryId = '22', // Default to 22 (People & Blogs)
    thumbnailFilename,
  } = req.body || {};

  if (!safeSegment(scriptId) || typeof title !== 'string' || !title.trim() || typeof description !== 'string' ||
      !safeSegment(videoFilename) || !videoFilename.endsWith('.mp4') || videoFilename.endsWith('.partial.mp4') ||
      (thumbnailFilename && (!safeSegment(thumbnailFilename) || !/\.(png|jpg|jpeg)$/i.test(thumbnailFilename)))) {
    res.status(400).json({ error: 'A script, title and completed MP4 filename are required.' }); return;
  }
  if (!store.getById('scripts', scriptId)) { res.status(404).json({ error: 'Script not found in this account and video profile' }); return; }
  const outputScriptDir = containedFile(outputDir(), scriptId);
  const genScriptDir = containedFile(generatedDir(), scriptId);
  const videoPath = containedFile(outputScriptDir, videoFilename);
  if (!fs.existsSync(videoPath)) {
    res.status(404).json({ error: 'The selected render does not exist in this workspace. Render the video first.' }); return;
  }
  if (!isCurrentRender(scriptId, videoPath)) { res.status(409).json({ error: 'The scene map, images or narration changed. Render the current video before uploading.' }); return; }

    const destination = await verifyChannel(client, accountId);
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

    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: snippetPayload,
        status: {
          privacyStatus: ['public', 'unlisted', 'private'].includes(privacyStatus) ? privacyStatus : 'private',
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(videoPath),
      },
    });

    const videoId = response.data.id;
    if (!videoId) {
      throw new Error('YouTube did not return a valid video ID.');
    }

    const videoUrl = `https://youtu.be/${videoId}`;
    console.log(`YouTube upload successful! Video URL: ${videoUrl}`);

    // Optional Thumbnail Upload if provided
    if (thumbnailFilename) {
      const thumbPath = fs.existsSync(path.join(genScriptDir, thumbnailFilename))
        ? path.join(genScriptDir, thumbnailFilename)
        : fs.existsSync(path.join(outputScriptDir, thumbnailFilename))
        ? path.join(outputScriptDir, thumbnailFilename)
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

    atomicJson(path.join(outputScriptDir, `upload_${videoId}.json`), {
      accountId, channelId: destination.id, profile: currentWorkspace().profile,
      videoId, videoFilename, uploadedAt: new Date().toISOString(),
    });
    res.json({
      accountId,
      channelId: destination.id,
      success: true,
      videoId,
      videoUrl,
      title,
      privacyStatus,
      uploadedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('YouTube upload failed:', err);
    res.status(500).json({
      error: err.message || 'YouTube upload failed',
      details: err?.response?.data?.error || undefined,
    });
  }
});
