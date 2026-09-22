import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT_DATA, accountDir } from './workspace.js';

export interface Account {
  id: string; name: string; color: string; avatar: string;
  youtubeChannelId?: string; youtubeChannelTitle?: string;
}
export function atomicJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
export function listAccounts(): Account[] {
  const file = path.join(ROOT_DATA, 'accounts.json');
  if (!fs.existsSync(file)) return [{ id: 'default', name: 'My Channel', color: '#3b82f6', avatar: 'MC' }];
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(data)) throw new Error('Invalid accounts storage');
  return data;
}
export function getAccount(id: string) { return listAccounts().find(account => account.id === id); }
export function createAccount(name: string): Account {
  const accounts = listAccounts();
  const account: Account = { id: `acct_${crypto.randomUUID()}`, name, color: ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b'][accounts.length % 4], avatar: name.slice(0, 2).toUpperCase() };
  fs.mkdirSync(accountDir(account.id), { recursive: true });
  atomicJson(path.join(ROOT_DATA, 'accounts.json'), [...accounts, account]);
  return account;
}
export function updateAccount(id: string, patch: Partial<Pick<Account, 'name' | 'youtubeChannelId' | 'youtubeChannelTitle'>>) {
  const accounts = listAccounts();
  const index = accounts.findIndex(account => account.id === id);
  if (index < 0) throw new Error('Account not found');
  if (Object.entries(patch).every(([key, value]) => accounts[index][key as keyof Account] === value)) return accounts[index];
  accounts[index] = { ...accounts[index], ...patch };
  atomicJson(path.join(ROOT_DATA, 'accounts.json'), accounts);
  return accounts[index];
}
export function tokenPath(id: string) {
  return id === 'default' ? path.join(ROOT_DATA, 'youtube-token.json') : path.join(accountDir(id), 'youtube-token.json');
}
