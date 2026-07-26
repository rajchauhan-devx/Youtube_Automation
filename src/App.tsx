import { useState, useMemo, useEffect, useRef } from 'react';
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
  Upload,
  Sparkles,
  AlertCircle,
  Loader2,
  Square,
} from 'lucide-react';
import { channels, channelData } from './data';
import type { Section, Tab, Channel, Script, PipelineStep, GeneratedImage } from './data';
import { parseAIResponse } from './lib/parseAIResponse.js';
import { apiPost, getApiKey } from './services/api.js';

const TABS: { id: Tab; label: string }[] = [
  { id: 'scripts', label: 'Scripts' },
  { id: 'preview', label: 'Preview' },
  { id: 'assets', label: 'Assets' },
  { id: 'generation', label: 'Generation' },
  { id: 'editor', label: 'Editor' },
  { id: 'export', label: 'Export' },
];

const SIDEBAR_ICONS = [
  { id: 'shorts', label: 'Shorts', icon: Zap },
  { id: 'long', label: 'Long', icon: Clapperboard },
  { id: 'queue', label: 'Queue', icon: ListOrdered },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

const LS_KEY = 'tubeflow:v1';

interface PersistedUiState {
  channelId: string;
  section: Section;
  tab: Tab;
  selectedScriptId: string | null;
}

function loadUiState(): PersistedUiState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedUiState;
  } catch {
    return null;
  }
}

