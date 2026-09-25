import type { RequestHandler } from 'express';
import { presenterState } from './presenter-state.js';

export function presenterGuard(paths: string[]): RequestHandler {
  return (req, res, next) => {
    if (req.method !== 'POST' || !paths.includes(req.path)) { next(); return; }
    if (presenterState.editingRequests) { res.status(409).json({ error: 'Wait for artifact image generation to finish before starting another GPU task.' }); return; }
    if (presenterState.busy) { res.status(409).json({ error: 'Wait for presenter generation to finish before starting another GPU task.' }); return; }
    presenterState.mediaRequests++;
    let released = false;
    const release = () => { if (!released) { released = true; presenterState.mediaRequests--; } };
    res.once('finish', release);
    // Underlying image/speech jobs have their own counters and survive disconnects.
    res.once('close', release);
    next();
  };
}
