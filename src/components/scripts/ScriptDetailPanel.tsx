import { useState } from 'react';
import { Play, Trash2, X, RotateCcw, Pencil, Check } from 'lucide-react';
import { DURATION_PRESETS, type Script, type DurationPreset } from '../../data';

export function ScriptDetailPanel({
  script,
  onClose,
  onRun,
  onDelete,
  onClear,
  onUpdateDuration,
}: {
  script: Script;
  onClose: () => void;
  onRun: () => void;
  onDelete: () => void;
  onClear?: () => void;
  onUpdateDuration?: (duration: number) => void;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isEditingDuration, setIsEditingDuration] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<number>(script.duration || 30);

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

  return (
    <div className="w-80 shrink-0 rounded-lg border border-border bg-surface p-4">
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-lg border border-border bg-surface p-6 shadow-lg max-w-sm w-full mx-4">
            <p className="mb-4 text-sm text-gray-200">Delete "{script.name}"?</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-gray-300 hover:bg-surface2"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-lg border border-border bg-surface p-6 shadow-lg max-w-md w-full mx-4">
            <h4 className="text-base font-semibold text-white mb-2">Clear Generated Content?</h4>
            <p className="mb-4 text-sm text-gray-300 leading-relaxed">
              Clear all generated content for <span className="font-semibold text-white">"{script.name}"</span>? The template (prompts, duration, settings) will be preserved.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-gray-300 hover:bg-surface2"
              >
                Cancel
              </button>
              <button
                onClick={confirmClear}
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
              >
                Clear Data
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white truncate pr-2">{script.name}</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            Prompts
          </div>
          <div className="space-y-2">
            {script.prompts.map((p) => (
              <div key={p.id} className="rounded-md bg-bg p-2">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
                    {p.type || 'Prompt'}
                  </span>
                  <span className="text-xs font-medium text-white">{p.name}</span>
                </div>
                <div className="text-sm text-gray-300">{p.content}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-gray-500">
            <span>Duration</span>
            <button
              onClick={() => setIsEditingDuration(!isEditingDuration)}
              className="flex items-center gap-1 text-[11px] font-normal text-accent hover:text-blue-400"
            >
              <Pencil className="h-3 w-3" />
              {isEditingDuration ? 'Done' : 'Edit'}
            </button>
          </div>
          {isEditingDuration ? (
            <div className="rounded-md bg-bg p-2 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {DURATION_PRESETS.map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => handleSaveDuration(dur)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      script.duration === dur
                        ? 'bg-accent text-white'
                        : 'border border-border bg-surface text-gray-300 hover:bg-surface2 hover:text-white'
                    }`}
                  >
                    {dur >= 60 && dur % 60 === 0 ? `${dur / 60}m` : `${dur}s`}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-md bg-bg p-2 text-sm text-gray-300 flex items-center justify-between">
              <span>{script.duration}s target</span>
              <span className="text-xs text-gray-500">
                {script.duration <= 60 ? 'Short' : 'Long-form'}
              </span>
            </div>
          )}
        </div>

        {script.howItWorks && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
              How It Works
            </div>
            <div className="rounded-md bg-bg p-2 text-sm text-gray-300">{script.howItWorks}</div>
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        {hasRunData && (
          <button
            onClick={() => setShowClearConfirm(true)}
            title="Clear all generated runs and reset to clean template"
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-gray-300 hover:bg-surface2 hover:text-white transition-colors"
          >
            <RotateCcw className="h-4 w-4 text-accent" />
            Clear
          </button>
        )}
        <button
          onClick={onRun}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          <Play className="h-4 w-4" />
          Run Script
        </button>
        <button
          onClick={handleDelete}
          title="Delete Script"
          className="flex items-center justify-center rounded-lg border border-border px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
