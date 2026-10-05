import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Zap,
  Clapperboard,
  Layers,
  ListOrdered,
  Library,
  Settings,
  ChevronDown,
  Play,
  Eye,
  Images,
  Wand2,
  Film,
  Rocket,
  ScrollText,
  CircleUserRound,
} from 'lucide-react';
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
import { EditingWorkspace } from './components/editor/EditingWorkspace';
import { ArtifactsTab } from './components/artifacts/ArtifactsTab';
import { SetupTab } from './components/setup/SetupTab';
import { ExportHubTab } from './components/export/ExportHubTab';
import { Header } from './components/layout/Header';
import { ChannelSwitcher } from './components/layout/ChannelSwitcher';
import { incompleteResponse, placeholderResponse } from '../server/src/services/generation-status';
import { buildFreePrompt, FREE_CHAT_SYSTEM } from '../server/src/services/script-generation';
import { apiPost, getApiKey } from './services/api.js';
import { parseJsonResponse, isAbortError, safeErrorMessage, safeJsonParse } from './lib/safe';
import { ErrorBoundary } from './components/ErrorBoundary';

const TABS: { id: Tab; label: string; icon: typeof ScrollText; step: string }[] = [
  { id: 'scripts', label: 'Scripts', icon: ScrollText, step: '01' },
  { id: 'preview', label: 'Preview', icon: Eye, step: '02' },
  { id: 'assets', label: 'Assets', icon: Images, step: '03' },
  { id: 'generation', label: 'Generation', icon: Wand2, step: '04' },
  { id: 'artifacts', label: 'Artifacts', icon: Film, step: '05' },
  { id: 'review', label: 'Timeline & Render', icon: Clapperboard, step: '06' },
  { id: 'export', label: 'Export', icon: Rocket, step: '07' },
];

type SidebarGroup = { title: string; items: { id: string; label: string; icon: typeof Zap; badge?: string }[] };

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    title: 'Create',
    items: [
      { id: 'shorts', label: 'Shorts', icon: Zap, badge: '9:16' },
      { id: 'long', label: 'Long Video', icon: Clapperboard, badge: '16:9' },
      { id: 'mixed', label: 'Mixed Media', icon: Layers },
    ],
  },
  {
    title: 'Manage',
    items: [
      { id: 'queue', label: 'Queue', icon: ListOrdered },
      { id: 'library', label: 'Library', icon: Library },
    ],
  },
  {
    title: 'System',
    items: [{ id: 'settings', label: 'Setup', icon: Settings }],
  },
];

const LS_KEY = 'tubeflow:v1';

interface PersistedUiState {
  channelId: string;
  section: Section;
  tab: Tab;
  selectedScriptId: string | null;
}

type AccountUiState = Omit<PersistedUiState, 'channelId'>;

function readJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

// The global key remembers the last workspace so a refresh resumes where the
// user left off; every profile additionally keeps its own section, tab and
// selected script so switching YouTube accounts never mixes their spaces.
function loadUiState(): PersistedUiState | null {
  try {
    return readJson<PersistedUiState>(localStorage.getItem(LS_KEY));
  } catch {
    return null;
  }
}

function loadAccountUiState(accountId: string): AccountUiState | null {
  try {
    return readJson<AccountUiState>(localStorage.getItem(`${LS_KEY}:${accountId}`));
  } catch {
    return null;
  }
}

function saveUiState(state: PersistedUiState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    localStorage.setItem(`${LS_KEY}:${state.channelId}`, JSON.stringify({ section: state.section, tab: state.tab, selectedScriptId: state.selectedScriptId }));
  } catch {
    // ignore
  }
}

type SidebarId = Section | 'queue' | 'library' | 'settings' | 'profile';

function isMainSectionSidebar(id: SidebarId): boolean {
  return id === 'shorts' || id === 'long' || id === 'mixed';
}

