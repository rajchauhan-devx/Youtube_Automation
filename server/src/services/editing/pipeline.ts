import fs from "node:fs";
import path from "node:path";
import { sceneThumbnails } from "./sceneMedia.js";
import { z } from "zod";
import {
  Style,
  Analysis,
  Artifact,
  AssetRequest,
  Id,
  capabilities,
  validateProject,
  toFrame,
  type EditingProject,
  type ArtifactComposition,
} from "@tubeflow/editing-contracts";
import { structured, type ProviderContext } from "./providers.js";
import { editingConfig, EditingError, editingNeedsApiKey } from "./config.js";
import {
  assetRecord,
  assetFile,
  projectDir,
  atomic,
  objectHash,
  nextRevision,
} from "./repository.js";
import { align, mapScenes, compileCue } from "./timing.js";
import { buildAsset, ground } from "./assets.js";
import { assetCacheKey, workflowCapabilities } from "./artifactWorkflow.js";
import { layoutDiagnostics, placeArtifact } from "./layout.js";
import { previewFrames } from "./renderer.js";
import { validateNarrativeLabels } from "./evidence.js";
const Brief = z.strictObject({
  id: Id,
  sceneId: Id,
  intent: z.string().min(1).max(2000),
  narrativeRefs: z.array(Id).min(1).max(100),
  assetRequests: z.array(AssetRequest).max(10),
});
const Plan = z.strictObject({ briefs: z.array(Brief).max(160) });
const RevisionDesign = z.strictObject({
  artifact: Artifact,
  assetRequests: z.array(AssetRequest).max(10),
});
const Review = z.strictObject({
  findings: z
    .array(
      z.strictObject({
        artifactId: Id,
        frame: z.number().int().min(0),
        severity: z.enum(["warning", "error"]),
        message: z.string().max(1000),
      }),
    )
    .max(100),
});
const diagnostic = (
  p: EditingProject,
  code: string,
  message: string,
  artifactId?: string,
) =>
  p.diagnostics.push({
    severity: "warning",
    code,
    stage: "pipeline",
    message,
    artifactId,
    retryable: false,
  });
