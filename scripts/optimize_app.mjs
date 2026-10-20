import fs from 'node:fs';

let code = fs.readFileSync('src/App.tsx', 'utf8');

const oldLoop = 'for (let i = 0; i < scenesToRender.length; i++) {';
const newLoop = 'let flowAvailableThisRun = true;\n\n        for (let i = 0; i < scenesToRender.length; i++) {';
if (!code.includes(oldLoop)) throw new Error('oldLoop not found');
code = code.replace(oldLoop, newLoop);

const oldIsVideo = "const isVideoScene = runSettings.media.flowEnabled && (scenesToRender[i] as any).mediaType === 'video';";
const newIsVideo = "const isVideoScene = flowAvailableThisRun && runSettings.media.flowEnabled && (scenesToRender[i] as any).mediaType === 'video';";
if (!code.includes(oldIsVideo)) throw new Error('oldIsVideo not found');
code = code.replace(oldIsVideo, newIsVideo);

const oldJobErr = "addAutoPilotLog('generate_images', `Flow video note for Scene ${i + 1}: ${jobResult.error || 'Flow error, kept reference frame'}`, 'warn');";
const newJobErr = "flowAvailableThisRun = false; addAutoPilotLog('generate_images', `Flow video note for Scene ${i + 1}: ${jobResult.error || 'Flow error'}. Using reference keyframes for subsequent video scenes.`, 'warn');";
if (!code.includes(oldJobErr)) throw new Error('oldJobErr not found');
code = code.replace(oldJobErr, newJobErr);

const oldCatchErr = "addAutoPilotLog('generate_images', `Scene ${i + 1} video note: ${videoErr instanceof Error ? videoErr.message : 'Kept reference keyframe'}`, 'warn');";
const newCatchErr = "flowAvailableThisRun = false; addAutoPilotLog('generate_images', `Scene ${i + 1} video note: ${videoErr instanceof Error ? videoErr.message : 'Kept reference keyframe'}. Using reference keyframes for subsequent video scenes.`, 'warn');";
if (!code.includes(oldCatchErr)) throw new Error('oldCatchErr not found');
code = code.replace(oldCatchErr, newCatchErr);

fs.writeFileSync('src/App.tsx', code, 'utf8');
console.log('✓ Successfully applied Flow optimization to src/App.tsx');
