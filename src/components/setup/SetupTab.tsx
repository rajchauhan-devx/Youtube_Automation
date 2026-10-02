import { useEffect, useState } from 'react';
import { Copy, Check, Download, RefreshCw, Server, KeyRound, Cpu, Image as ImageIcon, Music, User, Scissors, GitBranch, ListChecks, HardDrive, Activity, FileCog } from 'lucide-react';

interface SetupData {
  generatedAt: string;
  repoRoot: string;
  node: string;
  platform: string;
  ports: Record<string, string>;
  scriptModels: { default: string; geminiEditOverride: string; gemini: { id: string; name: string; needsKey: string }[]; local: any[]; opencodeFree: any[]; groq: any[]; openrouter: any[] };
  voice: any;
  image: any;
  music: any;
  presenter: any;
  editing: any;
  ollama: { endpoint: string; store: { path: string; installed: boolean }; live: { online: boolean; detail: string }; models: string[] };
  storage: { dataDir: { path: string; installed: boolean }; hfCache: { path: string; installed: boolean }; voices: { path: string; installed: boolean }; pkuseg: { path: string; installed: boolean }; clientSecret: boolean; youtubeToken: boolean; accountsDir: boolean };
  tools: { node: string; ffmpeg: string; ffprobe: string; python310: string; python312: string };
  apiKeys: { key: string; savedIn: string; present: boolean; usedBy: string; browserOnly?: boolean }[];
  envMatrix: { group: string; vars: { key: string; set: boolean; value: string }[] }[];
  envKeyDiff: { key: string; set: boolean }[];
  envFile: { path: string; exists: boolean; template: string };
  gitNotes: { committed: string[]; ignoredNotInGit: string[] };
  newPcChecklist: string[];
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">{icon}{title}</h3>
      <div className="space-y-2 text-xs text-gray-300">{children}</div>
    </section>
  );
}

