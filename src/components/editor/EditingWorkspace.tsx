import { useState } from "react";
import type { Script } from "../../data";
import { ArtifactsTab } from "../artifacts/ArtifactsTab";
import { ReviewAdjustTab } from "./ReviewAdjustTab";
export function EditingWorkspace({
  script,
  onUpdate,
}: {
  script: Script | null;
  onUpdate: (patch: Partial<Script>) => unknown;
}) {
  const [mode, setMode] = useState<"legacy" | "enhanced">(
    script?.editingProjectId ? "enhanced" : "legacy",
  );
  return (
    <>
      <div className="mb-4 flex gap-2">
        <button
          className={`rounded px-3 py-2 text-sm ${mode === "legacy" ? "bg-blue-700 text-white" : "bg-surface text-gray-400"}`}
          onClick={() => setMode("legacy")}
        >
          Legacy timeline & export
        </button>
        <button
          className={`rounded px-3 py-2 text-sm ${mode === "enhanced" ? "bg-blue-700 text-white" : "bg-surface text-gray-400"}`}
          onClick={() => setMode("enhanced")}
        >
          Enhanced revision & export
        </button>
      </div>
      {mode === "legacy" ? (
        <ReviewAdjustTab script={script} onUpdate={onUpdate} />
      ) : (
        <ArtifactsTab
          key={script?.id}
          script={script}
          onUpdate={onUpdate}
          editor
        />
      )}
    </>
  );
}
