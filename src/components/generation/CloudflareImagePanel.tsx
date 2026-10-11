import { useEffect, useState } from "react";
import {
  Cloud,
  Cpu,
  Check,
  AlertCircle,
  Loader2,
  Copy,
  Settings2,
  Sparkles,
  KeyRound,
  Globe,
  Code2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Power,
  PowerOff,
  FlaskConical,
  RotateCcw,
} from "lucide-react";
import { useWorkspaceApi } from "../../services/workspaceApi";
import { getChannelLoraProfile } from "../../data";

export type ImageProviderMode = "local" | "cloudflare";

export interface CloudflareModelOption {
  id: string;
  label: string;
  badge: string;
  description: string;
  qualityRating: string;
  speedRating: string;
}

export interface PublicCloudflareEndpointState {
  id: string;
  label: string;
  mode: "worker" | "direct";
  workerUrl: string;
  hasWorkerApiKey: boolean;
  workerApiKeyMasked: string;
  accountId: string;
  hasApiToken: boolean;
  apiTokenMasked: string;
  disabled: boolean;
  configured: boolean;
  coolingDownUntil: number;
  coolingDownSecs: number;
  lastError: string;
  lastLatencyMs: number;
  consecutiveFailures: number;
}

export interface PublicCloudflareConfigState {
  provider: ImageProviderMode;
  mode: "worker" | "direct";
  workerUrl: string;
  hasWorkerApiKey: boolean;
  workerApiKeyMasked: string;
  accountId: string;
  hasApiToken: boolean;
  apiTokenMasked: string;
  model: string;
  modelLabel: string;
  injectStyleDna: boolean;
  configured: boolean;
  models: CloudflareModelOption[];
  workerScript: string;
  endpoints: PublicCloudflareEndpointState[];
  strategy: "failover" | "round-robin";
  cooldownMs: number;
  lastUsedEndpointId: string | null;
  activeEndpointCount: number;
}

interface EndpointDraft {
  label: string;
  mode: "worker" | "direct";
  workerUrl: string;
  workerApiKey: string;
  accountId: string;
  apiToken: string;
  disabled: boolean;
}

function draftFromEndpoint(e: PublicCloudflareEndpointState): EndpointDraft {
  return {
    label: e.label,
    mode: e.mode,
    workerUrl: e.workerUrl,
    workerApiKey: "",
    accountId: e.accountId,
    apiToken: "",
    disabled: e.disabled,
  };
}

