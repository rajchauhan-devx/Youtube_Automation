import fs from 'node:fs';
// Build output only. Prevent retired service modules from surviving a TypeScript rebuild.
fs.rmSync(new URL('../dist/', import.meta.url), { recursive: true, force: true });
