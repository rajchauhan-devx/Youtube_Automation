import { Router } from 'express';
import { getAccount } from '../services/accounts.js';
import { safeSegment } from '../services/paths.js';
import { workspaceContext } from '../services/workspace.js';
import { scriptsRouter } from './scripts.js';
import { generateRouter } from './generate.js';
import { renderRouter } from './render.js';
import { ttsRouter } from './tts.js';
import { youtubeRouter } from './youtube.js';
import { llmRouter } from './llm.js';
import { mediaImportRouter } from './media-import.js';
import { presenterRouter } from './presenter.js';
import { editingRouter } from './editing.js';

export const workspacesRouter = Router({ mergeParams: true });
workspacesRouter.use((req, res, next) => {
  const { accountId, profile } = req.params;
  if (!safeSegment(accountId) || !getAccount(accountId) || (profile !== 'shorts' && profile !== 'long' && profile !== 'mixed')) {
    res.status(404).json({ error: 'Workspace not found' }); return;
  }
  workspaceContext.run({ accountId, profile }, next);
});
workspacesRouter.use('/scripts', scriptsRouter);
workspacesRouter.use('/generate', generateRouter);
workspacesRouter.use('/media-import', mediaImportRouter);
workspacesRouter.use('/render', renderRouter);
workspacesRouter.use('/presenter', presenterRouter);
workspacesRouter.use('/editing', editingRouter);
workspacesRouter.use('/tts', ttsRouter);
workspacesRouter.use('/youtube', youtubeRouter);
workspacesRouter.use('/llm', llmRouter);
