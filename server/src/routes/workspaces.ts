import { Router, type ErrorRequestHandler } from 'express';
import { StoreCorruptionError } from '../services/store.js';
import { getAccount } from '../services/accounts.js';
import { safeSegment } from '../services/paths.js';
import { workspaceContext } from '../services/workspace.js';
import { scriptsRouter } from './scripts.js';
import { generateRouter } from './generate.js';
import { renderRouter } from './render.js';
import { ttsRouter } from './tts.js';
import { youtubeRouter } from './youtube.js';
import { facebookRouter } from './facebook.js';
import { instagramRouter } from './instagram.js';
import { llmRouter } from './llm.js';
import { mediaImportRouter } from './media-import.js';
import { presenterRouter } from './presenter.js';
import { editingRouter } from './editing.js';

import { flowRouter } from './flow.js';
import { supervisorRouter } from './supervisor.js';
import { retentionRouter } from './retention.js';
import { recoveryRouter } from './recovery.js';
import { workspaceMutationGuard } from '../services/workspace-activity.js';

export const workspacesRouter = Router({ mergeParams: true });
workspacesRouter.use((req, res, next) => {
  const { accountId, profile } = req.params;
  if (!safeSegment(accountId) || !getAccount(accountId) || (profile !== 'shorts' && profile !== 'long' && profile !== 'mixed')) {
    res.status(404).json({ error: 'Workspace not found' }); return;
  }
  workspaceContext.run({ accountId, profile }, next);
});
workspacesRouter.use(workspaceMutationGuard);
workspacesRouter.use('/recovery', recoveryRouter);
workspacesRouter.use('/scripts', scriptsRouter);
workspacesRouter.use('/generate', generateRouter);
workspacesRouter.use('/media-import', mediaImportRouter);
workspacesRouter.use('/flow', flowRouter);
workspacesRouter.use('/render', renderRouter);
workspacesRouter.use('/presenter', presenterRouter);
workspacesRouter.use('/editing', editingRouter);
workspacesRouter.use('/tts', ttsRouter);
workspacesRouter.use('/youtube', youtubeRouter);
workspacesRouter.use('/facebook', facebookRouter);
workspacesRouter.use('/instagram', instagramRouter);
workspacesRouter.use('/llm', llmRouter);
workspacesRouter.use('/supervisor', supervisorRouter);
workspacesRouter.use('/retention', retentionRouter);
workspacesRouter.use(((error, _req, res, next) => {
  if (error instanceof StoreCorruptionError) { res.status(409).json({ error: error.message, code: error.code }); return; }
  next(error);
}) as ErrorRequestHandler);