export interface PipelineContext extends ProviderContext {
  stage: (name: string, completed: number, total: number) => void;
}
export async function thumbnail(id: string) { return (await sceneThumbnails(id))[0]; }
function validateArtifact(p: EditingProject, a: ArtifactComposition) {
  validateNarrativeLabels(p, a);
  const candidate = {
    ...p,
    artifacts: [...p.artifacts.filter((x) => x.id !== a.id), a],
  };
  validateProject(candidate);
  const scene = p.scenes.find((s) => s.id === a.sceneId)!;
  if (assetRecord(scene.assetId).mime === "video/mp4") {
    for (const node of a.nodes) {
      if ((!node.parentId && node.space !== "screen") || (node.kind === "connector" && [node.from, node.to].some(anchor => anchor.kind === "source" || anchor.kind === "object")))
        throw new Error("Moving scenes need screen-space explanations; sampled frames do not provide motion tracking.");
    }
  }
  // A model cannot bypass grounding policy by supplying a raw source point.
  for (const node of a.nodes)
    if (node.kind === "connector")
      for (const anchor of [node.from, node.to])
        if (anchor.kind === "source")
          throw new Error(
            "Use a grounded object anchor, not a model-guessed source point",
          );
  if (
    p.alignment.mode === "approximate" &&
    (a.startFrame !== scene.startFrame || a.endFrame !== scene.endFrame)
  )
    throw new Error("Approximate alignment requires scene-wide timing");
  const failures = layoutDiagnostics(candidate, a);
  if (failures.length)
    throw new Error(failures.map((f) => `${f.code}: ${f.message}`).join("; "));
  return a;
}
export async function runPipeline(input: EditingProject, ctx: PipelineContext) {
  const config = editingConfig();
  if (
    !config.planner ||
    !config.vision ||
    !config.review ||
    (editingNeedsApiKey() && !(ctx.apiKey || process.env.OPENROUTER_API_KEY))
  )
    throw new EditingError(
      "NEEDS_CONFIGURATION",
      "Configure visual editing models. Remote OpenRouter models also require an API key.",
      422,
      true,
    );
  let p = nextRevision(input);
  if (ctx.job.operation === "generate") {
    p.artifacts = [];
    p.analyses = [];
    p.diagnostics = [];
    p.sceneOutcomes = [];
    p.status = "draft";
    p.scenes.forEach((scene) => {
      delete scene.analysisId;
    });
  }
  const checkpoint = path.join(
    projectDir(input.id),
    "jobs",
    `${ctx.job.id}.checkpoint.json`,
  );
  if (fs.existsSync(checkpoint)) {
    const cached = JSON.parse(fs.readFileSync(checkpoint, "utf8")) as {
      inputHash: string;
      project: EditingProject;
    };
    if (cached.inputHash === ctx.job.inputHash)
      p = validateProject(cached.project);
  }
  const save = () => {
    ctx.signal.throwIfAborted();
    atomic(checkpoint, { inputHash: ctx.job.inputHash, project: p });
  };
  async function stage(name: string, work: () => Promise<void>) {
    if (ctx.job.stages[name]) return;
    ctx.stage(name, 0, 1);
    const start = Date.now();
    await work();
    save();
    ctx.job.stages[name] = { durationMs: Date.now() - start };
    ctx.stage(name, 1, 1);
    ctx.persist();
  }
  if (ctx.job.operation === "revise") {
    const existing = p.artifacts.find((a) => a.id === ctx.job.artifactId);
    if (!existing) throw new Error("Artifact no longer exists");
    await stage("revising composition", async () => {
      let last = "";
      for (let attempt = 0; attempt <= config.maxRepairs; attempt++) {
        try {
          const design = await structured(
            ctx,
            attempt ? "repair" : "revise",
            config.planner,
            RevisionDesign.extend({
              artifact: Artifact.extend({
                id: z.literal(existing.id),
                sceneId: z.literal(existing.sceneId),
              }),
            }),
            {
              project: p,
              artifact: existing,
              instruction: ctx.job.instruction,
              capabilities,
              assetGenerationAvailable: !!config.workflow,
              assetCapabilities: workflowCapabilities(),
            },
            [],
            last,
          );
          let replacement = design.artifact;
          const resolved: Record<string, string> = {};
          for (const request of design.assetRequests) {
            if (
              (request.sourceAssetId &&
                !p.assetIds.includes(request.sourceAssetId)) ||
              request.referenceAssetIds.some((id) => !p.assetIds.includes(id))
            )
              throw new Error("Revision references an unapproved asset");
            const file = path.join(
              projectDir(p.id),
              "jobs",
              `asset-${assetCacheKey(request, p.style)}.json`,
            );
            let asset;
            if (fs.existsSync(file)) {
              asset = assetRecord(
                (JSON.parse(fs.readFileSync(file, "utf8")) as { id: string })
                  .id,
              );
              assetFile(asset.id);
            } else {
              if (
                request.strategy === "generate" &&
                p.assetIds.filter((id) => assetRecord(id).method === "generate")
                  .length >=
                  Math.min(p.settings.maxGeneratedAssets, config.maxAssets)
              )
                throw new Error(
                  "Generated asset budget reached; revise using existing media or vector primitives",
                );
              asset = await buildAsset(request, ctx.signal);
              ctx.signal.throwIfAborted();
              atomic(file, { id: asset.id });
            }
            resolved[request.id] = asset.id;
            if (!p.assetIds.includes(asset.id)) p.assetIds.push(asset.id);
          }
          replacement.nodes = replacement.nodes.map((node) => ({
            ...node,
            ...(node.kind === "image" && resolved[node.assetId]
              ? { assetId: resolved[node.assetId] }
              : {}),
            ...(node.clip?.kind === "mask" && resolved[node.clip.assetId]
              ? { clip: { ...node.clip, assetId: resolved[node.clip.assetId] } }
              : {}),
          }));
          if (
            replacement.id !== existing.id ||
            replacement.sceneId !== existing.sceneId
          )
            throw new Error("Revision must preserve artifact identity");
          replacement = placeArtifact(p, compileCue(p, replacement));
          replacement.revisionInstruction = ctx.job.instruction;
          validateArtifact(p, replacement);
          p.artifacts = p.artifacts.map((a) =>
            a.id === existing.id ? replacement : a,
          );
          return;
        } catch (e) {
          if (e instanceof EditingError && e.code === "NEEDS_CONFIGURATION")
            throw e;
          ctx.signal.throwIfAborted();
          last = e instanceof Error ? e.message : "Invalid revision";
        }
      }
      throw new EditingError(
        "REVISION_FAILED",
        `Current preview was preserved. ${last}`,
      );
    });
  } else {
    await stage("aligning narration", async () => {
      try {
        p.alignment = await align(p, ctx.signal);
      } catch {
        ctx.signal.throwIfAborted();
        p.alignment = await align(p, ctx.signal, false);
        diagnostic(
          p,
          "ALIGNMENT_FALLBACK",
          "Alignment service failed; timing remains approximate and precision cues are disabled.",
        );
      }
      if (p.alignment.mode === "approximate")
        diagnostic(
          p,
          "APPROXIMATE_TIMING",
          "Narration timing is estimated, not word aligned. Scene-wide graphics only. Configure alignment for measured cues.",
        );
      p.scenes = mapScenes(p);
      validateProject(p);
    });
    await stage("directing style", async () => {
      try {
        const style = await structured(
          ctx,
          "style",
          config.vision,
          Style,
          {
            narration: p.inputs.narrationText.slice(0, 4000),
            settings: p.settings,
            style: p.style,
            dimensions: {width: p.inputs.width, height: p.inputs.height, fps: p.inputs.fps},
          },
          (await sceneThumbnails(p.scenes[0].assetId, ctx.signal)).slice(0, 1),
        );
        if (
          style.fontAssetIds.some((id) => !p.style.fontAssetIds.includes(id)) ||
          style.textureAssetIds.some((id) => !p.assetIds.includes(id))
        )
          throw new Error("Style invented font/texture assets");
        p.style = { ...style, fontAssetIds: p.style.fontAssetIds };
      } catch (error) {
        ctx.signal.throwIfAborted();
        if (
          error instanceof EditingError &&
          error.code === "NEEDS_CONFIGURATION"
        )
          throw error;
        diagnostic(
          p,
          "STYLE_FALLBACK",
          "Style direction failed; the validated project typography and palette are retained.",
        );
      }
    });
    await stage("analyzing scenes", async () => {
      for (let i = 0; i < p.scenes.length; i++) {
        ctx.signal.throwIfAborted();
        const scene = p.scenes[i],
          record = assetRecord(scene.assetId),
          cache = path.join(
            projectDir(p.id),
            "analyses",
            `${objectHash({ hash: record.hash, model: config.vision, grounding: config.groundingUrl, sceneSeconds: (scene.endFrame - scene.startFrame) / p.inputs.fps, version: 2 })}.json`,
          );
        if (
          scene.analysisId &&
          p.analyses.some((a) => a.id === scene.analysisId)
        )
          continue;
        let analysis;
        if (fs.existsSync(cache))
          analysis = Analysis.parse(JSON.parse(fs.readFileSync(cache, "utf8")));
        else {
          try {
            analysis = await structured(
              ctx,
              "analyze",
              config.vision,
              Analysis,
              {
                id: `analysis-${i}`,
                assetId: record.id,
                imageHash: record.hash,
                width: record.width,
                height: record.height,
                mediaType: record.mime,
                motionPolicy: "Video images are chronological samples, not motion tracks. Describe changes; reserve regions covering subject movement. Use non-pointing screen overlays for video.",
                narration: scene.narrativeRefs
                  .map(
                    (id) => p.alignment.tokens.find((t) => t.id === id)?.text,
                  )
                  .join(" "),
              },
              await sceneThumbnails(scene.assetId, ctx.signal, (scene.endFrame - scene.startFrame) / p.inputs.fps),
            );
            analysis = {
              ...analysis,
              id: `analysis-${i}`,
              assetId: record.id,
              imageHash: record.hash,
              width: record.width!,
              height: record.height!,
              objects: analysis.objects.map((o) => ({
                ...o,
                method: "vision-estimate" as const,
                maskAssetId: undefined,
              })),
            };
            try {
              if (record.mime !== "video/mp4") analysis = await ground(analysis, ctx.signal);
              else analysis.objects = [];
            } catch {
              ctx.signal.throwIfAborted();
              diagnostic(
                p,
                "GROUNDING_UNAVAILABLE",
                "Precise localization failed. Use non-pointing explanations.",
              );
            }
            atomic(cache, analysis);
          } catch (error) {
            ctx.signal.throwIfAborted();
            if (
              error instanceof EditingError &&
              error.code === "NEEDS_CONFIGURATION"
            )
              throw error;
            diagnostic(
              p,
              "ANALYSIS_UNAVAILABLE",
              `Scene ${i + 1} could not be inspected. Precise targets are unavailable.`,
            );
            analysis = {
              id: `analysis-${i}`,
              assetId: record.id,
              imageHash: record.hash,
              width: record.width!,
              height: record.height!,
              description:
                "Image inspection unavailable; do not infer object locations or image facts",
              protectedRegions: [],
              objects: [],
            };
          }
        }
        analysis.id = `analysis-${i}`;
        p.analyses.push(analysis);
        scene.analysisId = analysis.id;
        save();
        ctx.stage("analyzing scenes", i + 1, p.scenes.length);
      }
    });
    await stage("mapping scenes", async () => {
      if (p.inputs.sceneTiming.length || p.scenes.length === 1 || p.scenes.length > 8) return;
      try {
        const mapping = await structured(
          ctx,
          "map",
          config.planner,
          z.strictObject({
            starts: z
              .array(z.strictObject({ sceneId: Id, firstTokenId: Id }))
              .min(1)
              .max(160),
          }),
          {
            scenes: p.scenes,
            analyses: p.analyses,
            narration: p.alignment.tokens,
            images: p.inputs.imageAssets,
          },
        );
        if (mapping.starts.length !== p.scenes.length)
          throw new Error("Mapping omitted scenes");
        const starts = mapping.starts.map((entry, index) => {
          if (entry.sceneId !== p.scenes[index].id)
            throw new Error("Mapping reordered scenes");
          const token = p.alignment.tokens.find(
            (t) => t.id === entry.firstTokenId,
          );
          if (!token) throw new Error("Mapping invented a token");
          return index === 0 ? 0 : toFrame(token.start, p.inputs.fps);
        });
        if (
          starts.some((start, index) => index > 0 && start <= starts[index - 1])
        )
          throw new Error("Mapping has invalid scene boundaries");
        p.scenes = p.scenes.map((scene, index) => {
          const startFrame = starts[index],
            endFrame = starts[index + 1] ?? p.inputs.durationFrames;
          return {
            ...scene,
            startFrame,
            endFrame,
            narrativeRefs: p.alignment.tokens
              .filter(
                (t) =>
                  toFrame(t.start, p.inputs.fps) >= startFrame &&
                  toFrame(t.start, p.inputs.fps) < endFrame,
              )
              .map((t) => t.id),
            camera: [
              { frame: 0, x: 0, y: 0, scale: 1 },
              { frame: endFrame - startFrame, x: 0, y: 0, scale: assetRecord(scene.assetId).mime === "video/mp4" ? 1 : 1.06 },
            ],
          };
        });
      } catch (error) {
        ctx.signal.throwIfAborted();
        if (
          error instanceof EditingError &&
          error.code === "NEEDS_CONFIGURATION"
        )
          throw error;
        diagnostic(
          p,
          "SCENE_MAPPING_FALLBACK",
          "Semantic scene mapping was unavailable; estimated token-allocation boundaries are used.",
        );
      }
    });
    await stage("designing visuals", async () => {
      const planFile = path.join(
        projectDir(p.id),
        "jobs",
        `${ctx.job.id}.briefs.json`,
      );
      const plan: z.infer<typeof Plan> = fs.existsSync(planFile)
        ? Plan.parse(JSON.parse(fs.readFileSync(planFile, "utf8"))) : {briefs: []};
      p.sceneOutcomes ||= [];
      for (const [index, scene] of p.scenes.entries()) {
        if (p.sceneOutcomes.some(o => o.sceneId === scene.id)) continue;
        ctx.stage("planning scenes", index, p.scenes.length);
        try {
          if (p.analyses.find(a => a.id === scene.analysisId)?.description.startsWith("Image inspection unavailable"))
            throw new Error("Scene inspection failed; artifact decisions could not be made.");
          const decision = await structured(ctx, "plan", config.planner,
            z.strictObject({briefs: z.array(Brief.extend({sceneId: z.literal(scene.id)})).max(1), reason: z.string().max(2000).optional()}), {
              narration: {...p.alignment, tokens: p.alignment.tokens.filter(t => scene.narrativeRefs.includes(t.id))},
              scenes: [scene], analyses: p.analyses.filter(a => a.id === scene.analysisId),
              mediaType: assetRecord(scene.assetId).mime,
              style: p.style, settings: p.settings, capabilities,
              assetGenerationAvailable: !!config.workflow && p.settings.maxGeneratedAssets > 0,
              assetCapabilities: workflowCapabilities(), retrievalAvailable: false,
            });
          for (const brief of decision.briefs) {
            if (brief.narrativeRefs.some(id => !scene.narrativeRefs.includes(id))) throw new Error("Planner returned narration outside this scene.");
            brief.id = scene.id + "-artifact";
          }
          plan.briefs = plan.briefs.filter(b => b.sceneId !== scene.id);
          plan.briefs.push(...decision.briefs);
          p.sceneOutcomes.push({sceneId: scene.id, state: decision.briefs.length ? "planned" : "not_needed",
            reason: decision.reason || (decision.briefs.length ? "AI selected a visual explanation." : "AI decided the scene needs no extra explanation."),
            artifactIds: decision.briefs.map(b => b.id)});
        } catch (error) {
          ctx.signal.throwIfAborted();
          if (error instanceof EditingError && error.code === "NEEDS_CONFIGURATION") throw error;
          p.sceneOutcomes.push({sceneId: scene.id, state: "failed", reason: (error instanceof Error ? error.message : "Scene planning failed").slice(0, 2000), artifactIds: []});
          diagnostic(p, "PLANNING_FAILED", "Scene " + (index + 1) + " planning failed; this is not a no-artifact decision.");
        }
        atomic(planFile, plan);
        save();
      }
      let generated = p.assetIds.filter(
        (id) => assetRecord(id).method === "generate",
      ).length;
      for (let i = 0; i < plan.briefs.length; i++) {
        const brief = plan.briefs[i];
        if (p.artifacts.some((a) => a.id === brief.id)) continue;
        const scene = p.scenes.find((s) => s.id === brief.sceneId);
        if (
          !scene ||
          brief.narrativeRefs.some((id) => !scene.narrativeRefs.includes(id))
        ) {
          diagnostic(
            p,
            "OMITTED_INVALID_BRIEF",
            "Planner returned an unresolved scene/narrative reference.",
            brief.id,
          );
          continue;
        }
        const resolved: Record<string, string> = {};
        ctx.stage("preparing assets", i, plan.briefs.length);
        for (const request of brief.assetRequests) {
          try {
            if (
              request.sourceAssetId &&
              !p.assetIds.includes(request.sourceAssetId)
            )
              throw new Error("Asset source is not approved");
            if (
              request.referenceAssetIds.some((id) => !p.assetIds.includes(id))
            )
              throw new Error("Unapproved asset reference");
            const cacheFile = path.join(
              projectDir(p.id),
              "jobs",
              `asset-${assetCacheKey(request, p.style)}.json`,
            );
            let asset;
            if (fs.existsSync(cacheFile)) {
              asset = assetRecord(
                (
                  JSON.parse(fs.readFileSync(cacheFile, "utf8")) as {
                    id: string;
                  }
                ).id,
              );
              assetFile(asset.id);
            } else {
              if (
                request.strategy === "generate" &&
                generated >=
                  Math.min(p.settings.maxGeneratedAssets, config.maxAssets)
              )
                throw new Error("Generated asset budget reached");
              asset = await buildAsset(request, ctx.signal);
              ctx.signal.throwIfAborted();
              atomic(cacheFile, { id: asset.id });
            }
            if (
              request.strategy === "generate" &&
              !p.assetIds.includes(asset.id)
            )
              generated++;
            resolved[request.id] = asset.id;
            if (!p.assetIds.includes(asset.id)) p.assetIds.push(asset.id);
          } catch (e) {
            ctx.signal.throwIfAborted();
            diagnostic(
              p,
              "ASSET_FALLBACK",
              `Optional asset unavailable: ${e instanceof Error ? e.message : "provider failure"}. Use existing media or primitives.`,
              brief.id,
            );
          }
        }
        let last = "",
          artifact: ArtifactComposition | undefined;
        for (let attempt = 0; attempt <= config.maxRepairs; attempt++) {
          try {
            ctx.stage("designing visuals", i, plan.briefs.length);
            let candidate = await structured(
              ctx,
              attempt ? "repair" : "compose",
              config.planner,
              Artifact.extend({
                id: z.literal(brief.id),
                sceneId: z.literal(scene.id),
                narrativeRefs: z
                  .array(z.enum(scene.narrativeRefs as [string, ...string[]]))
                  .min(1)
                  .max(100),
              }),
              {
                brief,
                scene,
                style: p.style,
                analyses: p.analyses.filter((a) => a.id === scene.analysisId),
                resolvedAssets: resolved,
                availableAssets: p.assetIds.filter(id => id === scene.assetId || p.style.fontAssetIds.includes(id) || Object.values(resolved).includes(id)).map(assetRecord).filter(r => r.mime !== "video/mp4"),
                narration: {...p.alignment, tokens: p.alignment.tokens.filter(t => scene.narrativeRefs.includes(t.id))},
                dimensions: {
                  width: p.inputs.width,
                  height: p.inputs.height,
                  fps: p.inputs.fps,
                },
                capabilities,
                invalidArtifact: artifact,
              },
              [],
              last,
            );
            candidate = placeArtifact(p, compileCue(p, candidate));
            artifact = candidate;
            if (
              candidate.id !== brief.id ||
              candidate.sceneId !== brief.sceneId
            )
              throw new Error(
                `Artifact ID must be ${brief.id} and scene ID must be ${scene.id}`,
              );
            validateArtifact(p, candidate);
            p.artifacts.push(candidate);
            artifact = undefined;
            last = "";
            break;
          } catch (e) {
            ctx.signal.throwIfAborted();
            if (e instanceof EditingError && e.code === "NEEDS_CONFIGURATION")
              throw e;
            last = e instanceof Error ? e.message : "Invalid composition";
            diagnostic(
              p,
              "COMPOSITION_REPAIR",
              `Attempt ${attempt + 1}: ${last.slice(0, 1800)}`,
              brief.id,
            );
          }
        }
        if (last)
          diagnostic(
            p,
            "OMITTED_ARTIFACT",
            `Optional composition omitted after bounded repair: ${last.slice(0, 1800)}`,
            brief.id,
          );
        save();
      }
    });
  }
  await stage("reviewing previews", async () => {
    diagnostic(p, "UNVERIFIED_SCRIPT_CLAIMS", "Labels are traced to supplied narration. Script claims have not been independently verified.");
    const selected = p.artifacts.filter(a => a.enabled);
    for (const [index, original] of selected.entries()) {
      const scene = p.scenes.find(s => s.id === original.sceneId)!;
      const cache = path.join(projectDir(p.id), "jobs", ctx.job.id + "-review-" + original.id + ".json");
      if (fs.existsSync(cache) && JSON.parse(fs.readFileSync(cache, "utf8")).hash === objectHash(original)) continue;
      let accepted = false, last = "", candidate = original;
      for (let attempt = 0; attempt <= config.maxRepairs; attempt++) {
        ctx.signal.throwIfAborted();
        ctx.stage(attempt ? "repairing and reviewing artifacts" : "reviewing artifacts", index, selected.length);
        try {
          if (attempt) {
            const repaired = await structured(ctx, "repair", config.planner,
              Artifact.extend({id: z.literal(original.id), sceneId: z.literal(scene.id)}), {
                invalidArtifact: candidate, scene, style: p.style,
                instruction: "Resolve the visible review findings. Simplify to a clear readable explanation if necessary. Keep the same intent and cited narration. Use only existing image assets or vector primitives.",
                narration: {...p.alignment, tokens: p.alignment.tokens.filter(t => scene.narrativeRefs.includes(t.id))},
                analyses: p.analyses.filter(a => a.id === scene.analysisId),
                availableAssets: p.assetIds.filter(id => id === scene.assetId || p.style.fontAssetIds.includes(id) || candidate.nodes.some(n => n.kind === "image" && n.assetId === id)).map(assetRecord).filter(a => a.mime !== "video/mp4"),
                dimensions: {width: p.inputs.width, height: p.inputs.height, fps: p.inputs.fps}, capabilities,
              }, [], last);
            candidate = placeArtifact(p, compileCue(p, repaired));
            validateArtifact(p, candidate);
            p.artifacts = p.artifacts.map(a => a.id === candidate.id ? candidate : a);
          }
          const samples = await previewFrames(p, ctx.signal, candidate.id);
          const findings: string[] = samples.flatMap(s => s.findings.filter(f => f.artifactId === candidate.id).map(f => f.message));
          for (let i = 0; i < samples.length; i += 6) {
            const batch = samples.slice(i, i + 6);
            const review = await structured(ctx, "review", config.review, Review, {
              frames: batch.map(s => s.frame), fps: p.inputs.fps,
              narration: p.alignment.tokens.filter(t => scene.narrativeRefs.includes(t.id)).map(t => t.text).join(" "),
              artifacts: [candidate], style: p.style,
              note: "Entry/exit animation may intentionally hide or fade text. Different heading/body sizes are intentional. Report concrete visible defects; do not invent numeric contrast measurements from screenshots.",
            }, batch.map(s => "data:image/png;base64," + fs.readFileSync(s.file).toString("base64")));
            for (const finding of review.findings) {
              if (finding.artifactId !== candidate.id || !batch.some(s => s.frame === finding.frame)) continue;
              diagnostic(p, "VISUAL_REVIEW", "Frame " + finding.frame + ": " + finding.message, candidate.id);
              if (finding.severity === "error") findings.push(finding.message);
            }
          }
          if (findings.length) throw new Error(findings.join("; "));
          accepted = true;
          atomic(cache, {hash: objectHash(candidate)});
          break;
        } catch (error) {
          ctx.signal.throwIfAborted();
          if (error instanceof EditingError && error.code === "NEEDS_CONFIGURATION") throw error;
          last = (error instanceof Error ? error.message : "Visual review failed").slice(0, 2000);
          diagnostic(p, "VISUAL_REPAIR", "Review attempt " + (attempt + 1) + ": " + last, candidate.id);
          if (ctx.job.usage.length >= ctx.maxCalls) break;
        }
      }
      if (!accepted) {
        if (ctx.job.operation === "revise") throw new EditingError("REVISION_REVIEW_FAILED", "Revision could not pass review after repair. Previous preview preserved. " + last, 422, true);
        p.artifacts = p.artifacts.filter(a => a.id !== original.id);
        diagnostic(p, "OMITTED_AFTER_REVIEW", "Artifact remains incomplete after automatic repair: " + last, original.id);
      }
      save();
    }
    // Refresh final previews after any rejected graphics have been removed.
    const samples = await previewFrames(p, ctx.signal);
    atomic(path.join(projectDir(p.id), "qa", p.revisionId + ".json"), {
      frames: samples.map(s => s.frame), diagnostics: p.diagnostics,
      scope: "Sampled rendered frames; not a guarantee about every frame",
    });
  });
  for (const outcome of p.sceneOutcomes || []) {
    if (outcome.state === "not_needed" || (outcome.state === "failed" && !outcome.artifactIds.length)) continue;
    const complete = outcome.artifactIds.length > 0 && outcome.artifactIds.every(id => p.artifacts.some(a => a.id === id));
    outcome.state = complete ? "complete" : "failed";
    outcome.reason = complete ? "Artifact generated and reviewed." : "The planned artifact could not pass generation or review after automatic repair. See diagnostics.";
  }
  p.status = p.sceneOutcomes?.some(o => o.state === "failed") ? "partial" : "ready";
  validateProject(p);
  save();
  return p;
}