export function CloudflareImagePanel({
  disabled = false,
  onConfigChange,
}: {
  disabled?: boolean;
  onConfigChange?: (config: PublicCloudflareConfigState) => void;
}) {
  const { fetch, account } = useWorkspaceApi();
  const channelLora = getChannelLoraProfile(account);

  const [config, setConfig] = useState<PublicCloudflareConfigState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingAll, setTestingAll] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [savingEndpointId, setSavingEndpointId] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showWorkerCode, setShowWorkerCode] = useState(false);
  const [copiedWorker, setCopiedWorker] = useState(false);

  const [drafts, setDrafts] = useState<Record<string, EndpointDraft>>({});
  const [newLabel, setNewLabel] = useState("");
  const [newMode, setNewMode] = useState<"worker" | "direct">("worker");
  const [newWorkerUrl, setNewWorkerUrl] = useState("");
  const [newWorkerApiKey, setNewWorkerApiKey] = useState("");
  const [newAccountId, setNewAccountId] = useState("");
  const [newApiToken, setNewApiToken] = useState("");
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function applyConfig(data: PublicCloudflareConfigState) {
    // Backfill endpoints for servers that predate the pool (single-key configs).
    const endpoints: PublicCloudflareEndpointState[] = Array.isArray(data.endpoints) && data.endpoints.length > 0
      ? data.endpoints
      : data.configured || data.workerUrl || data.accountId
        ? [
            {
              id: "cf-primary",
              label: "Primary API",
              mode: data.mode,
              workerUrl: data.workerUrl,
              hasWorkerApiKey: data.hasWorkerApiKey,
              workerApiKeyMasked: data.workerApiKeyMasked,
              accountId: data.accountId,
              hasApiToken: data.hasApiToken,
              apiTokenMasked: data.apiTokenMasked,
              disabled: false,
              configured: data.configured,
              coolingDownUntil: 0,
              coolingDownSecs: 0,
              lastError: "",
              lastLatencyMs: 0,
              consecutiveFailures: 0,
            },
          ]
        : [];
    const normalized = { ...data, endpoints };
    setConfig(normalized);
    const nextDrafts: Record<string, EndpointDraft> = {};
    for (const e of endpoints) nextDrafts[e.id] = draftFromEndpoint(e);
    setDrafts(nextDrafts);
    onConfigChange?.(normalized);
  }

  async function loadConfig() {
    setLoading(true);
    try {
      const res = await fetch("/api/generate/cloudflare/config");
      if (!res.ok) return;
      const data = (await res.json()) as PublicCloudflareConfigState;
      applyConfig(data);
      if (data.provider === "cloudflare" && !data.configured) {
        setShowSetup(true);
      }
    } catch {
      // Ignore initial load error
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConfig();
  }, []);

  async function updateConfig(patch: Record<string, unknown>, showSavedBanner = false) {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/generate/cloudflare/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save Cloudflare settings.");
      }
      applyConfig(data.config as PublicCloudflareConfigState);
      if (showSavedBanner) {
        setFeedback({ type: "ok", text: "Cloudflare configuration saved securely on server." });
      }
      const updated = data.config as PublicCloudflareConfigState;
      if (updated.provider === "cloudflare" && !updated.configured) {
        setShowSetup(true);
      }
    } catch (err) {
      setFeedback({
        type: "err",
        text: err instanceof Error ? err.message : "Could not save Cloudflare configuration.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddEndpoint() {
    if (!newLabel.trim() && !newWorkerUrl.trim() && !newAccountId.trim()) {
      setFeedback({ type: "err", text: "Give the backup API a label and its URL / Account ID first." });
      return;
    }
    setAdding(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/generate/cloudflare/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel.trim() || `API ${(config?.endpoints.length || 0) + 1}`,
          mode: newMode,
          workerUrl: newWorkerUrl.trim(),
          workerApiKey: newWorkerApiKey.trim(),
          accountId: newAccountId.trim(),
          apiToken: newApiToken.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add API endpoint.");
      applyConfig(data.config as PublicCloudflareConfigState);
      setNewLabel("");
      setNewWorkerUrl("");
      setNewWorkerApiKey("");
      setNewAccountId("");
      setNewApiToken("");
      setFeedback({ type: "ok", text: "Backup Cloudflare API added. Generation will fail over to it on limits." });
    } catch (err) {
      setFeedback({ type: "err", text: err instanceof Error ? err.message : "Could not add API endpoint." });
    } finally {
      setAdding(false);
    }
  }

  async function handleSaveEndpoint(id: string) {
    const d = drafts[id];
    if (!d) return;
    setSavingEndpointId(id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/generate/cloudflare/endpoints/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: d.label,
          mode: d.mode,
          workerUrl: d.workerUrl,
          ...(d.workerApiKey.trim() ? { workerApiKey: d.workerApiKey.trim() } : {}),
          accountId: d.accountId,
          ...(d.apiToken.trim() ? { apiToken: d.apiToken.trim() } : {}),
          disabled: d.disabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save API endpoint.");
      applyConfig(data.config as PublicCloudflareConfigState);
      setFeedback({ type: "ok", text: `API "${d.label || id}" saved.` });
    } catch (err) {
      setFeedback({ type: "err", text: err instanceof Error ? err.message : "Could not save API endpoint." });
    } finally {
      setSavingEndpointId(null);
    }
  }

  async function handleDeleteEndpoint(id: string) {
    setSavingEndpointId(id);
    try {
      const res = await fetch(`/api/generate/cloudflare/endpoints/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove API endpoint.");
      applyConfig(data.config as PublicCloudflareConfigState);
      setFeedback({ type: "ok", text: "API endpoint removed." });
    } catch (err) {
      setFeedback({ type: "err", text: err instanceof Error ? err.message : "Could not remove API endpoint." });
    } finally {
      setSavingEndpointId(null);
    }
  }

  async function handleMoveEndpoint(id: string, dir: -1 | 1) {
    if (!config) return;
    const ids = config.endpoints.map((e) => e.id);
    const idx = ids.indexOf(id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    try {
      const res = await fetch("/api/generate/cloudflare/endpoints/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not reorder APIs.");
      applyConfig(data.config as PublicCloudflareConfigState);
    } catch (err) {
      setFeedback({ type: "err", text: err instanceof Error ? err.message : "Could not reorder APIs." });
    }
  }

  async function handleToggleEndpoint(id: string) {
    const d = drafts[id];
    if (!d) return;
    const next = { ...d, disabled: !d.disabled };
    setDrafts((prev) => ({ ...prev, [id]: next }));
    try {
      const res = await fetch(`/api/generate/cloudflare/endpoints/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: next.disabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not toggle API.");
      applyConfig(data.config as PublicCloudflareConfigState);
    } catch (err) {
      setDrafts((prev) => ({ ...prev, [id]: d }));
      setFeedback({ type: "err", text: err instanceof Error ? err.message : "Could not toggle API." });
    }
  }

  async function handleTestEndpoint(id: string) {
    setTestingId(id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/generate/cloudflare/endpoints/${encodeURIComponent(id)}/test`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setFeedback({ type: "ok", text: data.message || "Connection OK." });
      } else {
        const detail = Array.isArray(data.results) && data.results[0]?.message ? data.results[0].message : data.message;
        setFeedback({ type: "err", text: detail || "Connection test failed." });
      }
      await loadConfig();
    } catch (err) {
      setFeedback({ type: "err", text: err instanceof Error ? err.message : "Connection test failed." });
    } finally {
      setTestingId(null);
    }
  }

  async function handleTestAll() {
    setTestingAll(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/generate/cloudflare/test", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        const extra = Array.isArray(data.results)
          ? ` (${data.results.filter((r: { ok: boolean }) => r.ok).length}/${data.results.length} reachable)`
          : "";
        setFeedback({ type: "ok", text: `${data.message || "Connected!"}${extra}` });
      } else if (Array.isArray(data.results)) {
        const lines = data.results.map((r: { label: string; ok: boolean; message: string }) => `${r.ok ? "✅" : "❌"} ${r.message}`).join(" ");
        setFeedback({ type: "err", text: lines || data.message || "Connection test failed." });
      } else {
        setFeedback({ type: "err", text: data.message || "Connection test failed." });
      }
      await loadConfig();
    } catch (err) {
      setFeedback({ type: "err", text: err instanceof Error ? err.message : "Connection test failed." });
    } finally {
      setTestingAll(false);
    }
  }

  async function handleClearCooldowns() {
    try {
      const res = await fetch("/api/generate/cloudflare/cooldowns/clear", { method: "POST" });
      const data = await res.json();
      if (data.config) applyConfig(data.config as PublicCloudflareConfigState);
      else await loadConfig();
      setFeedback({ type: "ok", text: "Rate-limit cooldowns cleared — all APIs active again." });
    } catch {
      setFeedback({ type: "err", text: "Could not clear cooldowns." });
    }
  }

  function handleCopyWorkerScript() {
    if (!config?.workerScript) return;
    navigator.clipboard
      .writeText(config.workerScript)
      .then(() => {
        setCopiedWorker(true);
        setTimeout(() => setCopiedWorker(false), 2500);
      })
      .catch(() => {
        setFeedback({ type: "err", text: "Could not copy automatically. Select the code below to copy." });
      });
  }

  if (loading && !config) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-surface p-3 text-xs text-gray-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
        Loading image generation engines…
      </div>
    );
  }

  if (!config) return null;

  const isCloudflare = config.provider === "cloudflare";
  const coolingCount = config.endpoints.filter((e) => e.coolingDownSecs > 0).length;

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface/90 p-4 shadow-sm">
      {/* Top Engine Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Image Engine
          </span>
          <div
            role="group"
            aria-label="Image generation engine"
            className="inline-flex rounded-lg border border-border bg-bg p-1"
          >
            <button
              type="button"
              disabled={disabled || saving}
              onClick={() => void updateConfig({ provider: "local" })}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                !isCloudflare
                  ? "bg-surface2 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              } disabled:opacity-50`}
            >
              <Cpu className="h-3.5 w-3.5 text-purple-300" />
              Local ComfyUI (LoRA)
            </button>
            <button
              type="button"
              disabled={disabled || saving}
              onClick={() => void updateConfig({ provider: "cloudflare" })}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                isCloudflare
                  ? "bg-orange-500/20 text-orange-200 border border-orange-400/30 shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              } disabled:opacity-50`}
            >
              <Cloud className="h-3.5 w-3.5 text-orange-400" />
              Cloudflare Workers AI (Free API)
            </button>
          </div>
        </div>

        {/* Right Status & Settings Toggle */}
        {isCloudflare ? (
          <div className="flex flex-wrap items-center gap-2">
            {config.configured ? (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Cloud Ready · {config.activeEndpointCount} API{config.activeEndpointCount === 1 ? "" : "s"} · {config.modelLabel}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
                <AlertCircle className="h-3.5 w-3.5" />
                API Setup Required
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowSetup((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-gray-200 hover:bg-surface2"
            >
              <Settings2 className="h-3.5 w-3.5 text-orange-300" />
              {showSetup ? "Hide API Setup" : "Configure Cloudflare APIs"}
              {showSetup ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        ) : (
          <span className="text-[11px] text-gray-400">
            Using local GPU/RAM checkpoint + {channelLora.channelLabel} LoRA
          </span>
        )}
      </div>

      {/* Cloudflare Model Cards & Options when Cloudflare is Selected */}
      {isCloudflare && (
        <div className="mt-4 space-y-4 border-t border-border/70 pt-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white">
                Select Cloud Image Model (0 GB Local RAM)
              </span>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={config.injectStyleDna}
                  disabled={disabled || saving}
                  onChange={(e) => void updateConfig({ injectStyleDna: e.target.checked })}
                  className="rounded border-border bg-bg text-orange-400"
                />
                <span>
                  Auto-append <strong className="text-orange-300">{channelLora.channelLabel}</strong> Style-DNA to cloud prompts
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {config.models.map((m) => {
                const active = config.model === m.id;
                const isRecommended = m.id.includes("flux-1-schnell");
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={disabled || saving}
                    onClick={() => void updateConfig({ model: m.id })}
                    className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                      active
                        ? "border-orange-400/60 bg-orange-500/10 shadow-sm"
                        : "border-border bg-bg/60 hover:border-border/90 hover:bg-bg"
                    } disabled:opacity-50`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                        <Sparkles
                          className={`h-3.5 w-3.5 ${
                            active ? "text-orange-400" : "text-gray-500"
                          }`}
                        />
                        {m.label}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          isRecommended
                            ? "bg-orange-500/20 text-orange-300 border border-orange-400/30"
                            : "bg-surface2 text-gray-300"
                        }`}
                      >
                        {m.badge}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">
                      {m.description}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-400">
                      <span>
                        Quality: <strong className="text-gray-200">{m.qualityRating}</strong>
                      </span>
                      <span>·</span>
                      <span>
                        Speed: <strong className="text-gray-200">{m.speedRating}</strong>
                      </span>
                      <span className="ml-auto font-mono text-[10px] text-gray-500">{m.id}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Setup Drawer */}
          {showSetup && (
            <div className="rounded-xl border border-orange-400/30 bg-bg/80 p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-xs font-semibold text-white">
                    Cloudflare API Pool — automatic failover ({config.endpoints.length}/10)
                  </h4>
                  <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-gray-400">
                    Add one API per Cloudflare account (Worker URL + Key, or Account ID + Token). Generation tries them in
                    priority order and <strong className="text-orange-300">auto-switches to the next API on 429 / quota / 5xx</strong>.
                    {config.lastUsedEndpointId && (
                      <> Last image used: <code className="text-emerald-300">{config.endpoints.find((e) => e.id === config.lastUsedEndpointId)?.label || config.lastUsedEndpointId}</code>.</>
                    )}
                    {coolingCount > 0 && <> <span className="text-amber-300">{coolingCount} API(s) cooling down after a limit hit.</span></>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-gray-300">
                    Strategy
                    <select
                      value={config.strategy}
                      disabled={disabled || saving}
                      onChange={(e) => void updateConfig({ strategy: e.target.value })}
                      className="rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-white"
                    >
                      <option value="failover">Failover (priority order)</option>
                      <option value="round-robin">Round-robin (spread load)</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-gray-300">
                    Limit cooldown
                    <select
                      value={String(Math.round(config.cooldownMs / 60000))}
                      disabled={disabled || saving}
                      onChange={(e) => void updateConfig({ cooldownMs: Number(e.target.value) * 60000 })}
                      className="rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-white"
                    >
                      <option value="1">1 min</option>
                      <option value="5">5 min</option>
                      <option value="15">15 min</option>
                      <option value="60">60 min</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={testingAll}
                    onClick={() => void handleTestAll()}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-medium text-gray-200 hover:bg-surface2 disabled:opacity-50"
                  >
                    {testingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-300" /> : <FlaskConical className="h-3.5 w-3.5 text-orange-300" />}
                    Test all APIs
                  </button>
                  {coolingCount > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleClearCooldowns()}
                      className="flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 hover:bg-amber-500/20"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Clear cooldowns
                    </button>
                  )}
                </div>
              </div>

              {/* Existing endpoints */}
              <div className="space-y-3">
                {config.endpoints.map((ep, idx) => {
                  const d = drafts[ep.id];
                  if (!d) return null;
                  const busy = savingEndpointId === ep.id || testingId === ep.id;
                  return (
                    <div
                      key={ep.id}
                      className={`rounded-xl border p-3 space-y-3 ${ep.disabled ? "border-border bg-surface/50 opacity-70" : ep.coolingDownSecs > 0 ? "border-amber-400/40 bg-amber-500/5" : "border-border bg-surface/70"}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface2 text-[11px] font-bold text-gray-300">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={d.label}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [ep.id]: { ...d, label: e.target.value } }))}
                          placeholder={`API ${idx + 1} label`}
                          className="min-w-32 flex-1 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
                        />
                        <div className="inline-flex rounded-lg border border-border bg-bg p-0.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() => setDrafts((prev) => ({ ...prev, [ep.id]: { ...d, mode: "worker" } }))}
                            className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium ${d.mode === "worker" ? "bg-orange-500/20 text-orange-200" : "text-gray-400 hover:text-white"}`}
                          >
                            <Globe className="h-3 w-3" /> Worker
                          </button>
                          <button
                            type="button"
                            onClick={() => setDrafts((prev) => ({ ...prev, [ep.id]: { ...d, mode: "direct" } }))}
                            className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium ${d.mode === "direct" ? "bg-orange-500/20 text-orange-200" : "text-gray-400 hover:text-white"}`}
                          >
                            <KeyRound className="h-3 w-3" /> Direct
                          </button>
                        </div>
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            type="button"
                            title="Move up (higher priority)"
                            disabled={idx === 0}
                            onClick={() => void handleMoveEndpoint(ep.id, -1)}
                            className="rounded-md border border-border bg-bg p-1.5 text-gray-300 hover:bg-surface2 disabled:opacity-30"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Move down"
                            disabled={idx === config.endpoints.length - 1}
                            onClick={() => void handleMoveEndpoint(ep.id, 1)}
                            className="rounded-md border border-border bg-bg p-1.5 text-gray-300 hover:bg-surface2 disabled:opacity-30"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title={d.disabled ? "Enable API" : "Disable API"}
                            onClick={() => void handleToggleEndpoint(ep.id)}
                            className={`rounded-md border p-1.5 ${d.disabled ? "border-border bg-bg text-gray-500 hover:text-white" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}
                          >
                            {d.disabled ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            title="Delete API"
                            disabled={config.endpoints.length <= 1}
                            onClick={() => void handleDeleteEndpoint(ep.id)}
                            className="rounded-md border border-red-500/30 bg-red-500/10 p-1.5 text-red-300 hover:bg-red-500/20 disabled:opacity-30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Status badges */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        {ep.configured && !ep.disabled ? (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-300">Ready</span>
                        ) : ep.disabled ? (
                          <span className="rounded-full border border-border bg-surface2 px-2 py-0.5 font-medium text-gray-400">Disabled</span>
                        ) : (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-300">Incomplete</span>
                        )}
                        {config.lastUsedEndpointId === ep.id && (
                          <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-2 py-0.5 font-medium text-orange-200">Last used</span>
                        )}
                        {ep.coolingDownSecs > 0 && (
                          <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-200">
                            Cooling down {Math.floor(ep.coolingDownSecs / 60) > 0 ? `${Math.floor(ep.coolingDownSecs / 60)}m ` : ""}{ep.coolingDownSecs % 60}s — backups used
                          </span>
                        )}
                        {ep.consecutiveFailures > 0 && (
                          <span className="text-gray-500">{ep.consecutiveFailures} recent failure{ep.consecutiveFailures === 1 ? "" : "s"}</span>
                        )}
                        {ep.lastLatencyMs > 0 && <span className="text-gray-500">last ping {ep.lastLatencyMs}ms</span>}
                      </div>
                      {ep.lastError && (
                        <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-[11px] text-red-200/90">{ep.lastError}</p>
                      )}

                      {d.mode === "worker" ? (
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                          <label className="block space-y-1 text-[11px]">
                            <span className="font-medium text-gray-300">Worker URL (HTTPS)</span>
                            <input
                              type="url"
                              value={d.workerUrl}
                              onChange={(e) => setDrafts((prev) => ({ ...prev, [ep.id]: { ...d, workerUrl: e.target.value } }))}
                              placeholder="https://free-image-generation-api.yourname.workers.dev"
                              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
                            />
                          </label>
                          <label className="block space-y-1 text-[11px]">
                            <span className="flex items-center justify-between font-medium text-gray-300">
                              <span>Worker Bearer API_KEY</span>
                              {ep.hasWorkerApiKey && <span className="text-[10px] text-emerald-300">Saved ({ep.workerApiKeyMasked})</span>}
                            </span>
                            <input
                              type="password"
                              value={d.workerApiKey}
                              onChange={(e) => setDrafts((prev) => ({ ...prev, [ep.id]: { ...d, workerApiKey: e.target.value } }))}
                              placeholder={ep.hasWorkerApiKey ? "Blank = keep saved key" : "API_KEY from Worker secrets"}
                              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                          <label className="block space-y-1 text-[11px]">
                            <span className="font-medium text-gray-300">Account ID</span>
                            <input
                              type="text"
                              value={d.accountId}
                              onChange={(e) => setDrafts((prev) => ({ ...prev, [ep.id]: { ...d, accountId: e.target.value } }))}
                              placeholder="e.g. 8f4b2c9d1e3a5b7c9d0e1f2a3b4c5d6e"
                              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
                            />
                          </label>
                          <label className="block space-y-1 text-[11px]">
                            <span className="flex items-center justify-between font-medium text-gray-300">
                              <span>API Token (Workers AI)</span>
                              {ep.hasApiToken && <span className="text-[10px] text-emerald-300">Saved ({ep.apiTokenMasked})</span>}
                            </span>
                            <input
                              type="password"
                              value={d.apiToken}
                              onChange={(e) => setDrafts((prev) => ({ ...prev, [ep.id]: { ...d, apiToken: e.target.value } }))}
                              placeholder={ep.hasApiToken ? "Blank = keep saved token" : "Cloudflare API token"}
                              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
                            />
                          </label>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleSaveEndpoint(ep.id)}
                          className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-[11px] font-semibold text-black hover:bg-orange-400 disabled:opacity-50"
                        >
                          {savingEndpointId === ep.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Save API {idx + 1}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleTestEndpoint(ep.id)}
                          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[11px] font-medium text-gray-200 hover:bg-surface2 disabled:opacity-50"
                        >
                          {testingId === ep.id ? <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-300" /> : <Sparkles className="h-3.5 w-3.5 text-orange-300" />}
                          Test this API
                        </button>
                      </div>
                    </div>
                  );
                })}

                {config.endpoints.length === 0 && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">
                    No Cloudflare APIs yet — add your first one below.
                  </p>
                )}
              </div>

              {/* Add new endpoint */}
              {config.endpoints.length < 10 ? (
                <div className="rounded-xl border border-dashed border-border bg-surface/50 p-3 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                    <Plus className="h-3.5 w-3.5 text-orange-300" />
                    Add backup API (account #{config.endpoints.length + 1})
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <label className="block space-y-1 text-[11px]">
                      <span className="font-medium text-gray-300">Label</span>
                      <input
                        type="text"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        placeholder={`Account ${config.endpoints.length + 1} / Worker ${config.endpoints.length + 1}`}
                        className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
                      />
                    </label>
                    <div className="flex items-end">
                      <div className="inline-flex rounded-lg border border-border bg-bg p-0.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setNewMode("worker")}
                          className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium ${newMode === "worker" ? "bg-orange-500/20 text-orange-200" : "text-gray-400 hover:text-white"}`}
                        >
                          <Globe className="h-3 w-3" /> Worker URL + Key
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewMode("direct")}
                          className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium ${newMode === "direct" ? "bg-orange-500/20 text-orange-200" : "text-gray-400 hover:text-white"}`}
                        >
                          <KeyRound className="h-3 w-3" /> Direct API
                        </button>
                      </div>
                    </div>
                    {newMode === "worker" ? (
                      <>
                        <label className="block space-y-1 text-[11px]">
                          <span className="font-medium text-gray-300">Worker URL</span>
                          <input
                            type="url"
                            value={newWorkerUrl}
                            onChange={(e) => setNewWorkerUrl(e.target.value)}
                            placeholder="https://second-api.yourname.workers.dev"
                            className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
                          />
                        </label>
                        <label className="block space-y-1 text-[11px]">
                          <span className="font-medium text-gray-300">Worker API_KEY</span>
                          <input
                            type="password"
                            value={newWorkerApiKey}
                            onChange={(e) => setNewWorkerApiKey(e.target.value)}
                            placeholder="API_KEY secret of 2nd worker"
                            className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
                          />
                        </label>
                      </>
                    ) : (
                      <>
                        <label className="block space-y-1 text-[11px]">
                          <span className="font-medium text-gray-300">Account ID</span>
                          <input
                            type="text"
                            value={newAccountId}
                            onChange={(e) => setNewAccountId(e.target.value)}
                            placeholder="2nd Cloudflare account ID"
                            className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
                          />
                        </label>
                        <label className="block space-y-1 text-[11px]">
                          <span className="font-medium text-gray-300">API Token</span>
                          <input
                            type="password"
                            value={newApiToken}
                            onChange={(e) => setNewApiToken(e.target.value)}
                            placeholder="2nd account token"
                            className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
                          />
                        </label>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={adding}
                    onClick={() => void handleAddEndpoint()}
                    className="flex items-center gap-1.5 rounded-lg bg-surface2 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-bg disabled:opacity-50"
                  >
                    {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Add backup API
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-gray-400">Maximum 10 APIs reached.</p>
              )}

              {/* Worker script helpers */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyWorkerScript}
                  className="flex items-center gap-1.5 rounded-lg border border-orange-400/30 bg-orange-500/10 px-2.5 py-1.5 text-xs font-medium text-orange-200 hover:bg-orange-500/20"
                >
                  {copiedWorker ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedWorker ? "Copied Upgraded worker.js!" : "Copy Upgraded FLUX worker.js"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowWorkerCode((v) => !v)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
                >
                  <Code2 className="h-3.5 w-3.5" />
                  {showWorkerCode ? "Hide worker.js" : "View worker.js (deploy same code to each account)"}
                </button>
              </div>

              {showWorkerCode && (
                <div className="rounded-lg border border-border bg-surface p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-gray-300">
                    <span>
                      Paste this into <strong>each</strong> Cloudflare Worker (<code className="text-orange-300">worker.js</code>), bind <code className="text-orange-300">AI</code> under Workers AI, and set a <strong>different</strong> <code className="text-orange-300">API_KEY</code> per account.
                    </span>
                  </div>
                  <pre className="max-h-56 overflow-auto rounded bg-black/70 p-3 font-mono text-[11px] leading-relaxed text-gray-300">
                    {config.workerScript}
                  </pre>
                </div>
              )}

              {feedback && (
                <div
                  role={feedback.type === "err" ? "alert" : "status"}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                    feedback.type === "ok"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      : "border-red-500/30 bg-red-500/10 text-red-200"
                  }`}
                >
                  {feedback.type === "ok" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-300" />
                  )}
                  <span>{feedback.text}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
