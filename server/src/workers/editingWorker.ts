import { parentPort, workerData } from "node:worker_threads";
import type { EditingProject } from "@tubeflow/editing-contracts";
import { workspaceContext, type Workspace } from "../services/workspace.js";
import { exportVideo } from "../services/editing/renderer.js";
const input = workerData as {
  project: EditingProject;
  workspace: Workspace;
  jobId: string;
};
const controller = new AbortController();
parentPort!.on("message", (message) => {
  if (message === "cancel") controller.abort();
});
await workspaceContext.run(input.workspace, async () => {
  try {
    const output = await exportVideo(
      input.project,
      input.jobId,
      controller.signal,
      (completed, total) =>
        parentPort!.postMessage({ type: "progress", completed, total }),
    );
    controller.signal.throwIfAborted();
    parentPort!.postMessage({ type: "done", output });
  } catch (error) {
    parentPort!.postMessage({
      type: "error",
      message: controller.signal.aborted
        ? "Cancelled"
        : error instanceof Error
          ? error.message
          : "Render worker failed",
    });
  } finally {
    parentPort!.close();
  }
});
