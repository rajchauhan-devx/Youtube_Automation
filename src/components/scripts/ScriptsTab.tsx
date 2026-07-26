import { Plus, Sparkles, Lock } from 'lucide-react';
import { ScriptDetailPanel } from './ScriptDetailPanel';
import type { Script, Section } from '../../data';

export function ScriptsTab({
  scripts,
  section,
  selectedId,
  onSelect,
  onNewScript,
  onRunScript,
  selectedScript,
  onClosePanel,
  onDelete,
}: {
  scripts: Script[];
  section: Section;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewScript: () => void;
  onRunScript: (script: Script) => void;
  selectedScript: Script | null;
  onClosePanel: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex gap-6">
      <div className="flex-1">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Scripts</h2>
          <button
            onClick={onNewScript}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-gray-200 hover:bg-surface2"
          >
            <Plus className="h-4 w-4" />
            New Script
          </button>
        </div>
        {scripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-gray-500">
            <Sparkles className="mb-3 h-8 w-8 text-gray-600" />
            <p className="text-sm">No scripts yet.</p>
            <p className="mt-1 text-xs">Create your first script template to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scripts.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={`rounded-lg border bg-surface p-4 text-left transition-colors hover:bg-surface2 ${
                  s.locked ? 'border-accent' : 'border-border'
                } ${selectedId === s.id ? 'ring-1 ring-accent' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <span className="text-sm font-medium text-white">{s.name}</span>
                  {s.locked && (
                    <span className="flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      <Lock className="h-2.5 w-2.5" />
                      Locked
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      s.status === 'active' ? 'bg-green-500' : 'bg-gray-600'
                    }`}
                  />
                  <span className="capitalize">{s.status}</span>
                  <span>·</span>
                  <span>Used {s.lastUsed}</span>
                </div>
                <div className="mt-2 text-xs text-gray-500">{s.duration}s duration</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedScript && (
        <ScriptDetailPanel script={selectedScript} onClose={onClosePanel} onRun={() => onRunScript(selectedScript)} onDelete={() => onDelete(selectedScript.id)} />
      )}
    </div>
  );
}
