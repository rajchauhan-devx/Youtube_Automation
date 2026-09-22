import { useState, useMemo, useEffect, useRef } from 'react';
import { Zap, Clapperboard, ListOrdered, Library, Settings, ChevronDown } from 'lucide-react';
import { createWorkspaceFetch, DEFAULT_ACCOUNT, WorkspaceApiContext } from './services/workspaceApi';
import type { Section, Tab, Channel, Script } from './data';
import { PlaceholderPage } from './components/PlaceholderPage';
import { ProfilePage } from './components/profile/ProfilePage';
import { ScriptsTab } from './components/scripts/ScriptsTab';
import { NewScriptModal } from './components/scripts/NewScriptModal';
import { ScriptRunModal } from './components/scripts/ScriptRunModal';
import { PreviewTab } from './components/preview/PreviewTab';
import { AssetsTab } from './components/assets/AssetsTab';
import { GenerationTab } from './components/generation/GenerationTab';
import { ReviewAdjustTab } from './components/editor/ReviewAdjustTab';
import { YouTubeExportTab } from './components/export/YouTubeExportTab';
import { Header } from './components/layout/Header';
import { ChannelSwitcher } from './components/layout/ChannelSwitcher';
import { extractScriptTagContent, parseAIResponse } from './lib/parseAIResponse.js';
import { incompleteResponse } from '../server/src/services/generation-status';
import { apiPost, getApiKey } from './services/api.js';
import { ErrorBoundary } from './components/ErrorBoundary';

const TABS: { id: Tab; label: string }[] = [
  { id: 'scripts', label: 'Scripts' },
  { id: 'preview', label: 'Preview' },
  { id: 'assets', label: 'Assets' },
  { id: 'generation', label: 'Generation' },
  { id: 'review', label: 'Timeline & Render' },
  { id: 'export', label: 'YouTube Export' },
];

