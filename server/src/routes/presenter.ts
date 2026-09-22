import { Router } from 'express';
import { presenterHealth, avatarPreview } from '../services/presenter.js';

export const presenterRouter = Router();
presenterRouter.get('/status', (_req, res) => { res.json(presenterHealth()); });
presenterRouter.get('/avatar/:id', (req, res) => {
  try { res.sendFile(avatarPreview(req.params.id, req.query.transparent === '1')); }
  catch { res.status(404).json({ error: 'Avatar not found.' }); }
});
