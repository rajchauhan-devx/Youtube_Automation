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
  const [testing, setTesting] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showWorkerCode, setShowWorkerCode] = useState(false);
  const [copiedWorker, setCopiedWorker] = useState(false);

  // Form state
  const [mode, setMode] = useState<"worker" | "direct">("worker");
  const [workerUrl, setWorkerUrl] = useState("");
  const [workerApiKey, setWorkerApiKey] = useState("");
  const [accountId, setAccountId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function loadConfig() {
    setLoading(true);
    try {
      const res = await fetch("/api/generate/cloudflare/config");
      if (!res.ok) return;
      const data = (await res.json()) as PublicCloudflareConfigState;
      setConfig(data);
      setMode(data.mode);
      setWorkerUrl(data.workerUrl || "");
      setAccountId(data.accountId || "");
      if (data.provider === "cloudflare" && !data.configured) {
        setShowSetup(true);
      }
      onConfigChange?.(data);
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
      const updated = data.config as PublicCloudflareConfigState;
      setConfig(updated);
      setMode(updated.mode);
      setWorkerUrl(updated.workerUrl || "");
      setAccountId(updated.accountId || "");
      setWorkerApiKey("");
      setApiToken("");
      onConfigChange?.(updated);
      if (showSavedBanner) {
        setFeedback({ type: "ok", text: "Cloudflare configuration saved securely on server." });
      }
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

  async function handleTestConnection() {
    setTesting(true);
    setFeedback(null);
    try {
      // Save any pending inputs before testing
      const saveRes = await fetch("/api/generate/cloudflare/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          workerUrl,
          ...(workerApiKey.trim() ? { workerApiKey: workerApiKey.trim() } : {}),
          accountId,
          ...(apiToken.trim() ? { apiToken: apiToken.trim() } : {}),
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        throw new Error(saveData.error || "Invalid configuration.");
      }
      const updated = saveData.config as PublicCloudflareConfigState;
      setConfig(updated);
      setWorkerApiKey("");
      setApiToken("");
      onConfigChange?.(updated);

      const res = await fetch("/api/generate/cloudflare/test", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setFeedback({ type: "ok", text: data.message || "Connected to Cloudflare Workers AI!" });
      } else {
        setFeedback({ type: "err", text: data.message || "Connection test failed." });
      }
    } catch (err) {
      setFeedback({
        type: "err",
        text: err instanceof Error ? err.message : "Connection test failed.",
      });
    } finally {
      setTesting(false);
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
                Cloud Ready · {config.modelLabel}
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
              {showSetup ? "Hide API Setup" : "Configure Cloudflare API"}
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-white">
                    Cloudflare Workers AI Connection
                  </h4>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    Connect via your deployed Cloudflare Worker (<code className="text-orange-300">saurav-z/free-image-generation-api</code>) or directly with a Cloudflare Account ID + API Token.
                  </p>
                </div>
                <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setMode("worker")}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
                      mode === "worker"
                        ? "bg-orange-500/20 text-orange-200"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    Worker URL + Key
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("direct")}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
                      mode === "direct"
                        ? "bg-orange-500/20 text-orange-200"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Direct Cloudflare API
                  </button>
                </div>
              </div>

              {mode === "worker" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block space-y-1 text-xs">
                    <span className="font-medium text-gray-300">
                      Cloudflare Worker URL (HTTPS)
                    </span>
                    <input
                      type="url"
                      value={workerUrl}
                      onChange={(e) => setWorkerUrl(e.target.value)}
                      placeholder="https://free-image-generation-api.yourname.workers.dev"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
                    />
                  </label>
                  <label className="block space-y-1 text-xs">
                    <span className="flex items-center justify-between font-medium text-gray-300">
                      <span>Worker Bearer API_KEY</span>
                      {config.hasWorkerApiKey && (
                        <span className="text-[10px] text-emerald-300">
                          Saved ({config.workerApiKeyMasked})
                        </span>
                      )}
                    </span>
                    <input
                      type="password"
                      value={workerApiKey}
                      onChange={(e) => setWorkerApiKey(e.target.value)}
                      placeholder={
                        config.hasWorkerApiKey
                          ? "Leave blank to keep saved key, or enter new key"
                          : "Enter the API_KEY set in your Cloudflare Worker"
                      }
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
                    />
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block space-y-1 text-xs">
                    <span className="font-medium text-gray-300">
                      Cloudflare Account ID
                    </span>
                    <input
                      type="text"
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      placeholder="e.g. 8f4b2c9d1e3a5b7c9d0e1f2a3b4c5d6e"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
                    />
                  </label>
                  <label className="block space-y-1 text-xs">
                    <span className="flex items-center justify-between font-medium text-gray-300">
                      <span>Cloudflare API Token (Workers AI Read/Run)</span>
                      {config.hasApiToken && (
                        <span className="text-[10px] text-emerald-300">
                          Saved ({config.apiTokenMasked})
                        </span>
                      )}
                    </span>
                    <input
                      type="password"
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      placeholder={
                        config.hasApiToken
                          ? "Leave blank to keep saved token, or enter new token"
                          : "Enter your Cloudflare Workers AI API Token"
                      }
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
                    />
                  </label>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={saving || testing}
                    onClick={() =>
                      void updateConfig(
                        {
                          mode,
                          workerUrl,
                          ...(workerApiKey.trim() ? { workerApiKey: workerApiKey.trim() } : {}),
                          accountId,
                          ...(apiToken.trim() ? { apiToken: apiToken.trim() } : {}),
                        },
                        true
                      )
                    }
                    className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-orange-400 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Save Settings
                  </button>
                  <button
                    type="button"
                    disabled={saving || testing}
                    onClick={() => void handleTestConnection()}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-surface2 disabled:opacity-50"
                  >
                    {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-300" /> : <Sparkles className="h-3.5 w-3.5 text-orange-300" />}
                    Test Connection
                  </button>
                </div>

                {mode === "worker" && (
                  <div className="flex items-center gap-2">
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
                      {showWorkerCode ? "Hide worker.js" : "View worker.js"}
                    </button>
                  </div>
                )}
              </div>

              {showWorkerCode && mode === "worker" && (
                <div className="rounded-lg border border-border bg-surface p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-gray-300">
                    <span>
                      Paste this into your Cloudflare Worker (<code className="text-orange-300">worker.js</code>), bind <code className="text-orange-300">AI</code> under Workers AI, and set <code className="text-orange-300">API_KEY</code> in Variables.
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
