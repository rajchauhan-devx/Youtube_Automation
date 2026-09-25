import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  UUID,
  Job,
  Asset,
  validateProject,
  type EditingProject,
  type JobRecord,
  type AssetRecord,
} from "@tubeflow/editing-contracts";
import { workspaceDir, ROOT_DATA } from "../workspace.js";
import { EditingError } from "./config.js";
export const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const objectHash = (value: unknown) => hash(JSON.stringify(value));
export const editingRoot = () => path.join(workspaceDir(), "editing");
export const assetRoot = () => path.join(workspaceDir(), "editing-assets");
export function atomic(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  try {
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
export function read(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      throw new EditingError("NOT_FOUND", "Editing record not found", 404);
    throw new EditingError(
      "CORRUPT_STORAGE",
      "Editing storage is damaged. Restore a backup; it has not been replaced.",
      500,
    );
  }
}
export function projectDir(id: string) {
  UUID.parse(id);
  return path.join(editingRoot(), id);
}
export function current(id: string): EditingProject {
  const manifest = read(path.join(projectDir(id), "manifest.json")) as {
    revisionId: string;
  };
  return revision(id, manifest.revisionId);
}
export function revision(id: string, revisionId: string): EditingProject {
  UUID.parse(revisionId);
  return validateProject(
    read(path.join(projectDir(id), "revisions", `${revisionId}.json`)),
  );
}
export function publish(project: EditingProject, expected?: string) {
  const p = validateProject(project),
    dir = projectDir(p.id),
    manifest = path.join(dir, "manifest.json");
  if (fs.existsSync(manifest)) {
    if (current(p.id).revisionId !== expected)
      throw new EditingError(
        "REVISION_CONFLICT",
        "The project changed. Refresh before applying this edit.",
        409,
      );
  } else if (expected)
    throw new EditingError("NOT_FOUND", "Project was deleted", 404);
  const file = path.join(dir, "revisions", `${p.revisionId}.json`);
  if (fs.existsSync(file))
    throw new EditingError(
      "IMMUTABLE_REVISION",
      "A revision cannot be overwritten",
      409,
    );
  atomic(file, p);
  atomic(manifest, {
    id: p.id,
    revisionId: p.revisionId,
    scriptId: p.scriptId,
  });
  return p;
}
export function nextRevision(p: EditingProject): EditingProject {
  return {
    ...structuredClone(p),
    parentRevisionId: p.revisionId,
    revisionId: randomUUID(),
    createdAt: new Date().toISOString(),
  };
}
export function listProjects() {
  if (!fs.existsSync(editingRoot())) return [];
  return fs
    .readdirSync(editingRoot())
    .filter((id) => UUID.safeParse(id).success)
    .map(current);
}
export function jobs(projectId?: string): JobRecord[] {
  const root = path.join(editingRoot(), "jobs");
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .filter((f) => f.endsWith(".json"))
    .map((f) => Job.parse(read(path.join(root, f))))
    .filter((j) => !projectId || j.projectId === projectId);
}
export function getJob(id: string) {
  UUID.parse(id);
  return Job.parse(read(path.join(editingRoot(), "jobs", `${id}.json`)));
}
export function saveJob(job: JobRecord) {
  atomic(path.join(editingRoot(), "jobs", `${job.id}.json`), Job.parse(job));
  return job;
}
export function assetRecord(id: string): AssetRecord {
  UUID.parse(id);
  return Asset.parse(read(path.join(assetRoot(), "records", `${id}.json`)));
}
export function assetFile(id: string) {
  const a = assetRecord(id),
    base = fs.realpathSync(assetRoot()),
    file = fs.realpathSync(path.resolve(base, a.path));
  const relative = path.relative(base, file);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new EditingError("INVALID_ASSET", "Asset escaped storage", 422);
  if (hash(fs.readFileSync(file)) !== a.hash)
    throw new EditingError("CORRUPT_ASSET", "Asset content hash changed", 422);
  return file;
}
export function saveAsset(
  bytes: Buffer,
  meta: Omit<AssetRecord, "id" | "hash" | "path">,
) {
  const digest = hash(bytes),
    root = assetRoot(),
    records = path.join(root, "records");
  fs.mkdirSync(records, { recursive: true });
  const id =
    digest.slice(0, 8) +
    "-" +
    digest.slice(8, 12) +
    "-4" +
    digest.slice(13, 16) +
    "-a" +
    digest.slice(17, 20) +
    "-" +
    digest.slice(20, 32);
  const recordFile = path.join(records, `${id}.json`);
  if (fs.existsSync(recordFile)) return assetRecord(id);
  const ext = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "audio/wav": "wav",
    "audio/mpeg": "mp3",
    "font/woff2": "woff2",
    "video/mp4": "mp4",
  }[meta.mime];
  const relative = `${digest}/asset.${ext}`,
    file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, bytes, { flag: "wx" });
  else if (hash(fs.readFileSync(file)) !== digest)
    throw new EditingError("CORRUPT_ASSET", "Cached asset content changed");
  const asset = Asset.parse({ ...meta, id, hash: digest, path: relative });
  atomic(recordFile, asset);
  return asset;
}
let lock: string | undefined;
export function acquireSchedulerLock() {
  fs.mkdirSync(ROOT_DATA, { recursive: true });
  lock = path.join(ROOT_DATA, "editing-scheduler.lock");
  if (fs.existsSync(lock)) {
    const previous = JSON.parse(fs.readFileSync(lock, "utf8")) as {
      pid: number;
    };
    try {
      process.kill(previous.pid, 0);
      throw new EditingError(
        "SCHEDULER_LOCK",
        "Another server owns the editing scheduler",
        500,
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
      fs.unlinkSync(lock);
    }
  }
  fs.writeFileSync(
    lock,
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    { flag: "wx" },
  );
  process.once("exit", () => {
    if (lock && fs.existsSync(lock)) fs.unlinkSync(lock);
  });
}
