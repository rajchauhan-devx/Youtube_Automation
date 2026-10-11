import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { Crop, validateProject, motionProject, type ArtifactComposition, type EditingProject, type MotionGraphicSpec } from '@tubeflow/editing-contracts';
import { atomic, assetFile, assetRecord, nextRevision, objectHash, projectDir } from './repository.js';
import { align, mapScenes } from './timing.js';
import { EditingError } from './config.js';
import { motionJson, motionModel, type MotionContext } from './motionProvider.js';
import { compileGraphic, GraphicProposal, sceneNarration, type Proposal } from './motionPackArtifacts.js';
import { runMedia } from '../media-process.js';
import { applyMotionTheme, type MotionTheme } from './motionTheme.js';

const Plan = z.strictObject({ graphics: z.array(GraphicProposal).max(16), theme: z.enum(['devotional', 'modern', 'documentary', 'nature', 'mystery', 'dramatic', 'neutral']).optional() });
const VisualScene = z.strictObject({ sceneId: z.string(), visibleObjects: z.array(z.string().trim().min(1).max(80)).max(8), openArea: z.enum(['top', 'bottom', 'left', 'right', 'center', 'none']) });
const VisualInventory = z.strictObject({ scenes: z.array(VisualScene).max(16) });
type Observation = z.infer<typeof VisualScene>;
const Detection = z.strictObject({ found: z.boolean(), description: z.string().max(1000), box: z.array(z.number().min(0).max(1000)).length(4).nullable() });
const Verification = z.strictObject({ matches: z.boolean(), unambiguous: z.boolean(), evidence: z.string().max(1000) });
const PLAN_PROMPT = `You are a restrained documentary motion graphics editor for history/archaeology storytelling. Default to no graphic: return graphics:[] unless a beat truly needs evidence or orientation.
Allowed graphics: title (2-4 word chapter/hook headline, max one per 90 seconds), lower-third (character name + short identity, first appearance only, never repeat), badge (place or era at chapter starts only), spotlight (a clearly named visible physical object), route (journey/expedition progress: title names the route, detail cites start-end places), counter (explicit date/stat numeral spoken in narration: title is the numeral only, detail cites what it counts), frame (archival material: title names the record, detail cites the archive/source), diagram (one evidence noun with a static callout: title is the noun, detail cites the source).
No subtitles, narration excerpts as display text, social buttons, keyword stickers, pop-word highlights or generic motivational labels. Captions are a separate track, never a scene graphic. Do not invent names, dates, statistics, identities or claims. counter/route/frame/diagram require an explicit numeral, journey, archival look or mechanism quoted from the narration; never decorate ordinary scenes.
Write labels in the narration language. Every proposal must cite an exact quote from its scene's narration. title/detail must be supported by that quote. detail is a source/era citation only (max 40 chars, e.g. a text name or place), never a sentence or slogan.
Use at most one graphic per scene, and respect the supplied limits as ceilings, not targets. Propose a graphic only when it adds specific information or emphasis that the footage and narration do not already make clear. Leave ordinary scenes clean. For spotlight, target must name a specific physical object listed in visibleObjects; title must name that visible object rather than inferred contents or identity. Never propose a spotlight for an absent or unclear object. For other types, target is empty.
The visual inventory describes what is actually visible. Prefer the openArea for text placement; use position top, bottom, left, right, or center as appropriate. Avoid repeated titles when another supported graphic type is suitable. The supplied mediaType indicates whether a scene is a still or moving clip. Use scene graphics for moving clips; spotlights require still images. Choose one theme matching the actual story and visual media: devotional, modern, documentary, nature, mystery, dramatic, or neutral. Do not default to yellow/gold. Return graphics:[] if none are warranted.`;

