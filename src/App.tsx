import {isImageOnlyShorts} from '../server/src/services/motion-editorial-policy';
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
  X,
} from 'lucide-react';
import { createWorkspaceFetch, DEFAULT_ACCOUNT, WorkspaceApiContext } from './services/workspaceApi';
import type { Section, Tab, Channel, Script, PipelineStep, GeneratedAudio } from './data';
import { PlaceholderPage } from './components/PlaceholderPage';
import { ProfilePage } from './components/profile/ProfilePage';
import { ProfileMotionTemplatesPage } from './components/profile/ProfileMotionTemplatesPage';
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
import { hasCaptionBlocker, reviewBlockerMessage, waitForRenderedReview } from './services/renderReview.js';
import { parseJsonResponse, isAbortError, safeErrorMessage, safeJsonParse } from './lib/safe';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AutoPilotModal } from './components/autopilot/AutoPilotModal';
import { AUTO_PILOT_STAGES, type AutoPilotState, type AutoPilotStage } from './services/autoPilotTypes';
import { editingRequest, type EditingPayload } from './services/editingApi';
import { AutoPilotSettingsSchema, defaultAutoPilotSettings, narrationOptions, type AutoPilotSettings } from '../server/src/services/autopilot-settings';
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
      { id: 'motion-templates', label: 'Motion Templates', icon: Wand2, badge: 'Library' },
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

function savedProductionStage(script: Script): number {
  if (!script.retentionPlan) return 0;
  if (!script.aiResponse?.trim()) return 1;
  if (!script.retentionEdit) return 2;
  const count = script.scenePlan?.scenes.length || script.imagePrompts?.length || 0;
  if (!count || !(script.narration || script.extractedScript)?.trim()) return 3;
  if (Array.from({ length: count }, (_, index) => index).some(index =>
    !script.generatedImages?.some(image => image.index === index && image.url && image.status === 'done'))) return 4;
  if (!script.generatedAudio?.[0]?.url) return 5;
  return 9;
}

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

