import fs from 'fs';

const accountId = 'acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab';
const profile = 'long';
const scriptId = 'usr_25f6fa73-4649-4a4c-a52a-a999e3c7cde5';
const url = `http://localhost:3001/api/accounts/${accountId}/profiles/${profile}/render/status/${scriptId}`;

async function main() {
  console.log(`[Wait] Monitoring render progress for ${scriptId}...`);
  while (true) {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'running') {
        console.log(`[Wait] Progress: ${data.progress}% - ${data.message || 'rendering'}...`);
      } else if (data.status === 'done') {
        console.log(`[Wait] Render COMPLETE!`);
        console.log(`[Wait] Videos:`, data.videos);
        break;
      } else if (data.status === 'error') {
        console.error(`[Wait] Render ERROR:`, data.error);
        process.exit(1);
      } else {
        console.log(`[Wait] Status: ${data.status}`);
      }
    }
    await new Promise(r => setTimeout(r, 4000));
  }
}

main().catch(console.error);
