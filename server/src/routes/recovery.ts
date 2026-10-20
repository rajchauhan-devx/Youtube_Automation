import { Router } from 'express';
import { z } from 'zod';
import { storeRecoveryStatus, restoreStore } from '../services/store.js';
import { assertRecoveryIdle, createWorkspaceBackup, listWorkspaceBackups, restoreWorkspaceBackup, workspaceFingerprint } from '../services/workspace-backups.js';
export const recoveryRouter = Router();
recoveryRouter.get('/', (_req, res, next) => {
  try { res.json({ stores: storeRecoveryStatus(), backups: listWorkspaceBackups(), fingerprint: workspaceFingerprint() }); } catch (error) { next(error); }
});
recoveryRouter.post('/backups', async (_req, res) => {
  try { res.status(201).json(await createWorkspaceBackup()); } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : 'Backup failed' }); }
});
recoveryRouter.post('/backups/:id/restore', async (req, res) => {
  try {
    const body = z.strictObject({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).parse(req.body);
    res.json(await restoreWorkspaceBackup(req.params.id, body.fingerprint));
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : 'Restore failed' }); }
});
recoveryRouter.post('/stores/:name/restore', (req, res) => {
  try { assertRecoveryIdle(); if (req.body?.fingerprint !== workspaceFingerprint()) throw new Error('The workspace changed. Refresh recovery status.'); res.json(restoreStore(req.params.name)); } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : 'Recovery failed' }); }
});