const SIDEBAR_ICONS = [
  { id: 'shorts', label: 'Shorts', icon: Zap },
  { id: 'long', label: 'Long Video', icon: Clapperboard },
  { id: 'mixed', label: 'Mixed Media', icon: Library },
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

type SidebarId = Section | 'queue' | 'library' | 'settings' | 'profile';

export default function App() {
  const initialUi = loadUiState();
  const [activeChannel, setActiveChannel] = useState<Channel>(
    { ...DEFAULT_ACCOUNT, id: initialUi?.channelId?.startsWith('acct_') ? initialUi.channelId : 'default' }
  );
  const [accounts, setAccounts] = useState<Channel[]>([DEFAULT_ACCOUNT]);
  const [channelSwitcherOpen, setChannelSwitcherOpen] = useState(false);
  const [sidebar, setSidebar] = useState<SidebarId>(initialUi?.section ?? 'shorts');
  const [section, setSection] = useState<Section>(initialUi?.section ?? 'shorts');
  const [tab, setTab] = useState<Tab>(initialUi?.tab ?? 'scripts');
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(initialUi?.selectedScriptId ?? null);
  const [newScriptOpen, setNewScriptOpen] = useState(false);
  const [userScripts, setUserScripts] = useState<Script[]>([]);
  const [runModalScript, setRunModalScript] = useState<Script | null>(null);
  const saveQueues = useRef(new Map<string, Promise<void>>());
  const [saveError, setSaveError] = useState('');
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

  const fetch = useMemo(() => createWorkspaceFetch(activeChannel.id, section), [activeChannel.id, section]);
  const scopeKey = `${activeChannel.id}:${section}`;
  const activeScope = useRef(scopeKey);
  activeScope.current = scopeKey;
  const scopeScripts = userScripts.filter(script => script.accountId === activeChannel.id && script.section === section);

  useEffect(() => {
    const controller = new AbortController();
    globalThis.fetch('/api/accounts', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Could not load YouTube accounts');
      const data = await response.json();
      if (!Array.isArray(data.accounts)) throw new Error('Invalid account list');
      setAccounts(data.accounts);
      setActiveChannel(current => data.accounts.find((item: Channel) => item.id === current.id) || data.accounts[0] || DEFAULT_ACCOUNT);
    }).catch(error => { if (!controller.signal.aborted) setSaveError(error.message); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setUserScripts([]);
    fetch('/api/scripts', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Could not load workspace scripts');
      const data: Script[] = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid script list');
      if (!controller.signal.aborted) {
        const normalized = data.map(script => ({ ...script, accountId: activeChannel.id, section }));
        setUserScripts(normalized);
        setSelectedScriptId(current => normalized.some(script => script.id === current) ? current : normalized[0]?.id || null);
      }
    }).catch(error => { if (!controller.signal.aborted) setSaveError(error.message); });
    return () => { controller.abort(); generationAbortRef.current?.abort(); };
  }, [fetch, activeChannel.id, section]);

  function patchScriptState(id: string, patch: Partial<Script>) {
    if (activeScope.current !== scopeKey) return;
    setUserScripts(prev => prev.map(script => script.id === id ? { ...script, ...patch, accountId: activeChannel.id, section } : script));
  }

  async function persistScript(id: string, patch: Partial<Script>) {
    const full = userScripts.find(script => script.id === id);
    if (!full) return;
    const updated = { ...full, ...patch };
    patchScriptState(id, patch);
    let saved = false;
    const save = async () => {
      try {
        let response = await fetch('/api/scripts/' + id, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
        });
        if (response.status === 404) {
          response = await fetch('/api/scripts', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated),
          });
        }
        if (!response.ok) throw new Error(`Save failed (HTTP ${response.status})`);
        saved = true;
        setSaveError('');
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Could not save changes');
      }
    };
    const saveKey = `${scopeKey}:${id}`;
    const pending = (saveQueues.current.get(saveKey) || Promise.resolve()).then(save);
    saveQueues.current.set(saveKey, pending);
    await pending;
    if (saveQueues.current.get(saveKey) === pending) saveQueues.current.delete(saveKey);
    return saved;
  }

  function buildPrompt(template: string, topic: string, instructions: string, duration?: number): string {
    if (section !== 'shorts') {
      return [template, topic.trim() ? `Topic: ${topic}` : '', instructions.trim()].filter(Boolean).join('\n\n');
    }
    const targetDurationStr = duration
      ? `Target Duration: ~${duration} seconds. Pace the script naturally for this length — you may go slightly shorter or longer if the content demands it, but aim for this ballpark.`
      : '';
    const optionalInstructions = instructions.trim()
      ? `Additional Instructions: ${instructions.trim()}`
      : '';

    return `${template}

Topic: ${topic}
${targetDurationStr}
${optionalInstructions}
${section !== 'shorts' ? 'Create a long-form YouTube video with a strong opening, clear chapters, smooth transitions and a conclusion. Plan images for landscape 16:9 composition. Use the requested duration to develop the topic in depth.' : ''}`.trim();
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
      generatedImages: [],
      generatedAudio: [],
      timelineConfig: undefined,
      sceneAnalysis: undefined,
      youtubeExport: undefined,
      scenePlan: undefined,
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
    if (!await persistScript(scriptId, initialPatch)) {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
      return;
    }
    if (controller.signal.aborted || generationAbortRef.current !== controller) return;

    let fullResponse = '';

    try {
      const baseMessages = section !== 'shorts' ? [{ role: 'user', content: promptText }] : [
        {
          role: 'system',
          content:
            'You are an expert YouTube automation assistant. Generate a highly engaging YouTube script and follow the exact instructions in the user\'s template.',
        },
        { role: 'user', content: promptText },
      ];
      let messages = baseMessages;
      let finishReason = '';
      let incomplete: string | undefined;
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
            throw new Error('Received a damaged response stream. Partial text has been saved; retry generation.');
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

        incomplete = incompleteResponse(promptText, fullResponse);
        const needsContinuation = !finishReason || finishReason === 'STREAM_INTERRUPTED' || finishReason === 'MAX_TOKENS' || (finishReason === 'STOP' && Boolean(incomplete));
        if (!needsContinuation || attempt === maxContinuations) break;

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

      const completedNormally = finishReason === 'STOP' && !incomplete;
      const donePatch: Partial<Script> = {
        aiResponse: fullResponse,
        pipeline: [
          {
            id: 'response',
            label: 'Response',
            status: completedNormally ? ('done' as const) : ('warning' as const),
            summary: completedNormally
              ? 'Response complete — click Extract Assets to process'
              : `Response incomplete: ${incomplete || (finishReason || 'stream interrupted').toLowerCase().replace(/_/g, ' ')}`,
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

  const selectedScript = scopeScripts.find(script => script.id === selectedScriptId) || null;

  const pipeline = selectedScript?.pipeline || [];

  function selectSidebar(id: SidebarId) {
    setNewScriptOpen(false); setRunModalScript(null);
    setSidebar(id);
    if (id === 'shorts' || id === 'long' || id === 'mixed') {
      setSection(id);
      setTab('scripts');
      setSelectedScriptId(null);
    }
  }

  function switchChannel(ch: Channel) {
    setNewScriptOpen(false); setRunModalScript(null);
    setActiveChannel(ch);
    setChannelSwitcherOpen(false);
    setSelectedScriptId(null);
    setTab('scripts');
  }

  async function handleImportResponse(response: string, extract: boolean) {
    if (!selectedScript || !response.trim()) throw new Error('Select a script and paste a response first.');
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    const patch: Partial<Script> = {
      aiResponse: response.trim(), extractedScript: '', imagePrompts: [], narration: '',
      generatedImages: [], generatedAudio: [], scenePlan: undefined, timelineConfig: undefined,
      sceneAnalysis: undefined, youtubeExport: undefined, status: 'active', lastUsed: new Date().toISOString(),
      pipeline: [{ id: 'response', label: 'Response', status: 'done', summary: 'Response imported — ready to extract', inputLog: '', outputPreview: response.slice(0, 120) }],
    };
    if (!await persistScript(selectedScript.id, patch)) throw new Error('Could not save the imported response. Your pasted text is still here; please retry.');
    if (activeScope.current !== scopeKey) return;
    if (extract) await handleExtractAssets(false, { ...selectedScript, ...patch });
  }

  async function handleExtractAssets(useTimelineNarration = false, sourceScript: Script | null = selectedScript) {
    const selectedScript = sourceScript;
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

    let extracted: { script: string; ttsText: string; imagePrompts: string[]; scenePlan?: Script['scenePlan'] };

    try {
      const result = await apiPost(
        '/api/llm/extract',
        { rawText: selectedScript.aiResponse, useTimelineNarration },
        getApiKey(), fetch
      );
      extracted = {
        script: result.script || '',
        ttsText: section !== 'shorts' ? result.ttsText : extractScriptTagContent(selectedScript.aiResponse),
        imagePrompts: result.imagePrompts || [],
        scenePlan: result.scenePlan,
      };
    } catch (err) {
      if (section !== 'shorts') {
        patchScriptState(scriptId, { pipeline: [{ id: 'response', label: 'Response', status: 'error', summary: 'Asset extraction needs attention', inputLog: '', outputPreview: err instanceof Error ? err.message : 'Check the asset tags and narration links in the response.' }] });
        if (activeScope.current === scopeKey) setTab('preview');
        return;
      }
      console.error('AI extraction failed, falling back to regex parser:', err);
      extracted = parseAIResponse(selectedScript.aiResponse);
    }

    let sceneAnalysis: any = undefined;
    if (section !== 'shorts') {
      sceneAnalysis = { transitions: extracted.imagePrompts.map(() => 'none'), effects: extracted.imagePrompts.map(() => 'zoom-in'), timings: [], mood: 'epic', colorGrade: 'warm-vintage' };
    } else {
    try {
      sceneAnalysis = await apiPost(
        '/api/llm/scene-analysis',
        {
          script: extracted.script,
          narration: extracted.ttsText,
          imagePrompts: extracted.imagePrompts,
          duration: selectedScript.duration || 30,
        },
        getApiKey(), fetch
      );
    } catch (e) {
      console.warn('Scene analysis fetch error:', e);
    }
    }

    const patch: Partial<Script> = {
      extractedScript: extracted.script,
      imagePrompts: extracted.imagePrompts,
      narration: extracted.ttsText,
      scenePlan: extracted.scenePlan,
      ...(section !== 'shorts' ? { generatedImages: [], generatedAudio: [], timelineConfig: undefined } : {}),
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
    if (activeScope.current === scopeKey) setTab('assets');
  }

  async function handleClearScript(id: string) {
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
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
      youtubeExport: undefined,
      scenePlan: undefined,
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

  const isMainSection = sidebar === 'shorts' || sidebar === 'long' || sidebar === 'mixed';

  return (
    <WorkspaceApiContext.Provider value={{ account: activeChannel, profile: section, fetch }}>
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-white">
      {saveError && <div role="alert" className="fixed right-4 top-4 z-50 rounded-lg border border-red-500 bg-red-950 p-4 text-sm text-red-100">{saveError}. Changes remain in this tab; check the server before closing.</div>}
      {/* Sidebar */}
      <aside className="group flex w-16 flex-col border-r border-border bg-surface transition-all duration-200 hover:w-[200px]">
        {/* Channel avatar */}
        <div className="relative flex h-16 items-center justify-center border-b border-border">
          <button
            aria-label="Switch YouTube account"
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
              channels={accounts}
              onAdd={() => { setChannelSwitcherOpen(false); setSidebar('profile'); }}
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
                aria-label={item.label}
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
          <button aria-label="Profile and voices" title="Profile and voices" onClick={() => setSidebar('profile')} className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-bold">
              JD
            </div>
            <span className="hidden whitespace-nowrap text-sm group-hover:block">Profile & Voices</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          channel={activeChannel}
          section={sidebar === 'shorts' || sidebar === 'long' || sidebar === 'mixed' ? section : (sidebar as string)}
          tab={tab}
          isMain={isMainSection}
          onNewScript={() => { setSidebar(section); setTab('scripts'); setNewScriptOpen(true); }}
        />

        <main key={scopeKey} className="flex-1 overflow-y-auto thin-scrollbar">
          <div className="mx-auto w-full max-w-[1400px] px-6 py-6">
            {sidebar === 'profile' ? <ProfilePage accounts={accounts} onAccountsChange={setAccounts} onSelectAccount={switchChannel} /> : !isMainSection ? (
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
                      scripts={scopeScripts}
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
                      key={`${scopeKey}:${selectedScriptId}`}
                      pipeline={pipeline}
                      script={selectedScript}
                      onGenerate={(prompt) => selectedScript && generateScript(selectedScript, prompt, '')}
                      onStop={handleStopGeneration}
                      onExtractAssets={() => handleExtractAssets()}
                      onExtractTimelineAssets={() => handleExtractAssets(true)}
                      onImportResponse={handleImportResponse}
                    />
                  )}
                  {tab === 'assets' && <AssetsTab key={selectedScriptId} script={selectedScript} onUpdate={(patch) => selectedScriptId && persistScript(selectedScriptId, patch)} onProceedToGeneration={() => setTab('generation')} />}
                  {tab === 'generation' && (
                    <GenerationTab key={selectedScriptId}
                      script={selectedScript}
                      onUpdate={(patch) => selectedScriptId && persistScript(selectedScriptId, patch)}
                    />
                  )}
                  {tab === 'review' && (
                    <ReviewAdjustTab
                      key={`${scopeKey}:${selectedScriptId}`}
                      script={selectedScript}
                      onUpdate={(patch) => selectedScriptId && persistScript(selectedScriptId, patch)}
                    />
                  )}
                  {tab === 'export' && (
                    <YouTubeExportTab key={selectedScriptId}
                      script={selectedScript}
                      onUpdate={(patch) => selectedScriptId && persistScript(selectedScriptId, patch)}
                      onNavigateToTimeline={() => setTab('review')}
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
            setUserScripts((prev) => [...prev, { ...newScript, accountId: activeChannel.id, section }]);
            setSelectedScriptId(newScript.id);
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
    </WorkspaceApiContext.Provider>
  );
}






