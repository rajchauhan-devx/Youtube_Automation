import { parentPort, workerData } from "node:worker_threads";
import type { EditingProject } from "@tubeflow/editing-contracts";
import type { CompositionProps } from '@tubeflow/video-composition';
import { workspaceContext, type Workspace } from "../services/workspace.js";
import { exportGraphicsOverlay, exportVideo } from "../services/editing/renderer.js";
const input = workerData as {
  project: EditingProject;
  workspace: Workspace;
  jobId: string;
  overlayOutput?: string;
  legacyCameras?: CompositionProps['legacyCameras'];
};
const controller = new AbortController();
parentPort!.on("message", (message) => {
  if (message === "cancel") controller.abort();
});
await workspaceContext.run(input.workspace, async () => {
  try {
    const progress = (completed: number, total: number) => parentPort!.postMessage({ type: 'progress', completed, total });
    const output = input.overlayOutput
      ? await exportGraphicsOverlay(input.project, input.overlayOutput, controller.signal, progress, input.legacyCameras)
      : await exportVideo(input.project, input.jobId, controller.signal, progress);
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
