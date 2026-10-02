import { Plus, Sparkles, Clock3, Clapperboard } from 'lucide-react';
import { ScriptDetailPanel } from './ScriptDetailPanel';
import { SCRIPT_MODELS } from './ScriptModelSelector';
import { StatusPill, StudioEmpty, StudioPageHeader } from '../ui/studio';
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
  onClear,
  onUpdateDuration,
  onUpdateModel,
  onSaveScript,
  onSaveSpoken,
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
  onClear?: (id: string) => void;
  onUpdateDuration?: (id: string, duration: number) => void;
  onUpdateModel?: (id: string, model: string) => void;
  onSaveScript: (id: string, patch: Partial<Script>) => Promise<boolean>;
  onSaveSpoken: (id: string, text: string) => Promise<boolean>;
}) {
  const activeCount = scripts.filter((s) => s.status === 'active').length;
  return (
    <div className="flex items-start gap-5">
      <div className="min-w-0 flex-1">
        <StudioPageHeader
          eyebrow={section === 'shorts' ? 'Shorts Studio' : section === 'long' ? 'Long-form Studio' : 'Mixed Media Studio'}
          title="Scripts"
          subtitle={`${scripts.length} templates · ${activeCount} active. Select a script to configure, run, and move it down the production pipeline.`}
          actions={
            <button onClick={onNewScript} className="studio-btn-primary">
              <Plus className="h-4 w-4" />
              New Script
            </button>
          }
        />
        {scripts.length === 0 ? (
          <StudioEmpty
            icon={<Sparkles className="h-6 w-6" />}
            title="No scripts yet"
            hint="Create your first script template to start generating videos in this workspace."
            action={
              <button onClick={onNewScript} className="studio-btn-primary">
                <Plus className="h-4 w-4" />
                Create script
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {scripts.map((s) => {
              const selected = selectedId === s.id;
              return (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={
                  selected
                    ? 'studio-card studio-card-hover group relative overflow-hidden border-accent/40 p-4 text-left ring-1 ring-accent/50'
                    : 'studio-card studio-card-hover group relative overflow-hidden p-4 text-left'
                }
              >
                <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-accent/70 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className={selected ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-glow' : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-muted group-hover:text-white'}>
                      <Clapperboard className="h-4 w-4" />
                    </span>
                    <span className="truncate text-[14px] font-semibold text-white">{s.name}</span>
                  </span>
                  <StatusPill status={s.status} />
                </div>
                <div className="mt-3.5 flex items-center gap-2 text-xs text-muted">
                  <Clock3 className="h-3.5 w-3.5 text-faint" />
                  <span>Used {s.lastUsed}</span>
                  <span className="text-faint">·</span>
                  <span>{s.duration}s target</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-borderSoft pt-3">
                  <span className="rounded-md bg-white/[0.05] px-2 py-1 text-[11px] font-medium text-gray-300">
                    {SCRIPT_MODELS.find(model => model.id === (s.model || 'gemini-3.6-flash'))?.name || s.model}
                  </span>
                  <span className={selected ? 'text-[11px] font-semibold text-accent' : 'text-[11px] font-medium text-faint group-hover:text-muted'}>
                    {selected ? 'Selected' : 'Open →'}
                  </span>
                </div>
              </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedScript && (
        <ScriptDetailPanel
          key={selectedScript.id}
          script={selectedScript}
          onClose={onClosePanel}
          onRun={() => onRunScript(selectedScript)}
          onDelete={() => onDelete(selectedScript.id)}
          onClear={onClear ? () => onClear(selectedScript.id) : undefined}
          onUpdateDuration={onUpdateDuration ? (dur) => onUpdateDuration(selectedScript.id, dur) : undefined}
          onUpdateModel={onUpdateModel ? (mod) => onUpdateModel(selectedScript.id, mod) : undefined}
          onSaveScript={(patch) => onSaveScript(selectedScript.id, patch)}
          onSaveSpoken={(text) => onSaveSpoken(selectedScript.id, text)}
        />
      )}
    </div>
  );
}