function CopyBtn({ id, text, copied, onCopy }: { id: string; text: string; copied: string; onCopy: (id: string, text: string) => void }) {
  return (
    <button onClick={() => onCopy(id, text)} className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-surface2" aria-label="Copy">
      {copied === id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function Row({ label, value, copyId, copied, onCopy }: { label: string; value: string; copyId?: string; copied?: string; onCopy?: (id: string, text: string) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded bg-surface2/60 px-2 py-1.5">
      <div className="min-w-0"><span className="text-gray-400">{label}: </span><span className="break-all font-mono text-[11px] text-gray-100">{value}</span></div>
      {copyId && onCopy && <CopyBtn id={copyId} text={value} copied={copied || ''} onCopy={onCopy} />}
    </div>
  );
}

function Status({ online, label }: { online: boolean; label: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${online ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>{label}: {online ? 'online' : 'offline'}</span>;
}

export function SetupTab() {
  const [data, setData] = useState<SetupData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');
  const [browserKeyPresent, setBrowserKeyPresent] = useState(false);
  const [colabUrl, setColabUrl] = useState(() => localStorage.getItem('colab_url') || '');
  const [colabKey, setColabKey] = useState(() => localStorage.getItem('colab_key') || '');
  const [colabSaved, setColabSaved] = useState('');
  const [colabTesting, setColabTesting] = useState(false);
  const [colabStatus, setColabStatus] = useState('');

  function copy(id: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(''), 1500);
    }).catch(() => {});
  }

  function saveColab() {
    localStorage.setItem('colab_url', colabUrl.trim().replace(/\/+$/, ''));
    localStorage.setItem('colab_key', colabKey.trim());
    setColabSaved('Saved on THIS browser.');
    setTimeout(() => setColabSaved(''), 2500);
  }

  async function testColab() {
    setColabTesting(true);
    setColabStatus('');
    try {
      const headers: Record<string, string> = {};
      if (colabUrl.trim()) headers['x-colab-url'] = colabUrl.trim();
      if (colabKey.trim()) headers['x-colab-key'] = colabKey.trim();
      const res = await fetch('/api/generate/colab-status', { headers });
      const data = await res.json();
      if (!data.configured) setColabStatus('Not configured — enter the Colab URL + API key, or set COLAB_MEDIA_API_URL / COLAB_MEDIA_API_KEY in server/.env.');
      else setColabStatus(data.reachable ? `Reachable: ${data.detail}` : `Unreachable: ${data.detail}`);
    } catch (e) {
      setColabStatus(`Test failed: ${e instanceof Error ? e.message : 'could not reach server'}`);
    } finally {
      setColabTesting(false);
    }
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/setup');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setBrowserKeyPresent(!!localStorage.getItem('openrouter_key'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load setup inventory. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function exportMarkdown() {
    if (!data) return;
    const lines: string[] = [
      `# TubeFlow Setup — model + key inventory`,
      ``,
      `Exported: ${data.generatedAt} · ${data.platform} · ${data.node}`,
      ``,
      `## Live service status`,
      `- Ollama ${data.ollama.endpoint}: ${data.ollama.live.online ? 'online' : 'offline'} (${data.ollama.live.detail}); models: ${data.ollama.models.join(', ') || '(none)'}`,
      `- Chatterbox: ${data.voice.live.online ? 'online' : 'offline'} (${data.voice.live.detail})`,
      `- ComfyUI: ${data.image.live.online ? 'online' : 'offline'} (${data.image.live.detail})`,
      ``,
      `## Script models`,
      `- Default: ${data.scriptModels.default}; GEMINI_EDIT_MODEL=${data.scriptModels.geminiEditOverride}`,
      ...data.scriptModels.gemini.map(m => `- Gemini ${m.id} — needs ${m.needsKey}`),
      ...data.scriptModels.local.map((m: any) => `- Local ${m.id} (${m.name}) — ${m.install}; downloaded=${m.downloaded}`),
      ...data.scriptModels.opencodeFree.map((m: any) => `- ${m.id} — needs ${m.needsKey}`),
      ...data.scriptModels.groq.map((m: any) => `- ${m.id} — needs ${m.needsKey}`),
      ...data.scriptModels.openrouter.map((m: any) => `- ${m.id} — needs ${m.needsKey}`),
      ``,
      `## Voice — active ${data.voice.activeProviderName} (${data.voice.activeProvider})`,
      ...data.voice.options.map((o: any) => `- ${o.id}: ${o.name} | install: ${o.install} | key: ${o.needsKey}${o.model ? ` | model: ${o.model}` : ''}${o.voices ? ` | voices: ${o.voices.join(', ')}` : ''}`),
      ``,
      `## Image — ${data.image.engine} @ ${data.image.comfyPath.path}`,
      `- Workflow: ${data.image.workflow}; promptNode=${data.image.promptNode} seedNode=${data.image.seedNode} seedKey=${data.image.seedKey}`,
      `- Checkpoints: ${data.image.checkpoints.join(', ') || '(none)'}`,
      ``,
      `## Music — ${data.music.engine}`,
      ...data.music.files.map((f: any) => `- ${f.folder}/${f.name} installed=${f.installed}`),
      ``,
      `## Presenter — ${data.presenter.note}`,
      `- Root: ${data.presenter.root.path} installed=${data.presenter.root.installed}`,
      ``,
      ``,
      `## Storage`,
      `- dataDir=${data.storage.dataDir.path} exists=${data.storage.dataDir.installed}; hfCache=${data.storage.hfCache.path}; ollamaStore=${data.ollama.store.path}`,
      `- client_secret.json=${data.storage.clientSecret}; youtube-token.json=${data.storage.youtubeToken}; accountsDir=${data.storage.accountsDir}`,
      ``,
      `## Tools — node=${data.tools.node}; ffmpeg=${data.tools.ffmpeg || 'MISSING'}; ffprobe=${data.tools.ffprobe || 'MISSING'}; py3.10=${data.tools.python310 || 'MISSING'}; py3.12=${data.tools.python312 || 'MISSING'}`,
      ``,
      `## Env matrix (secrets show presence only)`,
      ...data.envMatrix.flatMap(g => [`### ${g.group}`, ...g.vars.map(v => `- ${v.key}=${v.value}`)]),
      ``,
      `## .env.example keys missing from server env: ${data.envKeyDiff.filter(k => !k.set).map(k => k.key).join(', ') || '(none)'}`,
      ``,
      `## API keys (values never exported)`,
      ...data.apiKeys.map(k => `- ${k.key}: savedIn=${k.savedIn} | serverPresent=${k.present} | usedBy=${k.usedBy}`),
      `- Browser openrouter_key on THIS browser: ${browserKeyPresent}`,
      ``,
      `## Git`,
      `- Committed: ${data.gitNotes.committed.join('; ')}`,
      `- Ignored: ${data.gitNotes.ignoredNotInGit.join('; ')}`,
      ``,
      `## New-PC checklist`,
      ...data.newPcChecklist.map(c => `- ${c}`),
      ``,
      `Full runbook: docs/NEW_PC_SETUP.md`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tubeflow-setup-inventory.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading setup inventory from /api/setup…</div>;
  if (error || !data) return (
    <div className="p-8 text-sm text-red-300">
      <p className="font-semibold">Setup inventory unavailable: {error}</p>
      <button onClick={load} className="mt-3 rounded bg-accent px-3 py-1.5 text-white">Retry</button>
    </div>
  );

  const missingEnvKeys = data.envKeyDiff.filter(k => !k.set);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
        <div>
          <h2 className="text-base font-semibold text-white">Setup — every model, engine & API key in one place</h2>
          <p className="mt-1 text-xs text-gray-400">
            Clone-safe: this screen shows <span className="text-green-300">where each model/key is saved</span> and what git does NOT carry.
            Secret <span className="text-red-300">values are never displayed or exported</span> — only present / missing.
            Full runbook: <span className="font-mono">docs/NEW_PC_SETUP.md</span>
          </p>
          <p className="mt-1 font-mono text-[11px] text-gray-500">{data.platform} · {data.node} · {data.generatedAt}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs text-gray-200 hover:bg-surface2"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
          <button onClick={exportMarkdown} className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80"><Download className="h-3.5 w-3.5" /> Export .md</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card icon={<Activity className="h-4 w-4 text-green-300" />} title="Live service status (real reachability right now)">
          <div className="flex flex-wrap gap-2">
            <Status online={data.ollama.live.online} label="Ollama :11434" />
            <Status online={data.voice.live.online} label="Chatterbox :8880" />
            <Status online={data.image.live.online} label="ComfyUI :8188" />
          </div>
          <Row label="Ollama detail" value={data.ollama.live.detail || '(no detail)'} />
          <Row label="Chatterbox detail" value={data.voice.live.detail || '(no detail)'} />
          <Row label="ComfyUI detail" value={data.image.live.detail || '(no detail)'} />
          <Row label="Ollama models downloaded" value={data.ollama.models.join(', ') || '(none — run ollama pull)'} copyId="ollama-models" copied={copied} onCopy={copy} />
          <p className="text-gray-400">Offline here means the service is not running now — not that it is uninstalled. Start via app controls / Ollama tray / manual ComfyUI terminal.</p>
        </Card>

        <Card icon={<Server className="h-4 w-4 text-accent" />} title="Ports, tools & env file">
          {Object.entries(data.ports).map(([k, v]) => <Row key={k} label={k} value={v} />)}
          <Row label="node" value={data.tools.node} />
          <Row label="ffmpeg" value={data.tools.ffmpeg || 'MISSING from PATH — install FFmpeg + ffprobe'} />
          <Row label="ffprobe" value={data.tools.ffprobe || 'MISSING from PATH'} />
          <Row label="python 3.10 (Chatterbox)" value={data.tools.python310 || 'MISSING — setup.ps1 needs py -3.10'} />
          <Row label="python 3.12 (ComfyUI)" value={data.tools.python312 || 'MISSING'} />
          <Row label="server/.env exists" value={String(data.envFile.exists)} />
          <Row label="server/.env path" value={data.envFile.path} copyId="envpath" copied={copied} onCopy={copy} />
          <Row label=".env.example keys missing" value={missingEnvKeys.map(k => k.key).join(', ') || '(none — server env covers template)'} />
        </Card>

        <Card icon={<KeyRound className="h-4 w-4 text-amber-300" />} title="API keys — saved location + present/missing (no values)">
          {data.apiKeys.map(k => (
            <div key={k.key} className="rounded bg-surface2/60 px-2 py-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-white">{k.key}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${k.browserOnly ? (browserKeyPresent ? 'bg-green-500/15 text-green-300' : 'bg-gray-500/15 text-gray-300') : k.present ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
                  {k.browserOnly ? (browserKeyPresent ? 'saved in THIS browser' : 'not in THIS browser') : k.present ? 'present on server' : 'missing on server'}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-gray-400">Saved in: {k.savedIn}</p>
              <p className="text-[11px] text-gray-400">Used by: {k.usedBy}</p>
            </div>
          ))}
          <p className="text-gray-400">Browser key lives in localStorage <span className="font-mono text-gray-200">openrouter_key</span> (per-PC, never in git). Server keys live only in <span className="font-mono text-gray-200">server/.env</span> (git-ignored).</p>
        </Card>

        <Card icon={<ImageIcon className="h-4 w-4 text-fuchsia-300" />} title="Colab media API — remote image + video key (media only)">
          <p className="text-gray-400">Run your model on Google Colab, expose it (e.g. Cloudflare tunnel), and paste the public URL + API key here. Used ONLY for image &amp; video generation — never for scripts or audio. Server <span className="font-mono text-gray-200">server/.env</span> keys are the shared fallback.</p>
          <label className="block">
            <span className="mb-1 block text-gray-400">Colab API URL</span>
            <input value={colabUrl} onChange={(e) => setColabUrl(e.target.value)} placeholder="https://xxx.trycloudflare.com" className="w-full rounded border border-border bg-bg px-2 py-1.5 font-mono text-[11px] text-white outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="mb-1 block text-gray-400">Colab API key (X-API-Key)</span>
            <input value={colabKey} onChange={(e) => setColabKey(e.target.value)} type="password" placeholder="paste key from Colab" className="w-full rounded border border-border bg-bg px-2 py-1.5 font-mono text-[11px] text-white outline-none focus:border-accent" />
          </label>
          <div className="flex items-center gap-2">
            <button onClick={saveColab} className="rounded bg-accent px-3 py-1.5 text-[11px] font-medium text-white hover:bg-accent/80">Save on this browser</button>
            <button onClick={testColab} disabled={colabTesting} className="rounded border border-border px-3 py-1.5 text-[11px] text-gray-200 hover:bg-surface2 disabled:opacity-40">{colabTesting ? 'Testing…' : 'Test connection'}</button>
            {colabSaved && <span className="text-[11px] text-green-300">{colabSaved}</span>}
          </div>
          {colabStatus && <p className="text-[11px] text-gray-200">{colabStatus}</p>}
        </Card>

        <Card icon={<FileCog className="h-4 w-4 text-sky-300" />} title="All env vars by group (secrets show presence only)">
          {data.envMatrix.map(g => (
            <div key={g.group}>
              <p className="font-medium text-gray-200">{g.group}</p>
              {g.vars.map(v => (
                <div key={v.key} className="flex items-center justify-between gap-2 rounded bg-surface2/40 px-2 py-1 font-mono text-[11px]">
                  <span className="text-gray-300">{v.key}</span>
                  <span className={v.set ? 'text-green-300' : 'text-gray-500'}>{v.value.length > 90 ? `${v.value.slice(0, 90)}…` : v.value}</span>
                </div>
              ))}
            </div>
          ))}
        </Card>

        <Card icon={<Cpu className="h-4 w-4 text-green-300" />} title={`Script models (default: ${data.scriptModels.default})`}>
          <Row label="GEMINI_EDIT_MODEL override" value={data.scriptModels.geminiEditOverride} />
          <p className="font-medium text-gray-200">Cloud — Gemini (needs GEMINI_API_KEY in server/.env):</p>
          {data.scriptModels.gemini.map(m => <Row key={m.id} label={m.name} value={`${m.id} · ${m.needsKey}`} />)}
          <p className="font-medium text-gray-200">Local — Ollama (no key, offline http://127.0.0.1:11434):</p>
          {data.scriptModels.local.map((m: any) => <Row key={m.id} label={`${m.name}${m.downloaded ? ' · downloaded' : ' · NOT downloaded'}`} value={`${m.id} · ${m.install}`} />)}
          <p className="font-medium text-gray-200">Free cloud — OpenCode Zen (needs OPENCODE_API_KEY):</p>
          {data.scriptModels.opencodeFree.map((m: any) => <Row key={m.id} label={m.name} value={m.id} />)}
          <p className="font-medium text-gray-200">Reasoning — Groq / OpenRouter (needs GROQ / OPENROUTER key):</p>
          {data.scriptModels.groq.map((m: any) => <Row key={m.id} label={m.name} value={m.id} />)}
          {data.scriptModels.openrouter.map((m: any) => <Row key={m.id} label={m.name} value={m.id} />)}
        </Card>

        <Card icon={<Music className="h-4 w-4 text-violet-300" />} title={`Voice — active: ${data.voice.activeProviderName}`}>
          <Status online={data.voice.live.online} label="Chatterbox service now" />
          {data.voice.options.map((o: any) => (
            <div key={o.id} className="rounded bg-surface2/60 px-2 py-1.5">
              <p className="font-medium text-white">{o.name}</p>
              <p className="text-[11px] text-gray-400">Install: {o.install}</p>
              <p className="text-[11px] text-gray-400">Key: {o.needsKey}{o.model ? ` · model: ${o.model}` : ''}</p>
              {o.voices && <p className="break-all font-mono text-[10px] text-gray-500">voices: {o.voices.join(', ')}</p>}
            </div>
          ))}
          <Row label="TTS_PROVIDER" value={String(data.voice.env.TTS_PROVIDER)} />
          <Row label="CHATTERBOX_URL" value={String(data.voice.env.CHATTERBOX_URL)} />
          <Row label="Cloud TTS_MODEL" value={String(data.voice.env.TTS_MODEL)} />
          <Row label="Chatterbox venv" value={`${data.voice.chatterboxVenv.path} · installed=${data.voice.chatterboxVenv.installed}`} />
          <Row label="Voice refs dir" value={`${data.storage.voices.path} · exists=${data.storage.voices.installed}`} />
          <Row label="pkuseg cache" value={`${data.storage.pkuseg.path} · exists=${data.storage.pkuseg.installed}`} />
        </Card>

        <Card icon={<ImageIcon className="h-4 w-4 text-sky-300" />} title="Image generation — ComfyUI (local)">
          <Status online={data.image.live.online} label="ComfyUI service now" />
          <p className="text-gray-400">{data.image.note}</p>
          <Row label="COMFYUI_PATH" value={`${data.image.comfyPath.path} · main.py=${data.image.comfyPath.hasMainPy}`} />
          <Row label="COMFYUI_PYTHON" value={`${data.image.comfyPython.path} · installed=${data.image.comfyPython.installed}`} />
          <Row label="Workflow" value={String(data.image.workflow)} copyId="workflow" copied={copied} onCopy={copy} />
          <Row label="Prompt/seed nodes" value={`prompt=${data.image.promptNode} seedNode=${data.image.seedNode} seedKey=${data.image.seedKey}`} />
          <Row label="Checkpoints found" value={data.image.checkpoints.join(', ') || '(none — install juggernautXL_ragnarok.safetensors)'} />
        </Card>

        <Card icon={<Music className="h-4 w-4 text-amber-300" />} title="Music — ACE-Step via ComfyUI (local)">
          <p className="text-gray-400">{data.music.setup}</p>
          {data.music.files.map((f: any) => <Row key={f.name} label={`${f.folder}/${f.name}`} value={f.installed ? `installed (${Math.round(f.bytes / 1024 / 1024)} MB)` : 'MISSING — run setup-local-music.py'} />)}
        </Card>

        <Card icon={<User className="h-4 w-4 text-pink-300" />} title="AI Presenter — MuseTalk (external app)">
          <p className="text-gray-400">{data.presenter.note}</p>
          <Row label="MUSETALK_ROOT" value={`${data.presenter.root.path} · app wrapper=${data.presenter.root.installed}`} copyId="musetalk-root" copied={copied} onCopy={copy} />
          <Row label="MUSETALK_PYTHON" value={String(data.presenter.env.MUSETALK_PYTHON)} />
        </Card>

        <Card icon={<Scissors className="h-4 w-4 text-teal-300" />} title="Motion graphics">
          <Row label="Timing" value={String(data.editing.alignment)} />
          <Row label="Planner" value={String(data.editing.planner)} />
          <Row label="Object verification" value={String(data.editing.grounding)} />
          <Row label="Browser executable" value={String(data.editing.browser)} />
        </Card>

        <Card icon={<HardDrive className="h-4 w-4 text-orange-300" />} title="Storage paths (per-PC, mostly git-ignored)">
          <Row label="TUBEFLOW_DATA_DIR" value={`${data.storage.dataDir.path} · exists=${data.storage.dataDir.installed}`} copyId="datadir" copied={copied} onCopy={copy} />
          <Row label="HF cache" value={`${data.storage.hfCache.path} · exists=${data.storage.hfCache.installed}`} />
          <Row label="Ollama store" value={`${data.ollama.store.path} · exists=${data.ollama.store.installed}`} />
          <Row label="client_secret.json" value={String(data.storage.clientSecret)} />
          <Row label="youtube-token.json" value={String(data.storage.youtubeToken)} />
          <Row label="accounts dir" value={String(data.storage.accountsDir)} />
        </Card>

        <Card icon={<GitBranch className="h-4 w-4 text-orange-300" />} title="Git — what clone gives you vs what you reinstall">
          <p className="font-medium text-gray-200">Committed (comes with git clone):</p>
          {data.gitNotes.committed.map(c => <p key={c} className="font-mono text-[11px] text-gray-400">• {c}</p>)}
          <p className="font-medium text-gray-200">Ignored — reinstall / transfer on new PC:</p>
          {data.gitNotes.ignoredNotInGit.map(c => <p key={c} className="font-mono text-[11px] text-red-200/80">• {c}</p>)}
        </Card>

        <Card icon={<ListChecks className="h-4 w-4 text-green-300" />} title="New-PC checklist (also in docs/NEW_PC_SETUP.md)">
          {data.newPcChecklist.map((c, i) => (
            <div key={i} className="flex items-start gap-2 rounded bg-surface2/60 px-2 py-1.5">
              <span className="text-gray-100">{c}</span>
              <button onClick={() => copy(`step-${i}`, c)} className="ml-auto shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-surface2">{copied === `step-${i}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}</button>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
