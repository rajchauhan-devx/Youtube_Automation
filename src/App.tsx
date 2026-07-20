import { useState, useMemo } from 'react';
import {
  Zap,
  Clapperboard,
  ListOrdered,
  Library,
  Settings,
  ChevronRight,
  Plus,
  Check,
  ChevronDown,
  Play,
  Pause,
  RotateCcw,
  Pencil,
  Undo2,
  Redo2,
  Scissors,
  Trash2,
  Maximize2,
  ZoomIn,
  Download,
  Copy,
  FileVideo,
  Image as ImageIcon,
  Music,
  Film,
  Search,
  Lock,
  X,
  MoreVertical,
  Upload,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import type { PromptType } from './data';
import { channels, channelData } from './data';
import type { Section, Tab, Channel, Script } from './data';

const TABS: { id: Tab; label: string }[] = [
  { id: 'scripts', label: 'Scripts' },
  { id: 'preview', label: 'Preview' },
  { id: 'assets', label: 'Assets' },
  { id: 'editor', label: 'Editor' },
  { id: 'export', label: 'Export' },
];

const SECTIONS: { id: Section; label: string; icon: typeof Zap }[] = [
  { id: 'shorts', label: 'Shorts', icon: Zap },
  { id: 'long', label: 'Long', icon: Clapperboard },
];

const SIDEBAR_ICONS = [
  { id: 'shorts', label: 'Shorts', icon: Zap },
  { id: 'long', label: 'Long', icon: Clapperboard },
  { id: 'queue', label: 'Queue', icon: ListOrdered },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

type SidebarId = Section | 'queue' | 'library' | 'settings';

export default function App() {
  const [activeChannel, setActiveChannel] = useState<Channel>(channels[0]);
  const [channelSwitcherOpen, setChannelSwitcherOpen] = useState(false);
  const [sidebar, setSidebar] = useState<SidebarId>('shorts');
  const [section, setSection] = useState<Section>('shorts');
  const [tab, setTab] = useState<Tab>('scripts');
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [newScriptOpen, setNewScriptOpen] = useState(false);

  const data = useMemo(() => channelData[activeChannel.id], [activeChannel]);
  const selectedScript = useMemo(
    () => data.scripts.find((s) => s.id === selectedScriptId) ?? null,
    [data, selectedScriptId],
  );

  function selectSidebar(id: SidebarId) {
    setSidebar(id);
    if (id === 'shorts' || id === 'long') {
      setSection(id);
      setTab('scripts');
      setSelectedScriptId(null);
    }
  }

  function switchChannel(ch: Channel) {
    setActiveChannel(ch);
    setChannelSwitcherOpen(false);
    setSelectedScriptId(null);
    setTab('scripts');
  }

  const isMainSection = sidebar === 'shorts' || sidebar === 'long';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-white">
      {/* Sidebar */}
      <aside className="group flex w-16 flex-col border-r border-border bg-surface transition-all duration-200 hover:w-[200px]">
        {/* Channel avatar */}
        <div className="relative flex h-16 items-center justify-center border-b border-border">
          <button
            onClick={() => setChannelSwitcherOpen((v) => !v)}
            className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface2"
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
              style={{ backgroundColor: activeChannel.color }}
            >
              {activeChannel.avatar}
            </div>
            <span className="hidden whitespace-nowrap text-sm font-medium group-hover:block">
              {activeChannel.name}
            </span>
            <ChevronDown className="hidden h-4 w-4 text-gray-400 group-hover:block" />
          </button>

          {channelSwitcherOpen && (
            <ChannelSwitcher
              active={activeChannel}
              onSelect={switchChannel}
              onClose={() => setChannelSwitcherOpen(false)}
            />
          )}
        </div>

        {/* Icons */}
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {SIDEBAR_ICONS.map((item) => {
            const Icon = item.icon;
            const active = sidebar === item.id;
            return (
              <button
                key={item.id}
                onClick={() => selectSidebar(item.id)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active ? 'bg-surface2 text-white' : 'text-gray-400 hover:bg-surface2 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="hidden whitespace-nowrap group-hover:block">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Profile avatar */}
        <div className="flex h-16 items-center justify-center border-t border-border">
          <button className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-bold">
              JD
            </div>
            <span className="hidden whitespace-nowrap text-sm group-hover:block">John Doe</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          channel={activeChannel}
          section={sidebar === 'shorts' || sidebar === 'long' ? section : (sidebar as string)}
          tab={tab}
          isMain={isMainSection}
        />

        <main className="flex-1 overflow-y-auto thin-scrollbar">
          <div className="mx-auto w-full max-w-[1400px] px-6 py-6">
            {!isMainSection ? (
              <PlaceholderPage label={sidebar.charAt(0).toUpperCase() + sidebar.slice(1)} />
            ) : (
              <div>
                {/* Tabs */}
                <div className="mb-6 flex gap-1 border-b border-border">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                        tab === t.id
                          ? 'border-accent text-white'
                          : 'border-transparent text-gray-400 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {tab === 'scripts' && (
                  <ScriptsTab
                    data={data}
                    section={section}
                    selectedId={selectedScriptId}
                    onSelect={setSelectedScriptId}
                    onNew={() => setNewScriptOpen(true)}
                    selectedScript={selectedScript}
                    onClosePanel={() => setSelectedScriptId(null)}
                  />
                )}
                {tab === 'preview' && <PreviewTab data={data} section={section} />}
                {tab === 'assets' && <AssetsTab data={data} section={section} />}
                {tab === 'editor' && <EditorTab data={data} section={section} />}
                {tab === 'export' && <ExportTab section={section} />}
              </div>
            )}
          </div>
        </main>
      </div>

      {newScriptOpen && <NewScriptModal onClose={() => setNewScriptOpen(false)} section={section} />}
    </div>
  );
}

function ChannelSwitcher({
  active,
  onSelect,
  onClose,
}: {
  active: Channel;
  onSelect: (c: Channel) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-2 top-14 z-50 w-56 rounded-lg border border-border bg-surface py-1 shadow-lg">
        <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-gray-500">
          Switch Channel
        </div>
        {channels.map((ch) => (
          <button
            key={ch.id}
            onClick={() => onSelect(ch)}
            className={`flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-surface2 ${
              active.id === ch.id ? 'text-white' : 'text-gray-300'
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ch.color }} />
            <span className="flex-1 text-left">{ch.name}</span>
            {active.id === ch.id && <Check className="h-4 w-4 text-accent" />}
          </button>
        ))}
        <div className="my-1 border-t border-border" />
        <button className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-gray-300 hover:bg-surface2">
          <Plus className="h-4 w-4" />
          Add Channel
        </button>
      </div>
    </>
  );
}

function Header({
  channel,
  section,
  tab,
  isMain,
}: {
  channel: Channel;
  section: Section | string;
  tab: Tab;
  isMain: boolean;
}) {
  const sectionLabel =
    section === 'shorts' ? 'Shorts' : section === 'long' ? 'Long' : (section as string);
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-bg px-6">
      <div className="flex items-center gap-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-white">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: channel.color }} />
          {channel.name}
        </span>
        <ChevronRight className="h-4 w-4 text-gray-600" />
        <span className="text-gray-400">{sectionLabel}</span>
        {isMain && (
          <>
            <ChevronRight className="h-4 w-4 text-gray-600" />
            <span className="text-gray-400 capitalize">{tab}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-gray-300 hover:bg-surface2">
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Search</span>
        </button>
        <button className="flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500">
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">New Script</span>
        </button>
      </div>
    </header>
  );
}

function PlaceholderPage({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-gray-500">
      <span className="text-lg font-medium">{label}</span>
      <span className="mt-1 text-sm">Coming soon</span>
    </div>
  );
}

/* ============ SCRIPTS TAB ============ */

function ScriptsTab({
  data,
  section,
  selectedId,
  onSelect,
  onNew,
  selectedScript,
  onClosePanel,
}: {
  data: typeof channelData[string];
  section: Section;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  selectedScript: Script | null;
  onClosePanel: () => void;
}) {
  return (
    <div className="flex gap-6">
      <div className="flex-1">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Scripts</h2>
          <button
            onClick={onNew}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-gray-200 hover:bg-surface2"
          >
            <Plus className="h-4 w-4" />
            New Script
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.scripts.map((s) => (
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
              {section === 'long' && s.chapters && (
                <div className="mt-2 text-xs text-gray-500">{s.chapters.length} chapters</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {selectedScript && (
        <ScriptDetailPanel script={selectedScript} onClose={onClosePanel} />
      )}
    </div>
  );
}

function ScriptDetailPanel({ script, onClose }: { script: Script; onClose: () => void }) {
  return (
    <div className="w-80 shrink-0 rounded-lg border border-border bg-surface p-4">
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
        <button className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-blue-500">
          <Play className="h-4 w-4" />
          Run
        </button>
      </div>
    </div>
  );
}

const PROMPT_TYPES: PromptType[] = ['Research', 'Image', 'Script', 'TTS', 'Metadata', 'Custom'];

let blockCounter = 0;
function newBlockId() {
  blockCounter += 1;
  return `nb${Date.now()}_${blockCounter}`;
}

function NewScriptModal({ onClose, section }: { onClose: () => void; section: Section }) {
  const [name, setName] = useState('');
  const [duration, setDuration] = useState<15 | 30 | 60>(15);
  const [prompts, setPrompts] = useState<
    { id: string; name: string; type: PromptType; content: string }[]
  >([
    { id: newBlockId(), name: '', type: 'Research', content: '' },
  ]);
  const [howItWorks, setHowItWorks] = useState('');

  function updatePrompt(id: string, patch: Partial<{ name: string; type: PromptType; content: string }>) {
    setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function addPrompt() {
    setPrompts((prev) => [...prev, { id: newBlockId(), name: '', type: 'Custom', content: '' }]);
  }
  function deletePrompt(id: string) {
    setPrompts((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto thin-scrollbar rounded-lg border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">New Script</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Script name"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
            />
          </Field>

          <div>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
              Prompts
            </div>
            <div className="space-y-3">
              {prompts.map((p, i) => (
                <div key={p.id} className="rounded-md border border-border bg-bg p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs text-gray-500">#{i + 1}</span>
                    <input
                      value={p.name}
                      onChange={(e) => updatePrompt(p.id, { name: e.target.value })}
                      placeholder="Prompt name"
                      className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
                    />
                    <select
                      value={p.type}
                      onChange={(e) => updatePrompt(p.id, { type: e.target.value as PromptType })}
                      className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
                    >
                      {PROMPT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => deletePrompt(p.id)}
                      disabled={prompts.length === 1}
                      className="rounded-md p-1.5 text-gray-400 hover:bg-surface2 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <textarea
                    value={p.content}
                    onChange={(e) => updatePrompt(p.id, { content: e.target.value })}
                    placeholder="Prompt content..."
                    rows={2}
                    className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={addPrompt}
              className="mt-2 flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-gray-300 hover:bg-surface2"
            >
              <Plus className="h-4 w-4" />
              Add Prompt
            </button>
          </div>

          {prompts.length >= 2 && (
            <Field label="How It Works">
              <textarea
                value={howItWorks}
                onChange={(e) => setHowItWorks(e.target.value)}
                placeholder="Explain execution flow between prompts"
                rows={2}
                className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
              />
            </Field>
          )}

          {section === 'long' && (
            <Field label="Chapter Outline">
              <textarea
                placeholder="One chapter per line..."
                rows={3}
                className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
              />
            </Field>
          )}
          <Field label="Duration">
            <div className="flex gap-2">
              {([15, 30, 60] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`rounded-md border px-4 py-2 text-sm transition-colors ${
                    duration === d
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-gray-300 hover:bg-surface2'
                  }`}
                >
                  {d}s
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-gray-200 hover:bg-surface2"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Create Script
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
      {children}
    </div>
  );
}

/* ============ PREVIEW TAB ============ */

function PreviewTab({ data, section }: { data: typeof channelData[string]; section: Section }) {
  const [openStep, setOpenStep] = useState<(typeof data.pipeline)[number] | null>(null);

  return (
    <div className="max-w-3xl">
      <div className="space-y-2">
        {data.pipeline.map((step, i) => (
          <button
            key={step.id}
            onClick={() => setOpenStep(step)}
            className="flex w-full items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3.5 text-left transition-colors hover:bg-surface2"
          >
            <span className="w-6 text-xs text-gray-600">{i + 1}</span>
            <StageStatusIcon status={step.status} />
            <div className="flex-1">
              <div className="text-sm font-medium text-white">{step.label}</div>
              <div className="truncate text-xs text-gray-500">{step.summary}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        ))}
      </div>

      {section === 'long' && (
        <div className="mt-4 rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            Chapter Markers
          </div>
          <div className="flex flex-wrap gap-2">
            {['Intro', 'Setup', 'Main', 'Demo', 'Outro'].map((c, i) => (
              <span
                key={c}
                className="rounded-md border border-border bg-bg px-2.5 py-1 text-xs text-gray-300"
              >
                {i}:00 {c}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between rounded-lg border border-border bg-surface p-4">
        <div className="text-sm text-gray-400">
          Est. cost: <span className="text-white">$0.42</span>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
          <Play className="h-4 w-4" />
          Run Pipeline
        </button>
      </div>

      {openStep && (
        <StepModal step={openStep} onClose={() => setOpenStep(null)} />
      )}
    </div>
  );
}

function StepModal({
  step,
  onClose,
}: {
  step: { label: string; status: string; inputLog: string; outputPreview: string };
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto thin-scrollbar rounded-lg border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StageStatusIcon status={step.status as 'done' | 'pending' | 'running' | 'error'} />
            <h3 className="text-base font-semibold">{step.label}</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
              Input Log
            </div>
            <pre className="max-h-40 overflow-y-auto thin-scrollbar whitespace-pre-wrap rounded-md border border-border bg-bg p-3 text-sm text-gray-300">
              {step.inputLog || 'No input recorded.'}
            </pre>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
              Output Preview
            </div>
            <pre className="max-h-40 overflow-y-auto thin-scrollbar whitespace-pre-wrap rounded-md border border-border bg-bg p-3 text-sm text-gray-300">
              {step.outputPreview || 'No output yet.'}
            </pre>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-gray-200 hover:bg-surface2">
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
            <RotateCcw className="h-4 w-4" />
            Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}

function StageStatusIcon({ status }: { status: 'done' | 'pending' | 'running' | 'error' }) {
  if (status === 'done') return <Check className="h-4 w-4 shrink-0 text-green-500" />;
  if (status === 'running')
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-600 border-t-accent" />
      </span>
    );
  if (status === 'error') return <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />;
  return <span className="h-2 w-2 shrink-0 rounded-full bg-gray-600" />;
}

/* ============ ASSETS TAB ============ */

function AssetsTab({ data, section }: { data: typeof channelData[string]; section: Section }) {
  const [sub, setSub] = useState<'images' | 'audio' | 'video'>('images');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const subTabs = section === 'long'
    ? [
        { id: 'images' as const, label: 'Images', icon: ImageIcon },
        { id: 'audio' as const, label: 'Audio', icon: Music },
        { id: 'video' as const, label: 'Video Clips', icon: Film },
      ]
    : [
        { id: 'images' as const, label: 'Images', icon: ImageIcon },
        { id: 'audio' as const, label: 'Audio', icon: Music },
      ];

  return (
    <div>
      <div className="mb-4 flex gap-1">
        {subTabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                sub === t.id ? 'bg-surface2 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {sub === 'images' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {data.images.map((img) => (
            <div
              key={img.id}
              className="group relative aspect-[9/16] overflow-hidden rounded-lg border border-border bg-surface"
              style={{ background: `linear-gradient(135deg, ${img.color}33, ${img.color}11)` }}
            >
              <button
                onClick={() => setLightbox(img.name)}
                className="flex h-full w-full items-center justify-center"
              >
                <ImageIcon className="h-6 w-6 text-white/40" />
              </button>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100">
                <span className="truncate text-xs text-white">{img.name}</span>
                <button
                  onClick={() => setMenuOpen(menuOpen === img.id ? null : img.id)}
                  className="text-gray-300 hover:text-white"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
              {menuOpen === img.id && (
                <AssetMenu onClose={() => setMenuOpen(null)} />
              )}
            </div>
          ))}
        </div>
      )}

      {sub === 'audio' && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <tbody>
              {data.audio.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="w-10 px-3 py-3">
                    <button className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-gray-300 hover:bg-surface2">
                      <Play className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  <td className="px-3 py-3 text-gray-200">{a.name}</td>
                  <td className="px-3 py-3">
                    <Waveform color={a.color} />
                  </td>
                  <td className="w-20 px-3 py-3 text-right text-gray-500">{a.duration}</td>
                  <td className="w-10 px-3 py-3">
                    <button className="text-gray-400 hover:text-white">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sub === 'video' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {data.videos.map((v) => (
            <div
              key={v.id}
              className="group relative aspect-video overflow-hidden rounded-lg border border-border bg-surface"
              style={{ background: `linear-gradient(135deg, ${v.color}33, ${v.color}11)` }}
            >
              <button className="flex h-full w-full items-center justify-center">
                <Film className="h-6 w-6 text-white/40" />
              </button>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                <span className="text-xs text-white">{v.name}</span>
                <span className="ml-2 text-xs text-gray-400">{v.duration}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setLightbox(null)}
        >
          <div className="relative aspect-[9/16] h-full max-h-[80vh] rounded-lg border border-border bg-surface">
            <button
              onClick={() => setLightbox(null)}
              className="absolute right-3 top-3 text-gray-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex h-full items-center justify-center text-gray-500">
              {lightbox}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AssetMenu({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-2 top-8 z-50 w-40 rounded-lg border border-border bg-surface py-1">
        <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-surface2">
          <RotateCcw className="h-4 w-4" />
          Regenerate
        </button>
        <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-surface2">
          <Download className="h-4 w-4" />
          Download
        </button>
        <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-surface2">
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>
    </>
  );
}

function Waveform({ color }: { color: string }) {
  const bars = [40, 70, 30, 90, 50, 75, 35, 60, 45, 80, 55, 65, 40, 85, 30, 70, 50, 60, 35, 75];
  return (
    <div className="flex h-8 items-center gap-0.5">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-0.5 rounded-full"
          style={{ height: `${h}%`, backgroundColor: color, opacity: 0.7 }}
        />
      ))}
    </div>
  );
}

/* ============ EDITOR TAB ============ */

function EditorTab({ data, section }: { data: typeof channelData[string]; section: Section }) {
  const [playing, setPlaying] = useState(false);
  const tracks =
    section === 'long'
      ? [
          { id: 'video', label: 'Video', color: '#3b82f6' },
          { id: 'broll', label: 'B-Roll', color: '#ec4899' },
          { id: 'audio', label: 'Audio', color: '#10b981' },
          { id: 'caption', label: 'Captions', color: '#f59e0b' },
        ]
      : [
          { id: 'video', label: 'Video', color: '#3b82f6' },
          { id: 'audio', label: 'Audio', color: '#10b981' },
          { id: 'caption', label: 'Captions', color: '#f59e0b' },
        ];

  return (
    <div className="flex h-[calc(100vh-12rem)] gap-3">
      {/* Media pool */}
      <div className="hidden w-48 shrink-0 flex-col rounded-lg border border-border bg-surface md:flex">
        <div className="border-b border-border px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-gray-500">
          Media Pool
        </div>
        <div className="flex-1 overflow-y-auto thin-scrollbar p-2">
          {[...data.images, ...data.audio, ...data.videos].map((m) => (
            <div
              key={m.id}
              className="mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-300 hover:bg-surface2"
            >
              {m.kind === 'image' && <ImageIcon className="h-4 w-4 text-gray-500" />}
              {m.kind === 'audio' && <Music className="h-4 w-4 text-gray-500" />}
              {m.kind === 'video' && <Film className="h-4 w-4 text-gray-500" />}
              <span className="truncate">{m.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Center */}
      <div className="flex flex-1 flex-col">
        {/* Toolbar */}
        <div className="mb-3 flex items-center gap-1 rounded-lg border border-border bg-surface p-1.5">
          <ToolbarBtn icon={Undo2} label="Undo" />
          <ToolbarBtn icon={Redo2} label="Redo" />
          <Divider />
          <ToolbarBtn icon={Scissors} label="Split" />
          <ToolbarBtn icon={Trash2} label="Delete" />
          <Divider />
          <ToolbarBtn icon={Maximize2} label="Fit" />
          <ToolbarBtn icon={ZoomIn} label="Zoom" />
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPlaying((p) => !p)}
              className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {playing ? 'Pause' : 'Play'}
              <span className="text-xs text-blue-200">Space</span>
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex flex-1 items-center justify-center rounded-lg border border-border bg-black">
          <div className="flex aspect-[9/16] h-full max-h-full items-center justify-center rounded-md bg-surface2">
            <span className="text-sm text-gray-600">9:16 Canvas</span>
          </div>
        </div>

        {/* Timeline */}
        <div className="mt-3 rounded-lg border border-border bg-surface p-2">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs text-gray-500">Timeline</span>
            <span className="text-xs text-gray-600">0:00 / 0:13</span>
          </div>
          <div className="space-y-1">
            {tracks.map((t) => {
              const clips = data.clips.filter((c) => c.track === t.id);
              return (
                <div key={t.id} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs text-gray-500">{t.label}</span>
                  <div className="relative h-8 flex-1 rounded bg-bg">
                    {clips.map((c) => (
                      <div
                        key={c.id}
                        className="absolute top-0.5 bottom-0.5 flex items-center rounded px-2 text-xs text-white"
                        style={{
                          left: `${(c.start / 13) * 100}%`,
                          width: `${(c.length / 13) * 100}%`,
                          backgroundColor: c.color,
                          opacity: 0.85,
                        }}
                      >
                        <span className="truncate">{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Properties */}
      <div className="hidden w-56 shrink-0 flex-col rounded-lg border border-border bg-surface lg:flex">
        <div className="border-b border-border px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-gray-500">
          Properties
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto thin-scrollbar p-3">
          <PropField label="Duration">
            <input
              defaultValue="4.0s"
              className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
            />
          </PropField>
          <PropField label="Zoom">
            <input
              defaultValue="100%"
              className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
            />
          </PropField>
          <PropField label="Position">
            <input
              defaultValue="0, 0"
              className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
            />
          </PropField>
          <PropField label="Caption Text">
            <textarea
              defaultValue="AI just changed everything"
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
            />
          </PropField>
          <PropField label="Font">
            <select className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-white outline-none focus:border-accent">
              <option>Inter</option>
              <option>Roboto</option>
              <option>System</option>
            </select>
          </PropField>
          <PropField label="Color">
            <div className="flex gap-2">
              {['#ffffff', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'].map((c) => (
                <button
                  key={c}
                  className="h-6 w-6 rounded border border-border"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </PropField>
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({ icon: Icon, label }: { icon: typeof Undo2; label: string }) {
  return (
    <button
      title={label}
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-300 hover:bg-surface2"
    >
      <Icon className="h-4 w-4" />
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-border" />;
}

function PropField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
      {children}
    </div>
  );
}

/* ============ EXPORT TAB ============ */

function ExportTab({ section }: { section: Section }) {
  const [thumbMode, setThumbMode] = useState<'frame' | 'upload'>('frame');
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Preview */}
      <div className="flex flex-col">
        <div className="flex aspect-video items-center justify-center rounded-lg border border-border bg-black">
          <div className="flex aspect-[9/16] h-full items-center justify-center rounded bg-surface2">
            <FileVideo className="h-8 w-8 text-gray-600" />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-center gap-2">
          <button className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-gray-200 hover:bg-surface2">
            <Play className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-4">
        <Field label="Title">
          <input
            defaultValue="AI just changed everything in 2026"
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
          />
        </Field>
        <Field label="Description">
          <textarea
            defaultValue="The biggest AI announcements of the year, explained in 30 seconds. Subscribe for daily AI news."
            rows={4}
            className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
          />
        </Field>
        <Field label="Tags">
          <input
            defaultValue="AI, tech, news, 2026, shorts"
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
          />
        </Field>

        <Field label="Thumbnail">
          <div className="mb-2 flex gap-2">
            <button
              onClick={() => setThumbMode('frame')}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                thumbMode === 'frame'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-gray-300 hover:bg-surface2'
              }`}
            >
              Frame Grab
            </button>
            <button
              onClick={() => setThumbMode('upload')}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
                thumbMode === 'upload'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-gray-300 hover:bg-surface2'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </button>
          </div>
          <div className="flex aspect-video items-center justify-center rounded-lg border border-border bg-surface2 text-sm text-gray-500">
            {thumbMode === 'frame' ? 'Select a frame from the video' : 'Click to upload image'}
          </div>
        </Field>

        {section === 'long' && (
          <Field label="End Screen">
            <select className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent">
              <option>Subscribe button (default)</option>
              <option>Best for viewer</option>
              <option>Last video</option>
              <option>Custom</option>
            </select>
          </Field>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <button className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
            <Download className="h-4 w-4" />
            Download MP4
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-gray-200 hover:bg-surface2">
            <Copy className="h-4 w-4" />
            Copy Metadata
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-gray-200 hover:bg-surface2">
            <Plus className="h-4 w-4" />
            Start New
          </button>
        </div>
      </div>
    </div>
  );
}
