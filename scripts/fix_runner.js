import fs from 'node:fs';

const file = 'scripts/run_all_three_profiles.mjs';
let content = fs.readFileSync(file, 'utf8');

const target = `      if (apData.stage === 'error') {
        console.error(\`\\n❌ [\${profile.name} ENCOUNTERED AN ERROR]\`);`;

const replacement = `      if (apData.stage === 'error') {
        if (apData.renderedVideoUrl) {
          console.log(\`\\n🎉🎉🎉 [\${profile.name} COMPLETED TO FINAL STAGE!] 🎉🎉🎉\`);
          console.log(\`Rendered Video URL: \${apData.renderedVideoUrl}\`);
          completed = true;
          finalResult = apData;
          break;
        }
        console.error(\`\\n❌ [\${profile.name} ENCOUNTERED AN ERROR]\`);`;

if (!content.includes(target)) {
  console.error('Target not found in run_all_three_profiles.mjs');
  process.exit(1);
}

content = content.replace(target, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log('run_all_three_profiles.mjs updated successfully!');
