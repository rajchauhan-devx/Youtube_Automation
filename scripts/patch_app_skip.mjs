import fs from 'node:fs';

const filePath = 'src/App.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const target = `await checkPauseOrAbort();\r\n      enterStage('upload_youtube');`;
const targetLF = `await checkPauseOrAbort();\n      enterStage('upload_youtube');`;

const actualTarget = content.includes(target) ? target : targetLF;
const eol = content.includes('\r\n') ? '\r\n' : '\n';

const block = [
  `await checkPauseOrAbort();`,
  `      if (typeof window !== 'undefined' && localStorage.getItem('tubeflow:skip_youtube_upload') === 'true') {`,
  `        try { localStorage.setItem('tubeflow:autopilot_completed:' + activeScope.current, JSON.stringify({ stage: 'completed', progressPercent: 100, statusMessage: 'Production complete! Video rendered to final stage (YouTube export skipped).', renderedVideoUrl: finalVideoUrl, topic })); } catch {}`,
  `        setAutoPilotState((prev) => ({`,
  `          ...prev,`,
  `          stage: 'completed',`,
  `          progressPercent: 100,`,
  `          statusMessage: 'Production complete! Video rendered to final stage (YouTube export skipped).',`,
  `          renderedVideoUrl: finalVideoUrl,`,
  `        }));`,
  `        addAutoPilotLog('render_video', \`🎉 Full MP4 video successfully rendered: \${finalVideoUrl}\`, 'success');`,
  `        addAutoPilotLog('upload_youtube', 'YouTube export skipped as requested. Video is ready in final stage.', 'info');`,
  `        return;`,
  `      }`,
  `      enterStage('upload_youtube');`
].join(eol);

if (!content.includes(actualTarget)) {
  console.error('Target not found in App.tsx');
  process.exit(1);
}

content = content.replace(actualTarget, block);
fs.writeFileSync(filePath, content, 'utf8');
console.log('App.tsx successfully updated!');
