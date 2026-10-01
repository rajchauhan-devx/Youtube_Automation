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
      <div className="studio-card mb-4 flex flex-wrap items-center gap-2 p-2">
        <button
          className={mode === "legacy" ? "studio-btn-primary !py-2" : "studio-btn-ghost !border-transparent !bg-transparent"}
          onClick={() => setMode("legacy")}
        >
          Legacy timeline & export
        </button>
        <button
          className={mode === "enhanced" ? "studio-btn-primary !py-2" : "studio-btn-ghost !border-transparent !bg-transparent"}
          onClick={() => setMode("enhanced")}
        >
          Enhanced revision & export
        </button>
        <span className="ml-auto hidden px-2 text-[11px] font-medium text-faint sm:block">
          {mode === "legacy" ? "Classic editor workflow" : "AI revision workflow"}
        </span>
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
