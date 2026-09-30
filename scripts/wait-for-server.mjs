import { setTimeout as delay } from 'node:timers/promises';

const port = process.env.PORT || '3001';
const url = `http://127.0.0.1:${port}/api/health`;
const deadline = Date.now() + 120_000;

console.log(`Waiting for backend on port ${port} before starting Vite...`);
while (Date.now() < deadline) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    if (response.ok && (await response.json()).status === 'ok') {
      console.log('Backend ready; starting Vite.');
      process.exit(0);
    }
  } catch {
    // The backend is still compiling or starting.
  }
  await delay(250);
}

console.error(`Backend did not become ready at ${url} within two minutes.`);
process.exit(1);