function saveUiState(state: PersistedUiState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function mergeScript(base: Script, persisted?: Script): Script {
  if (!persisted) return base;
  return {
    ...base,
    ...persisted,
    prompts: persisted.prompts && persisted.prompts.length > 0 ? persisted.prompts : base.prompts,
  };
}

type SidebarId = Section | 'queue' | 'library' | 'settings';

export default function App() {
  const initialUi = loadUiState();
  const [activeChannel, setActiveChannel] = useState<Channel>(
    channels.find((c) => c.id === initialUi?.channelId) ?? channels[0]
  );
  const [channelSwitcherOpen, setChannelSwitcherOpen] = useState(false);
  const [sidebar, setSidebar] = useState<SidebarId>(initialUi?.section ?? 'shorts');
  const [section, setSection] = useState<Section>(initialUi?.section ?? 'shorts');
  const [tab, setTab] = useState<Tab>(initialUi?.tab ?? 'scripts');
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(initialUi?.selectedScriptId ?? null);
  const [newScriptOpen, setNewScriptOpen] = useState(false);
  const [userScripts, setUserScripts] = useState<Script[]>([]);
  const [runModalScript, setRunModalScript] = useState<Script | null>(null);

  // Persist lightweight UI state so a refresh restores the workspace.
  useEffect(() => {
    saveUiState({
      channelId: activeChannel.id,
      section,
      tab,
      selectedScriptId,
    });
  }, [activeChannel.id, section, tab, selectedScriptId]);

  // Make sure the selected script still belongs to the active channel/section.
  useEffect(() => {
    if (!selectedScriptId) return;
    const persistedExists = userScripts.some((s) => s.id === selectedScriptId);
    if (!persistedExists) setSelectedScriptId(null);
  }, [userScripts, selectedScriptId]);

  useEffect(() => {
    fetch('/api/scripts')
      .then((res) => res.json())
      .then((data: Script[]) => {
        // If a saved run is in an unfinished running state, reset it so the UI
        // does not stay stuck after a refresh.
        const normalized = data.map((s) => {
          const isUnfinished =
            (s.pipeline?.[0]?.status === 'running' && !s.aiResponse) ||
            (s.pipeline?.some((p) => p.status === 'running') && !s.aiResponse);
          if (isUnfinished) {
            return {
              ...s,
              pipeline: [{ id: 'response', label: 'Response', status: 'pending' as const, summary: 'Waiting to start', inputLog: s.topicName || '', outputPreview: '' }],
            };
          }
          return s;
        });
        setUserScripts(normalized);
      })
      .catch(console.error);
  }, []);

  function patchScriptState(id: string, patch: Partial<Script>) {
    setUserScripts((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...patch };
        return next;
      }
      const base = channelData[activeChannel.id].scripts.find((s) => s.id === id);
      if (!base) return prev;
      return [...prev, { ...base, ...patch }];
    });
  }

  async function persistScript(id: string, patch: Partial<Script>) {
    const base = channelData[activeChannel.id].scripts.find((s) => s.id === id);
    const persisted = userScripts.find((s) => s.id === id);
    const full = base ? mergeScript(base, persisted) : persisted;
    if (!full) {
      console.error('Cannot persist script: no template or saved state for', id);
      return;
    }
    const updated = { ...full, ...patch };
    patchScriptState(id, patch);
    try {
      await fetch('/api/scripts/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch (err) {
      console.error('Failed to persist script state:', err);
    }
  }

  function buildPrompt(template: string, topic: string, instructions: string): string {
    const optionalInstructions = instructions.trim()
      ? `Additional Instructions: ${instructions.trim()}`
      : '';

    return `${template}

Topic: ${topic}
${optionalInstructions}`;
  }

  async function handleRunScriptSubmit(topic: string, instructions: string) {
    if (!runModalScript) return;
    const script = runModalScript;
    const scriptId = script.id;

    setRunModalScript(null);
    setSelectedScriptId(scriptId);
    setTab('preview');

    const template = script.prompts
      .filter((p) => p.content.trim())
      .map((p) => p.content)
      .join('\n\n');
    const promptText = buildPrompt(template || script.howItWorks || '', topic, instructions);

    const initialPatch: Partial<Script> = {
      id: scriptId,
      topicName: topic,
      aiInstructions: instructions,
      aiResponse: '',
      extractedScript: '',
      imagePrompts: [],
      narration: '',
      lastUsed: new Date().toISOString(),
      status: 'active',
      pipeline: [
        {
          id: 'response',
          label: 'Response',
          status: 'running' as const,
          summary: 'Generating AI response...',
          inputLog: topic,
          outputPreview: '',
        },
      ],
    };

    patchScriptState(scriptId, initialPatch);
    await persistScript(scriptId, initialPatch);

    try {
      const res = await fetch('/api/llm/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek/deepseek-v4-flash',
          messages: [
            {
              role: 'system',
              content:
                'You are an expert YouTube automation assistant. Generate a highly engaging YouTube script and follow the exact instructions in the user\'s template.',
            },
            { role: 'user', content: promptText },
          ],
        }),
      });

      if (!res.ok) throw new Error('Streaming request failed');
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No readable stream');
      const decoder = new TextDecoder();

      let fullResponse = '';
      let sseBuffer = '';
      let truncated = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.token) {
                fullResponse += parsed.token;
                patchScriptState(scriptId, {
                  aiResponse: fullResponse,
                  pipeline: [
                    {
                      id: 'response',
                      label: 'Response',
                      status: 'running' as const,
                      summary: 'Receiving AI response...',
                      inputLog: topic,
                      outputPreview: fullResponse.slice(0, 200) + '...',
                    },
                  ],
                });
              }
              if (parsed.finishReason && parsed.finishReason !== 'stop') {
                truncated = true;
              }
              if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      // Stream complete: save raw response, don't extract yet
      const donePatch: Partial<Script> = {
        aiResponse: fullResponse,
        pipeline: [
          {
            id: 'response',
            label: 'Response',
            status: truncated ? ('warning' as const) : ('done' as const),
            summary: truncated
              ? 'Response was cut off (hit token limit) — consider shortening the prompt or continuing generation'
              : 'Response complete — click Extract Assets to process',
            inputLog: topic,
            outputPreview: fullResponse.slice(0, 120) + '...',
          },
        ],
      };

      patchScriptState(scriptId, donePatch);
      await persistScript(scriptId, donePatch);
    } catch (err) {
      console.error('Streaming failed:', err);
      const errorPatch: Partial<Script> = {
        pipeline: [
          {
            id: 'response',
            label: 'Response',
            status: 'error' as const,
            summary: 'Failed to generate',
            inputLog: topic,
            outputPreview: String(err),
          },
        ],
      };
      patchScriptState(scriptId, errorPatch);
      await persistScript(scriptId, errorPatch);
    }
  }

  const data = useMemo(() => channelData[activeChannel.id], [activeChannel]);

  const persistedScript = useMemo(
    () => userScripts.find((s) => s.id === selectedScriptId),
    [userScripts, selectedScriptId]
  );

  const selectedScript = useMemo(() => {
    const base = data.scripts.find((s) => s.id === selectedScriptId) ?? null;
    if (!base) return persistedScript ?? null;
    return mergeScript(base, persistedScript);
  }, [data, persistedScript, selectedScriptId]);

  const pipeline = selectedScript?.pipeline || [];

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

  async function handleExtractAssets() {
    if (!selectedScript?.aiResponse || !selectedScriptId) return;
    const scriptId = selectedScriptId;

    patchScriptState(scriptId, {
      pipeline: [
        {
          id: 'response',
          label: 'Response',
          status: 'running' as const,
          summary: 'Extracting assets with AI...',
          inputLog: selectedScript.topicName || '',
          outputPreview: '',
        },
      ],
    });
    setTab('assets');

    let extracted: { script: string; ttsText: string; imagePrompts: string[] };

    try {
      const result = await apiPost(
        '/api/llm/extract',
        { rawText: selectedScript.aiResponse },
        getApiKey()
      );
      extracted = {
        script: result.script || '',
        ttsText: result.ttsText || '',
        imagePrompts: result.imagePrompts || [],
      };
    } catch (err) {
      console.error('AI extraction failed, falling back to regex parser:', err);
      extracted = parseAIResponse(selectedScript.aiResponse);
    }

    const patch: Partial<Script> = {
      extractedScript: extracted.script,
      imagePrompts: extracted.imagePrompts,
      narration: extracted.ttsText,
      pipeline: [
        {
          id: 'response',
          label: 'Response',
          status: 'done' as const,
          summary: 'Assets extracted',
          inputLog: selectedScript.topicName || '',
          outputPreview: extracted.script.slice(0, 120) + '...',
        },
      ],
    };
    patchScriptState(scriptId, patch);
    await persistScript(scriptId, patch);
    setTab('assets');
  }

  async function handleDeleteScript(id: string) {
    try {
      await fetch(`/api/scripts/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Delete script API error:', err);
    }
    setUserScripts((prev) => prev.filter((s) => s.id !== id));
    if (selectedScriptId === id) setSelectedScriptId(null);
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
                    scripts={userScripts}
                    section={section}
                    selectedId={selectedScriptId}
                    onSelect={setSelectedScriptId}
                    onNewScript={() => setNewScriptOpen(true)}
                    onRunScript={(s) => setRunModalScript(s)}
                    selectedScript={selectedScript}
                    onClosePanel={() => setSelectedScriptId(null)}
                    onDelete={handleDeleteScript}
                  />
                )}
                {tab === 'preview' && <PreviewTab pipeline={pipeline} script={selectedScript} onExtractAssets={handleExtractAssets} />}
                {tab === 'assets' && <AssetsTab script={selectedScript} onProceedToGeneration={() => setTab('generation')} />}
                {tab === 'generation' && (
                  <GenerationTab
                    script={selectedScript}
                    onUpdate={(patch) => selectedScriptId && persistScript(selectedScriptId, patch)}
                  />
                )}
                {tab === 'editor' && <EditorTab data={data} section={section} />}
                {tab === 'export' && <ExportTab section={section} />}
              </div>
            )}
          </div>
        </main>
      </div>

      {newScriptOpen && (
        <NewScriptModal
          onClose={() => setNewScriptOpen(false)}
          section={section}
          onCreated={(newScript) => {
            setUserScripts((prev) => [...prev, newScript]);
          }}
        />
      )}
    
      {runModalScript && (
        <ScriptRunModal
          script={runModalScript}
          onClose={() => setRunModalScript(null)}
          onSubmit={handleRunScriptSubmit}
        />
      )}
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

function ScriptDetailPanel({
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

let blockCounter = 0;
function newBlockId() {
  blockCounter += 1;
  return `nb${Date.now()}_${blockCounter}`;
}

function NewScriptModal({ onClose, section, onCreated }: { onClose: () => void; section: Section; onCreated?: (script: Script) => void }) {
  const [name, setName] = useState('');
  const [prompts, setPrompts] = useState<
    { id: string; name: string; content: string }[]
  >([
    { id: newBlockId(), name: '', content: '' },
  ]);
  const [howItWorks, setHowItWorks] = useState('');
  const [saving, setSaving] = useState(false);

  function updatePrompt(id: string, patch: Partial<{ name: string; content: string }>) {
    setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function addPrompt() {
    setPrompts((prev) => [...prev, { id: newBlockId(), name: '', type: 'Custom', content: '' }]);
  }
  function deletePrompt(id: string) {
    setPrompts((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev));
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    const newScript: Script = {
      id: `usr_${Date.now()}`,
      name: name.trim(),
      lastUsed: 'now',
      status: 'draft',
      locked: false,
      prompts: prompts.map((p) => ({ id: p.id, name: p.name, content: p.content })),
      howItWorks,
    };
    try {
      const res = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newScript),
      });
      if (!res.ok) throw new Error('Failed to save script');
      const saved = await res.json();
      onCreated?.(saved);
      onClose();
    } catch (err) {
      console.error('Error saving script:', err);
      alert('Failed to save script. Please try again.');
    } finally {
      setSaving(false);
    }
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
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-4 py-2 text-sm text-gray-200 hover:bg-surface2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Create Script'}
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

function PreviewTab({ pipeline, script, onExtractAssets }: { pipeline: PipelineStep[]; script: Script | null; onExtractAssets?: () => void }) {
  const responseEndRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (responseEndRef.current) {
      responseEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [script?.aiResponse]);

  function handleCopy() {
    if (script?.aiResponse) {
      navigator.clipboard.writeText(script.aiResponse).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  if (!script) {
    return <div className="flex h-full items-center justify-center text-gray-500">No script selected.</div>;
  }

  const responseStage = pipeline.find((p) => p.id === 'response') || ({} as PipelineStep);
  const isDone = responseStage.status === 'done';
  const hasAssets = (script.imagePrompts?.length ?? 0) > 0 || script.narration;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-semibold">Preview</h3>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gray-600" />
            <span className="text-xs text-gray-500">Topic:</span>
            <span className="text-xs text-white">{script.topicName || 'Not set'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDone && !hasAssets && onExtractAssets && (
            <button
              onClick={onExtractAssets}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Extract Assets
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? 'Copied' : 'Copy Response'}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="rounded-lg bg-surface p-6">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-400">AI Response</h4>
            {responseStage.status === 'running' && (
              <span className="flex items-center gap-2 text-xs text-accent">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                Streaming...
              </span>
            )}
            {responseStage.status === 'done' && (
              <span className="flex items-center gap-2 text-xs text-green-400">
                <Check className="h-3 w-3" />
                Complete
              </span>
            )}
            {responseStage.status === 'error' && (
              <span className="flex items-center gap-2 text-xs text-red-400">
                <AlertCircle className="h-3 w-3" />
                Error
              </span>
            )}
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
            {script.aiResponse || responseStage?.outputPreview || (
              <span className="text-gray-500 italic">No response generated yet. Run a script to begin.</span>
            )}
            <div ref={responseEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
function AssetsTab({ script, onProceedToGeneration }: { script: Script | null; onProceedToGeneration?: () => void }) {
  const [activeSubTab, setActiveSubTab] = useState<'images' | 'narration'>('images');

  if (!script) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <p className="text-sm">No script selected.</p>
        <p className="mt-1 text-xs">Run a script to see extracted assets.</p>
      </div>
    );
  }

  const responseStep = script.pipeline?.find((p) => p.id === 'response');
  const isExtracting = responseStep?.status === 'running';
  const hasAssets = (script.imagePrompts?.length ?? 0) > 0 || script.narration;

  if (isExtracting) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <Loader2 className="mb-3 h-8 w-8 animate-spin text-accent" />
        <p className="text-sm">Extracting assets with AI...</p>
        <p className="mt-1 text-xs">Please wait while we parse the response</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveSubTab('images')}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors ${
              activeSubTab === 'images' ? 'bg-surface2 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            Image Prompts
            {script.imagePrompts && script.imagePrompts.length > 0 && (
              <span className="ml-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] text-accent">
                {script.imagePrompts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab('narration')}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors ${
              activeSubTab === 'narration' ? 'bg-surface2 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Music className="h-4 w-4" />
            Narration
            {script.narration && (
              <span className="ml-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] text-accent">
                1
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {script.imagePrompts?.length ?? 0} images, {script.narration ? '1 narration' : 'no narration'}
          </span>
          {hasAssets && (script.imagePrompts?.length ?? 0) > 0 && onProceedToGeneration && (
            <button
              onClick={onProceedToGeneration}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80"
            >
              <Play className="h-3.5 w-3.5" />
              Proceed to Generation
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {!hasAssets ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-500">
            <ImageIcon className="mb-3 h-8 w-8 text-gray-600" />
            <p className="text-sm">No assets extracted yet.</p>
            <p className="mt-1 text-xs">Run a script and assets will appear here automatically.</p>
          </div>
        ) : activeSubTab === 'images' ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Image Prompts</h3>
              <span className="text-xs text-gray-500">Pending generation</span>
            </div>
            {script.imagePrompts && script.imagePrompts.length > 0 ? (
              <div className="flex flex-col gap-3">
                {script.imagePrompts.map((prompt, i) => (
                  <div key={i} className="rounded-lg border border-border bg-surface p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">
                          {i + 1}
                        </span>
                        <span className="text-xs font-medium text-white">Image {i + 1}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                          Pending
                        </span>
                      </div>
                    </div>
                    <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                      {prompt}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigator.clipboard.writeText(prompt)}
                        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </button>
                      <button className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2">
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No image prompts found in the response.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Narration (TTS)</h3>
              <span className="text-xs text-gray-500">Pending generation</span>
            </div>
            {script.narration ? (
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-white">Narration Script</span>
                  <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                    Pending
                  </span>
                </div>
                <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                  {script.narration}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(script.narration!)}
                    className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No narration found in the response.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


/* ============ GENERATION TAB ============ */

function GenerationTab({
  script,
  onUpdate,
}: {
  script: Script | null;
  onUpdate: (patch: Partial<Script>) => void;
}) {
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline' | 'starting'>('checking');
  const [serverError, setServerError] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);

  const runTokenRef = useRef(0);
  const pausedRef = useRef(false);
  const imagesRef = useRef<GeneratedImage[]>([]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    runTokenRef.current++;
    setIsRunning(false);
    setIsPaused(false);
    if (!script) {
      setImages([]);
      return;
    }
    const prompts = script.imagePrompts || [];
    const existing = script.generatedImages || [];
    const merged: GeneratedImage[] = prompts.map((prompt, i) => {
      const prior = existing.find((e) => e.index === i && e.prompt === prompt);
      return prior ?? { index: i, prompt, status: 'pending' as const };
    });
    setImages(merged);
  }, [script?.id, script?.imagePrompts]);

  async function checkServer() {
    setServerStatus('checking');
    const status = await fetch('/api/generate/status')
      .then((r) => r.json())
      .catch((err) => ({ online: false, detail: err.message }));
    setServerStatus(status.online ? 'online' : 'offline');
    setServerError(status.detail || '');
    return status.online as boolean;
  }

  useEffect(() => {
    checkServer();
  }, []);

  function updateImage(index: number, patch: Partial<GeneratedImage>) {
    const next = imagesRef.current.map((im) => (im.index === index ? { ...im, ...patch } : im));
    imagesRef.current = next;
    setImages(next);
    onUpdate({ generatedImages: next });
  }

  async function generateOne(item: GeneratedImage) {
    if (!script) return;
    updateImage(item.index, { status: 'generating', error: undefined, errorCode: undefined });
    try {
      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId: script.id, index: item.index, prompt: item.prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.error || 'Generation failed'), { code: data.code });
      updateImage(item.index, {
        status: 'done',
        url: data.url,
        seed: data.seed,
        elapsedMs: data.elapsedMs,
        attempts: (item.attempts || 0) + 1,
      });
    } catch (err: any) {
      updateImage(item.index, {
        status: 'error',
        error: err.message || 'Unknown error',
        errorCode: err.code,
        attempts: (item.attempts || 0) + 1,
      });
    }
  }

  async function runQueue(items: GeneratedImage[]) {
    const myToken = ++runTokenRef.current;
    setIsRunning(true);
    for (const item of items) {
      if (myToken !== runTokenRef.current) return;
      if (item.status === 'done') continue;
      while (pausedRef.current) {
        await new Promise((r) => setTimeout(r, 300));
        if (myToken !== runTokenRef.current) return;
      }
      await generateOne(item);
    }
    if (myToken === runTokenRef.current) setIsRunning(false);
  }

  async function handleStartModel() {
    setServerStatus('starting');
    setServerError('');
    try {
      const res = await fetch('/api/generate/start', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setServerStatus('online');
      } else {
        setServerStatus('offline');
        setServerError(data.message || 'Failed to start ComfyUI');
      }
    } catch (err: any) {
      setServerStatus('offline');
      setServerError(err.message || 'Could not reach the server');
    }
  }

  async function handleStopModel() {
    setServerStatus('offline');
    try {
      await fetch('/api/generate/stop', { method: 'POST' });
    } catch {
      // ignore
    }
  }

  async function handleStart() {
    if (!script || images.length === 0 || isRunning) return;
    const online = await checkServer();
    if (!online) return;
    runQueue(imagesRef.current);
  }

  function handlePause() {
    setIsPaused(true);
  }
  function handleResume() {
    setIsPaused(false);
  }

  function handleCancel() {
    runTokenRef.current++;
    setIsRunning(false);
    setIsPaused(false);
    const generating = imagesRef.current.find((im) => im.status === 'generating');
    if (generating && script) {
      fetch('/api/generate/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId: script.id, index: generating.index }),
      }).catch(() => {});
      updateImage(generating.index, { status: 'pending' });
    }
  }

  function handleRetryFailed() {
    if (isRunning) return;
    runQueue(imagesRef.current);
  }

  async function handleRegenerateOne(index: number) {
    if (isRunning) return;
    const target = imagesRef.current.find((im) => im.index === index);
    if (!target) return;
    setIsRunning(true);
    const myToken = ++runTokenRef.current;
    await generateOne({ ...target, status: 'pending' });
    if (myToken === runTokenRef.current) setIsRunning(false);
  }

  if (!script) {
    return <div className="flex h-full items-center justify-center text-gray-500">No script selected.</div>;
  }
  if (images.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <ImageIcon className="mb-3 h-8 w-8 text-gray-600" />
        <p className="text-sm">No image prompts to generate.</p>
        <p className="mt-1 text-xs">Extract assets first from the Preview tab.</p>
      </div>
    );
  }

  const doneCount = images.filter((i) => i.status === 'done').length;
  const errorCount = images.filter((i) => i.status === 'error').length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-semibold">Image Generation</h3>
          <span className="text-xs text-gray-500">
            {doneCount}/{images.length} done{errorCount > 0 ? `, ${errorCount} failed` : ''}
          </span>
          {serverStatus === 'online' && (
            <span className="flex items-center gap-1.5 text-[10px] text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> FLUX.2 Klein server online
            </span>
          )}
          {serverStatus === 'offline' && (
            <span className="flex items-center gap-1.5 text-[10px] text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Server offline
            </span>
          )}
          {serverStatus === 'starting' && (
            <span className="flex items-center gap-1.5 text-[10px] text-accent">
              <span className="h-1.5 w-1.5 animate-spin rounded-full border-2 border-accent border-t-transparent" /> Starting model...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {serverStatus === 'online' && (
            <button
              onClick={async () => {
                const res = await fetch('/api/generate/stop', { method: 'POST' });
                const data = await res.json();
                if (data.success) setServerStatus('offline');
              }}
              className="flex items-center gap-1.5 rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
            >
              <Square className="h-3.5 w-3.5" /> Stop Model
            </button>
          )}
          {serverStatus === 'online' && (
            <button
              onClick={handleStopModel}
              className="flex items-center gap-1.5 rounded-md border border-orange-500/40 px-3 py-1.5 text-xs text-orange-400 hover:bg-orange-500/10"
            >
              <Square className="h-3.5 w-3.5" /> Stop Model
            </button>
          )}
          {!isRunning ? (
            <button
              onClick={handleStart}
              disabled={serverStatus !== 'online' || doneCount === images.length}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80 disabled:opacity-40"
            >
              {serverStatus === 'starting' ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {serverStatus === 'starting' ? 'Starting model...' : doneCount === 0 ? 'Start Generation' : 'Resume Generation'}
            </button>
          ) : isPaused ? (
            <button onClick={handleResume} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80">
              <Play className="h-3.5 w-3.5" /> Resume
            </button>
          ) : (
            <button onClick={handlePause} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2">
              <Pause className="h-3.5 w-3.5" /> Pause
            </button>
          )}
          {isRunning && (
            <button onClick={handleCancel} className="flex items-center gap-1.5 rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          )}
          {!isRunning && errorCount > 0 && (
            <button onClick={handleRetryFailed} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2">
              <Undo2 className="h-3.5 w-3.5" /> Retry Failed ({errorCount})
            </button>
          )}
        </div>
      </div>

      {serverStatus === 'starting' && (
        <div className="mx-4 mt-4 flex items-start gap-2 rounded-md border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
          <span className="mt-0.5 h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <div>
            <p className="font-medium">Starting Image Model...</p>
            <p className="mt-1 text-accent/80">Launching ComfyUI, this may take up to 2 minutes.</p>
          </div>
        </div>
      )}

      {serverStatus === 'offline' && (
        <div className="mx-4 mt-4 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Image Model is offline</p>
            <p className="mt-1 text-red-300/80">{serverError}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleStartModel}
                className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-[11px] font-medium text-white hover:bg-accent/80"
              >
                <Zap className="h-3.5 w-3.5" />
                Run Image Model
              </button>
              <button onClick={checkServer} className="rounded border border-red-500/40 px-2 py-1 text-[11px] hover:bg-red-500/10">
                Retry connection
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img) => (
            <div key={img.index} className="rounded-lg border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-white">Image {img.index + 1}</span>
                {img.status === 'pending' && <span className="rounded-full bg-gray-500/10 px-2 py-0.5 text-[10px] text-gray-400">Pending</span>}
                {img.status === 'generating' && (
                  <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Generating...
                  </span>
                )}
                {img.status === 'done' && (
                  <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">
                    <Check className="h-3 w-3" /> Done
                  </span>
                )}
                {img.status === 'error' && (
                  <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">
                    <AlertCircle className="h-3 w-3" /> Failed
                  </span>
                )}
              </div>

              <div className="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-md bg-surface2">
                {img.status === 'done' && img.url ? (
                  <img
                    src={img.url}
                    alt={`Generated ${img.index + 1}`}
                    className="h-full w-full cursor-pointer object-cover"
                    onClick={() => setLightbox(img.url!)}
                  />
                ) : img.status === 'generating' ? (
                  <div className="flex flex-col items-center gap-2 text-gray-500">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                    <span className="text-[10px]">Rendering...</span>
                  </div>
                ) : (
                  <ImageIcon className="h-8 w-8 text-gray-600" />
                )}
              </div>

              <p className="mb-2 line-clamp-3 text-[11px] leading-relaxed text-gray-400">{img.prompt}</p>
              {img.status === 'error' && <p className="mb-2 text-[11px] text-red-400">{img.error}</p>}

              <div className="flex gap-2">
                <button
                  onClick={() => handleRegenerateOne(img.index)}
                  disabled={isRunning}
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-gray-300 hover:bg-surface2 disabled:opacity-40"
                >
                  <Undo2 className="h-3 w-3" /> {img.status === 'done' ? 'Regenerate' : 'Retry'}
                </button>
                {img.status === 'done' && img.url && (
                  <a href={img.url} download className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-gray-300 hover:bg-surface2">
                    <Download className="h-3 w-3" /> Download
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
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

function ScriptRunModal({
  script,
  onClose,
  onSubmit,
}: {
  script: Script;
  onClose: () => void;
  onSubmit: (topic: string, instructions: string) => void;
}) {
  const [topic, setTopic] = useState(script.topicName || '');
  const [instructions, setInstructions] = useState(script.aiInstructions || '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = topic.trim();
    if (!cleaned) return;
    onSubmit(cleaned, instructions.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[500px] rounded-2xl border border-border bg-bg shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-semibold">Run AI Script</h2>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-surface">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <p className="mb-6 text-sm text-gray-400">
            Running <strong>{script.name}</strong>. Provide a topic and optional instructions.
          </p>
          <div className="mb-4 space-y-2">
            <label htmlFor="run-topic" className="text-sm font-medium">
              Topic Name (Required)
            </label>
            <input
              id="run-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. History of Rome"
              className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm focus:border-accent focus:outline-none"
              required
            />
          </div>
          <div className="mb-6 space-y-2">
            <label htmlFor="run-instructions" className="text-sm font-medium">
              AI Instructions (Optional)
            </label>
            <textarea
              id="run-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Make it dramatic, focus on Caesar..."
              className="h-24 w-full resize-none rounded-lg border border-border bg-surface px-4 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-surface">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!topic.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Run Script
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
