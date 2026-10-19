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
  LayoutDashboard,
  Check,
} from 'lucide-react';
import { createWorkspaceFetch, DEFAULT_ACCOUNT, WorkspaceApiContext } from './services/workspaceApi';
import type { Section, Tab, Channel, Script, PipelineStep, GeneratedAudio } from './data';
import { PlaceholderPage } from './components/PlaceholderPage';
import { ProfilePage } from './components/profile/ProfilePage';
import { YouTubeStudioDashboard } from './components/dashboard/YouTubeStudioDashboard';
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
import { buildFreePrompt, FREE_CHAT_SYSTEM, freeChatSystem } from '../server/src/services/script-generation';
import { apiPost, getApiKey } from './services/api.js';
import { parseJsonResponse, isAbortError, safeErrorMessage, safeJsonParse } from './lib/safe';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AutoPilotModal } from './components/autopilot/AutoPilotModal';
import type { AutoPilotState, AutoPilotStage } from './services/autoPilotTypes';
import { editingRequest, type EditingPayload } from './services/editingApi';
import { executeSupervisedStage, runPreflightSupervision } from './services/supervisor';

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
    title: 'Studio',
    items: [
      { id: 'dashboard', label: 'YT Studio', icon: LayoutDashboard, badge: '3 YT' },
    ],
  },
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