export default function App() {
  const initialUi = loadUiState();
  const initialAccountId = initialUi?.channelId?.startsWith('acct_') ? initialUi.channelId : 'default';
  const restoredUi = loadAccountUiState(initialAccountId) ?? initialUi;
  const [activeChannel, setActiveChannel] = useState<Channel>({ ...DEFAULT_ACCOUNT, id: initialAccountId });
  const [accounts, setAccounts] = useState<Channel[]>([DEFAULT_ACCOUNT]);
  const [channelSwitcherOpen, setChannelSwitcherOpen] = useState(false);
  const [sidebar, setSidebar] = useState<SidebarId>(restoredUi?.section ?? 'shorts');
  const [section, setSection] = useState<Section>(restoredUi?.section ?? 'shorts');
  const [tab, setTab] = useState<Tab>(restoredUi?.tab ?? 'scripts');
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(restoredUi?.selectedScriptId ?? null);
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
      const data = await parseJsonResponse<{ accounts?: Channel[] }>(response, {});
      if (!Array.isArray(data.accounts)) throw new Error('Invalid account list');
      if (controller.signal.aborted) return;
      setAccounts(data.accounts);
      setActiveChannel(current => data.accounts!.find((item: Channel) => item.id === current.id) || data.accounts![0] || DEFAULT_ACCOUNT);
    }).catch(error => { if (!controller.signal.aborted && !isAbortError(error)) setSaveError(safeErrorMessage(error, 'Could not load YouTube accounts')); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setUserScripts([]);
    fetch('/api/scripts', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Could not load workspace scripts');
      const data = await parseJsonResponse<Script[]>(response, []);
      if (!Array.isArray(data)) throw new Error('Invalid script list');
      if (!controller.signal.aborted) {
        const normalized = data.map(script => ({ ...script, accountId: activeChannel.id, section }));
        setUserScripts(normalized);
        setSelectedScriptId(current => normalized.some(script => script.id === current) ? current : normalized[0]?.id || null);
      }
    }).catch(error => { if (!controller.signal.aborted && !isAbortError(error)) setSaveError(safeErrorMessage(error, 'Could not load workspace scripts')); });
    return () => { controller.abort(); generationAbortRef.current?.abort(); };
  }, [fetch, activeChannel.id, section]);

  function patchScriptState(id: string, patch: Partial<Script>) {
    if (activeScope.current !== scopeKey) return;
    setUserScripts(prev => prev.map(script => script.id === id ? { ...script, ...patch, accountId: activeChannel.id, section } : script));
  }

  async function persistScript(id: string, patch: Partial<Script>) {
    const scopeAtCall = scopeKey;
    const full = userScripts.find(script => script.id === id);
    if (!full) return false;
    const updated = { ...full, ...patch };
    patchScriptState(id, patch);
    let saved = false;
    const save = async () => {
      try {
        const safeId = encodeURIComponent(id);
        let response = await fetch('/api/scripts/' + safeId, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
        });
        if (response.status === 404 && activeScope.current === scopeAtCall) {
          response = await fetch('/api/scripts', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated),
          });
        }
        if (!response.ok) throw new Error(`Save failed (HTTP ${response.status})`);
        saved = true;
        if (activeScope.current === scopeAtCall) setSaveError('');
      } catch (error) {
        if (isAbortError(error)) return;
        if (activeScope.current === scopeAtCall) {
          setSaveError(safeErrorMessage(error, 'Could not save changes'));
        }
      }
    };
    const saveKey = `${scopeKey}:${id}`;
    // Prevent unbounded queue growth across long sessions.
    if (saveQueues.current.size > 50) saveQueues.current.clear();
    const pending = (saveQueues.current.get(saveKey) || Promise.resolve()).then(save).finally(() => {
      if (saveQueues.current.get(saveKey) === pending) saveQueues.current.delete(saveKey);
    });
    saveQueues.current.set(saveKey, pending);
    await pending;
    return saved;
  }

  function buildPrompt(template: string, topic: string, instructions: string, duration?: number): string {
    // Template-sovereign free chat: the template goes through untouched plus
    // topic, authoritative target duration (with minimum scene scaling) and
    // extra instructions. The template keeps its tag system; extraction
    // validates the tags.
    return buildFreePrompt(template, topic, instructions, duration || 30);

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
      facebookExport: undefined,
      instagramExport: undefined,
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
      // Same plain-chat shape for every profile: neutral system line plus the
      // template-driven user prompt. No per-profile system contracts and no
      // provider JSON-schema enforcement — the template owns the format.
      const baseMessages = [
        { role: 'system', content: FREE_CHAT_SYSTEM },
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
            max_tokens: (script.model || 'gemini-3.6-flash').startsWith('gemini-') ? 65536 : 16384,
          }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          let message = `Generation failed (HTTP ${res.status})`;
          const parsed = safeJsonParse<{ error?: string }>(body, {});
          if (parsed?.error?.trim()) message = parsed.error;
          else if (body.trim()) message = body.trim().slice(0, 500);
          throw new Error(message);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('The server did not provide a response stream');

        const decoder = new TextDecoder();
        let sseBuffer = '';
        let streamDamaged = false;

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
            // Don't kill the whole stream on one damaged chunk â€” keep partial text.
            streamDamaged = true;
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

        try {
          while (true) {
            if (controller.signal.aborted) break;
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const events = sseBuffer.split(/\r?\n\r?\n/);
            sseBuffer = events.pop() || '';
            for (const event of events) {
              try {
                handleEvent(event);
              } catch (error) {
                // Server-sent error payload â€” abort cleanly with message.
                try { await reader.cancel(); } catch { /* already closed */ }
                throw error;
              }
            }
          }

          sseBuffer += decoder.decode();
          if (sseBuffer.trim()) {
            try {
              handleEvent(sseBuffer);
            } catch (error) {
              try { await reader.cancel(); } catch { /* already closed */ }
              throw error;
            }
          }
        } finally {
          try { reader.releaseLock(); } catch { /* lock already released */ }
        }

        if (streamDamaged && !fullResponse.trim()) {
          throw new Error('Received a damaged response stream. Partial text could not be recovered; retry generation.');
        }

        // Free-chat completion: the stream ending is the signal. The generic
        // structural check below only catches genuinely unclosed tags — the
        // template's own instructional headings are never treated as required
        // output sections (freeChat flag), so a finished response stops here
        // instead of ballooning through repeated continuations.
        // (No visual-prompt repair here: it rewrites responses into bare JSON
        // and would destroy the template's own tag system. Extraction is the
        // quality gate and reports exactly which tags are missing.)
        incomplete = incompleteResponse(promptText, fullResponse, true) || placeholderResponse(fullResponse);
        const placeholdersOnly = !incompleteResponse(promptText, fullResponse, true) && Boolean(placeholderResponse(fullResponse));
        const needsContinuation = !finishReason || finishReason === 'STREAM_INTERRUPTED' || finishReason === 'MAX_TOKENS' || (finishReason === 'STOP' && Boolean(incomplete));
        if (!needsContinuation || attempt === maxContinuations) break;

        messages = [
          ...baseMessages,
          { role: 'assistant', content: fullResponse },
          {
            role: 'user',
            content: placeholdersOnly
              ? 'Write ONLY the missing <image_prompt> blocks in full (complete Prompt, Negative Prompt and Style Tags in each). Do not repeat any existing text, do not add an introduction, and do not use placeholders such as [...Repeat...] or "following the same standard".'
              : 'Continue exactly where you stopped. Do not repeat any existing text, do not add an introduction, and finish every remaining part of the requested output.',
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
              ? 'Response complete â€” click Extract Assets to process'
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
    // Each profile keeps its own workspace: restore this account's last
    // section, tab and script instead of inheriting the previous profile's.
    const saved = loadAccountUiState(ch.id);
    if (saved?.section) {
      const nextSection = saved.section;
      setSection(nextSection);
      if (isMainSectionSidebar(sidebar)) setSidebar(nextSection);
      setTab(saved.tab ?? 'scripts');
      setSelectedScriptId(saved.selectedScriptId ?? null);
      return;
    }
    setTab('scripts');
    setSelectedScriptId(null);
  }

  async function handleImportResponse(response: string, extract: boolean) {
    if (!selectedScript || !response.trim()) throw new Error('Select a script and paste a response first.');
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    const patch: Partial<Script> = {
      aiResponse: response.trim(), extractedScript: '', imagePrompts: [], narration: '',
      generatedImages: [], generatedAudio: [], scenePlan: undefined, timelineConfig: undefined,
      sceneAnalysis: undefined, youtubeExport: undefined, facebookExport: undefined, instagramExport: undefined, status: 'active', lastUsed: new Date().toISOString(),
      pipeline: [{ id: 'response', label: 'Response', status: 'done', summary: 'Response imported â€” ready to extract', inputLog: '', outputPreview: response.slice(0, 120) }],
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
          summary: 'Extracting scene assets...',
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
        ttsText: result.ttsText,
        imagePrompts: result.imagePrompts || [],
        scenePlan: result.scenePlan,
      };
    } catch (err) {
      await persistScript(scriptId, { pipeline: [{ id: 'response', label: 'Response', status: 'error', summary: 'Asset extraction needs attention', inputLog: '', outputPreview: err instanceof Error ? err.message : 'Check the scene plan and narration links in the response.' }] });
      if (activeScope.current === scopeKey) setTab('preview');
      return;
    }

    const sceneAnalysis = { transitions: extracted.imagePrompts.map(() => 'none'), effects: extracted.imagePrompts.map(() => 'zoom-in'), timings: [], mood: 'epic', colorGrade: 'warm-vintage' };

    const patch: Partial<Script> = {
      extractedScript: extracted.script,
      imagePrompts: extracted.imagePrompts,
      narration: extracted.ttsText,
      scenePlan: extracted.scenePlan,
      ...(section !== 'shorts' || extracted.scenePlan ? { generatedImages: [], generatedAudio: [], timelineConfig: undefined } : {}),
      sceneAnalysis,
      pipeline: [
        {
          id: 'response',
          label: 'Response',
          status: 'done' as const,
          summary: 'Assets extracted in the shared scene format',
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
    const scopeAtCall = scopeKey;
    await saveQueues.current.get(`${scopeKey}:${id}`);
    try {
      const response = await fetch(`/api/scripts/${encodeURIComponent(id)}/clear`, { method: 'POST' });
      const saved = await response.json() as Script & { error?: string };
      if (!response.ok) throw new Error(saved.error || 'Could not clear script data');
      if (activeScope.current === scopeAtCall) {
        setUserScripts(previous => previous.map(script => script.id === id ? saved : script));
        setSaveError('');
      }
    } catch (error) {
      if (activeScope.current === scopeAtCall) setSaveError(safeErrorMessage(error, 'Could not clear script data'));
    }
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

  async function handleSaveSpokenScript(id: string, text: string) {
    generationAbortRef.current?.abort();
    const scopeAtCall = scopeKey;
    await saveQueues.current.get(`${scopeKey}:${id}`);
    const response = await fetch(`/api/scripts/${encodeURIComponent(id)}/spoken-script`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    });
    const saved = await response.json() as Script & { error?: string };
    if (!response.ok) throw new Error(saved.error || `Could not save script (HTTP ${response.status}).`);
    if (activeScope.current === scopeAtCall) patchScriptState(id, { ...saved, timelineConfig: undefined, youtubeExport: undefined, facebookExport: undefined, instagramExport: undefined, generatedMusic: undefined });
    return true;
  }

  async function handleSaveScriptPatch(id: string, patch: Partial<Script>) {
    if ('scenePlan' in patch || 'aiResponse' in patch) generationAbortRef.current?.abort();
    return persistScript(id, patch);
  }

  async function handleDeleteScript(id: string) {
    generationAbortRef.current?.abort();
    const scopeAtCall = scopeKey;
    await saveQueues.current.get(`${scopeKey}:${id}`);
    try {
      const response = await fetch(`/api/scripts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not delete script data');
      if (activeScope.current === scopeAtCall) {
        setUserScripts(previous => previous.filter(script => script.id !== id));
        if (selectedScriptId === id) setSelectedScriptId(null);
        setSaveError('');
      }
    } catch (error) {
      if (activeScope.current === scopeAtCall) setSaveError(safeErrorMessage(error, 'Could not delete script data'));
    }
  }

  const isMainSection = sidebar === 'shorts' || sidebar === 'long' || sidebar === 'mixed';
  const activeStepIndex = Math.max(0, TABS.findIndex((t) => t.id === tab));

  return (
    <WorkspaceApiContext.Provider value={{ account: activeChannel, profile: section, fetch }}>
    <div className="studio-bg flex h-screen w-screen overflow-hidden text-white">
      {saveError && (
        <div role="alert" className="fixed right-4 top-4 z-[80] studio-card max-w-sm border-danger/40 bg-[#1a0f14] p-4 text-[13px] leading-relaxed text-red-100 shadow-pop animate-scale-in">
          <p className="font-semibold text-red-200">Sync issue</p>
          <p className="mt-1 text-red-100/80">{saveError}. Changes remain in this tab; check the server before closing.</p>
        </div>
      )}
      {/* Sidebar */}
      <aside className="hidden w-[248px] shrink-0 flex-col border-r border-borderSoft bg-[#0b0e15]/90 backdrop-blur-xl md:flex">
        {/* Brand */}
        <div className="flex h-[68px] items-center gap-3 border-b border-borderSoft px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-[#ff4d6d] to-[#c40f35] shadow-glow">
            <Play className="h-4 w-4 fill-white text-white" />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-extrabold tracking-tight">TubeFlow</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Studio Pro</span>
          </span>
        </div>

        {/* Channel */}
        <div className="relative px-3 pt-3">
          <button
            aria-label="Switch YouTube account"
            onClick={() => setChannelSwitcherOpen((v) => !v)}
            className="flex w-full items-center gap-3 rounded-studio border border-borderSoft bg-surface px-3 py-2.5 text-left shadow-card transition-colors hover:border-[#334054] hover:bg-surface2"
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold text-white"
              style={{ backgroundColor: activeChannel.color }}
            >
              {activeChannel.avatar}
            </div>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{activeChannel.name}</span>
              <span className="block text-[11px] text-faint">Publishing channel</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-faint transition-transform ${channelSwitcherOpen ? 'rotate-180' : ''}`} />
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

        {/* Nav */}
        <nav className="thin-scrollbar flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {SIDEBAR_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-faint">{group.title}</p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = sidebar === item.id;
                  return (
                    <button
                      key={item.id}
                      aria-label={item.label}
                      onClick={() => selectSidebar(item.id as SidebarId)}
                      className={
                        active
                          ? 'studio-nav-btn border border-accent/25 bg-accentSoft text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                          : 'studio-nav-btn border border-transparent text-muted hover:bg-white/[0.04] hover:text-white'
                      }
                    >
                      <span className={active ? 'flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white shadow-glow' : 'flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-muted'}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.badge && (
                        <span className={active ? 'rounded-md bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold text-accent' : 'rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-bold text-faint'}>
                          {item.badge}
                        </span>
                      )}
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Profile */}
        <div className="border-t border-borderSoft p-3">
          <button aria-label="Profile and voices" title="Profile and voices" onClick={() => setSidebar('profile')} className={`studio-nav-btn border ${sidebar === 'profile' ? 'border-accent/25 bg-accentSoft text-white' : 'border-transparent text-muted hover:bg-white/[0.04] hover:text-white'}`}>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-b from-[#3a4358] to-[#202636] text-xs font-bold text-white">
              <CircleUserRound className="h-5 w-5" />
            </span>
            <span className="flex-1 text-left">
              <span className="block text-[13px] font-semibold">Profile & Voices</span>
              <span className="block text-[11px] text-faint">Accounts Â· TTS Â· Clones</span>
            </span>
          </button>
        </div>
      </aside>

      {/* Mobile sidebar */}
      <aside className="flex w-16 shrink-0 flex-col items-center border-r border-borderSoft bg-[#0b0e15] py-3 md:hidden">
        {SIDEBAR_GROUPS.flatMap((g) => g.items).map((item) => {
          const Icon = item.icon;
          const active = sidebar === item.id;
          return (
            <button
              key={item.id}
              aria-label={item.label}
              onClick={() => selectSidebar(item.id as SidebarId)}
              className={active ? 'mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-white shadow-glow' : 'mb-1 flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-white/5 hover:text-white'}
            >
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          channel={activeChannel}
          section={sidebar === 'shorts' || sidebar === 'long' || sidebar === 'mixed' ? section : (sidebar as string)}
          tab={tab}
          isMain={isMainSection}
          onNewScript={() => { setSidebar(section); setTab('scripts'); setNewScriptOpen(true); }}
        />

        <main key={scopeKey} className="thin-scrollbar flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] px-5 py-6 sm:px-7">
            {sidebar === 'profile' ? <ProfilePage accounts={accounts} onAccountsChange={setAccounts} onSelectAccount={switchChannel} /> : sidebar === 'settings' ? (
              <SetupTab />
            ) : !isMainSection ? (
              <PlaceholderPage label={sidebar.charAt(0).toUpperCase() + sidebar.slice(1)} />
            ) : (
              <div className="animate-fade-up">
                {/* Pipeline stepper */}
                <div className="studio-card mb-5 hidden items-center gap-1 overflow-x-auto p-2 no-scrollbar lg:flex">
                  {TABS.map((t, i) => {
                    const StepIcon = t.icon;
                    const done = i < activeStepIndex;
                    const current = i === activeStepIndex;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors ${current ? 'bg-accentSoft text-white' : 'text-muted hover:bg-white/[0.04] hover:text-white'}`}
                      >
                        <span className={current ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-glow' : done ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success/15 text-emerald-300' : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-faint'}>
                          <StepIcon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-faint">Step {t.step}</span>
                          <span className="block truncate text-[12px] font-semibold">{t.label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Tabs (mobile / compact) */}
                <div className="mb-5 flex gap-1.5 overflow-x-auto rounded-studio border border-borderSoft bg-surface/70 p-1.5 no-scrollbar lg:hidden">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={tab === t.id ? 'studio-tab-btn shrink-0 bg-accent text-white shadow-glow' : 'studio-tab-btn shrink-0 text-muted hover:bg-white/5 hover:text-white'}
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
                      onSaveScript={handleSaveScriptPatch}
                      onSaveSpoken={handleSaveSpokenScript}
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
                      onVisualEdit={() => setTab('artifacts')}
                      script={selectedScript}
                      onUpdate={(patch) => selectedScriptId && persistScript(selectedScriptId, patch)}
                    />
                  )}
                  {tab === 'review' && (
                    <EditingWorkspace
                      key={`${scopeKey}:${selectedScriptId}`}
                      script={selectedScript}
                      onUpdate={(patch) => selectedScriptId && persistScript(selectedScriptId, patch)}
                    />
                  )}
                  {tab === 'artifacts' && <ArtifactsTab key={selectedScriptId} script={selectedScript} onUpdate={(patch) => selectedScriptId && persistScript(selectedScriptId, patch)} />}
                  {tab === 'export' && (
                    <ExportHubTab key={selectedScriptId}
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






