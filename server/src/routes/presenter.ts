import { Router, raw } from 'express';
import { presenterHealth, avatarPreview, preparePresenterAvatar, presenterPreparation, cancelPresenterPreparation } from '../services/presenter.js';

export const presenterRouter = Router();
presenterRouter.get('/status', (_req, res) => { res.json(presenterHealth()); });
presenterRouter.post('/avatars', raw({ type: 'application/octet-stream', limit: '40mb' }), (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body)) { res.status(400).json({ error: 'Upload the avatar as application/octet-stream.' }); return; }
    const filename = typeof req.query.filename === 'string' ? req.query.filename : '';
    const name = typeof req.query.name === 'string' ? req.query.name : '';
    res.status(202).json(preparePresenterAvatar(req.body, filename, name));
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Could not prepare avatar.' }); }
});
presenterRouter.get('/preparation/:id', (req, res) => {
  const job = presenterPreparation(req.params.id);
  if (!job) { res.status(404).json({ error: 'Avatar preparation not found.' }); return; }
  res.json(job);
});
presenterRouter.post('/preparation/:id/cancel', (req, res) => {
  try { cancelPresenterPreparation(req.params.id); res.json({ cancelled: true }); }
  catch { res.status(404).json({ error: 'Avatar preparation not found.' }); }
});
presenterRouter.get('/avatar/:id', (req, res) => {
  try { res.sendFile(avatarPreview(req.params.id, req.query.transparent === '1')); }
  catch { res.status(404).json({ error: 'Avatar not found.' }); }
});
