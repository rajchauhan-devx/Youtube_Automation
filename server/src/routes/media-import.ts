import express, { Router } from 'express';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { currentWorkspace, generatedDir, mediaUrl } from '../services/workspace.js';
import { containedFile, safeSegment } from '../services/paths.js';
import { store } from '../services/store.js';
import { runMedia } from '../services/media-process.js';
import { validateScenePlan } from '../services/scene-plan.js';

export const mediaImportRouter = Router();
mediaImportRouter.post('/:scriptId/:index', express.raw({ type: 'application/octet-stream', limit: '250mb' }), async (req, res) => {
  let target: string | undefined;
  try {
    const { scriptId } = req.params;
    const index = Number(req.params.index);
    if (currentWorkspace().profile !== 'mixed' || !safeSegment(scriptId) || !Number.isInteger(index) || index < 0) throw new Error('Invalid mixed-media scene.');
    const script = store.getById<any>('scripts', scriptId);
    const scene = validateScenePlan(script?.scenePlan).scenes[index];
    if (!scene) throw new Error('Scene not found. Extract your script first.');
    const type = scene.mediaType || 'image';
    const extension = String(req.query.extension || '').toLowerCase();
    if (!(type === 'video' ? ['mp4'] : ['png', 'jpg', 'jpeg', 'webp']).includes(extension)) throw new Error(type === 'video' ? 'Choose an MP4 video.' : 'Choose a PNG, JPG or WebP image.');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Error('The media file is empty.');
    const dir = containedFile(generatedDir(), scriptId);
    fs.mkdirSync(dir, { recursive: true });
    const filename = `import_${index}_${randomUUID()}.${extension}`;
    target = containedFile(dir, filename);
    fs.writeFileSync(target, req.body);
    const probe = JSON.parse(await runMedia('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', target]));
    const visual = probe.streams?.find((stream: any) => stream.codec_type === 'video');
    if (!visual || visual.width < 1 || visual.height < 1) throw new Error('This file has no readable visual media.');
    if (type === 'image' && !['png', 'mjpeg', 'webp'].includes(visual.codec_name)) throw new Error('This file is not a supported still image.');
    const duration = type === 'video' ? Number(visual.duration || probe.format?.duration) : undefined;
    if (type === 'video' && (!Number.isFinite(duration) || duration! < 1 / 30 || duration! > 3600)) throw new Error('Video must have a readable duration between one frame and one hour.');
    const current = store.getById<any>('scripts', scriptId);
    if (!current || JSON.stringify(current.scenePlan?.scenes[index]) !== JSON.stringify(scene)) throw new Error('Scene changed during upload. Import again into the updated scene.');
    const asset = { index, prompt: scene.imagePrompt, mediaType: type, ...(type === 'video' ? { duration } : {}), status: 'done', url: mediaUrl(`generate/file/${scriptId}/${filename}`) };
    const generatedImages = [...(current.generatedImages || []).filter((item: any) => item.index !== index), asset].sort((a, b) => a.index - b.index);
    store.add('scripts', { ...current, generatedImages, timelineConfig: undefined, youtubeExport: undefined });
    target = undefined;
    res.json({ asset, generatedImages });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Import failed.' });
  } finally { if (target) fs.rmSync(target, { force: true }); }
});
