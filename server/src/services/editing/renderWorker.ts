import { Worker } from "node:worker_threads";
import fs from "node:fs";
import type { EditingProject } from "@tubeflow/editing-contracts";
import { currentWorkspace } from "../workspace.js";
/** The scheduler owns job files; the worker only reports progress and immutable output. */
export function renderInWorker(
  project: EditingProject,
  jobId: string,
  signal: AbortSignal,
  progress: (done: number, total: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const compiled = new URL("../../workers/editingWorker.js", import.meta.url);
    const worker = new Worker(
      fs.existsSync(compiled)
        ? compiled
        : new URL("../../../dist/workers/editingWorker.js", import.meta.url),
      { workerData: { project, jobId, workspace: currentWorkspace() } },
    );
    let timer: ReturnType<typeof setTimeout> | undefined,
      finished = false;
    const cleanup = () => {
      signal.removeEventListener("abort", cancel);
      if (timer) clearTimeout(timer);
    };
    const cancel = () => {
      worker.postMessage("cancel");
      timer = setTimeout(() => {
        void worker.terminate();
      }, 15000);
    };
    signal.addEventListener("abort", cancel, { once: true });
    worker.on(
      "message",
      (message: {
        type: string;
        completed: number;
        total: number;
        output: string;
        message: string;
      }) => {
        if (message.type === "progress") {
          if (!signal.aborted) progress(message.completed, message.total);
          return;
        }
        finished = true;
        cleanup();
        if (message.type === "done" && !signal.aborted) resolve(message.output);
        else reject(new Error(signal.aborted ? "Cancelled" : message.message));
      },
    );
    worker.on("error", (error) => {
      finished = true;
      cleanup();
      reject(error);
    });
    worker.on("exit", (code) => {
      cleanup();
      if (!finished)
        reject(
          new Error(
            signal.aborted
              ? "Cancelled"
              : `Render worker exited before completion (${code})`,
          ),
        );
    });
    if (signal.aborted) cancel();
  });
}
