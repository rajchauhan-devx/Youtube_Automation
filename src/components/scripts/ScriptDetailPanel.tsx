import { useState } from 'react';
import { ScriptModelSelector, SCRIPT_MODELS } from './ScriptModelSelector';
import { Play, Trash2, X, RotateCcw, Pencil, Sparkles } from 'lucide-react';
import { DURATION_PRESETS, LONG_DURATION_PRESETS, type Script } from '../../data';

export function ScriptDetailPanel({
  script,
  onClose,
  onRun,
  onDelete,
  onClear,
  onUpdateDuration,
  onUpdateModel,
}: {
  script: Script;
  onClose: () => void;
  onRun: () => void;
  onDelete: () => void;
  onClear?: () => void;
  onUpdateDuration?: (duration: number) => void;
  onUpdateModel?: (model: string) => void;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isEditingDuration, setIsEditingDuration] = useState(false);
  const [isEditingModel, setIsEditingModel] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<number>(script.duration || 30);
  const currentModelId = script.model || 'gemini-3.6-flash';
  const activeModelObj = SCRIPT_MODELS.find((m) => m.id === currentModelId) || { name: currentModelId, badge: 'Saved model' };

  const hasRunData = Boolean(
    (script.aiResponse && script.aiResponse.trim().length > 0) ||
    (script.pipeline && script.pipeline.length > 0 && (script.pipeline[0]?.status !== 'pending' || script.pipeline.length > 1 || Boolean(script.pipeline[0]?.inputLog))) ||
    (script.generatedImages && script.generatedImages.length > 0) ||
    (script.generatedAudio && script.generatedAudio.length > 0) ||
    (script.topicName && script.topicName.trim().length > 0) ||
    (script.extractedScript && script.extractedScript.trim().length > 0)
  );

  function handleDelete() {
    setShowDeleteConfirm(true);
  }

  function confirmDelete() {
    onDelete();
    setShowDeleteConfirm(false);
  }

  function confirmClear() {
    onClear?.();
    setShowClearConfirm(false);
  }

  function handleSaveDuration(dur: number) {
    setSelectedDuration(dur);
    setIsEditingDuration(false);
    onUpdateDuration?.(dur);
  }

  function handleSelectModel(mId: string) {
    onUpdateModel?.(mId);
  }

  return (
    <div className="studio-card w-full max-w-sm shrink-0 animate-scale-in p-5 lg:sticky lg:top-2 lg:w-[360px]">
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="studio-card w-full max-w-sm p-6 shadow-pop animate-scale-in">
            <p className="text-[15px] font-semibold text-white">Delete "{script.name}"?</p>
            <p className="mt-1 text-[13px] text-muted">This removes the template and its workspace state.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="studio-btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="studio-btn-danger !border-danger/50 !bg-danger !text-white hover:!bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="studio-card w-full max-w-md p-6 shadow-pop animate-scale-in">
            <h4 className="text-base font-bold text-white">Clear generated content?</h4>
            <p className="mb-4 mt-2 text-[13px] leading-relaxed text-muted">
              Clear all generated content for <span className="font-semibold text-white">"{script.name}"</span>? The template (prompts, duration, settings) will be preserved.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="studio-btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={confirmClear}
                className="studio-btn-primary"
              >
                Clear data
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="studio-label !mb-1">Selected script</p>
          <h3 className="truncate text-[15px] font-bold text-white">{script.name}</h3>
        </div>
        <button onClick={onClose} aria-label="Close panel" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-white/5 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="thin-scrollbar max-h-[52vh] space-y-4 overflow-y-auto pr-1">
        <div>
          <div className="studio-label">
            Prompts · {script.prompts.length}
          </div>
          <div className="space-y-2">
            {script.prompts.map((p) => (
              <div key={p.id} className="rounded-xl border border-borderSoft bg-bg/60 p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                    {p.type || 'Prompt'}
                  </span>
                  <span className="truncate text-xs font-semibold text-white">{p.name}</span>
                </div>
                <div className="line-clamp-3 text-[13px] leading-relaxed text-muted">{p.content}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Duration Selector */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="studio-label !mb-0">Duration</span>
            <button
              onClick={() => setIsEditingDuration(!isEditingDuration)}
              className="flex items-center gap-1 text-[11px] font-semibold text-accent hover:text-white"
            >
              <Pencil className="h-3 w-3" />
              {isEditingDuration ? 'Done' : 'Edit'}
            </button>
          </div>
          {isEditingDuration ? (
            <div className="rounded-xl border border-borderSoft bg-bg/60 p-2.5">
              <div className="flex flex-wrap gap-1.5">
                {((script.section === 'long' || script.section === 'mixed') ? LONG_DURATION_PRESETS : DURATION_PRESETS).filter(dur => !script.maxDurationSeconds || dur <= script.maxDurationSeconds).map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => handleSaveDuration(dur)}
                    className={
                      script.duration === dur
                        ? 'rounded-lg bg-accent px-2.5 py-1.5 text-xs font-bold text-white shadow-glow'
                        : 'rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:bg-surface2 hover:text-white'
                    }
                  >
                    {dur >= 60 && dur % 60 === 0 ? `${dur / 60}m` : `${dur}s`}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-borderSoft bg-bg/60 px-3 py-2.5 text-[13px] text-gray-300">
              <span className="font-semibold text-white">{script.duration}s target</span>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-muted">
                {script.duration <= 60 ? 'Short' : 'Long-form'}
              </span>
            </div>
          )}
        </div>

        {/* AI Model Selector */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="studio-label !mb-0 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-accent" />
              AI Model
            </span>
            <button
              onClick={() => setIsEditingModel(!isEditingModel)}
              className="flex items-center gap-1 text-[11px] font-semibold text-accent hover:text-white"
            >
              <Pencil className="h-3 w-3" />
              {isEditingModel ? 'Done' : 'Change'}
            </button>
          </div>

          {isEditingModel ? (
            <ScriptModelSelector value={currentModelId} onChange={handleSelectModel} />
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-borderSoft bg-bg/60 px-3 py-2.5">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white">{activeModelObj.name}</span>
                <span className="text-[10px] text-faint">{activeModelObj.badge || 'Google Gemini'}</span>
              </div>
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                Active
              </span>
            </div>
          )}
        </div>

        {script.howItWorks && (
          <div>
            <div className="studio-label">
              How it works
            </div>
            <div className="rounded-xl border border-borderSoft bg-bg/60 p-3 text-[13px] leading-relaxed text-muted">{script.howItWorks}</div>
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2 border-t border-borderSoft pt-4">
        {hasRunData && (
          <button
            onClick={() => setShowClearConfirm(true)}
            title="Clear all generated runs and reset to clean template"
            className="studio-btn-ghost"
          >
            <RotateCcw className="h-4 w-4 text-accent" />
            Clear
          </button>
        )}
        <button
          onClick={onRun}
          className="studio-btn-primary flex-1"
        >
          <Play className="h-4 w-4 fill-current" />
          Run Script
        </button>
        <button
          onClick={handleDelete}
          title="Delete Script"
          className="studio-btn-danger !px-3"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