type SidebarId = Section | 'dashboard' | 'queue' | 'library' | 'settings' | 'profile';

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

  const [autoPilotState, setAutoPilotState] = useState<AutoPilotState>({
    isActive: false,
    isPaused: false,
    isMinimized: false,
    stage: 'idle',
    stageIndex: 0,
    totalStages: 6,
    progressPercent: 0,
    statusMessage: 'Ready',
    topic: '',
    scriptId: null,
    logs: [],
    renderedVideoUrl: null,
    error: null,
  });
  const autoPilotAbortRef = useRef<AbortController | null>(null);
  const autoPilotPausedRef = useRef(false);

  function addAutoPilotLog(
    stage: AutoPilotStage,
    message: string,
    type: 'info' | 'gemini' | 'success' | 'warn' | 'error' = 'info'
  ) {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const id = Math.random().toString(36).slice(2, 9);
    setAutoPilotState((prev) => ({
      ...prev,
      logs: [...prev.logs, { id, timestamp, stage, message, type }],
    }));
  }

  function handleAutoPilotPauseToggle() {
    autoPilotPausedRef.current = !autoPilotPausedRef.current;
    setAutoPilotState((prev) => ({
      ...prev,
      isPaused: autoPilotPausedRef.current,
      statusMessage: autoPilotPausedRef.current ? 'Auto-Pilot paused' : 'Auto-Pilot in progress...',
    }));
  }

  function handleAutoPilotStop() {
    autoPilotAbortRef.current?.abort();
    autoPilotAbortRef.current = null;
    autoPilotPausedRef.current = false;
    setAutoPilotState((prev) => ({
      ...prev,
      isActive: false,
      statusMessage: 'Auto-Pilot stopped',
    }));
  }

  function handleAutoPilotMinimizeToggle() {
    setAutoPilotState((prev) => ({
      ...prev,
      isMinimized: !prev.isMinimized,
    }));
  }

  function handleAutoPilotClose() {
    setAutoPilotState((prev) => ({
      ...prev,
      isActive: false,
      stage: 'idle',
    }));
  }

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
        const normalized = data.map(script => {
          const hasStaleRunning = !generationAbortRef.current && Array.isArray(script.pipeline) && script.pipeline.some(step => step.status === 'running');
          const pipeline = hasStaleRunning
            ? script.pipeline!.map(step =>
                step.status === 'running'
                  ? {
                      ...step,
                      status: (script.aiResponse?.trim() ? 'done' : 'warning') as 'done' | 'warning',
                      summary: script.aiResponse?.trim()
                        ? 'Response complete — click Extract Assets to process'
                        : 'Generation interrupted — enter a prompt below or click Run to start again',
                    }
                  : step,
              )
            : script.pipeline;
          return { ...script, pipeline, accountId: activeChannel.id, section };
        });
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

  function buildPrompt(template: string, topic: string, instructions: string, duration?: number, researchData?: string): string {
    // Template-sovereign free chat: the template goes through untouched plus
    // topic, authoritative target duration (with minimum scene scaling),
    // extra instructions, and any researched topic/script data.
    return buildFreePrompt(template, topic, instructions, duration || 30, researchData);
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

    const initialPatch: Partial<Script> = {
      id: scriptId,
      topicName: topic,
      aiInstructions: instructions,
      aiResponse: '',
      researchData: '',
      researchSources: [],
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
          id: 'research',
          label: 'Research',
          status: 'running' as const,
          summary: 'Researching topic, facts & script requirements...',
          inputLog: topic,
          outputPreview: '',
        },
        {
          id: 'response',
          label: 'Response',
          status: 'running' as const,
          summary: 'Researching topic & gathering script data...',
          inputLog: topic,
          outputPreview: '',
        },
      ],
    };

    patchScriptState(scriptId, initialPatch);
    if (!await persistScript(scriptId, initialPatch)) {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
      patchScriptState(scriptId, {
        pipeline: [
          {
            id: 'response',
            label: 'Response',
            status: 'error' as const,
            summary: 'Failed to start generation',
            inputLog: topic,
            outputPreview: 'Could not reach the backend server. Please try again.',
          },
        ],
      });
      return;
    }
    if (controller.signal.aborted || generationAbortRef.current !== controller) return;

    let fullResponse = '';
    let researchData = '';
    let researchSources: { title: string; url?: string; snippet?: string }[] = [];
    let researchStep: PipelineStep = {
      id: 'research',
      label: 'Research',
      status: 'running',
      summary: 'Researching topic, facts & script requirements...',
      inputLog: topic,
      outputPreview: '',
    };

    try {
      // Step 1: AI Model Researches Topic & Script Requirements First
      const researchRes = await fetch('/api/llm/research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getApiKey() ? { 'x-api-key': getApiKey() } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: script.model || 'gemini-3.6-flash',
          topic,
          template: template || script.howItWorks || '',
          instructions,
          duration: script.duration || 30,
        }),
      });

      if (researchRes.status === 401) {
        const body = await researchRes.text().catch(() => '');
        const parsed = safeJsonParse<{ error?: string }>(body, {});
        throw new Error(parsed?.error?.trim() || 'Missing API key');
      }

      if (researchRes.ok) {
        const researchJson = await parseJsonResponse<{
          researchData?: string;
          sources?: { title: string; url?: string; snippet?: string }[];
        }>(researchRes, {});
        researchData = (researchJson.researchData || '').trim();
        researchSources = Array.isArray(researchJson.sources) ? researchJson.sources : [];
        researchStep = {
          id: 'research',
          label: 'Research',
          status: 'done',
          summary: researchSources.length
            ? `Researched topic & script data (${researchSources.length} reference source${researchSources.length === 1 ? '' : 's'})`
            : 'Topic & script research complete',
          inputLog: topic,
          outputPreview: researchData.slice(0, 240),
        };
      } else {
        researchStep = {
          id: 'research',
          label: 'Research',
          status: 'warning',
          summary: 'Research step skipped — generating directly',
          inputLog: topic,
          outputPreview: '',
        };
      }

      if (controller.signal.aborted || generationAbortRef.current !== controller) return;

      patchScriptState(scriptId, {
        researchData,
        researchSources,
        pipeline: [
          researchStep,
          {
            id: 'response',
            label: 'Response',
            status: 'running' as const,
            summary: researchData
              ? 'Generating live response using researched data...'
              : 'Generating live response...',
            inputLog: topic,
            outputPreview: '',
          },
        ],
      });

      // Step 2: Generate Script Response Using Researched Data
      const promptText = buildPrompt(
        template || script.howItWorks || '',
        topic,
        instructions,
        script.duration || 30,
        researchData
      );

      // Same plain-chat shape for every profile: neutral system line plus the
      // template-driven user prompt (enriched with the researched dossier).
      const baseMessages = [
        { role: 'system', content: freeChatSystem(template, Boolean(researchData)) },
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

          let parsed: { token?: string; finishReason?: string; error?: string; status?: string };
          try {
            parsed = JSON.parse(dataStr);
          } catch {
            // Don't kill the whole stream on one damaged chunk — keep partial text.
            streamDamaged = true;
            return;
          }

          if (parsed.error) throw new Error(parsed.error);

          if (parsed.status && !parsed.token) {
            patchScriptState(scriptId, {
              pipeline: [
                researchStep,
                {
                  id: 'response',
                  label: 'Response',
                  status: 'running' as const,
                  summary: parsed.status,
                  inputLog: topic,
                  outputPreview: fullResponse.slice(-200),
                },
              ],
            });
          }

          if (parsed.token) {
            fullResponse += parsed.token;
            patchScriptState(scriptId, {
              aiResponse: fullResponse,
              pipeline: [
                researchStep,
                {
                  id: 'response',
                  label: 'Response',
                  status: 'running' as const,
                  summary:
                    attempt > 0
                      ? `Continuing response (${attempt + 1})...`
                      : researchData
                        ? 'Generating live response using researched data...'
                        : 'Generating live response...',
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
        researchData,
        researchSources,
        pipeline: [
          researchStep,
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
      const failedResearchStep: PipelineStep =
        researchStep.status === 'running'
          ? {
              ...researchStep,
              status: wasStopped ? ('warning' as const) : ('error' as const),
              summary: wasStopped ? 'Research stopped' : 'Research failed',
            }
          : researchStep;
      const errorPatch: Partial<Script> = {
        aiResponse: fullResponse,
        researchData,
        researchSources,
        pipeline: [
          failedResearchStep,
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

  async function runAutoPilotPipeline(initialScript: Script, topic: string, instructions: string) {
    if (autoPilotState.isActive) return;
    autoPilotAbortRef.current?.abort();
    generationAbortRef.current?.abort();
    const controller = new AbortController();
    autoPilotAbortRef.current = controller;
    autoPilotPausedRef.current = false;

    const scriptId = initialScript.id;
    setSelectedScriptId(scriptId);

    setAutoPilotState({
      isActive: true,
      isPaused: false,
      isMinimized: false,
      stage: 'research_script',
      stageIndex: 0,
      totalStages: 6,
      progressPercent: 5,
      statusMessage: 'Gemini Co-Pilot: Researching topic depth & generating script...',
      topic,
      scriptId,
      logs: [],
      renderedVideoUrl: null,
      error: null,
    });

    addAutoPilotLog('research_script', `[GEMINI] ⚡ Launching 1-Click Autonomous Production for: "${topic}"`, 'gemini');
    addAutoPilotLog('research_script', `Target profile: ${section === 'shorts' ? '9:16 Vertical Short' : '16:9 Landscape Video'}`, 'info');

    async function checkPauseOrAbort() {
      if (controller.signal.aborted) throw new DOMException('Aborted by user', 'AbortError');
      while (autoPilotPausedRef.current) {
        if (controller.signal.aborted) throw new DOMException('Aborted by user', 'AbortError');
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    const supervisorCtx = {
      scriptId,
      section,
      fetch,
      addLog: addAutoPilotLog,
      setStatus: (message: string) => setAutoPilotState((prev) => ({ ...prev, statusMessage: message })),
      patchScript: patchScriptState,
      persistScript: async (id: string, patch: any) => {
        await persistScript(id, patch);
      },
      checkPauseOrAbort,
    };

    try {
      // -------------------------------------------------------------
      // PRE-FLIGHT AUTONOMOUS SUPERVISION: Storage & Voice Buffers
      // -------------------------------------------------------------
      await runPreflightSupervision(
        fetch,
        addAutoPilotLog,
        (msg) => setAutoPilotState((prev) => ({ ...prev, statusMessage: msg }))
      );

      // -------------------------------------------------------------
      // STAGE 1: Script Research & Generation
      // -------------------------------------------------------------
      let freshRes: Response;
      let currentScript: Script;

      await executeSupervisedStage('research_script', async () => {
        setTab('preview');
        addAutoPilotLog('research_script', 'Synthesizing live research & streaming script narrative with Google Gemini...', 'info');
        await generateScript(initialScript, topic, instructions);
        await checkPauseOrAbort();

        freshRes = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}`);
        currentScript = (await freshRes.json()) as Script;
        if (!currentScript.aiResponse?.trim()) {
          throw new Error('Script generation finished without response content.');
        }

        addAutoPilotLog('research_script', `Script generated successfully (${currentScript.aiResponse.length} characters).`, 'success');
        setAutoPilotState((prev) => ({
          ...prev,
          stage: 'extract_assets',
          stageIndex: 1,
          progressPercent: 22,
          statusMessage: 'Gemini Co-Pilot: Extracting scenes, visual prompts & voice script...',
        }));
      }, supervisorCtx);

      // -------------------------------------------------------------
      // STAGE 2: Scene Asset Extraction
      // -------------------------------------------------------------
      let scenePlan: any;
      let imagePrompts: string[] = [];
      let narration = '';
      let extractedScript = '';
      let sceneCount = 1;

      await executeSupervisedStage('extract_assets', async () => {
        setTab('assets');
        addAutoPilotLog('extract_assets', '[GEMINI] Parsing structured scene plan, visual descriptions & timing...', 'gemini');
        await checkPauseOrAbort();

        freshRes = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}`);
        currentScript = (await freshRes.json()) as Script;

        const template = currentScript.prompts
          ?.filter((p) => p.content.trim())
          .map((p) => p.content)
          .join('\n\n') || currentScript.howItWorks || '';

        const extractResult = await apiPost(
          '/api/llm/extract',
          { rawText: currentScript.aiResponse, useTimelineNarration: false, template },
          getApiKey(),
          fetch
        );

        scenePlan = extractResult.scenePlan;
        imagePrompts = extractResult.imagePrompts || [];
        narration = extractResult.ttsText || '';
        extractedScript = extractResult.script || '';
        const sceneAnalysis = {
          transitions: imagePrompts.map(() => 'none'),
          effects: imagePrompts.map(() => 'zoom-in'),
          timings: [],
          mood: 'epic',
          colorGrade: 'warm-vintage',
        };

        const extractedPatch: Partial<Script> = {
          extractedScript,
          imagePrompts,
          narration,
          scenePlan,
          sceneAnalysis,
          pipeline: [
            {
              id: 'response',
              label: 'Response',
              status: 'done' as const,
              summary: 'Assets extracted in the shared scene format',
              inputLog: topic,
              outputPreview: extractedScript.slice(0, 120),
            },
          ],
        };
        patchScriptState(scriptId, extractedPatch);
        await persistScript(scriptId, extractedPatch);
        await checkPauseOrAbort();

        sceneCount = scenePlan?.scenes?.length || imagePrompts.length || 1;
        addAutoPilotLog('extract_assets', `Extracted ${sceneCount} production scenes with individual prompts & voice text.`, 'success');
        setAutoPilotState((prev) => ({
          ...prev,
          stage: 'generate_images',
          stageIndex: 2,
          progressPercent: 35,
          sceneTotal: sceneCount,
          sceneCurrent: 0,
          statusMessage: `Gemini Co-Pilot: Generating ${sceneCount} visuals via Google Cloud...`,
        }));
      }, supervisorCtx);

      // -------------------------------------------------------------
      // STAGE 3: Visual Generation via Google Cloud
      // -------------------------------------------------------------
      await executeSupervisedStage('generate_images', async () => {
        setTab('generation');
        addAutoPilotLog('generate_images', `[GOOGLE CLOUD] Directing image generation for ${sceneCount} scene keyframes...`, 'gemini');

        freshRes = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}`);
        currentScript = (await freshRes.json()) as Script;

        const scenesToRender = (currentScript.scenePlan?.scenes?.length)
          ? currentScript.scenePlan.scenes
          : (scenePlan?.scenes?.length
              ? scenePlan.scenes
              : imagePrompts.map((p) => ({ imagePrompt: p })));

        for (let i = 0; i < scenesToRender.length; i++) {
          await checkPauseOrAbort();
          const scenePrompt = ((scenesToRender[i] as any).mediaType === 'video' && (scenesToRender[i] as any).videoPrompt)
            ? (scenesToRender[i] as any).videoPrompt
            : (scenesToRender[i].imagePrompt || imagePrompts[i] || 'cinematic scene visual');

          setAutoPilotState((prev) => ({
            ...prev,
            sceneCurrent: i + 1,
            progressPercent: 35 + ((i + 1) / scenesToRender.length) * 30, // 35% -> 65%
            statusMessage: `Google Cloud: Rendering scene ${i + 1} of ${scenesToRender.length}...`,
          }));

          addAutoPilotLog('generate_images', `Rendering scene ${i + 1}/${scenesToRender.length}: "${scenePrompt.slice(0, 50)}..."`, 'info');

          let genRes = await fetch('/api/generate/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scriptId,
              index: i,
              prompt: scenePrompt,
              preset: 'standard',
              provider: 'google',
            }),
            signal: controller.signal,
          });

          // Fallback to cloudflare or local if google failed
          if (!genRes.ok) {
            addAutoPilotLog('generate_images', `Scene ${i + 1}: Google Cloud reported ${genRes.status}, switching to Cloudflare/Local fallback...`, 'warn');
            genRes = await fetch('/api/generate/image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                scriptId,
                index: i,
                prompt: scenePrompt,
                preset: 'standard',
                provider: 'cloudflare',
              }),
              signal: controller.signal,
            });
          }

          if (genRes.ok) {
            const genJson = await genRes.json();
            if (genJson.generatedImages) {
              patchScriptState(scriptId, { generatedImages: genJson.generatedImages });
              await persistScript(scriptId, { generatedImages: genJson.generatedImages });
            }
            addAutoPilotLog('generate_images', `Scene ${i + 1} keyframe rendered & saved.`, 'success');
          } else {
            const errText = await genRes.text().catch(() => '');
            addAutoPilotLog('generate_images', `Scene ${i + 1} note: ${errText.slice(0, 100)}`, 'warn');
          }

          // If this scene is a video scene (mediaType === 'video' or in mixed section):
          const isVideoScene = (scenesToRender[i] as any).mediaType === 'video' || (section === 'mixed' && i % 2 === 0);
          if (isVideoScene) {
            try {
              setAutoPilotState((prev) => ({
                ...prev,
                statusMessage: `Google Flow: Checking AI video worker for Scene ${i + 1}...`,
              }));
              const flowStatusRes = await fetch('/api/flow/status');
              const flowStatusData = flowStatusRes.ok ? await flowStatusRes.json() : null;

              if (flowStatusData?.profileReady && (flowStatusData?.creditsRemaining ?? 0) >= 12) {
                addAutoPilotLog('generate_images', `[FLOW] Generating video for Scene ${i + 1} via Veo 3.1...`, 'gemini');
                setAutoPilotState((prev) => ({
                  ...prev,
                  statusMessage: `Google Flow: Rendering Scene ${i + 1} video with Veo 3.1...`,
                }));
                const videoPrompt = (scenesToRender[i] as any).videoPrompt || scenePrompt;
                const aspect = section === 'shorts' ? 'portrait' : 'landscape';
                const flowJobRes = await fetch('/api/flow/jobs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    scriptId,
                    sceneIndex: i,
                    prompt: videoPrompt,
                    model: 'veo-3.1-fast',
                    aspect,
                    duration: 8,
                    resolution: '720p',
                    dryRun: false,
                  }),
                  signal: controller.signal,
                });

                if (flowJobRes.ok) {
                  const flowJobData = await flowJobRes.json();
                  let jobResult = flowJobData;
                  while (jobResult.state === 'queued' || jobResult.state === 'running') {
                    await new Promise((r) => setTimeout(r, 3000));
                    await checkPauseOrAbort();
                    const pollRes = await fetch(`/api/flow/jobs/${jobResult.id}`);
                    if (pollRes.ok) {
                      jobResult = await pollRes.json();
                      setAutoPilotState((prev) => ({
                        ...prev,
                        statusMessage: `Google Flow: Generating Scene ${i + 1} video (${jobResult.stage || 'generating'} ${jobResult.progress || 0}%)...`,
                      }));
                    }
                  }

                  if (jobResult.state === 'done' && jobResult.result?.downloadId) {
                    const dl = await fetch(`/api/flow/downloads/${jobResult.result.downloadId}`);
                    if (dl.ok) {
                      const videoBlob = await dl.blob();
                      const importRes = await fetch(`/api/media-import/${encodeURIComponent(scriptId)}/${i}?extension=mp4`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/octet-stream' },
                        body: videoBlob,
                      });
                      if (importRes.ok) {
                        const importJson = await importRes.json();
                        if (importJson.generatedImages) {
                          patchScriptState(scriptId, { generatedImages: importJson.generatedImages });
                          await persistScript(scriptId, { generatedImages: importJson.generatedImages });
                        }
                        addAutoPilotLog('generate_images', `Scene ${i + 1} full video motion rendered & imported!`, 'success');
                      }
                    }
                  } else if (jobResult.state === 'error') {
                    addAutoPilotLog('generate_images', `Flow video note for Scene ${i + 1}: ${jobResult.error || 'Flow error, kept reference frame'}`, 'warn');
                  }
                }
              } else {
                addAutoPilotLog('generate_images', `Scene ${i + 1}: Flow video worker not available or credits low. Using reference keyframe.`, 'info');
              }
            } catch (videoErr) {
              addAutoPilotLog('generate_images', `Scene ${i + 1} video note: ${videoErr instanceof Error ? videoErr.message : 'Kept reference keyframe'}`, 'warn');
            }
          }
        }

        // Reconcile scene plan media types with actual generated assets to prevent compositor validation mismatch
        const latestScriptRes = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}`);
        if (latestScriptRes.ok) {
          const latest = await latestScriptRes.json();
          if (latest.scenePlan?.scenes && latest.generatedImages) {
            let planChanged = false;
            latest.scenePlan.scenes.forEach((sc: any, idx: number) => {
              const asset = latest.generatedImages.find((g: any) => g.index === idx);
              if (asset) {
                const actual = asset.mediaType || (asset.url && asset.url.endsWith('.mp4') ? 'video' : 'image');
                if (sc.mediaType !== actual) {
                  sc.mediaType = actual;
                  planChanged = true;
                }
              }
            });
            if (planChanged) {
              patchScriptState(scriptId, { scenePlan: latest.scenePlan });
              await persistScript(scriptId, { scenePlan: latest.scenePlan });
            }
          }
        }

        addAutoPilotLog('generate_images', 'All visual keyframes completed and synced.', 'success');
        setAutoPilotState((prev) => ({
          ...prev,
          stage: 'generate_audio',
          stageIndex: 3,
          progressPercent: 68,
          statusMessage: 'Gemini Co-Pilot: Synthesizing voiceover narration with acoustic sync...',
        }));
      }, supervisorCtx);

      // -------------------------------------------------------------
      // STAGE 4: Voiceover Narration Synthesis
      // -------------------------------------------------------------
      await executeSupervisedStage('generate_audio', async () => {
        setTab('generation');
        addAutoPilotLog('generate_audio', '[TTS] Initializing acoustic voiceover with word-level timing...', 'gemini');
        await checkPauseOrAbort();

        freshRes = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}`);
        currentScript = (await freshRes.json()) as Script;

        const activeScenePlan = scenePlan || currentScript.scenePlan;
        const selectedVoice = currentScript.generatedAudio?.[0]?.voice || 'builtin';
        const textToNarrate = narration || currentScript.narration || extractedScript || currentScript.extractedScript;

        if (!textToNarrate?.trim()) {
          throw new Error('Narration text is empty. Asset extraction did not provide voiceover text.');
        }

        const hasHindi = /[\u0900-\u097F]/.test(textToNarrate);
        const languageToUse = hasHindi ? 'hi' : (currentScript.generatedAudio?.[0]?.language || 'en');

        if (section === 'shorts' && !activeScenePlan) {
          const ttsRes = await fetch('/api/tts/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: textToNarrate,
              language: languageToUse,
              scriptId,
              voice: selectedVoice,
            }),
            signal: controller.signal,
          });

          if (!ttsRes.ok) {
            const ttsErr = await ttsRes.json().catch(() => ({}));
            throw new Error(ttsErr.error || 'Voice narration synthesis failed');
          }
          const ttsData = await ttsRes.json();
          const audioEntry: GeneratedAudio = {
            narrationText: textToNarrate,
            language: languageToUse,
            voice: ttsData.voice || selectedVoice,
            voiceName: 'Chatterbox Natural',
            url: ttsData.publicUrl,
            filename: ttsData.filename,
          };
          patchScriptState(scriptId, { narration: textToNarrate, generatedAudio: [audioEntry] });
          await persistScript(scriptId, { narration: textToNarrate, generatedAudio: [audioEntry] });
        } else {
          const longRes = await fetch('/api/tts/long/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scriptId,
              language: languageToUse,
              voice: selectedVoice,
            }),
            signal: controller.signal,
          });

          if (!longRes.ok) {
            const longErr = await longRes.json().catch(() => ({}));
            throw new Error(longErr.error || 'Long video narration start failed');
          }

          let longDone = false;
          while (!longDone && !controller.signal.aborted) {
            await new Promise((r) => setTimeout(r, 1500));
            await checkPauseOrAbort();
            const pollRes = await fetch(`/api/tts/long/status/${scriptId}`);
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              if (pollData.status === 'done') {
                longDone = true;
                if (pollData.result) {
                  patchScriptState(scriptId, { generatedAudio: [pollData.result] });
                  await persistScript(scriptId, { generatedAudio: [pollData.result] });
                }
              } else if (pollData.status === 'error') {
                throw new Error(pollData.error || 'Narration synthesis failed');
              }
            }
          }
        }

        addAutoPilotLog('generate_audio', 'Voiceover audio rendered and mapped to timeline.', 'success');
        setAutoPilotState((prev) => ({
          ...prev,
          stage: 'plan_motion',
          stageIndex: 4,
          progressPercent: 80,
          statusMessage: 'Planning documentary images and placement review...',
        }));
      }, supervisorCtx);

      // -------------------------------------------------------------
      // STAGE 5: Documentary composition and rendered vision review
      // -------------------------------------------------------------
      await executeSupervisedStage('plan_motion', async () => {
        setTab('review');
        addAutoPilotLog('plan_motion', 'Directing image compositions, detail highlights and rendered placement review...', 'gemini');
        await checkPauseOrAbort();

        freshRes = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}`);
        currentScript = (await freshRes.json()) as Script;

        const audioFilename = currentScript.generatedAudio?.[0]?.filename;
        const readyImageIndexes = (currentScript.generatedImages || [])
          .filter((img) => img.url)
          .map((img) => img.index);

        if (audioFilename && readyImageIndexes.length) {
          try {
            const projectInputs = {
              scriptId,
              audioFilename,
              language: currentScript.generatedAudio?.[0]?.language || 'en',
              imageIndexes: readyImageIndexes,
              aspect: section === 'shorts' ? '9:16' : '16:9',
              fps: 30,
              settings: { stylePreference: 'Use image-led documentary storytelling with related source images and verified details.', density: 'balanced', documentary: true, treatment: 'auto', visualReview: true, maxGeneratedAssets: 0, maxProviderCalls: 40 },
            };
            const created = await editingRequest<EditingPayload>(fetch, '/projects', projectInputs);
            if (created?.project?.id) {
              patchScriptState(scriptId, { editingProjectId: created.project.id });
              await persistScript(scriptId, { editingProjectId: created.project.id });
              const started = await editingRequest<{ jobId: string }>(fetch, `/projects/${created.project.id}/generate`,
                { expectedRevisionId: created.project.revisionId }, 'POST', controller.signal);
              let visualsComplete = false;
              try {
                while (!visualsComplete) {
                  await checkPauseOrAbort();
                  const visualJob = await editingRequest<{ state: string; stage: string; error?: string }>(fetch,
                    `/jobs/${started.jobId}`, undefined, 'GET', controller.signal);
                  if (['succeeded', 'partial'].includes(visualJob.state)) {
                    visualsComplete = true;
                    if (visualJob.state === 'partial') addAutoPilotLog('plan_motion', 'Some optional visuals were skipped or need review; generation notes are available in Artifacts.', 'warn');
                  } else if (['failed', 'needs_configuration', 'interrupted', 'cancelled'].includes(visualJob.state)) {
                    throw new Error(visualJob.error || `Documentary visuals ${visualJob.state}`);
                  } else {
                    setAutoPilotState(prev => ({ ...prev, statusMessage: visualJob.stage }));
                    await new Promise(resolve => setTimeout(resolve, 1500));
                  }
                }
              } finally {
                if (!visualsComplete) await editingRequest(fetch, `/jobs/${started.jobId}/cancel`, {}).catch(() => {});
              }
              const directed = await editingRequest<EditingPayload>(fetch, `/projects/${created.project.id}`);
              const imageCompositions = directed.project.artifacts.filter(a => a.enabled && a.graphic?.kind === 'composition').length;
              if (!imageCompositions) throw new Error('Documentary generation returned no image compositions. Text-only completion is blocked.');
              if (currentScript.enableSubtitles === true) {
                await editingRequest<EditingPayload>(fetch, `/projects/${created.project.id}/captions`,
                  { expectedRevisionId: directed.project.revisionId });
              }
              addAutoPilotLog('plan_motion', `${imageCompositions} image compositions prepared${currentScript.enableSubtitles === true ? ' with captions' : ''}.`, 'success');
            }
          } catch (projErr) {
            throw projErr;
          }
        }

        setAutoPilotState((prev) => ({
          ...prev,
          stage: 'render_video',
          stageIndex: 5,
          progressPercent: 88,
          statusMessage: 'Gemini Supervisor: Compiling final 1080p MP4 video...',
        }));
      }, supervisorCtx);

      // -------------------------------------------------------------
      // STAGE 6: Video Rendering
      // -------------------------------------------------------------
      let finalVideoUrl: string | null = null;

      await executeSupervisedStage('render_video', async () => {
        setTab('review');
        addAutoPilotLog('render_video', '[RENDER] Launching video rendering engine for high-definition MP4...', 'gemini');
        await checkPauseOrAbort();

        freshRes = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}`);
        currentScript = (await freshRes.json()) as Script;

        const sortedAssets = [...(currentScript.generatedImages || [])]
          .filter((img) => img.url)
          .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        const imagePaths = sortedAssets.map((img) => {
          const parts = (img.url || '').split('/');
          return parts[parts.length - 1];
        });
        const audioUrl = currentScript.generatedAudio?.[0]?.url || '';
        const audioParts = audioUrl.split('/');
        const audioPath = audioParts[audioParts.length - 1];

        // Pre-flight cleanup before starting compositor to ensure adequate disk buffer
        await fetch('/api/supervisor/cleanup', { method: 'POST' }).catch(() => {});

        const renderStartRes = await fetch('/api/render/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scriptId,
            imagePaths,
            audioPath,
            presenter: { enabled: false },
            narration: currentScript.narration || '',
            duration: currentScript.duration || 30,
            resolution: section === 'shorts' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 },
            zoomFactor: 1.15,
            transitionDuration: 0.5,
            sceneAnalysis: currentScript.sceneAnalysis,
            enableSubtitles: currentScript.enableSubtitles === true,
            bgmTrack: 'epic',
            bgmVolume: 0.15,
            ttsVolume: 1.0,
            colorGrade: 'teal-orange',
            enableVignette: false,
            enableSfx: false,
          }),
          signal: controller.signal,
        });

        if (!renderStartRes.ok) {
          const renderErr = await renderStartRes.json().catch(() => ({}));
          throw new Error(renderErr.error || 'Failed to start video rendering');
        }

        let renderFinished = false;
        while (!renderFinished && !controller.signal.aborted) {
          await new Promise((r) => setTimeout(r, 1000));
          await checkPauseOrAbort();
          const statusRes = await fetch(`/api/render/status/${scriptId}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.status === 'running') {
              const pct = typeof statusData.progress === 'number' ? statusData.progress : 50;
              setAutoPilotState((prev) => ({
                ...prev,
                progressPercent: 88 + (pct / 100) * 11, // 88% -> 99%
                statusMessage: statusData.message || `Rendering video composition (${Math.round(pct)}%)...`,
              }));
            } else if (statusData.status === 'done' && statusData.videos?.length > 0) {
              renderFinished = true;
              finalVideoUrl = statusData.videos[0].url;
            } else if (statusData.status === 'error') {
              throw new Error(statusData.error || 'Video rendering failed');
            }
          }
        }
      }, supervisorCtx);

      // -------------------------------------------------------------
      // COMPLETION
      // -------------------------------------------------------------
      setAutoPilotState((prev) => ({
        ...prev,
        stage: 'completed',
        progressPercent: 100,
        statusMessage: 'Production complete! 1080p video ready to watch & download.',
        renderedVideoUrl: finalVideoUrl,
      }));

      addAutoPilotLog('render_video', `🎉 Full MP4 video successfully rendered: ${finalVideoUrl}`, 'success');
      addAutoPilotLog('render_video', '[GEMINI] Autonomous end-to-end production finished with 100% success.', 'gemini');
    } catch (err) {
      if (controller.signal.aborted) {
        addAutoPilotLog(autoPilotState.stage, 'Auto-Pilot stopped by user. Manual control restored.', 'warn');
        setAutoPilotState((prev) => ({
          ...prev,
          isActive: false,
          statusMessage: 'Auto-Pilot stopped by user',
        }));
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Auto-Pilot error:', err);
      addAutoPilotLog(autoPilotState.stage, `Pipeline halted: ${msg}`, 'error');
      setAutoPilotState((prev) => ({
        ...prev,
        stage: 'error',
        error: msg,
        statusMessage: `Pipeline halted: ${msg}`,
      }));
    } finally {
      if (autoPilotAbortRef.current === controller) {
        autoPilotAbortRef.current = null;
      }
    }
  }

  async function handleRunScriptSubmit(topic: string, instructions: string, options?: { autoPilot?: boolean }) {
    if (!runModalScript) return;
    const script = runModalScript;
    setRunModalScript(null);
    if (options?.autoPilot) {
      void runAutoPilotPipeline(script, topic, instructions);
    } else {
      await generateScript(script, topic, instructions);
    }
  }

  const selectedScript = scopeScripts.find(script => script.id === selectedScriptId) || null;

  function handleStopGeneration() {
    if (autoPilotState.isActive) {
      handleAutoPilotStop();
    }
    if (generationAbortRef.current) {
      generationAbortRef.current.abort();
      generationAbortRef.current = null;
    }
    if (selectedScript && selectedScript.pipeline?.some(step => step.status === 'running')) {
      const stoppedPatch: Partial<Script> = {
        pipeline: selectedScript.pipeline.map(step =>
          step.status === 'running'
            ? { ...step, status: 'warning' as const, summary: 'Generation stopped' }
            : step,
        ),
      };
      patchScriptState(selectedScript.id, stoppedPatch);
      void persistScript(selectedScript.id, stoppedPatch);
    }
  }

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
      const template = selectedScript.prompts
        .filter((p) => p.content.trim())
        .map((p) => p.content)
        .join('\n\n') || selectedScript.howItWorks || '';
      const result = await apiPost(
        '/api/llm/extract',
        { rawText: selectedScript.aiResponse, useTimelineNarration, template },
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
      <aside className="hidden w-[252px] shrink-0 flex-col border-r border-border bg-[#0b0e15]/95 backdrop-blur-2xl md:flex">
        {/* Brand */}
        <div className="flex h-[68px] items-center gap-3 border-b border-border/80 px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff3366] to-[#c40f35] shadow-glow">
            <Play className="h-4 w-4 fill-white text-white" />
          </span>
          <div className="flex min-w-0 flex-1 items-center justify-between">
            <span className="leading-tight">
              <span className="block text-[15px] font-extrabold tracking-tight text-white">TubeFlow</span>
              <span className="block text-[9.5px] font-bold uppercase tracking-[0.18em] text-accent">Automation Studio</span>
            </span>
            <span className="rounded-md border border-accent/25 bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent">
              Pro
            </span>
          </div>
        </div>

        {/* Channel Switcher */}
        <div className="relative px-3 pt-3.5">
          <button
            aria-label="Switch YouTube account"
            onClick={() => setChannelSwitcherOpen((v) => !v)}
            className="group flex w-full items-center gap-3 rounded-xl border border-border bg-surface/90 px-3 py-2.5 text-left shadow-card transition-all hover:border-[#323d54] hover:bg-surface2"
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold text-white shadow-sm ring-1 ring-white/10"
              style={{ backgroundColor: activeChannel.color }}
            >
              {activeChannel.avatar}
            </div>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-white group-hover:text-white">{activeChannel.name}</span>
              <span className="block text-[11px] text-faint">Connected Workspace</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-faint transition-transform duration-200 group-hover:text-muted ${channelSwitcherOpen ? 'rotate-180' : ''}`} />
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

        {/* Navigation */}
        <nav className="thin-scrollbar flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {SIDEBAR_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-faint/80">{group.title}</p>
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
                          ? 'studio-nav-btn border border-accent/30 bg-accent/15 text-white shadow-sm shadow-accent/10 ring-1 ring-accent/20'
                          : 'studio-nav-btn border border-transparent text-muted hover:bg-surface2 hover:text-white'
                      }
                    >
                      <span className={active ? 'flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white shadow-glow' : 'flex h-8 w-8 items-center justify-center rounded-lg bg-surface2 text-muted group-hover:text-white'}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 text-left font-medium">{item.label}</span>
                      {item.badge && (
                        <span className={active ? 'rounded-md bg-accent/25 px-1.5 py-0.5 text-[10px] font-bold text-accent' : 'rounded-md bg-white/[0.05] border border-borderSoft px-1.5 py-0.5 text-[10px] font-semibold text-faint'}>
                          {item.badge}
                        </span>
                      )}
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Profile Bottom Card */}
        <div className="border-t border-border p-3">
          <button aria-label="Profile and voices" title="Profile and voices" onClick={() => setSidebar('profile')} className={`studio-nav-btn border transition-all ${sidebar === 'profile' ? 'border-accent/30 bg-accent/15 text-white shadow-sm' : 'border-border/60 bg-surface/60 text-muted hover:border-border hover:bg-surface2 hover:text-white'}`}>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-b from-[#3a4358] to-[#202636] text-xs font-bold text-white shadow-inner">
              <CircleUserRound className="h-5 w-5 text-gray-300" />
            </span>
            <span className="flex-1 text-left">
              <span className="block text-[13px] font-semibold text-white">Profile &amp; Voices</span>
              <span className="block text-[11px] text-faint">Accounts · TTS · Clones</span>
            </span>
          </button>
        </div>
      </aside>

      {/* Mobile sidebar */}
      <aside className="flex w-16 shrink-0 flex-col items-center border-r border-border bg-[#0b0e15] py-3 md:hidden">
        {SIDEBAR_GROUPS.flatMap((g) => g.items).map((item) => {
          const Icon = item.icon;
          const active = sidebar === item.id;
          return (
            <button
              key={item.id}
              aria-label={item.label}
              onClick={() => selectSidebar(item.id as SidebarId)}
              className={active ? 'mb-1.5 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-white shadow-glow' : 'mb-1.5 flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-surface2 hover:text-white'}
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
            {sidebar === 'dashboard' ? (
              <YouTubeStudioDashboard
                accounts={accounts}
                activeAccount={activeChannel}
                onSelectAccount={switchChannel}
                onOpenWorkspace={(account, targetSection) => {
                  setNewScriptOpen(false);
                  setRunModalScript(null);
                  setActiveChannel(account);
                  setChannelSwitcherOpen(false);
                  setSection(targetSection);
                  setSidebar(targetSection);
                  setTab('scripts');
                  setSelectedScriptId(null);
                }}
                onManageAccounts={() => setSidebar('profile')}
              />
            ) : sidebar === 'profile' ? <ProfilePage accounts={accounts} onAccountsChange={setAccounts} onSelectAccount={switchChannel} onOpenDashboard={() => setSidebar('dashboard')} /> : sidebar === 'settings' ? (
              <SetupTab />
            ) : !isMainSection ? (
              <PlaceholderPage label={sidebar.charAt(0).toUpperCase() + sidebar.slice(1)} />
            ) : (
              <div className="animate-fade-up">
                {/* Pipeline stepper */}
                <div className="mb-6 hidden items-center gap-1.5 overflow-x-auto rounded-2xl border border-border/80 bg-surface/75 p-1.5 shadow-card backdrop-blur-md no-scrollbar lg:flex">
                  {TABS.map((t, i) => {
                    const StepIcon = t.icon;
                    const done = i < activeStepIndex;
                    const current = i === activeStepIndex;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-all ${
                          current
                            ? 'bg-accent/15 border border-accent/35 text-white shadow-sm ring-1 ring-accent/25'
                            : done
                            ? 'border border-transparent text-gray-300 hover:bg-surface2/60 hover:text-white'
                            : 'border border-transparent text-muted hover:bg-surface2/40 hover:text-gray-200'
                        }`}
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                            current
                              ? 'bg-accent text-white shadow-glow'
                              : done
                              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                              : 'bg-surface2 text-faint border border-borderSoft'
                          }`}
                        >
                          {done ? <Check className="h-3.5 w-3.5" /> : <StepIcon className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[9px] font-bold uppercase tracking-[0.14em] ${current ? 'text-accent' : done ? 'text-emerald-400' : 'text-faint'}`}>
                            {done ? 'Done' : `Step ${t.step}`}
                          </span>
                          <span className="block truncate text-[12px] font-semibold">{t.label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Tabs (mobile / compact) */}
                <div className="mb-5 flex gap-1.5 overflow-x-auto rounded-xl border border-border bg-surface/80 p-1.5 no-scrollbar lg:hidden">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={tab === t.id ? 'studio-tab-btn shrink-0 bg-accent text-white shadow-glow' : 'studio-tab-btn shrink-0 text-muted hover:bg-surface2 hover:text-white'}
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
                      onAutoPilot={() =>
                        selectedScript &&
                        runAutoPilotPipeline(
                          selectedScript,
                          selectedScript.topicName || selectedScript.name,
                          selectedScript.aiInstructions || ''
                        )
                      }
                      isAutoPilotRunning={autoPilotState.isActive}
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

      {autoPilotState.isActive && (
        <AutoPilotModal
          state={autoPilotState}
          script={selectedScript}
          onPauseToggle={handleAutoPilotPauseToggle}
          onStop={handleAutoPilotStop}
          onToggleMinimize={handleAutoPilotMinimizeToggle}
          onClose={handleAutoPilotClose}
          onNavigateTab={(targetTab) => setTab(targetTab)}
        />
      )}
    </div>
    </WorkspaceApiContext.Provider>
  );
}






