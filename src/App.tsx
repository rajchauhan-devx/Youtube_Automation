import { useState, useMemo, useEffect, useRef } from 'react';
import { Zap, Clapperboard, ListOrdered, Library, Settings, ChevronDown } from 'lucide-react';
import { channels, channelData } from './data';
import type { Section, Tab, Channel, Script } from './data';
import { PlaceholderPage } from './components/PlaceholderPage';
import { ScriptsTab } from './components/scripts/ScriptsTab';
import { NewScriptModal } from './components/scripts/NewScriptModal';
import { ScriptRunModal } from './components/scripts/ScriptRunModal';
import { PreviewTab } from './components/preview/PreviewTab';
import { AssetsTab } from './components/assets/AssetsTab';
import { GenerationTab } from './components/generation/GenerationTab';
import { ReviewAdjustTab } from './components/editor/ReviewAdjustTab';
import { Header } from './components/layout/Header';
import { ChannelSwitcher } from './components/layout/ChannelSwitcher';
import { extractScriptTagContent, parseAIResponse } from './lib/parseAIResponse.js';
import { apiPost, getApiKey } from './services/api.js';
import { ErrorBoundary } from './components/ErrorBoundary';

const TABS: { id: Tab; label: string }[] = [
  { id: 'scripts', label: 'Scripts' },
  { id: 'preview', label: 'Preview' },
  { id: 'assets', label: 'Assets' },
  { id: 'generation', label: 'Generation' },
  { id: 'review', label: 'Review & Export' },
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
  const generationAbortRef = useRef<AbortController | null>(null);

  // Persist lightweight UI state so a refresh restores the workspace.
  useEffect(() => {
    saveUiState({
      channelId: activeChannel.id,
      section,
      tab,
      selectedScriptId,
    });
  }, [activeChannel.id, section, tab, selectedScriptId]);

  // Make sure a script is selected by default so Generation & Preview tabs are active
  useEffect(() => {
    if (!selectedScriptId) {
      const channelScripts = channelData[activeChannel.id]?.scripts || [];
      const fallbackId = userScripts[0]?.id || channelScripts[0]?.id || 'ch1-s1';
      setSelectedScriptId(fallbackId);
      return;
    }
    const persistedExists = userScripts.some((s) => s.id === selectedScriptId);
    const channelExists = channelData[activeChannel.id]?.scripts.some((s) => s.id === selectedScriptId);
    if (!persistedExists && !channelExists) {
      const fallbackId = userScripts[0]?.id || channelData[activeChannel.id]?.scripts[0]?.id || 'ch1-s1';
      setSelectedScriptId(fallbackId);
    }
  }, [userScripts, selectedScriptId, activeChannel.id]);

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

  function buildPrompt(template: string, topic: string, instructions: string, duration?: number): string {
    const targetDurationStr = duration
      ? `Target Duration: ~${duration} seconds. Pace the script naturally for this length — you may go slightly shorter or longer if the content demands it, but aim for this ballpark.`
      : '';
    const optionalInstructions = instructions.trim()
      ? `Additional Instructions: ${instructions.trim()}`
      : '';

    return `${template}

Topic: ${topic}
${targetDurationStr}
${optionalInstructions}`.trim();
  }

  async function generateScript(script: Script, topic: string, instructions: string) {
    const scriptId = script.id;
    const controller = new AbortController();

    generationAbortRef.current?.abort();
    generationAbortRef.current = controller;

    setSelectedScriptId(scriptId);
    setTab('preview');

    const template = script.prompts
      .filter((p) => p.content.trim())
      .map((p) => p.content)
      .join('\n\n');
    const promptText = buildPrompt(
      template || script.howItWorks || '',
      topic,
      instructions,
      script.duration || 30
    );

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
          summary: 'Starting generation...',
          inputLog: topic,
          outputPreview: '',
        },
      ],
    };

    patchScriptState(scriptId, initialPatch);
    await persistScript(scriptId, initialPatch);

    let fullResponse = '';

    try {
      const baseMessages = [
        {
          role: 'system',
          content:
            'You are an expert YouTube automation assistant. Generate a highly engaging YouTube script and follow the exact instructions in the user\'s template.',
        },
        { role: 'user', content: promptText },
      ];
      let messages = baseMessages;
      let finishReason = '';
      const maxContinuations = 8;

      for (let attempt = 0; attempt <= maxContinuations; attempt += 1) {
        finishReason = '';
        const res = await fetch('/api/llm/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: script.model || 'gemini-3.6-flash',
            messages,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          let message = `Generation failed (HTTP ${res.status})`;
          try {
            const parsed = JSON.parse(body);
            if (parsed.error) message = parsed.error;
          } catch {
            if (body.trim()) message = body.trim();
          }
          throw new Error(message);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('The server did not provide a response stream');

        const decoder = new TextDecoder();
        let sseBuffer = '';

        const handleEvent = (eventBlock: string) => {
          const dataStr = eventBlock
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n')
            .trim();

          if (!dataStr || dataStr === '[DONE]') return;

          let parsed: { token?: string; finishReason?: string; error?: string };
          try {
            parsed = JSON.parse(dataStr);
          } catch {
            console.warn('Ignoring malformed stream event:', dataStr);
            return;
          }

          if (parsed.error) throw new Error(parsed.error);

          if (parsed.token) {
            fullResponse += parsed.token;
            patchScriptState(scriptId, {
              aiResponse: fullResponse,
              pipeline: [
                {
                  id: 'response',
                  label: 'Response',
                  status: 'running' as const,
                  summary: attempt > 0 ? `Continuing response (${attempt + 1})...` : 'Generating live response...',
                  inputLog: topic,
                  outputPreview: fullResponse.slice(-200),
                },
              ],
            });
          }

          if (parsed.finishReason) finishReason = parsed.finishReason.toUpperCase();
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const events = sseBuffer.split(/\r?\n\r?\n/);
          sseBuffer = events.pop() || '';
          events.forEach(handleEvent);
        }

        sseBuffer += decoder.decode();
        if (sseBuffer.trim()) handleEvent(sseBuffer);

        if (finishReason !== 'MAX_TOKENS' || attempt === maxContinuations) break;

        messages = [
          ...baseMessages,
          { role: 'assistant', content: fullResponse },
          {
            role: 'user',
            content:
              'Continue exactly where you stopped. Do not repeat any existing text, do not add an introduction, and finish every remaining part of the requested output.',
          },
        ];
      }

      if (generationAbortRef.current !== controller) return;
      if (!fullResponse.trim()) throw new Error('The model finished without returning any text');

      const completedNormally = !finishReason || finishReason === 'STOP';
      const donePatch: Partial<Script> = {
        aiResponse: fullResponse,
        pipeline: [
          {
            id: 'response',
            label: 'Response',
            status: completedNormally ? ('done' as const) : ('warning' as const),
            summary: completedNormally
              ? 'Response complete — click Extract Assets to process'
              : `Generation ended: ${finishReason.toLowerCase().replace(/_/g, ' ')}`,
            inputLog: topic,
            outputPreview: fullResponse.slice(-200),
          },
        ],
      };

      patchScriptState(scriptId, donePatch);
      await persistScript(scriptId, { ...initialPatch, ...donePatch });
    } catch (err) {
      if (generationAbortRef.current !== controller) return;
      const wasStopped = err instanceof DOMException && err.name === 'AbortError';
      if (!wasStopped) console.error('Streaming failed:', err);
      const errorPatch: Partial<Script> = {
        aiResponse: fullResponse,
        pipeline: [
          {
            id: 'response',
            label: 'Response',
            status: wasStopped ? ('warning' as const) : ('error' as const),
            summary: wasStopped ? 'Generation stopped' : 'Failed to generate',
            inputLog: topic,
            outputPreview: wasStopped ? 'Stopped by user' : err instanceof Error ? err.message : String(err),
          },
        ],
      };
      patchScriptState(scriptId, errorPatch);
      await persistScript(scriptId, { ...initialPatch, ...errorPatch });
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
    }
  }

  async function handleRunScriptSubmit(topic: string, instructions: string) {
    if (!runModalScript) return;
    const script = runModalScript;
    setRunModalScript(null);
    await generateScript(script, topic, instructions);
  }

  function handleStopGeneration() {
    generationAbortRef.current?.abort();
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
        ttsText: extractScriptTagContent(selectedScript.aiResponse),
        imagePrompts: result.imagePrompts || [],
      };
    } catch (err) {
      console.error('AI extraction failed, falling back to regex parser:', err);
      extracted = parseAIResponse(selectedScript.aiResponse);
    }

    let sceneAnalysis: any = undefined;
    try {
      sceneAnalysis = await apiPost(
        '/api/llm/scene-analysis',
        {
          script: extracted.script,
          narration: extracted.ttsText,
          imagePrompts: extracted.imagePrompts,
          duration: selectedScript.duration || 30,
        },
        getApiKey()
      );
    } catch (e) {
      console.warn('Scene analysis fetch error:', e);
    }

    const patch: Partial<Script> = {
      extractedScript: extracted.script,
      imagePrompts: extracted.imagePrompts,
      narration: extracted.ttsText,
      sceneAnalysis,
      pipeline: [
        {
          id: 'response',
          label: 'Response',
          status: 'done' as const,
          summary: 'Assets extracted & scene effects analyzed',
          inputLog: selectedScript.topicName || '',
          outputPreview: extracted.script.slice(0, 120) + '...',
        },
      ],
    };
    patchScriptState(scriptId, patch);
    await persistScript(scriptId, patch);
    setTab('assets');
  }

  async function handleClearScript(id: string) {
    const resetPatch: Partial<Script> = {
      topicName: undefined,
      aiInstructions: undefined,
      aiResponse: '',
      extractedScript: '',
      imagePrompts: [],
      narration: '',
      generatedImages: [],
      generatedAudio: [],
      timelineConfig: undefined,
      sceneAnalysis: undefined,
      pipeline: [
        {
          id: 'response',
          label: 'Response',
          status: 'pending' as const,
          summary: 'Waiting to start',
          inputLog: '',
          outputPreview: '',
        },
      ],
      lastUsed: 'Never',
      status: 'draft' as const,
    };

    patchScriptState(id, resetPatch);
    await persistScript(id, resetPatch);
  }

  async function handleUpdateScriptDuration(id: string, duration: number) {
    const patch: Partial<Script> = { duration };
    patchScriptState(id, patch);
    await persistScript(id, patch);
  }

  async function handleUpdateScriptModel(id: string, model: string) {
    const patch: Partial<Script> = { model };
    patchScriptState(id, patch);
    await persistScript(id, patch);
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

                <ErrorBoundary fallbackLabel={`${tab.toUpperCase()} Tab Error`}>
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
                      onClear={handleClearScript}
                      onUpdateDuration={handleUpdateScriptDuration}
                      onUpdateModel={handleUpdateScriptModel}
                    />
                  )}
                  {tab === 'preview' && (
                    <PreviewTab
                      pipeline={pipeline}
                      script={selectedScript}
                      onGenerate={(prompt) => selectedScript && generateScript(selectedScript, prompt, '')}
                      onStop={handleStopGeneration}
                      onExtractAssets={handleExtractAssets}
                    />
                  )}
                  {tab === 'assets' && <AssetsTab script={selectedScript} onProceedToGeneration={() => setTab('generation')} />}
                  {tab === 'generation' && (
                    <GenerationTab
                      script={selectedScript}
                      onUpdate={(patch) => selectedScriptId && persistScript(selectedScriptId, patch)}
                    />
                  )}
                  {tab === 'review' && (
                    <ReviewAdjustTab
                      script={selectedScript}
                      onUpdate={(patch) => selectedScriptId && persistScript(selectedScriptId, patch)}
                    />
                  )}
                </ErrorBoundary>
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






