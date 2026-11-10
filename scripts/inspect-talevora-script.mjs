import fs from 'node:fs';

const filePath = 'server/data/accounts/acct_c0316a84-3e92-41be-87cd-c44ba1a20e38/profiles/shorts/scripts.json';
const scripts = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const s = scripts.find(x => x.id === 'usr_5506701e-8960-4ea4-8faf-04e881782427');

console.log('generatedAudio turns:');
console.log(JSON.stringify(s.generatedAudio?.[0]?.turns, null, 2));
