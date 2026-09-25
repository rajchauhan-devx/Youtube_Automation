import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  type JobRecord,
  type EditingProject,
} from "@tubeflow/editing-contracts";
import {
  workspaceContext,
  currentWorkspace,
  workspaceKey,
  type Workspace,
} from "../workspace.js";
import {
  current,
  revision,
  jobs,
  getJob,
  saveJob,
  objectHash,
  publish,
  listProjects,
  projectDir,
  editingRoot,
  assetRoot,
  assetRecord,
} from "./repository.js";
import { EditingError, editingConfig } from "./config.js";
import { runPipeline } from "./pipeline.js";
import { renderInWorker } from "./renderWorker.js";
import { store } from "../store.js";
import {
  scriptFingerprint,
  projectCreationActive,
  type ScriptInput,
} from "./projects.js";
type Task = { jobId: string; workspace: Workspace; apiKey?: string };
const queue: Task[] = [],
  controllers = new Map<string, AbortController>();
const completions = new Map<string, Promise<void>>();
let running = false;
const reconciled = new Set<string>();
export function reconcile() {
  const key = workspaceKey("editing");
  if (reconciled.has(key)) return;
  reconciled.add(key);
  for (const job of jobs())
    if (["running", "queued", "cancel_requested"].includes(job.state)) {
      job.state =
        job.state === "cancel_requested" ? "cancelled" : "interrupted";
      job.error =
        job.state === "interrupted"
          ? "Server restarted. Resume to reuse validated checkpoints."
          : undefined;
      job.updatedAt = new Date().toISOString();
      saveJob(job);
    }
}
export function enqueue(
  project: EditingProject,
  operation: JobRecord["operation"],
  idempotencyKey: string,
  apiKey?: string,
  extra?: { artifactId: string; instruction: string },
) {
  reconcile();
  const inputHash = objectHash({
      revision: project.revisionId,
      operation,
      ...extra,
    }),
    existing = jobs(project.id).find(
      (j) => j.idempotencyKey === idempotencyKey,
    );
  if (existing) {
    if (existing.inputHash !== inputHash)
      throw new EditingError(
        "IDEMPOTENCY_CONFLICT",
        "Idempotency key was used for a different operation.",
        409,
      );
    return existing;
  }
  const duplicate = jobs(project.id).find(
    (j) =>
      j.inputHash === inputHash &&
      [
        "queued",
        "running",
        "succeeded",
        "partial",
        "needs_configuration",
        "interrupted",
      ].includes(j.state),
  );
  if (duplicate) return duplicate;
  if (
    operation !== "render" &&
    current(project.id).revisionId !== project.revisionId
  )
    throw new EditingError(
      "REVISION_CONFLICT",
      "Project changed before enqueue",
      409,
    );
  const now = new Date().toISOString(),
    job: JobRecord = {
      id: randomUUID(),
      projectId: project.id,
      revisionId: project.revisionId,
      operation,
      inputHash,
      idempotencyKey,
      state: "queued",
      stage: "queued",
      attempts: 0,
      completed: 0,
      total: 0,
      createdAt: now,
      updatedAt: now,
      stages: {},
      usage: [],
      ...extra,
    };
  saveJob(job);
  queue.push({ jobId: job.id, workspace: currentWorkspace(), apiKey });
  void drain();
  return job;
}
async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const task = queue.shift()!;
      const key = workspaceContext.run(task.workspace, () =>
        workspaceKey(task.jobId),
      );
      const completion = workspaceContext.run(task.workspace, () =>
        execute(task),
      );
      completions.set(key, completion);
      try {
        await completion;
      } finally {
        completions.delete(key);
      }
    }
  } finally {
    running = false;
  }
}
async function execute(task: Task) {
  let job = getJob(task.jobId);
  if (job.state === "cancelled") return;
  const controller = new AbortController(),
    key = workspaceKey(job.id);
  controllers.set(key, controller);
  const persist = () => {
    const disk = getJob(job.id);
    if (disk.state === "cancelled" || disk.state === "cancel_requested")
      controller.abort();
    job.updatedAt = new Date().toISOString();
    job.heartbeat = job.updatedAt;
    saveJob(job);
  };
  const stage = (name: string, completed: number, total: number) => {
    controller.signal.throwIfAborted();
    job.stage = name;
    job.completed = completed;
    job.total = total;
    persist();
  };
  const heartbeat = setInterval(() => {
    try {
      persist();
    } catch {
      controller.abort();
    }
  }, 10000);
  try {
    job = {
      ...job,
      state: "running",
      attempts: job.attempts + 1,
      error: undefined,
    };
    persist();
    const project = revision(job.projectId, job.revisionId);
    if (!store.getById("scripts", project.scriptId))
      throw new EditingError("SCRIPT_DELETED", "Script was deleted", 404);
    if (job.operation === "render")
      job.outputUrl = await renderInWorker(
        project,
        job.id,
        controller.signal,
        (done, total) => stage("rendering MP4", done, total),
      );
    else {
      const result = await runPipeline(project, {
        signal: controller.signal,
        apiKey: task.apiKey,
        job,
        maxCalls: Math.min(
          project.settings.maxProviderCalls,
          editingConfig().maxCalls,
        ),
        persist,
        stage,
      });
      controller.signal.throwIfAborted();
      const script = store.getById<ScriptInput>("scripts", project.scriptId);
      if (!script || scriptFingerprint(script) !== project.inputs.scriptHash)
        throw new EditingError(
          "STALE_INPUT",
          "Script media or narration changed. Create a new visual edit.",
          409,
        );
      publish(result, project.revisionId);
      job.resultRevisionId = result.revisionId;
      if (result.status === "partial") job.state = "partial";
    }
    controller.signal.throwIfAborted();
    if (job.state !== "partial") job.state = "succeeded";
    job.stage = job.state === "partial" ? "finished with incomplete scenes" : "complete";
  } catch (error) {
    job.state = controller.signal.aborted
      ? "cancelled"
      : error instanceof EditingError && error.code === "NEEDS_CONFIGURATION"
        ? "needs_configuration"
        : "failed";
    job.error = controller.signal.aborted
      ? undefined
      : error instanceof Error
        ? error.message.slice(0, 3500)
        : "Editing operation failed";
  } finally {
    clearInterval(heartbeat);
    controllers.delete(key);
    job.updatedAt = new Date().toISOString();
    saveJob(job);
    task.apiKey = undefined;
  }
}
export function cancel(id: string) {
  const job = getJob(id);
  if (["succeeded", "partial", "failed", "cancelled"].includes(job.state)) return job;
  job.state = controllers.has(workspaceKey(id))
    ? "cancel_requested"
    : "cancelled";
  job.updatedAt = new Date().toISOString();
  saveJob(job);
  controllers.get(workspaceKey(id))?.abort();
  return job;
}
export function resume(id: string, apiKey?: string) {
  const job = getJob(id);
  if (!["interrupted", "needs_configuration", "failed"].includes(job.state))
    throw new EditingError(
      "INVALID_JOB_STATE",
      "This job cannot be resumed",
      409,
    );
  if (job.attempts >= 5)
    throw new EditingError(
      "RETRY_LIMIT",
      "Job reached its five-attempt limit. Create a new project.",
    );
  if (
    job.operation !== "render" &&
    current(job.projectId).revisionId !== job.revisionId
  )
    throw new EditingError(
      "REVISION_CONFLICT",
      "Project changed since this job started",
      409,
    );
  job.state = "queued";
  job.error = undefined;
  saveJob(job);
  queue.push({ jobId: id, workspace: currentWorkspace(), apiKey });
  void drain();
  return job;
}
export function cancelScriptJobs(scriptId: string) {
  for (const job of jobs()) {
    try {
      if (revision(job.projectId, job.revisionId).scriptId === scriptId)
        cancel(job.id);
    } catch (error) {
      if (!(error instanceof EditingError && error.status === 404)) throw error;
    }
  }
}
export async function deleteScriptEditing(scriptId: string) {
  const projects = listProjects().filter((p) => p.scriptId === scriptId);
  const projectIds = new Set(projects.map((p) => p.id));
  const ownedJobs = jobs().filter((j) => projectIds.has(j.projectId));
  for (const job of ownedJobs) cancel(job.id);
  const scope = currentWorkspace();
  for (let i = queue.length - 1; i >= 0; i--)
    if (
      queue[i].workspace.accountId === scope.accountId &&
      queue[i].workspace.profile === scope.profile &&
      ownedJobs.some((j) => j.id === queue[i].jobId)
    )
      queue.splice(i, 1);
  await Promise.all(ownedJobs.map((j) => completions.get(workspaceKey(j.id))));
  const candidates = new Set<string>();
  const collect = (id: string, target: Set<string>) => {
    const dir = path.join(projectDir(id), "revisions");
    if (!fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")))
      for (const assetId of revision(id, file.slice(0, -5)).assetIds)
        target.add(assetId);
    const checkpoints = path.join(projectDir(id), "jobs");
    if (fs.existsSync(checkpoints))
      for (const file of fs
        .readdirSync(checkpoints)
        .filter((f) => f.endsWith(".checkpoint.json"))) {
        const checkpoint = JSON.parse(
          fs.readFileSync(path.join(checkpoints, file), "utf8"),
        ) as { project: EditingProject };
        checkpoint.project.assetIds.forEach((assetId) => target.add(assetId));
      }
  };
  for (const project of projects) collect(project.id, candidates);
  const retained = new Set<string>();
  for (const project of listProjects().filter((p) => !projectIds.has(p.id)))
    collect(project.id, retained);
  for (const project of projects) {
    const dir = projectDir(project.id),
      base = fs.realpathSync(editingRoot()),
      relative = path.relative(base, fs.realpathSync(dir));
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new EditingError(
        "INVALID_STORAGE",
        "Project directory escaped editing storage",
      );
    fs.rmSync(dir, { recursive: true, force: true });
  }
  // Defer cache collection while another snapshot/job may be acquiring a reference.
  if (projectCreationActive() || controllers.size) return;
  for (const id of candidates) {
    if (retained.has(id)) continue;
    const record = assetRecord(id),
      base = fs.realpathSync(assetRoot()),
      file = path.resolve(base, record.path),
      relative = path.relative(base, file);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new EditingError(
        "INVALID_STORAGE",
        "Asset escaped editing storage",
      );
    fs.rmSync(file, { force: true });
    fs.rmSync(path.join(base, "records", `${id}.json`), { force: true });
  }
}
