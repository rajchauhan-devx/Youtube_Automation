import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { containedFile } from './paths.js';

export type VideoProfile = 'shorts' | 'long' | 'mixed';
export interface Workspace { accountId: string; profile: VideoProfile }
export const workspaceContext = new AsyncLocalStorage<Workspace>();
export const ROOT_DATA = path.resolve(process.env.TUBEFLOW_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data'));
export function currentWorkspace(): Workspace { return workspaceContext.getStore() || { accountId: 'default', profile: 'shorts' }; }
export function accountDir(accountId = currentWorkspace().accountId) { return containedFile(ROOT_DATA, 'accounts', accountId); }
export function workspaceDir() {
  const { accountId, profile } = currentWorkspace();
  // Preserve existing assets and URLs in place. New workspaces never read this directory.
  if (accountId === 'default' && profile === 'shorts') return ROOT_DATA;
  return containedFile(accountDir(accountId), 'profiles', profile);
}
export function generatedDir() { return path.join(workspaceDir(), 'generated'); }
export function outputDir() { return path.join(workspaceDir(), 'output'); }
export function workspaceKey(scriptId: string) { const scope = currentWorkspace(); return `${scope.accountId}:${scope.profile}:${scriptId}`; }
export function mediaUrl(route: string) {
  const scope = workspaceContext.getStore();
  return scope ? `/api/accounts/${scope.accountId}/profiles/${scope.profile}/${route}` : `/api/${route}`;
}
