import { Router, Request } from 'express';
import { store } from '../services/store.js';

export const scriptsRouter = Router();

interface ScriptData {
  id: string;
  name: string;
  prompts: { id: string; content: string }[];
  content?: string;
  pipeline?: unknown[];
}

scriptsRouter.get('/', (_req, res) => {
  const scripts = store.get<ScriptData>('scripts');
  res.json(scripts);
});

scriptsRouter.get('/:id', (req, res) => {
  const script = store.getById<ScriptData>('scripts', req.params.id);
  if (!script) {
    res.status(404).json({ error: 'Script not found' });
    return;
  }
  res.json(script);
});

scriptsRouter.post('/', (req, res) => {
  const script = req.body as ScriptData;
  if (!script.id || !script.name) {
    res.status(400).json({ error: 'Script must have id and name' });
    return;
  }
  store.add('scripts', { ...script, pipeline: [] });
  res.json(script);
});

scriptsRouter.put('/:id', (req, res) => {
  const existing = store.getById<ScriptData>('scripts', req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Script not found' });
    return;
  }
  const updated = { ...existing, ...req.body, id: req.params.id };
  store.add('scripts', updated);
  res.json(updated);
});

scriptsRouter.delete('/:id', (req, res) => {
  store.remove('scripts', req.params.id);
  store.set(`pipeline_${req.params.id}`, []);
  res.json({ ok: true });
});

scriptsRouter.get('/:id/pipeline', (req: Request, res) => {
  const pipelines = store.get<unknown[]>(`pipeline_${req.params.id}`);
  res.json(pipelines);
});

scriptsRouter.post('/:id/pipeline', (req, res) => {
  store.set(`pipeline_${req.params.id}`, req.body);
  res.json({ ok: true });
});