type SidebarId = Section | 'dashboard' | 'queue' | 'library' | 'settings' | 'profile' | 'motion-templates';

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

  const [dismissedResumeScriptId, setDismissedResumeScriptId] = useState<string | null>(null);
  const [autoPilotState, setAutoPilotState] = useState<AutoPilotState>({
    isActive: false,
    isPaused: false,
    isMinimized: false,
    stage: 'idle',
    stageIndex: 0,
    totalStages: 10,
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
    generationAbortRef.current?.abort();
    autoPilotAbortRef.current = null;
    autoPilotPausedRef.current = false;
    setAutoPilotState((prev) => ({
      ...prev,
      isActive: false,
      stage: 'idle',
      statusMessage: 'Auto-Pilot stopped',
    }));
    try {
      localStorage.removeItem(`tubeflow:autopilot:${scopeKey}`);
    } catch {}
  }

  function handleAutoPilotMinimizeToggle() {
    setAutoPilotState((prev) => ({
      ...prev,
      isMinimized: !prev.isMinimized,
    }));
  }

  function handleAutoPilotClose() {
    autoPilotAbortRef.current?.abort();
    autoPilotAbortRef.current = null;
    setAutoPilotState((prev) => ({
      ...prev,
      isActive: false,
      stage: 'idle',
    }));
    try {
      localStorage.removeItem(`tubeflow:autopilot:${scopeKey}`);
    } catch {}
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
    // A refresh interrupts the browser orchestrator, but its saved stages remain usable.
    if (autoPilotAbortRef.current) return;
    try {
      const saved = readJson<AutoPilotState>(localStorage.getItem(`tubeflow:autopilot:${scopeKey}`));
      if (!saved || saved.scopeKey !== scopeKey || !saved.scriptId || !Array.isArray(saved.logs) || !Number.isInteger(saved.stageIndex)
        || saved.stageIndex < 0 || saved.stageIndex >= AUTO_PILOT_STAGES.length || saved.stage === 'completed') return;
      setAutoPilotState({ ...saved, isActive: false, isPaused: false, isMinimized: false, stage: 'error',
        statusMessage: saved.stage === 'error' ? saved.statusMessage : 'Production interrupted. Resume to continue from the saved stage.' });
    } catch { /* Storage may be disabled in this browser. */ }
  }, [scopeKey]);

  useEffect(() => {
    if (autoPilotState.scopeKey !== scopeKey || !autoPilotState.scriptId) return;
    try {
      const key = `tubeflow:autopilot:${scopeKey}`;
      if (autoPilotState.stage === 'completed') localStorage.removeItem(key);
      else if (autoPilotState.stage !== 'idle') localStorage.setItem(key, JSON.stringify({
        ...autoPilotState, logs: autoPilotState.logs.slice(-200),
      }));
    } catch { /* The in-memory Resume button still works without storage. */ }
  }, [autoPilotState, scopeKey]);

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
        setSaveError('');
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

  async function generateScript(script: Script, topic: string, instructions: string, retention?: { plan: NonNullable<Script['retentionPlan']>; brief: string }) {
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
      retentionPlan: retention?.plan,
      retentionEdit: undefined,
      retentionReview: undefined,
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
          instructions: [instructions, retention?.brief].filter(Boolean).join('\n\n'),
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
        [instructions, retention?.brief].filter(Boolean).join('\n\n'),
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

  async function runAutoPilotPipeline(initialScript: Script, topic: string, instructions: string, resumeFrom?: number, resumeVideoUrl?: string | null) {
    if (autoPilotAbortRef.current) {
      autoPilotAbortRef.current.abort();
      autoPilotAbortRef.current = null;
    }
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    const controller = new AbortController();
    autoPilotAbortRef.current = controller;
    autoPilotPausedRef.current = false;

    const scriptId = initialScript.id;
    const runSettings = AutoPilotSettingsSchema.parse(initialScript.autoPilotSettings || defaultAutoPilotSettings(initialScript));
    const resuming = resumeFrom !== undefined;
    let startStage = resumeFrom ?? 0;
    const originalInstructions = instructions;
    const imageEngine = { google: 'Google Cloud', cloudflare: 'Cloudflare', local: 'Local image model' }[runSettings.media.imageProvider];
    if (runSettings.voice.language !== 'auto') instructions += `\nNarration language selected for this run: ${runSettings.voice.language === 'hi' ? 'Hindi / Hinglish' : 'English'}. Write all spoken narration in this language.`;
    setSelectedScriptId(scriptId);

    setAutoPilotState({
      scopeKey,
      instructions: originalInstructions,
      retentionBrief: resuming ? autoPilotState.retentionBrief : undefined,
      isActive: true,
      isPaused: false,
      isMinimized: false,
      stage: AUTO_PILOT_STAGES[startStage].id,
      stageIndex: startStage,
      totalStages: 10,
      progressPercent: resuming ? autoPilotState.progressPercent : 5,
      statusMessage: resuming ? 'Loading saved production progress...' : topic.trim() ? 'Checking this topic against the profile notes...' : 'Researching a fresh topic for this profile...',
      topic,
      scriptId,
      logs: resuming ? autoPilotState.logs : [],
      renderedVideoUrl: resumeVideoUrl || null,
      manualExport: !runSettings.youtube.enabled,
      error: null,
    });

    addAutoPilotLog('research_script', topic.trim() ? `Checking topic: "${topic}"` : `Finding the best unused topic for ${activeChannel.youtubeChannelTitle || activeChannel.name}...`, 'gemini');
    addAutoPilotLog('research_script', `Target profile: ${section === 'shorts' ? '9:16 Vertical Short' : '16:9 Landscape Video'}`, 'info');
    if (runSettings.presenter?.enabled) {
      addAutoPilotLog('research_script', `AI Presenter: MuseTalk avatar "${runSettings.presenter.avatarId}" enabled (${runSettings.presenter.widthPercent}% size, ${runSettings.presenter.style})`, 'info');
    }
    if (!runSettings.youtube.enabled) {
      addAutoPilotLog('research_script', 'Export mode: Manual export (Will render video without auto-uploading to YouTube)', 'info');
    }

    async function checkPauseOrAbort() {
      if (activeScope.current !== scopeKey) controller.abort();
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
        if (!await persistScript(id, patch)) throw new Error('Could not save repaired production state.');
      },
      checkPauseOrAbort,
      autoPilotSettings: runSettings,
    };

    let activeStage = AUTO_PILOT_STAGES[startStage].id;
    function enterStage(stage: AutoPilotStage) {
      activeStage = stage;
      const stageIndex = AUTO_PILOT_STAGES.findIndex(item => item.id === stage);
      setAutoPilotState(prev => ({ ...prev, stage, stageIndex }));
    }
    async function executeStage(stage: AutoPilotStage, work: () => Promise<void>, ctx: typeof supervisorCtx) {
      if (AUTO_PILOT_STAGES.findIndex(item => item.id === stage) < startStage) return;
      enterStage(stage);
      await executeSupervisedStage(stage, work, ctx);
    }

    async function reloadCurrentScript(id: string, signal?: AbortSignal): Promise<Script> {
      for (let i = 0; i < 4; i++) {
        signal?.throwIfAborted();
        try {
          const res = await fetch(`/api/scripts/${encodeURIComponent(id)}`, { signal });
          if (res.ok) {
            const text = await res.text();
            if (text.trim()) {
              return JSON.parse(text) as Script;
            }
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') throw err;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      const fallbackRes = await fetch(`/api/scripts/${encodeURIComponent(id)}`, { signal });
      if (!fallbackRes.ok) throw new Error(`Could not load script ${id} (HTTP ${fallbackRes.status})`);
      const text = await fallbackRes.text();
      return JSON.parse(text) as Script;
    }

    try {
      let freshRes: Response;
      let currentScript = initialScript;
      let retention!: { plan: NonNullable<Script['retentionPlan']>; brief: string };
      if (resuming) {
        currentScript = await reloadCurrentScript(scriptId, controller.signal);
        if (startStage >= 2 && currentScript.youtubeExport?.uploadedVideoId) throw new Error('This production has already been exported to YouTube.');
        topic = startStage >= 2 ? currentScript.topicName || topic : topic;
        // Fall back only as far as a missing prerequisite requires.
        startStage = Math.min(startStage, savedProductionStage(currentScript));
        if (startStage >= 8 && !resumeVideoUrl) startStage = 7;
        if (startStage >= 9 && currentScript.retentionReview?.status !== 'passed') startStage = 8;
        if (startStage >= 8 && runSettings.captions !== 'off' && hasCaptionBlocker(currentScript.retentionReview)) {
          startStage = 7;
          addAutoPilotLog('render_video', 'The saved MP4 failed caption review. Rebuilding captions with the current renderer before reviewing again.', 'info');
        }
        if (currentScript.retentionPlan) retention = { plan: currentScript.retentionPlan, brief: autoPilotState.retentionBrief || `Viewer promise: ${currentScript.retentionPlan.viewerPromise}. Selected hook: ${currentScript.retentionPlan.hooks[currentScript.retentionPlan.selectedHookIndex].openingLine}` };
        patchScriptState(scriptId, currentScript);
        setAutoPilotState(prev => ({ ...prev, topic, renderedVideoUrl: startStage >= 8 ? resumeVideoUrl : null }));
        enterStage(AUTO_PILOT_STAGES[startStage].id);
        addAutoPilotLog(activeStage, `Resuming ${AUTO_PILOT_STAGES[startStage].label}. Completed stages and saved media will be reused.`, 'info');
      }
      if (startStage === 0) {
        enterStage('plan_hooks');
        const memoryResponse = await fetch('/api/youtube/retention/sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: controller.signal,
        });
        const memory = await memoryResponse.json();
        addAutoPilotLog('plan_hooks', memory.message || 'Using saved profile performance observations.', memory.status === 'needs_connection' ? 'warn' : 'info');
        await checkPauseOrAbort();
        const topicResponse = await fetch('/api/llm/autopilot-topic', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(getApiKey() ? { 'x-api-key': getApiKey() } : {}) },
          body: JSON.stringify({ scriptId, topic: topic.trim(), instructions }), signal: controller.signal,
        });
        const selectedTopic = await topicResponse.json();
        if (!topicResponse.ok || !selectedTopic.topic?.trim()) throw new Error(selectedTopic.error || 'Could not select a fresh topic');
        await checkPauseOrAbort();
        topic = selectedTopic.topic;
        setAutoPilotState(prev => ({ ...prev, topic }));
        addAutoPilotLog('research_script', `Selected: "${topic}". Checked ${selectedTopic.historyCount} previously exported topics. ${selectedTopic.reason || ''}`, 'success');

        if (runSettings.youtube.enabled) {
          const youtubeStatus = await fetch('/api/youtube/status', { signal: controller.signal });
          const connection = await youtubeStatus.json();
          if (!youtubeStatus.ok || !connection.authenticated) throw new Error('Connect this profile’s YouTube account before running Auto-Pilot with YouTube export.');
          await checkPauseOrAbort();
        }
        setAutoPilotState(prev => ({ ...prev, statusMessage: 'Comparing three opening hooks and planning the title/thumbnail promise...' }));
        retention = await apiPost<{ plan: NonNullable<Script['retentionPlan']>; brief: string }>(
          '/api/retention/plan', { scriptId, topic, instructions }, getApiKey(), fetch, controller.signal);
        await checkPauseOrAbort();
        patchScriptState(scriptId, { retentionPlan: retention.plan });
        setAutoPilotState(prev => ({ ...prev, retentionBrief: retention.brief }));
        addAutoPilotLog('plan_hooks', `Selected hook ${retention.plan.selectedHookIndex + 1}/3: ${retention.plan.hooks[retention.plan.selectedHookIndex].openingLine}`, 'success');
        addAutoPilotLog('plan_hooks', `Viewer promise: ${retention.plan.viewerPromise}`, 'info');
        setAutoPilotState(prev => ({ ...prev, stage: 'research_script', stageIndex: 1, progressPercent: 10 }));
      }
      // -------------------------------------------------------------
      // PRE-FLIGHT AUTONOMOUS SUPERVISION: Storage & Voice Buffers
      // -------------------------------------------------------------
      if (startStage <= 1) await runPreflightSupervision(
        fetch,
        addAutoPilotLog,
        (msg) => setAutoPilotState((prev) => ({ ...prev, statusMessage: msg })),
        runSettings.voice.provider
      );

      // -------------------------------------------------------------
      // STAGE 1: Script Research & Generation
      // -------------------------------------------------------------
      await executeStage('research_script', async () => {
        setTab('preview');
        addAutoPilotLog('research_script', 'Synthesizing live research & streaming script narrative with Google Gemini...', 'info');
        await generateScript(initialScript, topic, instructions, retention);
        await checkPauseOrAbort();

        currentScript = await reloadCurrentScript(scriptId, controller.signal);
        if (!currentScript.aiResponse?.trim()) {
          throw new Error('Script generation finished without response content.');
        }
        if (currentScript.pipeline?.some(step => step.id === 'response' && step.status !== 'done')) {
          throw new Error(currentScript.pipeline.find(step => step.id === 'response')?.outputPreview || 'Script generation did not finish. Resume to retry this stage.');
        }

        addAutoPilotLog('research_script', `Script generated successfully (${currentScript.aiResponse.length} characters).`, 'success');
        setAutoPilotState((prev) => ({
          ...prev,
          stage: 'edit_retention',
          stageIndex: 2,
          progressPercent: 20,
          statusMessage: 'Editing narration for clarity, forward momentum and an earned payoff...',
        }));
      }, supervisorCtx);

      let editorial = { edit: currentScript.retentionEdit! };
      if (startStage <= 2) {
        enterStage('edit_retention');
        editorial = await apiPost<{ edit: NonNullable<Script['retentionEdit']> }>(
          '/api/retention/edit', { scriptId }, getApiKey(), fetch, controller.signal);
        await checkPauseOrAbort();
        patchScriptState(scriptId, { retentionEdit: editorial.edit });
        for (const note of editorial.edit.notes) addAutoPilotLog('edit_retention', note, 'success');
        setAutoPilotState(prev => ({ ...prev, stage: 'extract_assets', stageIndex: 3, progressPercent: 27,
          statusMessage: 'Extracting the edited production scenes, visuals and narration...' }));
      }

      // -------------------------------------------------------------
      // STAGE 2: Scene Asset Extraction
      // -------------------------------------------------------------
      let scenePlan = currentScript.scenePlan;
      let imagePrompts: string[] = currentScript.imagePrompts || [];
      let narration = currentScript.narration || '';
      let extractedScript = currentScript.extractedScript || '';
      let sceneCount = scenePlan?.scenes.length || imagePrompts.length || 1;

      await executeStage('extract_assets', async () => {
        setTab('assets');
        addAutoPilotLog('extract_assets', '[GEMINI] Parsing structured scene plan, visual descriptions & timing...', 'gemini');
        await checkPauseOrAbort();

        currentScript = await reloadCurrentScript(scriptId, controller.signal);

        const template = currentScript.prompts
          ?.filter((p) => p.content.trim())
          .map((p) => p.content)
          .join('\n\n') || currentScript.howItWorks || '';

        const extractResult = await apiPost(
          '/api/llm/extract',
          { scriptId, rawText: currentScript.aiResponse, useTimelineNarration: false, template },
          getApiKey(),
          fetch
        );

        scenePlan = extractResult.scenePlan;
        imagePrompts = extractResult.imagePrompts || [];
        narration = extractResult.ttsText || '';
        extractedScript = extractResult.script || '';
        const sceneAnalysis = {
          transitions: imagePrompts.map((_, i) => editorial.edit.sceneDirections[i]?.transition === 'dissolve' ? 'dissolve' : 'none'),
          effects: imagePrompts.map((_, i) => editorial.edit.sceneDirections[i]?.motion || 'hold'),
          timings: [],
          mood: retention.plan.musicMood === 'none' ? 'neutral' : retention.plan.musicMood,
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
        if (!await persistScript(scriptId, extractedPatch)) throw new Error('Could not save extracted scenes. Retrying asset extraction.');
        await checkPauseOrAbort();

        sceneCount = scenePlan?.scenes?.length || imagePrompts.length || 1;
        addAutoPilotLog('extract_assets', `Extracted ${sceneCount} production scenes with individual prompts & voice text.`, 'success');
        setAutoPilotState((prev) => ({
          ...prev,
          stage: 'generate_images',
          stageIndex: 4,
          progressPercent: 35,
          sceneTotal: sceneCount,
          sceneCurrent: 0,
          statusMessage: `Generating ${sceneCount} visuals via ${imageEngine}...`,
        }));
      }, supervisorCtx);

      // -------------------------------------------------------------
      // STAGE 3: Visual Generation via Google Cloud
      // -------------------------------------------------------------
      await executeStage('generate_images', async () => {
        setTab('generation');
        addAutoPilotLog('generate_images', `[${imageEngine}] Directing image generation for ${sceneCount} scene keyframes...`, 'gemini');

        currentScript = await reloadCurrentScript(scriptId, controller.signal);

        const scenesToRender = (currentScript.scenePlan?.scenes?.length)
          ? currentScript.scenePlan.scenes
          : (scenePlan?.scenes?.length
              ? scenePlan.scenes
              : imagePrompts.map((p) => ({ imagePrompt: p })));

        let flowAvailableThisRun = true;

        for (let i = 0; i < scenesToRender.length; i++) {
          await checkPauseOrAbort();
          const scenePrompt = scenesToRender[i].imagePrompt || imagePrompts[i] || 'cinematic scene visual';

          setAutoPilotState((prev) => ({
            ...prev,
            sceneCurrent: i + 1,
            progressPercent: 35 + ((i + 1) / scenesToRender.length) * 30, // 35% -> 65%
            statusMessage: `${imageEngine}: Rendering scene ${i + 1} of ${scenesToRender.length}...`,
          }));

          addAutoPilotLog('generate_images', `Rendering scene ${i + 1}/${scenesToRender.length}: "${scenePrompt.slice(0, 50)}..."`, 'info');

          const isPlannedVideo = runSettings.media.flowEnabled && (
            (scenesToRender[i] as any).mediaType === 'video' ||
            Boolean((scenesToRender[i] as any).videoPrompt) ||
            (section === 'shorts' && (currentScript.name?.toLowerCase().includes('mixed') || currentScript.topic?.toLowerCase().includes('mixed')) && i % 2 === 0)
          );
          const savedAsset = currentScript.generatedImages?.find(asset => asset.index === i && asset.status === 'done' && asset.url
            && asset.prompt === (asset.mediaType === 'video' ? (scenesToRender[i] as any).videoPrompt || scenePrompt : scenePrompt));
          const needsVideo = flowAvailableThisRun && isPlannedVideo;
          if (savedAsset && (!needsVideo || savedAsset.mediaType === 'video')) {
            addAutoPilotLog('generate_images', `Scene ${i + 1}: reusing the saved visual.`, 'info');
            continue;
          }
          if (!savedAsset) {
            const genRes = await fetch('/api/generate/image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                scriptId,
                index: i,
                prompt: scenePrompt,
                preset: runSettings.media.imageQuality,
                provider: runSettings.media.imageProvider,
                ...(runSettings.media.seedMode === 'fixed' ? { seed: runSettings.media.seed } : {}),
              }),
              signal: controller.signal,
            });

            if (genRes.ok) {
              const genJson = await genRes.json();
              // Shorts returns the asset URL; other profiles return the updated list.
              const generatedImages = genJson.generatedImages || (genJson.url ? [
                ...(currentScript.generatedImages || []).filter(asset => asset.index !== i),
                { index: i, prompt: scenePrompt, status: 'done' as const, mediaType: 'image' as const,
                  url: genJson.url, seed: genJson.seed, elapsedMs: genJson.elapsedMs },
              ].sort((a, b) => a.index - b.index) : null);
              if (!generatedImages) throw new Error(`Scene ${i + 1} generation returned no saved image.`);
              currentScript.generatedImages = generatedImages;
              patchScriptState(scriptId, { generatedImages });
              if (!await persistScript(scriptId, { generatedImages })) throw new Error('Could not save generated visuals. Check the server connection before resuming.');
              addAutoPilotLog('generate_images', `Scene ${i + 1} keyframe rendered & saved.`, 'success');
            } else {
              const errText = await genRes.text().catch(() => '');
              throw new Error(`Scene ${i + 1} image generation failed: ${errText.slice(0, 250)}`);
            }
          }

          // If this scene is a video scene (mediaType === 'video' or in mixed section):
          const isVideoScene = flowAvailableThisRun && isPlannedVideo;
          if (isVideoScene) {
            try {
              setAutoPilotState((prev) => ({
                ...prev,
                statusMessage: `Google Flow: Checking AI video worker for Scene ${i + 1}...`,
              }));
              const flowStatusRes = await fetch('/api/flow/status');
              const flowStatusData = flowStatusRes.ok ? await flowStatusRes.json() : null;

              if (flowStatusData?.profileReady) {
                const videoPrompt = (scenesToRender[i] as any).videoPrompt || scenePrompt;
                const aspect = section === 'shorts' ? 'portrait' : 'landscape';
                let videoImported = false;
                const MAX_VIDEO_ATTEMPTS = 2;

                for (let videoAttempt = 1; videoAttempt <= MAX_VIDEO_ATTEMPTS && !videoImported; videoAttempt++) {
                  if (videoAttempt > 1) {
                    addAutoPilotLog('generate_images', `[FLOW] Retrying video generation for Scene ${i + 1} (attempt ${videoAttempt}/${MAX_VIDEO_ATTEMPTS})...`, 'info');
                    await new Promise((r) => setTimeout(r, 2000));
                    await checkPauseOrAbort();
                  } else {
                    addAutoPilotLog('generate_images', `[FLOW] Generating video for Scene ${i + 1} via Veo 3.1...`, 'gemini');
                  }
                  setAutoPilotState((prev) => ({
                    ...prev,
                    statusMessage: `Google Flow: Rendering Scene ${i + 1} video with Veo 3.1${videoAttempt > 1 ? ` (retry ${videoAttempt}/${MAX_VIDEO_ATTEMPTS})` : ''}...`,
                  }));

                  const flowJobRes = await fetch('/api/flow/jobs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      scriptId,
                      sceneIndex: i,
                      prompt: videoPrompt,
                      model: 'veo-3.1-fast',
                      aspect,
                      duration: runSettings.media.flowDuration,
                      resolution: runSettings.media.flowResolution,
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
                          videoImported = true;
                          break;
                        }
                      }
                    } else if (jobResult.state === 'error') {
                      const isAuth = jobResult.overseerCode === 'AUTH_EXPIRED' || /auth-expired|login required|signed out/i.test(jobResult.error || '');
                      if (isAuth) {
                        flowAvailableThisRun = false;
                        addAutoPilotLog('generate_images', `Google Flow login expired. Using reference keyframes for subsequent video scenes.`, 'warn');
                        break;
                      } else if (videoAttempt < MAX_VIDEO_ATTEMPTS) {
                        addAutoPilotLog('generate_images', `Scene ${i + 1} video attempt ${videoAttempt} error: ${jobResult.error || 'Flow error'}. Retrying video generation...`, 'info');
                      } else {
                        addAutoPilotLog('generate_images', `Scene ${i + 1} video note: ${jobResult.error || 'Flow error'}. Using reference keyframe for this scene. Continuing video generation for remaining scenes...`, 'warn');
                      }
                    }
                  } else {
                    const errJson = await flowJobRes.json().catch(() => ({}));
                    const errMsg = errJson.error || `Flow job failed to start (${flowJobRes.status})`;
                    if (videoAttempt < MAX_VIDEO_ATTEMPTS) {
                      addAutoPilotLog('generate_images', `Scene ${i + 1} Flow notice: ${errMsg}. Retrying...`, 'info');
                    } else {
                      addAutoPilotLog('generate_images', `Scene ${i + 1} Flow notice: ${errMsg}`, 'warn');
                    }
                  }
                }
              } else {
                flowAvailableThisRun = false;
                addAutoPilotLog('generate_images', `Scene ${i + 1}: Flow video worker is not signed in. Using reference keyframe.`, 'info');
              }
            } catch (videoErr) {
              const isAuth = /auth-expired|login required|signed out/i.test(videoErr instanceof Error ? videoErr.message : '');
              if (isAuth) {
                flowAvailableThisRun = false;
                addAutoPilotLog('generate_images', `Google Flow login expired. Using reference keyframes for subsequent video scenes.`, 'warn');
              } else {
                addAutoPilotLog('generate_images', `Scene ${i + 1} video notice: ${videoErr instanceof Error ? videoErr.message : 'Kept reference keyframe'}. Continuing video generation for remaining scenes...`, 'warn');
              }
            }
          }
          if (isVideoScene && !runSettings.media.allowImageFallback) {
            const check = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}`, { signal: controller.signal });
            const saved = await check.json() as Script;
            if (!saved.generatedImages?.some(asset => asset.index === i && asset.mediaType === 'video' && asset.status === 'done'))
              throw new Error(`Flow video is required for scene ${i + 1}. Enable still-image fallback or resolve the Flow error before continuing.`);
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
                if (sc.mediaType !== actual && !sc.videoPrompt) {
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
          stageIndex: 5,
          progressPercent: 68,
          statusMessage: 'Gemini Co-Pilot: Synthesizing voiceover narration with acoustic sync...',
        }));
      }, supervisorCtx);

      // -------------------------------------------------------------
      // STAGE 4: Voiceover Narration Synthesis
      // -------------------------------------------------------------
      await executeStage('generate_audio', async () => {
        setTab('generation');
        addAutoPilotLog('generate_audio', '[TTS] Synthesizing the selected narrator with measured scene timing...', 'gemini');
        await checkPauseOrAbort();

        currentScript = await reloadCurrentScript(scriptId, controller.signal);

        const activeScenePlan = scenePlan || currentScript.scenePlan;
        let selectedVoice = runSettings.voice.voiceId;
        const textToNarrate = narration || currentScript.narration || extractedScript || currentScript.extractedScript;

        if (!textToNarrate?.trim()) {
          throw new Error('Narration text is empty. Asset extraction did not provide voiceover text.');
        }

        const hasHindi = /[\u0900-\u097F]/.test(textToNarrate);
        const languageToUse = runSettings.voice.language === 'auto' ? (hasHindi ? 'hi' : 'en') : runSettings.voice.language;
        const libraryRes = await fetch(`/api/tts/voices?language=${languageToUse}&provider=${runSettings.voice.provider}`, { signal: controller.signal });
        const library = await libraryRes.json();
        if (!libraryRes.ok || !Array.isArray(library.voices)) throw new Error(library.error || 'Could not load the selected voice engine.');
        if (!library.voices.some((voice: { id: string }) => voice.id === selectedVoice)) {
          if (runSettings.voice.language !== 'auto') throw new Error('The selected narration voice is unavailable for this language. Choose another voice.');
          selectedVoice = library.voices.find((voice: { source?: string }) => voice.source === 'clone')?.id || library.voices[0]?.id;
          if (!selectedVoice) throw new Error('No matching narration voice is available for this script language.');
          addAutoPilotLog('generate_audio', `Using ${selectedVoice} from the matching ${languageToUse} voice library.`, 'info');
        }
        const voiceOptions = { ...narrationOptions(runSettings, languageToUse), language: languageToUse, voice: selectedVoice };

        if (section === 'shorts' && !activeScenePlan) {
          const ttsRes = await fetch('/api/tts/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: textToNarrate,
              scriptId,
              ...voiceOptions,
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
            provider: ttsData.provider || runSettings.voice.provider,
            voiceName: library.voices.find((voice: { id: string }) => voice.id === selectedVoice)?.name || selectedVoice,
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
              ...voiceOptions,
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
          stageIndex: 6,
          progressPercent: 80,
          statusMessage: runSettings.graphics.enabled ? 'Preparing optional graphics...' : 'Keeping scene footage clean...',
        }));
      }, supervisorCtx);

      // -------------------------------------------------------------
      // STAGE 5: Documentary composition and rendered vision review
      // -------------------------------------------------------------
      let finalVideoUrl: string | null = startStage >= 8 ? resumeVideoUrl || null : null;
      await executeStage('plan_motion', async () => {
        setTab('review');
        addAutoPilotLog('plan_motion', runSettings.graphics.enabled ? 'Checking whether any optional graphics would help this story...' : 'Graphics are off. Keeping scene footage clean.', 'info');
        await checkPauseOrAbort();

        currentScript = await reloadCurrentScript(scriptId, controller.signal);

        const audioFilename = currentScript.generatedAudio?.[0]?.filename;
        const readyImageIndexes = (currentScript.generatedImages || [])
          .filter((img) => img.url)
          .map((img) => img.index);

        if ((runSettings.graphics.enabled || runSettings.captions === 'motion') && audioFilename && readyImageIndexes.length) {
          try {
            let directed: EditingPayload | null = null;
            if (currentScript.editingProjectId) {
              const existing = await editingRequest<EditingPayload>(fetch, `/projects/${currentScript.editingProjectId}`).catch(() => null);
              if (existing?.project) {
                  const imageCompositions = existing.project.artifacts?.filter(a => a.enabled && a.graphic?.kind === 'composition')?.length || 0;
                  const inputsMatch = existing.project.inputs?.audioFilename === audioFilename &&
                    existing.project.inputs?.imageAssets?.length === readyImageIndexes.length && !existing.stale &&
                    existing.project.settings.stylePreference === runSettings.graphics.style && existing.project.settings.density === runSettings.graphics.density &&
                    (!isImageOnlyShorts(currentScript,section) || existing.project.settings.graphicEngine === 'generative');
                  const failedReview = existing.jobs?.filter(job => job.revisionId === existing.project.revisionId &&
                    ['generate', 'review', 'revise'].includes(job.operation) && ['failed', 'interrupted'].includes(job.state) &&
                    /Rendered vision review has not passed|VISUAL_REVIEW_REQUIRED|Rendered typography failed the layout check/i.test(job.error || ''))
                    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
                  // Generation failures can have valid assets in a checkpoint
                  // while the published revision is still a draft. Recover that
                  // job before creating yet another visual project.
                  if (inputsMatch && failedReview) throw new Error(failedReview.error);
                  const pendingReviews = existing.project.artifacts.filter(a => a.enabled && a.graphic && a.graphic.kind !== 'caption' && a.visualReview?.status !== 'passed');
                  if (inputsMatch && existing.project.settings.visualReview && pendingReviews.length)
                    throw new Error(`Rendered vision review has not passed for ${pendingReviews.length} motion graphic(s). Retry visual review before exporting.`);
                  if (inputsMatch && ['ready', 'partial'].includes(existing.project.status)) {
                    directed = existing;
                    addAutoPilotLog('plan_motion', `Reusing ${imageCompositions} verified documentary visuals from saved project.`, 'info');
                  }
              }
            }

            if (!directed) {
              const projectInputs = {
                scriptId,
                audioFilename,
                language: currentScript.generatedAudio?.[0]?.language || 'en',
                imageIndexes: readyImageIndexes,
                aspect: section === 'shorts' ? '9:16' : '16:9',
                fps: 30,
              settings: { graphicEngine: isImageOnlyShorts(currentScript,section)?'generative':'directed', soundDesign: isImageOnlyShorts(currentScript,section)?'subtle':'off', motionLevel: isImageOnlyShorts(currentScript,section)?'subtle':'balanced', stylePreference: runSettings.graphics.style, density: runSettings.graphics.density, documentary: runSettings.graphics.enabled && runSettings.graphics.mode === 'images', treatment: runSettings.graphics.treatment, visualReview: true, maxGeneratedAssets: 3, maxProviderCalls: 40, ...(runSettings.graphics.model ? { aiModel: runSettings.graphics.model } : {}) },
              };
              const created = await editingRequest<EditingPayload>(fetch, '/projects', projectInputs);
              if (created?.project?.id) {
                patchScriptState(scriptId, { editingProjectId: created.project.id });
                await persistScript(scriptId, { editingProjectId: created.project.id });
                if (runSettings.graphics.enabled) {
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
                        if (visualJob.error?.includes('DOCUMENTARY_VISUALS_REQUIRED') || visualJob.error?.includes('no enabled image compositions')) {
                          addAutoPilotLog('plan_motion', 'Documentary visual overlays skipped; continuing with full scene visual keyframes.', 'info');
                          visualsComplete = true;
                          break;
                        }
                        throw new Error(visualJob.error || `Documentary visuals ${visualJob.state}`);
                      } else {
                        setAutoPilotState(prev => ({ ...prev, statusMessage: visualJob.stage }));
                        await new Promise(resolve => setTimeout(resolve, 1500));
                      }
                    }
                  } finally {
                    if (!visualsComplete) await editingRequest(fetch, `/jobs/${started.jobId}/cancel`, {}).catch(() => {});
                  }
                }
                directed = await editingRequest<EditingPayload>(fetch, `/projects/${created.project.id}`);
              }
            }

            if (directed?.project?.id) {
              const imageCompositions = directed.project.artifacts.filter(a => a.enabled && a.graphic?.kind === 'composition').length;
              if (runSettings.graphics.enabled && runSettings.graphics.mode === 'images' && !imageCompositions) {
                addAutoPilotLog('plan_motion', 'Documentary overlays skipped; proceeding with scene-led visuals.', 'info');
              }
              if (runSettings.captions === 'motion') {
                await editingRequest<EditingPayload>(fetch, `/projects/${directed.project.id}/captions`,
                  { expectedRevisionId: directed.project.revisionId });
              }
              addAutoPilotLog('plan_motion', runSettings.graphics.enabled
                ? `${directed.project.artifacts.filter(a => a.enabled && a.graphic?.kind !== 'caption').length} motion graphics prepared${runSettings.captions === 'motion' ? ' with motion captions' : ''}.`
                : 'Motion captions prepared. Documentary motion graphics are switched off in this run’s settings.', runSettings.graphics.enabled ? 'success' : 'info');
            }
          } catch (projErr) {
            if (isAbortError(projErr)) throw projErr;
            addAutoPilotLog('plan_motion', `Optional graphics skipped: ${safeErrorMessage(projErr, 'Visual generation was unavailable')}. Continuing with scene footage.`, 'warn');
            await persistScript(scriptId, { editingProjectId: null });
            patchScriptState(scriptId, { editingProjectId: undefined });
            if (runSettings.captions === 'motion') {
              const captionsProject = await editingRequest<EditingPayload>(fetch, '/projects', {
                scriptId, audioFilename, language: currentScript.generatedAudio?.[0]?.language || 'en', imageIndexes: readyImageIndexes,
                aspect: section === 'shorts' ? '9:16' : '16:9', fps: 30,
                settings: { documentary: false, visualReview: true, stylePreference: '', density: 'subtle', maxGeneratedAssets: 0, maxProviderCalls: 40 },
              });
              await editingRequest(fetch, `/projects/${captionsProject.project.id}/captions`, { expectedRevisionId: captionsProject.project.revisionId });
              await persistScript(scriptId, { editingProjectId: captionsProject.project.id });
              patchScriptState(scriptId, { editingProjectId: captionsProject.project.id });
            }
          }
        } else {
          await persistScript(scriptId, { editingProjectId: null });
          addAutoPilotLog('plan_motion', 'Motion graphics and motion captions are off for this run.', 'info');
        }

        setAutoPilotState((prev) => ({
          ...prev,
          stage: 'render_video',
          stageIndex: 7,
          progressPercent: 88,
          statusMessage: 'Gemini Supervisor: Compiling final 1080p MP4 video...',
        }));
      }, supervisorCtx);

      // -------------------------------------------------------------
      // STAGE 6: Video Rendering
      // -------------------------------------------------------------

      await executeStage('render_video', async () => {
        setTab('review');
        addAutoPilotLog('render_video', '[RENDER] Launching video rendering engine for high-definition MP4...', 'gemini');
        await checkPauseOrAbort();

        currentScript = await reloadCurrentScript(scriptId, controller.signal);

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
            presenter: runSettings.presenter?.enabled ? runSettings.presenter : { enabled: false },
            narration: currentScript.narration || '',
            duration: currentScript.duration || 30,
            resolution: section === 'shorts' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 },
            zoomFactor: runSettings.editing.mode === 'off' ? 1 : 1.08,
            transitionDuration: runSettings.editing.mode === 'off' ? 0 : section === 'shorts' ? 0.2 : 0.4,
            sceneAnalysis: runSettings.editing.mode === 'off' ? { effects: imagePaths.map(() => 'hold'), transitions: imagePaths.map(() => 'none'), timings: currentScript.sceneAnalysis?.timings } : currentScript.sceneAnalysis,
            enableSubtitles: runSettings.captions !== 'off',
            ...(runSettings.editing.mode === 'custom' ? { editing: { ...runSettings.editing.settings, enabled: true, captions: runSettings.captions === 'plain' } } : runSettings.editing.mode === 'off' ? { editing: { ...runSettings.editing.settings, enabled: false, captions: runSettings.captions === 'plain' } } : {}),
            bgmTrack: runSettings.audio.music === 'auto' ? retention.plan.musicMood : runSettings.audio.music,
            bgmVolume: runSettings.audio.musicVolume,
            ttsVolume: runSettings.audio.voiceVolume,
            colorGrade: 'none',
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
              const displayMsg = statusData.message || (statusData.stage ? `${statusData.stage} (${Math.round(pct)}%)...` : `Rendering video composition (${Math.round(pct)}%)...`);
              setAutoPilotState((prev) => ({
                ...prev,
                progressPercent: 88 + (pct / 100) * 7,
                statusMessage: displayMsg,
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

      await checkPauseOrAbort();
      if (!finalVideoUrl) throw new Error('Rendering did not return a completed video.');
      const videoFilename = decodeURIComponent((finalVideoUrl as string).split('/').pop()!);
      if (startStage <= 8) {
        enterStage('review_retention');
        setAutoPilotState(prev => ({ ...prev, stage: 'review_retention', stageIndex: 8, progressPercent: 96,
          renderedVideoUrl: finalVideoUrl, statusMessage: 'Reviewing the rendered opening, ending, captions and mixed audio...' }));
        const reviewed = await waitForRenderedReview<{ review: NonNullable<Script['retentionReview']> }>({
          scriptId, videoFilename, apiKey: getApiKey(), signal: controller.signal, checkPause: checkPauseOrAbort, fetcher: fetch,
          status: statusMessage => setAutoPilotState(prev => ({ ...prev, statusMessage })),
        });
        patchScriptState(scriptId, { retentionReview: reviewed.review });
        for (const finding of reviewed.review.findings) addAutoPilotLog('review_retention', `${finding.category}: ${finding.detail}`, finding.severity === 'blocker' ? 'error' : 'info');
        if (reviewed.review.status !== 'passed') {
          if ((typeof window !== 'undefined' && localStorage.getItem('tubeflow:skip_youtube_upload') === 'true') || !runSettings.youtube.enabled) {
            addAutoPilotLog('review_retention', `Review findings noted: ${reviewBlockerMessage(reviewed.review)}. Export skipped as requested.`, 'warn');
          } else {
            throw new Error(reviewBlockerMessage(reviewed.review));
          }
        } else {
          addAutoPilotLog('review_retention', reviewed.review.summary, 'success');
        }
      }
      await checkPauseOrAbort();
      if ((typeof window !== 'undefined' && localStorage.getItem('tubeflow:skip_youtube_upload') === 'true') || !runSettings.youtube.enabled) {
        try { localStorage.setItem('tubeflow:autopilot_completed:' + activeScope.current, JSON.stringify({ stage: 'completed', progressPercent: 100, statusMessage: 'Production complete! Video rendered to final stage (YouTube export skipped).', renderedVideoUrl: finalVideoUrl, topic })); } catch {}
        setAutoPilotState((prev) => ({
          ...prev,
          stage: 'completed',
          progressPercent: 100,
          statusMessage: 'Production complete! Video rendered to final stage (YouTube export skipped).',
          renderedVideoUrl: finalVideoUrl,
          manualExport: true,
        }));
        addAutoPilotLog('render_video', `🎉 Full MP4 video successfully rendered: ${finalVideoUrl}`, 'success');
        addAutoPilotLog('upload_youtube', 'YouTube export skipped as configured (Manual export mode). Video is ready for manual export.', 'info');
        return;
      }
      enterStage('upload_youtube');
      setAutoPilotState(prev => ({ ...prev, stage: 'upload_youtube', stageIndex: 9, progressPercent: 98,
        statusMessage: 'Final review passed. Exporting the video with its planned title and promise...' }));
      const metadata = retention.plan;
      const exportSettings = initialScript.youtubeExport || {};
      const isShort = section === 'shorts';
      const rawTitle = metadata.titles?.[0] || topic;
      const finalTitle = isShort && !/#shorts\b/i.test(rawTitle)
        ? (rawTitle.length > 92 ? `${rawTitle.slice(0, 92).trim()} #Shorts` : `${rawTitle.trim()} #Shorts`)
        : rawTitle;
      const rawDesc = metadata.description || '';
      const finalDesc = isShort && !/#shorts\b/i.test(rawDesc)
        ? (rawDesc ? `${rawDesc.trim()}\n\n#Shorts` : '#Shorts')
        : rawDesc;
      const rawTags: string[] = metadata.tags || [];
      const finalTags = isShort && !rawTags.some((t: string) => /^#?shorts$/i.test(t))
        ? ['Shorts', ...rawTags]
        : rawTags;

      const uploadResponse = await fetch('/api/youtube/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId, videoFilename, autoPilot: true, isShort,
          title: finalTitle, description: finalDesc, tags: finalTags,
          privacyStatus: runSettings.youtube.privacyStatus, categoryId: exportSettings.categoryId || '22',
          ...(runSettings.youtube.publishMode === 'schedule' ? { publishAt: runSettings.youtube.scheduledPublishAt } : {}),
        }),
        signal: controller.signal,
      });
      const uploaded = await uploadResponse.json();
      if (!uploadResponse.ok || !uploaded.success) throw new Error(uploaded.error || 'YouTube export failed');
      patchScriptState(scriptId, { youtubeExport: { ...exportSettings,
        title: uploaded.title || finalTitle, description: finalDesc, tags: finalTags,
        publishMode: runSettings.youtube.publishMode, scheduledPublishAt: runSettings.youtube.scheduledPublishAt,
        privacyStatus: uploaded.privacyStatus, uploadedVideoId: uploaded.videoId,
        uploadedVideoUrl: uploaded.videoUrl, uploadedAt: uploaded.uploadedAt,
      } });
      addAutoPilotLog('upload_youtube', `Exported to YouTube: ${uploaded.videoUrl}`, 'success');
      addAutoPilotLog('upload_youtube', uploaded.topicHistorySaved
        ? 'Topic saved in this profile’s notes. Future topic searches will exclude it.'
        : 'Upload receipt saved. Topic notes will be recovered from the receipt before the next topic search.', uploaded.topicHistorySaved ? 'success' : 'warn');

      // -------------------------------------------------------------
      // COMPLETION
      // -------------------------------------------------------------
      setAutoPilotState((prev) => ({
        ...prev,
        stage: 'completed',
        progressPercent: 100,
        statusMessage: 'Production complete! Video exported to YouTube and topic recorded.',
        renderedVideoUrl: finalVideoUrl,
        youtubeVideoUrl: uploaded.videoUrl,
      }));

      addAutoPilotLog('render_video', `🎉 Full MP4 video successfully rendered: ${finalVideoUrl}`, 'success');
      addAutoPilotLog('upload_youtube', 'Autonomous production and YouTube export finished.', 'success');
    } catch (err) {
      if (controller.signal.aborted) {
        addAutoPilotLog(activeStage, 'Auto-Pilot stopped by user. Manual control restored.', 'warn');
        setAutoPilotState((prev) => ({
          ...prev,
          isActive: false,
          statusMessage: 'Auto-Pilot stopped by user',
        }));
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Auto-Pilot error:', err);
      addAutoPilotLog(activeStage, `Pipeline halted: ${msg}`, 'error');
      setAutoPilotState((prev) => ({
        ...prev,
        isActive: true,
        isMinimized: false,
        stage: 'error',
        stageIndex: AUTO_PILOT_STAGES.findIndex(item => item.id === activeStage),
        error: msg,
        statusMessage: `Pipeline halted: ${msg}`,
      }));
    } finally {
      if (autoPilotAbortRef.current === controller) {
        autoPilotAbortRef.current = null;
      }
    }
  }

  async function handleRunScriptSubmit(topic: string, instructions: string, options?: { autoPilot?: boolean; settings?: AutoPilotSettings }) {
    if (!runModalScript) return;
    let script = runModalScript;
    if (options?.autoPilot) {
      const parsed = AutoPilotSettingsSchema.safeParse(options.settings || defaultAutoPilotSettings(script));
      if (!parsed.success) {
        throw new Error('Invalid production settings: ' + parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
      }
      const settings = parsed.data;
      const patch = { autoPilotSettings: settings, enableSubtitles: settings.captions !== 'off', presenter: settings.presenter, editingProjectId: null };
      const saved = await persistScript(script.id, patch);
      if (!saved) throw new Error('Could not save production settings. Please check server connection.');
      script = { ...script, ...patch };
      setRunModalScript(null);
      void runAutoPilotPipeline(script, topic, instructions);
    } else {
      setRunModalScript(null);
      await generateScript(script, topic, instructions);
    }
  }

  const selectedScript = scopeScripts.find(script => script.id === selectedScriptId) || null;
  const autoPilotScript = scopeScripts.find(script => script.id === autoPilotState.scriptId) || null;
  const resumeCheckpoint = autoPilotState.scopeKey === scopeKey && autoPilotState.stage === 'error';
  const resumableScript = resumeCheckpoint ? autoPilotScript : selectedScript?.autoPilotSettings && selectedScript.retentionPlan
    && !selectedScript.youtubeExport?.uploadedVideoId ? selectedScript : null;

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
        { scriptId, rawText: selectedScript.aiResponse, useTimelineNarration, template },
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
    autoPilotAbortRef.current?.abort();
    autoPilotAbortRef.current = null;
    autoPilotPausedRef.current = false;
    setAutoPilotState((prev) => ({
      ...prev,
      isActive: false,
      stage: 'idle',
      error: null,
      statusMessage: '',
      scriptId: prev.scriptId === id ? null : prev.scriptId,
    }));
    try {
      localStorage.removeItem(`tubeflow:autopilot:${scopeKey}`);
    } catch {}
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
          <button type="button" onClick={() => setSaveError('')} className="mt-2 underline">Dismiss</button>
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
              <span className="block text-[11px] text-faint">Accounts · Narration</span>
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
            ) : sidebar === 'profile' ? <ProfilePage accounts={accounts} onAccountsChange={setAccounts} onSelectAccount={switchChannel} onOpenDashboard={() => setSidebar('dashboard')} /> : sidebar === 'motion-templates' ? (
              <ProfileMotionTemplatesPage account={activeChannel} accounts={accounts} onSelectAccount={switchChannel} />
            ) : sidebar === 'settings' ? (
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
                      onAutoPilot={() => selectedScript && setRunModalScript(selectedScript)}
                      isAutoPilotRunning={autoPilotState.isActive && autoPilotState.stage !== 'completed' && autoPilotState.stage !== 'error' && autoPilotState.stage !== 'idle'}
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

      {!autoPilotState.isActive && resumableScript && dismissedResumeScriptId !== resumableScript.id && (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-1.5 rounded-2xl border border-border/80 bg-[#121620]/95 p-1.5 shadow-2xl backdrop-blur-xl animate-fade-in">
          <button type="button" className="studio-btn-primary shadow-glow !py-2 !px-4 text-xs font-semibold"
            onClick={() => { void runAutoPilotPipeline(resumableScript,
              resumeCheckpoint ? autoPilotState.topic : resumableScript.topicName || resumableScript.retentionPlan?.topic || '',
              resumeCheckpoint ? autoPilotState.instructions || '' : resumableScript.aiInstructions || '',
              resumeCheckpoint ? autoPilotState.stageIndex : Math.min(6, savedProductionStage(resumableScript)),
              resumeCheckpoint ? autoPilotState.renderedVideoUrl : null); }}>
            <Play className="h-4 w-4" /> Resume Auto-Pilot
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted hover:bg-white/10 hover:text-white transition-colors"
            title="Dismiss Auto-Pilot prompt (keeps all script and media files)"
            aria-label="Dismiss Auto-Pilot prompt"
            onClick={() => setDismissedResumeScriptId(resumableScript.id)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {autoPilotState.isActive && (
        <AutoPilotModal
          state={autoPilotState}
          script={autoPilotScript}
          onPauseToggle={handleAutoPilotPauseToggle}
          onStop={handleAutoPilotStop}
          onToggleMinimize={handleAutoPilotMinimizeToggle}
          onClose={handleAutoPilotClose}
          onRetryProduction={autoPilotState.stage === 'error' && autoPilotScript
            ? () => { void runAutoPilotPipeline(autoPilotScript, autoPilotState.topic, autoPilotState.instructions || '', autoPilotState.stageIndex, autoPilotState.renderedVideoUrl); }
            : undefined}
          onNavigateTab={(targetTab) => setTab(targetTab)}
        />
      )}
    </div>
    </WorkspaceApiContext.Provider>
  );
}






