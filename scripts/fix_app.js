import fs from 'node:fs';

const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = "if (reviewed.review.status !== 'passed') throw new Error(reviewBlockerMessage(reviewed.review));\r\n        addAutoPilotLog('review_retention', reviewed.review.summary, 'success');";

const replacement = `if (reviewed.review.status !== 'passed') {
          if (typeof window !== 'undefined' && localStorage.getItem('tubeflow:skip_youtube_upload') === 'true') {
            addAutoPilotLog('review_retention', \`Review findings noted: \${reviewBlockerMessage(reviewed.review)}. Export skipped as requested.\`, 'warn');
          } else {
            throw new Error(reviewBlockerMessage(reviewed.review));
          }
        } else {
          addAutoPilotLog('review_retention', reviewed.review.summary, 'success');
        }`;

if (!content.includes(target)) {
  console.error('Target not found in App.tsx');
  process.exit(1);
}

content = content.replace(target, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log('App.tsx updated successfully!');
