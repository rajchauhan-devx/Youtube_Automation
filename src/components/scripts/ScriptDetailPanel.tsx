import { useState } from 'react';
import { Pencil, Play, Trash2, X } from 'lucide-react';
import type { Script } from '../../data';

export function ScriptDetailPanel({
  script,
  onClose,
  onRun,
  onDelete,
}: {
  script: Script;
  onClose: () => void;
  onRun: () => void;
  onDelete: () => void;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function handleDelete() {
    setShowDeleteConfirm(true);
  }

  function confirmDelete() {
    onDelete();
    setShowDeleteConfirm(false);
  }

  return (
    <div className="w-80 shrink-0 rounded-lg border border-border bg-surface p-4">
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-lg border border-border bg-surface p-6 shadow-lg">
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
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{script.name}</h3>
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
                    {p.type}
                  </span>
                  <span className="text-xs font-medium text-white">{p.name}</span>
                </div>
                <div className="text-sm text-gray-300">{p.content}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            Duration
          </div>
          <div className="rounded-md bg-bg p-2 text-sm text-gray-300">{script.duration}s</div>
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
        <button className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-gray-200 hover:bg-surface2">
          <Pencil className="h-4 w-4" />
          Edit
        </button>
        <button onClick={onRun} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-blue-500">
          <Play className="h-4 w-4" />
          Run Script
        </button>
        <button onClick={handleDelete} className="flex items-center justify-center rounded-lg border border-border px-3 py-2 text-sm text-red-400 hover:bg-red-500/10">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
