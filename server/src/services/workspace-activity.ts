import type { RequestHandler } from 'express';
import { workspaceKey } from './workspace.js';
export const maintenanceOperations = new Set<string>();
const requests = new Map<string, number>();
export const workspaceMaintenance = () => maintenanceOperations.has(workspaceKey('maintenance'));
export const workspaceRequestsActive = () => (requests.get(workspaceKey('requests')) || 0) > 0;
export const workspaceMutationGuard: RequestHandler = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path.startsWith('/recovery')) { next(); return; }
  if (workspaceMaintenance()) { res.status(423).json({ error: 'Workspace backup or restore is in progress. Try again when it finishes.' }); return; }
  const key = workspaceKey('requests'); requests.set(key, (requests.get(key) || 0) + 1);
  let released = false;
  const release = () => { if (released) return; released = true; requests.set(key, Math.max(0, (requests.get(key) || 1) - 1)); };
  res.once('finish', release); res.once('close', release); next();
};
