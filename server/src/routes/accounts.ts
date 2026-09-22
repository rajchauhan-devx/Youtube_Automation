import { Router } from 'express';
import { createAccount, listAccounts } from '../services/accounts.js';
export const accountsRouter = Router();
accountsRouter.get('/', (_req, res) => { res.json({ accounts: listAccounts() }); });
accountsRouter.post('/', (req, res) => {
  const name = req.body?.name;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
    res.status(400).json({ error: 'Account name must be 1–80 characters' }); return;
  }
  res.status(201).json({ account: createAccount(name.trim()) });
});
