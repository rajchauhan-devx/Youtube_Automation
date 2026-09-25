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
  assertEditingEnabled,
  EditingError,
  editingNeedsApiKey,
  isLocalEditingModel,
} from "../services/editing/config.js";
import { modelCapabilities } from "../services/editing/providers.js";
import { mediaUrl } from "../services/workspace.js";
import { store } from "../services/store.js";
import { sampleFrames } from "@tubeflow/video-composition";
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
function payload(p: EditingProject) {
  const script = store.getById<ScriptInput>("scripts", p.scriptId);
  return {
    project: p,
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
    jobs: jobs(p.id),
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
    const c = editingConfig(),
      missing: string[] = [];
    if (!c.enabled) missing.push("Enable AI_EDITING_ENABLED on the server");
    if (!c.planner) missing.push("Configure EDITING_PLANNER_MODEL");
    if (!c.vision) missing.push("Configure EDITING_VISION_MODEL");
    if (!c.review) missing.push("Configure EDITING_REVIEW_MODEL");
    if (
      editingNeedsApiKey() &&
      !credential(req) &&
      !process.env.OPENROUTER_API_KEY
    )
      missing.push("Provide OpenRouter credentials");
    let verified = false;
    if (
      (req.query.verify === "true" ||
        [c.planner, c.vision, c.review].every(isLocalEditingModel)) &&
      c.planner &&
      c.vision &&
      c.review
    ) {
      const models = await modelCapabilities(credential(req));
      missing.push(...models.missing);
      verified = models.ready;
    }
    res.json({
      ...capabilities,
      ready: missing.length === 0,
      missing,
      modelsVerified: verified,
      provider: [c.planner, c.vision, c.review].every(isLocalEditingModel)
        ? "Local · Ollama"
        : "OpenRouter / configured models",
      models: { planner: c.planner, vision: c.vision, review: c.review },
      alignment: c.alignmentUrl
        ? "configured service"
        : "measured TTS scenes or approximate fallback",
      grounding: !!c.groundingUrl,
      artifactGeneration: !!c.workflow && fs.existsSync(c.workflow),
      backgroundRemoval:
        !!c.backgroundWorkflow && fs.existsSync(c.backgroundWorkflow),
      renderer: "remotion",
      browserConfigured: !!c.browser,
      limits: {
        ...capabilities.limits,
        maxProviderCalls: c.maxCalls,
        maxGeneratedAssets: c.maxAssets,
      },
    });
  }),
);
editingRouter.post(
  "/projects",
  route(async (req, res) => {
    assertEditingEnabled();
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
    assertEditingEnabled();
    const p = current(req.params.projectId);
    expected(p, req.body.expectedRevisionId);
    const job = enqueue(p, "generate", key(req), credential(req));
    res.status(202).json({ jobId: job.id, revisionId: p.revisionId });
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
    const change = z
        .strictObject({ expectedRevisionId: UUID, enabled: z.boolean() })
        .parse(req.body),
      p = current(req.params.projectId);
    expected(p, change.expectedRevisionId);
    const next = nextRevision(p),
      artifact = next.artifacts.find((a) => a.id === req.params.artifactId);
    if (!artifact)
      throw new EditingError("NOT_FOUND", "Artifact not found", 404);
    artifact.enabled = change.enabled;
    publish(next, p.revisionId);
    res.json(payload(next));
  }),
);
editingRouter.post(
  "/projects/:projectId/artifacts/:artifactId/revise",
  route((req, res) => {
    assertEditingEnabled();
    const body = z
        .strictObject({
          expectedRevisionId: UUID,
          instruction: z.string().trim().min(1).max(2000),
        })
        .parse(req.body),
      p = current(req.params.projectId);
    expected(p, body.expectedRevisionId);
    if (!p.artifacts.some((a) => a.id === req.params.artifactId))
      throw new EditingError("NOT_FOUND", "Artifact not found", 404);
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
    assertEditingEnabled();
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
    assertEditingEnabled();
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
