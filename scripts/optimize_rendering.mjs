import fs from 'node:fs';

// -------------------------------------------------------------
// 3. Optimize server/src/routes/render.ts (Skip Remotion when only captions exist)
// -------------------------------------------------------------
let renderRouteCode = fs.readFileSync('server/src/routes/render.ts', 'utf8');

// Replace savedGraphics definition with hasVisualArtifacts check
const targetSavedGraphics = "savedGraphics = savedGraphicsForRender(scriptId, audioPath, imagePaths, resolution || { width: 1080, height: 1920 });";
if (!renderRouteCode.includes(targetSavedGraphics)) throw new Error('targetSavedGraphics in render.ts not found');

const newSavedGraphics = `savedGraphics = savedGraphicsForRender(scriptId, audioPath, imagePaths, resolution || { width: 1080, height: 1920 });
    const hasVisualArtifacts = Boolean(savedGraphics?.artifacts.some(a => a.enabled && a.graphic?.kind !== 'caption'));`;

renderRouteCode = renderRouteCode.replace(targetSavedGraphics, newSavedGraphics);

// Only delegate to Remotion if there are visual artifacts (maps, spotlights, frames, diagrams)
const targetSubtitles = "enableSubtitles: Boolean(enableSubtitles && !savedMotionCaptions && (longSync || subtitlePath)),";
if (!renderRouteCode.includes(targetSubtitles)) throw new Error('targetSubtitles in render.ts not found');
renderRouteCode = renderRouteCode.replace(targetSubtitles, "enableSubtitles: Boolean(enableSubtitles && (!hasVisualArtifacts || !savedMotionCaptions) && (longSync || subtitlePath)),");

const targetEditingCaptions = "editing: savedMotionCaptions && effectiveEditing ? { ...effectiveEditing, captions: false } : effectiveEditing,";
if (!renderRouteCode.includes(targetEditingCaptions)) throw new Error('targetEditingCaptions in render.ts not found');
renderRouteCode = renderRouteCode.replace(targetEditingCaptions, "editing: hasVisualArtifacts && savedMotionCaptions && effectiveEditing ? { ...effectiveEditing, captions: false } : effectiveEditing,");

const targetComposite = "if (savedGraphics) await compositeSavedGraphics(result, savedGraphics, controller.signal, (stage, progress) => {";
if (!renderRouteCode.includes(targetComposite)) throw new Error('targetComposite in render.ts not found');
renderRouteCode = renderRouteCode.replace(targetComposite, "if (savedGraphics && hasVisualArtifacts) await compositeSavedGraphics(result, savedGraphics, controller.signal, (stage, progress) => {");

const targetProgressEntry = "entry.progress = savedGraphics ? (presenter?.enabled ? Math.min(65, 45 + Math.round(percent * 0.20)) : Math.min(65, Math.round(percent * 0.65))) : presenter?.enabled ? Math.min(99, 45 + Math.round(percent * 0.54)) : percent;";
if (!renderRouteCode.includes(targetProgressEntry)) throw new Error('targetProgressEntry in render.ts not found');
renderRouteCode = renderRouteCode.replace(targetProgressEntry, "entry.progress = (savedGraphics && hasVisualArtifacts) ? (presenter?.enabled ? Math.min(65, 45 + Math.round(percent * 0.20)) : Math.min(65, Math.round(percent * 0.65))) : presenter?.enabled ? Math.min(99, 45 + Math.round(percent * 0.54)) : percent;");

fs.writeFileSync('server/src/routes/render.ts', renderRouteCode, 'utf8');
console.log('✓ Successfully applied conditional Remotion bypass to server/src/routes/render.ts');
