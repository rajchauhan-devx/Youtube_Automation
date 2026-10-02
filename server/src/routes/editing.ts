import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  capabilities,
  RENDERER_VERSION,
  MotionGraphic,
  Frame,
  validateProject,
  motionProject,
  UUID,
  Settings,
  type EditingProject,
} from "@tubeflow/editing-contracts";
import {
  createProject,
  reviseProjectInputs,
  scriptFingerprint,
  type ScriptInput,
} from "../services/editing/projects.js";
import {
  current,
  revision,
  nextRevision,
  publish,
  jobs,
  getJob,
  assetFile,
  assetRecord,
  projectDir,
  listProjects,
} from "../services/editing/repository.js";
import {
  enqueue,
  cancel,
  resume,
  reconcile,
} from "../services/editing/scheduler.js";
import {
  editingConfig,
  EditingError,
} from "../services/editing/config.js";
import { motionModel, motionCredential } from '../services/editing/motionProvider.js';
import { graphicIssues, graphicNames } from '@tubeflow/video-composition';
import { mediaUrl } from "../services/workspace.js";
import { store } from "../services/store.js";
import { sampleFrames } from "@tubeflow/video-composition";
import { createMotionCaptions } from '../services/editing/motionCaptions.js';
export const editingRouter = Router();
const route =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve()
      .then(() => {
        reconcile();
        return fn(req, res);
      })
      .catch(next);
  };
const expected = (p: EditingProject, value: unknown) => {
  if (p.revisionId !== UUID.parse(value))
    throw new EditingError(
      "REVISION_CONFLICT",
      "This project changed. Refresh and try again.",
      409,
    );
};
const key = (req: Request) =>
  z.string().min(1).max(128).parse(req.get("Idempotency-Key"));
