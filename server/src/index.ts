import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { llmRouter } from './routes/llm.js';
import { scriptsRouter } from './routes/scripts.js';
import { generateRouter } from './routes/generate.js';
import { ttsRouter } from './routes/tts.js';
import { renderRouter } from './routes/render.js';
import { youtubeRouter } from './routes/youtube.js';
import { accountsRouter } from './routes/accounts.js';
import { workspacesRouter } from './routes/workspaces.js';
import { presenterRouter } from './routes/presenter.js';
import { editingRouter } from './routes/editing.js';
import { editingConfig } from './services/editing/config.js';
import { acquireSchedulerLock } from './services/editing/repository.js';

const app = express();
editingConfig();
acquireSchedulerLock();
const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '127.0.0.1';

app.disable('x-powered-by');
app.use((req, res, next) => {
  const allowed = process.env.CORS_ORIGIN || 'http://localhost:5173';
  const origin = req.get('origin');
  const localOrigin = `${req.protocol}://${req.get('host')}`;
  if (origin && origin !== allowed && origin !== localOrigin) {
    res.status(403).json({ error: 'Origin is not allowed' });
    return;
  }
  next();
});

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
// Local voice references are uploaded as base64 JSON and capped again in the TTS service.
app.use(express.json({ limit: '12mb' }));

app.use('/api/accounts/:accountId/profiles/:profile', workspacesRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/health', healthRouter);
app.use('/api/llm', llmRouter);
app.use('/api/scripts', scriptsRouter);
app.use('/api/generate', generateRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/render', renderRouter);
app.use('/api/presenter', presenterRouter);
app.use('/api/editing', editingRouter);
app.use('/api/youtube', youtubeRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
