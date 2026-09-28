import { createContext, useContext } from 'react';
import type { Channel, Section } from '../data';

export const DEFAULT_ACCOUNT: Channel = { id: 'default', name: 'My Channel', color: '#3b82f6', avatar: 'MC' };
export function workspacePrefix(accountId: string, profile: Section): string {
  return `/api/accounts/${encodeURIComponent(accountId)}/profiles/${profile}`;
}
export function createWorkspaceFetch(accountId: string, profile: Section): typeof globalThis.fetch {
  const prefix = workspacePrefix(accountId, profile);
  return (input, init) => {
    const url = typeof input === 'string' && input.startsWith('/api/') && !input.startsWith('/api/accounts/') && input !== '/api/accounts'
      ? prefix + input.slice(4) : input;
    return globalThis.fetch(url, init);
  };
}
export function createWorkspaceUrl(accountId: string, profile: Section, route: string): string {
  return `${workspacePrefix(accountId, profile)}/${route.replace(/^\/+/, '')}`;
}
export const WorkspaceApiContext = createContext({ account: DEFAULT_ACCOUNT, profile: 'shorts' as Section, fetch: globalThis.fetch.bind(globalThis) });
export const useWorkspaceApi = () => useContext(WorkspaceApiContext);
