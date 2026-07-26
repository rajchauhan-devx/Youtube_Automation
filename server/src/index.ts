import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { llmRouter } from './routes/llm.js';
import { scriptsRouter } from './routes/scripts.js';
import { generateRouter } from './routes/generate.js';
import { ttsRouter } from './routes/tts.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/health', healthRouter);
app.use('/api/llm', llmRouter);
app.use('/api/scripts', scriptsRouter);
app.use('/api/generate', generateRouter);
import { renderRouter } from './routes/render.js';

app.use('/api/tts', ttsRouter);
app.use('/api/render', renderRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