async function sceneImage(assetId: string, signal: AbortSignal): Promise<string> {
  const record = assetRecord(assetId);
  let source = assetFile(assetId);
  let tempDir: string | undefined;
  try {
    if (record.mime === 'video/mp4') {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-vision-'));
      source = path.join(tempDir, 'frame.png');
      await runMedia('ffmpeg', ['-v', 'error', '-ss', String(Math.max(0, Math.min((record.duration || 1) / 2, (record.duration || 1) - 0.05))), '-i', assetFile(assetId), '-frames:v', '1', '-y', source], signal);
    }
    const bytes = await sharp(source).resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } finally {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function inspectScenes(ctx: MotionContext, model: string, scenes: EditingProject['scenes']): Promise<Observation[]> {
  const observations: Observation[] = [];
  for (let offset = 0; offset < scenes.length; offset += 16) {
    const batch = scenes.slice(offset, offset + 16), images: string[] = [];
    for (let i = 0; i < batch.length; i++) {
      ctx.stage('Inspecting scene media', offset + i, scenes.length);
      images.push(await sceneImage(batch[i].assetId, ctx.signal));
    }
    const inventory = await motionJson(ctx, model, 'inspect-scenes', VisualInventory,
      'Inspect each supplied image in order. Image 1 belongs to the first scene in the JSON list, image 2 to the second, and so on. Report only objects plainly visible in that image; use generic descriptions when identity is uncertain. Never infer visual content from narration. openArea is the area with the least important visible content for a short graphic, or none if every area is occupied. Return exactly one result for each scene with its matching sceneId.',
      { scenes: batch.map((s, index) => ({ sceneId: s.id, imageNumber: index + 1, mediaType: assetRecord(s.assetId).mime === 'video/mp4' ? 'video sample frame' : 'still image' })) }, images);
    if (inventory.scenes.length !== batch.length || inventory.scenes.some((item, i) => item.sceneId !== batch[i].id))
      throw new EditingError('INVALID_PROVIDER_OUTPUT', 'Gemini did not identify every scene image in order. Generate motion graphics again.', 502, true);
    observations.push(...inventory.scenes);
  }
  return observations;
}

export function decodeBox(box: number[]) {
  const [top, left, bottom, right] = box;
  return Crop.parse({ x: left / 1000, y: top / 1000, width: (right - left) / 1000, height: (bottom - top) / 1000 });
}
async function locate(ctx: MotionContext, model: string, assetId: string, label: string): Promise<MotionGraphicSpec['target']> {
  const record = assetRecord(assetId);
  if (record.mime === 'video/mp4') throw new Error('Object pointers on moving footage require tracking; this scene is kept clean.');
  const bytes = await sharp(assetFile(assetId)).resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  const image = `data:image/png;base64,${bytes.toString('base64')}`;
  const detected = await motionJson(ctx, model, 'locate-object', Detection,
    'Locate only the requested object in the image. If absent, ambiguous, obscured, or too small to identify, return found:false and box:null. Otherwise return a tight bounding box [ymin,xmin,ymax,xmax] normalized 0-1000, and a visual description. Never infer a position from the narration.', { target: label }, [image]);
  if (!detected.found || !detected.box) throw new Error(`Could not locate “${label}” unambiguously.`);
  const region = decodeBox(detected.box);
  if (region.width < 0.015 || region.height < 0.015 || region.width * region.height > 0.65) throw new Error('The detected target is too small or broad for a precise spotlight.');
  // Verify the actual detected crop in a second image request, rather than trusting a self-reported confidence number.
  const meta = await sharp(bytes).metadata(), width = meta.width!, height = meta.height!;
  const left = Math.floor(region.x * width), top = Math.floor(region.y * height);
  const crop = await sharp(bytes).extract({ left, top, width: Math.max(1, Math.min(width - left, Math.ceil(region.width * width))), height: Math.max(1, Math.min(height - top, Math.ceil(region.height * height))) }).png().toBuffer();
  const verified = await motionJson(ctx, model, 'verify-object', Verification,
    'The first image is the full scene; the second is the proposed object crop. Verify whether that crop visibly contains the requested object and identifies it without ambiguity. Be conservative. Reject unrelated regions, inferred identities, and empty background. Return evidence describing visible features, not a numerical confidence claim.',
    { target: label, candidateDescription: detected.description }, [image, `data:image/png;base64,${crop.toString('base64')}`]);
  if (!verified.matches || !verified.unambiguous || !verified.evidence.trim()) throw new Error(`Could not verify “${label}” in the detected region.`);
  return { label, region, evidence: verified.evidence, verified: true };
}

type Checkpoint = { version: 'motion-v2'; inputHash: string; project: EditingProject; observations?: Observation[]; proposals?: Proposal[]; completed: string[] };
export async function runPipeline(input: EditingProject, ctx: MotionContext): Promise<EditingProject> {
  const model = motionModel(input.settings.aiModel), revise = ctx.job.operation === 'revise';
  const file = path.join(projectDir(input.id), 'jobs', `${ctx.job.id}.checkpoint.json`);
  const inputHash = objectHash({ revision: input.revisionId, model, operation: ctx.job.operation, artifactId: ctx.job.artifactId, instruction: ctx.job.instruction });
  let checkpoint: Checkpoint | undefined;
  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as Checkpoint;
    if (saved.version === 'motion-v2' && saved.inputHash === inputHash) { validateProject(saved.project); checkpoint = saved; }
  }
  if (!checkpoint) {
    const project = motionProject(nextRevision(input));
    project.artifacts = project.artifacts.filter(a => a.graphic);
    project.diagnostics = revise ? project.diagnostics.filter(d => d.artifactId !== ctx.job.artifactId) : [];
    if (!revise) {
      project.artifacts = project.artifacts.filter(a => a.graphic?.kind === 'caption'); project.analyses = [];
      project.alignment = await align(project, ctx.signal, false);
      project.scenes = mapScenes(project);
      project.sceneOutcomes = project.scenes.map(s => ({ sceneId: s.id, state: 'not_needed', reason: 'No extra graphic is needed for this scene.', artifactIds: [] }));
      if (project.alignment.mode !== 'word') project.diagnostics.push({ severity: 'info', code: 'SCENE_TIMING', stage: 'timing', message: project.alignment.mode === 'phrase' ? 'Graphics use measured narration scene boundaries. Timing can be adjusted on each graphic.' : 'Narration timing is estimated. Graphics start at scene boundaries; review timing before export.', retryable: false });
    }
    checkpoint = { version: 'motion-v2', inputHash, project, completed: [] };
  }
  const p = checkpoint.project;
  const save = () => { ctx.signal.throwIfAborted(); atomic(file, checkpoint); };
  const fail = (sceneId: string, message: string, artifactId?: string) => {
    const number = p.scenes.findIndex(s => s.id === sceneId) + 1;
    p.diagnostics.push({ severity: 'warning', code: 'GRAPHIC_SKIPPED', stage: 'graphics', sceneId, ...(artifactId ? { artifactId } : {}), message: `Scene ${number}: ${message}`, retryable: false });
    const outcome = p.sceneOutcomes?.find(s => s.sceneId === sceneId);
    if (outcome) { outcome.state = 'failed'; outcome.reason = message; }
  };
  if (!checkpoint.proposals) {
    ctx.stage(revise ? 'Revising graphic' : 'Planning motion graphics', 0, 1);
    const old = revise ? p.artifacts.find(a => a.id === ctx.job.artifactId) : undefined;
    if (revise && !old?.graphic) throw new EditingError('NOT_FOUND', 'Generate new motion graphics before revising this legacy artifact.', 404);
    const scenes = old ? p.scenes.filter(s => s.id === old.sceneId) : p.scenes;
    if (!checkpoint.observations) { checkpoint.observations = await inspectScenes(ctx, model, scenes); save(); }
    const sceneLimit = Math.min(16, Math.ceil(p.inputs.durationFrames / p.inputs.fps / 60) * { subtle: 2, balanced: 3, expressive: 4 }[p.settings.density]);
    const spotlightLimit = Math.min(8, Math.ceil(p.inputs.durationFrames / p.inputs.fps / 20));
    try {
      const result = await motionJson(ctx, model, 'plan-graphics', Plan, PLAN_PROMPT, {
        language: p.inputs.language, artDirection: p.settings.stylePreference,
        sceneGraphicsLimit: revise ? 1 : sceneLimit, spotlightLimit: revise ? 1 : spotlightLimit,
        scenes: scenes.map((s, index) => ({ sceneId: s.id, narration: sceneNarration(p, s.id), mediaType: assetRecord(s.assetId).mime === 'video/mp4' ? 'video' : 'image', duration: (s.endFrame - s.startFrame) / p.inputs.fps, visual: checkpoint.observations![index] })),
        ...(old ? { previous: old.graphic, instruction: ctx.job.instruction, mustProduceOneReplacement: true } : {}),
      });
      if (result.theme && !revise) applyMotionTheme(p, result.theme as MotionTheme);
      const used = new Set<string>(); let graphics = 0, spotlights = 0;
      checkpoint.proposals = result.graphics.filter(g => {
        if (!scenes.some(s => s.id === g.sceneId) || used.has(g.sceneId)) return false;
        if (graphics >= sceneLimit || (g.kind === 'spotlight' && spotlights >= spotlightLimit)) return false;
        used.add(g.sceneId); graphics++; if (g.kind === 'spotlight') spotlights++;
        return true;
      });
      if (revise && !checkpoint.proposals.length) fail(old!.sceneId, 'The revision produced no valid replacement; the previous graphic is preserved.', old!.id);
    } catch (error) {
      ctx.signal.throwIfAborted();
      throw error instanceof EditingError ? error : new EditingError('PLANNING_FAILED',
        `Graphics planning failed: ${error instanceof Error ? error.message : 'The model did not return a valid plan.'}`);
    }
    save();
  }
  for (const proposal of checkpoint.proposals) {
    if (checkpoint.completed.includes(proposal.sceneId)) continue;
    ctx.stage(`Creating ${proposal.kind} · scene ${p.scenes.findIndex(s => s.id === proposal.sceneId) + 1}`, checkpoint.completed.length, checkpoint.proposals.length);
    const old = revise ? p.artifacts.find(a => a.id === ctx.job.artifactId) : undefined;
    try {
      const scene = p.scenes.find(s => s.id === proposal.sceneId)!;
      let artifact: ArtifactComposition;
      if (proposal.kind === 'spotlight') {
        const target = await locate(ctx, model, scene.assetId, proposal.target || proposal.title);
        artifact = compileGraphic(p, proposal, target, old?.id);
      } else artifact = compileGraphic(p, proposal, undefined, old?.id);
      if (old) {
        artifact.enabled = old.enabled;
        p.artifacts = p.artifacts.filter(a => a.id !== old.id);
      }
      p.artifacts.push(artifact);
      const outcome = p.sceneOutcomes?.find(s => s.sceneId === scene.id);
      if (outcome) { outcome.state = 'complete'; outcome.reason = artifact.intent; outcome.artifactIds = [artifact.id]; }
    } catch (error) {
      ctx.signal.throwIfAborted();
      if (error instanceof EditingError && error.code === 'NEEDS_CONFIGURATION') throw error;
      fail(proposal.sceneId, `${proposal.kind === 'spotlight' ? 'Object spotlight' : 'Graphic'} skipped: ${error instanceof Error ? error.message.slice(0, 600) : 'Validation failed.'}${old ? ' Previous graphic preserved.' : ' Original scene media preserved.'}`, old?.id);
    }
    checkpoint.completed.push(proposal.sceneId); save();
  }
  p.status = p.diagnostics.some(d => d.code === 'GRAPHIC_SKIPPED') ? 'partial' : 'ready';
  validateProject(p); save();
  ctx.stage('Motion graphics ready', checkpoint.proposals.length, checkpoint.proposals.length);
  return p;
}