const credential = (req: Request) => req.get("x-api-key");
function payload(saved: EditingProject) {
  const p = motionProject(saved);
  const script = store.getById<ScriptInput>("scripts", p.scriptId);
  return {
    project: { ...p, artifacts: p.artifacts.filter(a => a.graphic) },
    legacyArtifactCount: saved.artifacts.filter(a => !a.graphic).length,
    currentRevisionId: current(p.id).revisionId,
    artifactPreviews: Object.fromEntries(
      p.artifacts.flatMap((artifact) => {
        const frame = sampleFrames(artifact)[1] ?? artifact.startFrame;
        let ancestor: EditingProject | undefined = p;
        while (ancestor) {
          if (
            JSON.stringify(
              ancestor.artifacts.find((a) => a.id === artifact.id)?.nodes,
            ) !== JSON.stringify(artifact.nodes)
          )
            break;
          if (
            fs.existsSync(
              path.join(
                projectDir(p.id),
                "previews",
                ancestor.revisionId,
                `${frame}.png`,
              ),
            )
          )
            return [
              [
                artifact.id,
                mediaUrl(
                  `editing/projects/${p.id}/previews/${ancestor.revisionId}/${frame}.png`,
                ),
              ],
            ];
          ancestor = ancestor.parentRevisionId
            ? revision(p.id, ancestor.parentRevisionId)
            : undefined;
        }
        return [];
      }),
    ),
    revisions: fs
      .readdirSync(path.join(projectDir(p.id), "revisions"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => revision(p.id, file.slice(0, -5)))
      .map((rev) => ({
        revisionId: rev.revisionId,
        status: rev.status,
        createdAt: rev.createdAt,
        language: rev.inputs.language,
        audioFilename: rev.inputs.audioFilename,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    stale: !script || scriptFingerprint(script) !== p.inputs.scriptHash,
    jobs: jobs(p.id).map(job => {
      if (job.operation !== 'render' || !job.outputUrl) return job;
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(projectDir(p.id), 'renders', job.id, 'manifest.json'), 'utf8'));
        if (manifest.rendererVersion === RENDERER_VERSION) return job;
      } catch { /* Old exports remain archived; do not offer them as current graphics output. */ }
      return { ...job, outputUrl: undefined };
    }),
    assets: Object.fromEntries(
      p.assetIds.map((id) => [
        id,
        { record: assetRecord(id), url: mediaUrl(`editing/assets/${id}`) },
      ]),
    ),
  };
}
editingRouter.get(
  "/capabilities",
  route(async (req, res) => {
    const c = editingConfig(), missing: string[] = [];
    const selected = req.query.model === undefined ? undefined : z.string().min(1).max(150).parse(req.query.model);
    let model = '';
    try { model = motionModel(selected); } catch (error) { missing.push(error instanceof Error ? error.message : 'Select a Gemini model.'); }
    if (!motionCredential(credential(req))) missing.push('Add GEMINI_API_KEY in server/.env.');
    res.json({ ...capabilities, ready: missing.length === 0, missing,
      provider: 'Gemini', models: { planner: model, vision: model, review: model }, modelsVerified: false,
      alignment: 'Saved narration scene timing; estimated timing when unavailable', grounding: true,
      artifactGeneration: false, renderer: 'remotion', graphics: Object.keys(graphicNames),
      limits: { maxProviderCalls: c.maxCalls, maxGeneratedAssets: 0 } });
  }),
);
editingRouter.post(
  "/projects",
  route(async (req, res) => {
    const p = await createProject(req.body);
    res
      .status(201)
      .json({ projectId: p.id, revisionId: p.revisionId, ...payload(p) });
  }),
);
editingRouter.get(
  "/projects",
  route((req, res) =>
    res.json({
      projects: listProjects()
        .filter((p) => !req.query.scriptId || p.scriptId === req.query.scriptId)
        .map((p) => ({
          id: p.id,
          revisionId: p.revisionId,
          scriptId: p.scriptId,
          status: p.status,
          createdAt: p.createdAt,
        })),
    }),
  ),
);
editingRouter.get(
  "/projects/:projectId",
  route((req, res) => res.json(payload(current(req.params.projectId)))),
);
editingRouter.get(
  "/projects/:projectId/revisions/:revisionId",
  route((req, res) =>
    res.json(payload(revision(req.params.projectId, req.params.revisionId))),
  ),
);
editingRouter.post(
  "/projects/:projectId/generate",
  route((req, res) => {
    const p = current(req.params.projectId);
    expected(p, req.body.expectedRevisionId);
    const job = enqueue(p, "generate", key(req), credential(req));
    res.status(202).json({ jobId: job.id, revisionId: p.revisionId });
  }),
);
editingRouter.post(
  '/projects/:projectId/captions',
  route(async (req, res) => {
    const body = z.strictObject({ expectedRevisionId: UUID }).parse(req.body);
    const p = current(req.params.projectId);
    expected(p, body.expectedRevisionId);
    if (jobs(p.id).some(job => ['queued', 'running', 'cancel_requested'].includes(job.state)))
      throw new EditingError('JOB_ACTIVE', 'Wait for the current Artifacts job before creating captions.', 409);
    const script = store.getById<ScriptInput>('scripts', p.scriptId);
    if (!script || scriptFingerprint(script) !== p.inputs.scriptHash)
      throw new EditingError('STALE_INPUT', 'Media or narration changed. Create a new revision first.', 409);
    const next = await createMotionCaptions(p, new AbortController().signal);
    publish(next, p.revisionId);
    res.status(201).json(payload(next));
  }),
);
editingRouter.post(
  '/projects/:projectId/captions/clear',
  route((req, res) => {
    const body = z.strictObject({ expectedRevisionId: UUID }).parse(req.body);
    const p = current(req.params.projectId);
    expected(p, body.expectedRevisionId);
    if (jobs(p.id).some(job => ['queued', 'running', 'cancel_requested'].includes(job.state)))
      throw new EditingError('JOB_ACTIVE', 'Wait for the current Artifacts job before removing captions.', 409);
    const next = nextRevision(p);
    next.artifacts = next.artifacts.filter(a => a.graphic?.kind !== 'caption');
    next.diagnostics = next.diagnostics.filter(d => d.code !== 'CAPTION_TIMING_ESTIMATED');
    next.status = next.artifacts.some(a => a.graphic) ? (next.diagnostics.some(d => d.code === 'GRAPHIC_SKIPPED') ? 'partial' : 'ready') : 'draft';
    publish(next, p.revisionId);
    res.status(201).json(payload(next));
  }),
);
editingRouter.post(
  '/projects/:projectId/graphics/clear',
  route((req, res) => {
    const body = z.strictObject({ expectedRevisionId: UUID }).parse(req.body);
    const p = current(req.params.projectId);
    expected(p, body.expectedRevisionId);
    if (jobs(p.id).some(job => ['queued', 'running', 'cancel_requested'].includes(job.state)))
      throw new EditingError('JOB_ACTIVE', 'Wait for the current Artifacts job before removing graphics.', 409);
    const next = nextRevision(p);
    next.artifacts = next.artifacts.filter(a => a.graphic?.kind === 'caption');
    next.sceneOutcomes = next.scenes.map(scene => ({ sceneId: scene.id, state: 'not_needed', reason: 'No extra graphic is needed for this scene.', artifactIds: [] }));
    next.diagnostics = next.diagnostics.filter(d => d.stage !== 'graphics');
    next.status = next.artifacts.length ? 'ready' : 'draft';
    publish(next, p.revisionId);
    res.status(201).json(payload(next));
  }),
);
editingRouter.post(
  "/projects/:projectId/reset",
  route((req, res) => {
    const body = z.strictObject({ expectedRevisionId: UUID }).parse(req.body);
    const p = current(req.params.projectId);
    expected(p, body.expectedRevisionId);
    if (jobs(p.id).some(job => ["queued", "running", "cancel_requested"].includes(job.state)))
      throw new EditingError("JOB_ACTIVE", "Cancel the current Artifacts job before starting fresh.", 409);
    let original = p;
    while (original.parentRevisionId)
      original = revision(p.id, original.parentRevisionId);
    const fresh = nextRevision(original);
    fresh.parentRevisionId = p.revisionId;
    fresh.settings = structuredClone(p.settings);
    fresh.status = "draft";
    fresh.analyses = [];
    fresh.artifacts = [];
    fresh.sceneOutcomes = [];
    fresh.diagnostics = [];
    fresh.scenes.forEach(scene => { delete scene.analysisId; });
    publish(fresh, p.revisionId);
    res.status(201).json(payload(fresh));
  }),
);
editingRouter.post(
  "/projects/:projectId/revisions",
  route(async (req, res) => {
    if (req.body.inputs !== undefined) {
      const change = z
          .strictObject({ expectedRevisionId: UUID, inputs: z.unknown() })
          .parse(req.body),
        p = current(req.params.projectId);
      expected(p, change.expectedRevisionId);
      const next = await reviseProjectInputs(p, change.inputs);
      res.status(201).json(payload(next));
      return;
    }
    const change = z
        .strictObject({ expectedRevisionId: UUID, settings: Settings })
        .parse(req.body),
      p = current(req.params.projectId);
    expected(p, change.expectedRevisionId);
    const next = nextRevision(p);
    next.settings = change.settings;
    next.status = "draft";
    next.artifacts = [];
    next.diagnostics = [];
    publish(next, p.revisionId);
    res.status(201).json(payload(next));
  }),
);
editingRouter.patch(
  "/projects/:projectId/artifacts/:artifactId",
  route((req, res) => {
    const change = z.strictObject({ expectedRevisionId: UUID, enabled: z.boolean().optional(),
      graphic: MotionGraphic.optional(), startFrame: Frame.optional(), endFrame: Frame.optional() }).parse(req.body);
    const p = current(req.params.projectId);
    expected(p, change.expectedRevisionId);
    if (jobs(p.id).some(j => ['queued', 'running', 'cancel_requested'].includes(j.state)))
      throw new EditingError('JOB_ACTIVE', 'Wait for the current graphics job before editing this card.', 409);
    const next = nextRevision(p), artifact = next.artifacts.find(a => a.id === req.params.artifactId);
    if (!artifact?.graphic) throw new EditingError('NOT_FOUND', 'Motion graphic not found. Regenerate legacy artifacts first.', 404);
    if (change.enabled !== undefined) artifact.enabled = change.enabled;
    if (change.graphic) {
      // A text/layout edit cannot forge or replace the model-verified target.
      if (JSON.stringify(change.graphic.target) !== JSON.stringify(artifact.graphic.target) || change.graphic.kind !== artifact.graphic.kind)
        throw new EditingError('INVALID_TARGET', 'Regenerate the spotlight to change its target.');
      artifact.graphic = change.graphic;
      artifact.intent = `${graphicNames[change.graphic.kind]}: ${change.graphic.title}`;
    }
    if (change.startFrame !== undefined) artifact.startFrame = change.startFrame;
    if (change.endFrame !== undefined) artifact.endFrame = change.endFrame;
    const scene = next.scenes.find(s => s.id === artifact.sceneId)!;
    const source = assetRecord(scene.assetId);
    const issues = graphicIssues(next, artifact, { width: source.width!, height: source.height! });
    if (issues.length) throw new EditingError('INVALID_LAYOUT', issues.join(' '));
    validateProject(next);
    publish(next, p.revisionId);
    res.json(payload(next));
  }),
);
editingRouter.post(
  "/projects/:projectId/artifacts/:artifactId/revise",
  route((req, res) => {
    const body = z
        .strictObject({
          expectedRevisionId: UUID,
          instruction: z.string().trim().min(1).max(2000),
        })
        .parse(req.body),
      p = current(req.params.projectId);
    expected(p, body.expectedRevisionId);
    if (!p.artifacts.some((a) => a.id === req.params.artifactId && a.graphic?.kind !== 'caption'))
      throw new EditingError("NOT_FOUND", "Motion graphic not found", 404);
    const job = enqueue(p, "revise", key(req), credential(req), {
      artifactId: req.params.artifactId,
      instruction: body.instruction,
    });
    res.status(202).json({ jobId: job.id, revisionId: p.revisionId });
  }),
);
editingRouter.post(
  "/projects/:projectId/render",
  route((req, res) => {
    const body = z.strictObject({ revisionId: UUID }).parse(req.body),
      p = revision(req.params.projectId, body.revisionId);
    if (!["ready", "partial"].includes(p.status))
      throw new EditingError("NOT_READY", "Select a ready revision");
    const job = enqueue(p, "render", key(req), credential(req));
    res.status(202).json({ jobId: job.id, revisionId: p.revisionId });
  }),
);
editingRouter.get(
  "/jobs/:jobId",
  route((req, res) => res.json(getJob(req.params.jobId))),
);
editingRouter.post(
  "/jobs/:jobId/cancel",
  route((req, res) => res.json(cancel(req.params.jobId))),
);
editingRouter.post(
  "/jobs/:jobId/resume",
  route((req, res) => {
    res.status(202).json(resume(req.params.jobId, credential(req)));
  }),
);
editingRouter.get(
  "/assets/:assetId",
  route((req, res) => {
    const record = assetRecord(req.params.assetId);
    res
      .type(record.mime)
      .set("Cache-Control", "private, max-age=31536000, immutable")
      .sendFile(assetFile(req.params.assetId));
  }),
);
editingRouter.get(
  "/projects/:projectId/previews/:revisionId/:frame",
  route((req, res) => {
    revision(req.params.projectId, req.params.revisionId);
    if (!/^\d+\.png$/.test(req.params.frame))
      throw new EditingError("NOT_FOUND", "Preview not found", 404);
    res.sendFile(
      path.join(
        projectDir(req.params.projectId),
        "previews",
        req.params.revisionId,
        req.params.frame,
      ),
    );
  }),
);
editingRouter.get(
  "/projects/:projectId/renders/:jobId/video.mp4",
  route((req, res) => {
    const job = getJob(req.params.jobId);
    if (
      job.projectId !== req.params.projectId ||
      job.state !== "succeeded" ||
      job.operation !== "render"
    )
      throw new EditingError("NOT_FOUND", "Completed render not found", 404);
    res
      .type("video/mp4")
      .sendFile(
        path.join(projectDir(job.projectId), "renders", job.id, "video.mp4"),
      );
  }),
);
editingRouter.use(
  (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next; // Express requires four arguments to identify error middleware.
    if (error instanceof z.ZodError) {
      res.status(422).json({
        error: {
          code: "INVALID_PLAN",
          message: "Editing data failed validation",
          details: error.issues,
          retryable: false,
        },
      });
      return;
    }
    const e =
      error instanceof EditingError
        ? error
        : new EditingError(
            "EDITING_ERROR",
            error instanceof Error ? error.message : "Editing operation failed",
            500,
          );
    res.status(e.status).json({
      error: { code: e.code, message: e.message, retryable: e.retryable },
    });
  },
);
