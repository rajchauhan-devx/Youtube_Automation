import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import type { Script } from '../../data';
import { isAbortError, safeErrorMessage } from '../../lib/safe';
import { getApiKey } from '../../services/api';
import { useWorkspaceApi } from '../../services/workspaceApi';
import {
  applyWritersRoom,
  cancelWritersRoom,
  continueWritersRoom,
  decideWritersRoomFinding,
  fetchLatestWritersRoomJob,
  fetchWritersRoomJob,
  startWritersRoom,
  type WritersRoomFinding,
  type WritersRoomJob,
  type WritersRoomPass,
} from '../../services/writersRoom';

const CRITIC_LABELS: Record<string, string> = {
  retention: 'Retention critic',
  fact: 'Fact & canon critic',
  tone: 'Tone & audience critic',
  fresh_eyes: 'Fresh-eyes editor',
};

const SEVERITY_STYLES: Record<WritersRoomFinding['severity'], string> = {
  blocker: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  major: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  minor: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
};

const DECISION_LABELS: Record<string, string> = {
  approved: 'Approved',
  repair: 'Repaired',
  needs_review: 'Needs review',
  max_passes: 'Pass limit',
  plateau: 'No improvement',
  budget: 'Budget limit',
  no_progress: 'No change',
};

function isActive(job: WritersRoomJob | null): boolean {
  return Boolean(job && (job.status === 'queued' || job.status === 'running'));
}

function statusTone(job: WritersRoomJob): string {
  if (job.status === 'approved') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  if (job.status === 'needs_review' || job.status === 'interrupted') return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
  if (job.status === 'error') return 'border-rose-500/40 bg-rose-500/10 text-rose-300';
  if (job.status === 'cancelled') return 'border-gray-500/40 bg-gray-500/10 text-gray-300';
  return 'border-accent/40 bg-accent/10 text-accent';
}

export function WritersRoomPanel({ script, onUpdate }: { script: Script; onUpdate?: (patch: Partial<Script>) => void | Promise<void> }) {
  const { fetch: fetcher } = useWorkspaceApi();
  const defaultModel = script.model || 'gemini-3.6-flash';
  const [job, setJob] = useState<WritersRoomJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [maxPasses, setMaxPasses] = useState(3);
  const [freshEyes, setFreshEyes] = useState(false);
  const [criticModel, setCriticModel] = useState(defaultModel);
  const [fixerModel, setFixerModel] = useState(defaultModel);
  const [freshEyesModel, setFreshEyesModel] = useState('');
  const [selectedPass, setSelectedPass] = useState<number | null>(null);

  const plan = script.retentionEdit?.plan || script.scenePlan;
  const mediaExists = [...(script.generatedImages || []), ...(script.generatedAudio || [])]
    .some(item => typeof item?.url === 'string' && Boolean(item.url.trim()));

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    (async () => {
      try {
        const found = script.writersRoomJobId
          ? await fetchWritersRoomJob(fetcher, script.writersRoomJobId, controller.signal)
          : await fetchLatestWritersRoomJob(fetcher, script.id, controller.signal);
        if (alive) {
          setJob(found);
          setSelectedPass(found?.passes[found.passes.length - 1]?.pass || null);
        }
      } catch (caught) {
        if (alive && !isAbortError(caught)) setError(safeErrorMessage(caught, 'Could not load the Writers’ Room run'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; controller.abort(); };
  }, [fetcher, script.id, script.writersRoomJobId]);

  useEffect(() => {
    if (!job || !isActive(job)) return;
    const controller = new AbortController();
    const timer = window.setInterval(async () => {
      try {
        const next = await fetchWritersRoomJob(fetcher, job.id, controller.signal);
        setJob(next);
      } catch (caught) {
        if (!isAbortError(caught)) setError(safeErrorMessage(caught, 'Lost connection to the Writers’ Room'));
      }
    }, 2500);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [fetcher, job?.id, job?.status]);

  useEffect(() => {
    if (job?.passes.length) setSelectedPass(job.passes[job.passes.length - 1].pass);
  }, [job?.passes.length]);

  const activePass = useMemo(
    () => job?.passes.find(pass => pass.pass === selectedPass) || job?.passes[job.passes.length - 1],
    [job, selectedPass],
  );

  async function start() {
    if (!plan || busy) return;
    setBusy('start');
    setError('');
    try {
      const result = await startWritersRoom(
        fetcher,
        script.id,
        getApiKey(),
        { maxPasses, freshEyes, passThreshold: 90 },
        {
          criticModel: criticModel.trim() || undefined,
          fixerModel: fixerModel.trim() || undefined,
          freshEyesModel: freshEyes ? (freshEyesModel.trim() || criticModel.trim() || undefined) : undefined,
        },
      );
      setJob(result.job);
      setSelectedPass(null);
    } catch (caught) {
      setError(safeErrorMessage(caught, 'Could not start the Writers’ Room'));
    } finally {
      setBusy('');
    }
  }

  async function cancel() {
    if (!job || busy) return;
    setBusy('cancel');
    setError('');
    try { setJob((await cancelWritersRoom(fetcher, job.id)).job); }
    catch (caught) { setError(safeErrorMessage(caught, 'Could not cancel the run')); }
    finally { setBusy(''); }
  }

  async function continueRun() {
    if (!job || busy) return;
    setBusy('continue');
    setError('');
    try { setJob((await continueWritersRoom(fetcher, job.id, getApiKey(), 2)).job); }
    catch (caught) { setError(safeErrorMessage(caught, 'Could not continue the run')); }
    finally { setBusy(''); }
  }

  async function apply(force = false) {
    if (!job || busy) return;
    setBusy('apply');
    setError('');
    try {
      const result = await applyWritersRoom(fetcher, job.id, force);
      await onUpdate?.(result.patch);
      setJob({ ...job, status: 'approved' });
    } catch (caught) {
      setError(safeErrorMessage(caught, 'Could not apply the refined script'));
    } finally {
      setBusy('');
    }
  }

  async function decide(findingId: string, decision: 'accepted' | 'rejected') {
    if (!job) return;
    setError('');
    try {
      const result = await decideWritersRoomFinding(fetcher, job.id, findingId, decision);
      setJob(result.job);
    } catch (caught) {
      setError(safeErrorMessage(caught, 'Could not save the finding decision'));
    }
  }

  return (
    <details className="mx-5 my-4 rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-4" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-white">
        <span className="flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-300" />
          Writers’ Room · multi-agent refinement
        </span>
        {job && <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusTone(job)}`}>{job.status.replace('_', ' ')}</span>}
      </summary>

      <p className="mt-2 text-xs leading-relaxed text-gray-400">
        Three critics review in parallel, a fixer repairs only flagged scenes, and a showrunner stops when the script is ready, the score plateaus, or the budget runs out. It stops for your review instead of silently shipping a flawed draft.
      </p>

      {loading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the latest run…
        </div>
      )}

      {!plan && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Extract the scene plan first. The Writers’ Room edits the structured scene plan, not the raw AI response.
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} className="text-rose-300 hover:text-white"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {!job && plan && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] text-gray-400">
              Pass limit
              <select
                value={maxPasses}
                onChange={event => setMaxPasses(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-border bg-bg px-2.5 py-2 text-xs text-white outline-none focus:border-accent"
              >
                <option value={2}>2 passes</option>
                <option value={3}>3 passes (recommended)</option>
                <option value={4}>4 passes</option>
              </select>
            </label>
            <label className="flex items-end gap-2 pb-2 text-[11px] text-gray-300">
              <input type="checkbox" checked={freshEyes} onChange={event => setFreshEyes(event.target.checked)} className="h-3.5 w-3.5 accent-indigo-400" />
              Fresh-eyes review after approval
            </label>
          </div>

          <details className="rounded-lg border border-border bg-bg/40 p-3 text-xs">
            <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-gray-300">
              <ChevronDown className="h-3.5 w-3.5" /> Models
            </summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <label className="text-[11px] text-gray-400">
                Critic
                <input value={criticModel} onChange={event => setCriticModel(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg px-2.5 py-2 text-xs text-white outline-none focus:border-accent" />
              </label>
              <label className="text-[11px] text-gray-400">
                Fixer
                <input value={fixerModel} onChange={event => setFixerModel(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg px-2.5 py-2.5 text-xs text-white outline-none focus:border-accent" />
              </label>
              <label className="text-[11px] text-gray-400">
                Fresh eyes (optional)
                <input value={freshEyesModel} onChange={event => setFreshEyesModel(event.target.value)} placeholder="Different model ID" className="mt-1 w-full rounded-lg border border-border bg-bg px-2.5 py-2 text-xs text-white outline-none focus:border-accent" />
              </label>
            </div>
            <p className="mt-2 text-[10px] text-muted">Use a different model for fresh eyes when available. Leaving it blank uses the critic model.</p>
          </details>

          {mediaExists && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              Media has already been generated. Clear generated media before starting, so the refined script and visuals stay in sync.
            </div>
          )}

          <button
            type="button"
            onClick={start}
            disabled={Boolean(busy) || mediaExists}
            className="studio-btn-primary flex items-center gap-2 !px-4 !py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === 'start' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {busy === 'start' ? 'Starting…' : 'Start Writers’ Room'}
          </button>
        </div>
      )}

      {job && (
        <div className="mt-3 space-y-3">
          {isActive(job) && (
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-2 font-semibold text-indigo-200">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Pass {job.progress.pass}/{job.progress.totalPasses} · {job.progress.phase.replace('_', ' ')}
                </span>
                <span className="text-indigo-300">{job.progress.percent}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-indigo-950/60">
                <div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${job.progress.percent}%` }} />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-indigo-100/80">{job.progress.message}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(job.progress.criticStatus).map(([critic, state]) => (
                  <span key={critic} className={`rounded-full border px-2 py-0.5 text-[10px] ${
                    state === 'done' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : state === 'error' ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                        : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200'
                  }`}>
                    {CRITIC_LABELS[critic] || critic}: {state}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {isActive(job) && (
              <button type="button" onClick={cancel} disabled={Boolean(busy)} className="studio-btn-ghost flex items-center gap-1.5 !px-3 !py-1.5 text-xs">
                {busy === 'cancel' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                Cancel
              </button>
            )}
            {!isActive(job) && job.result && job.status !== 'approved' && (
              <button type="button" onClick={continueRun} disabled={Boolean(busy)} className="studio-btn-ghost flex items-center gap-1.5 !px-3 !py-1.5 text-xs">
                {busy === 'continue' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Run 2 more passes
              </button>
            )}
            {!isActive(job) && job.result && (
              <button
                type="button"
                onClick={() => apply(job.status !== 'approved')}
                disabled={Boolean(busy)}
                className="studio-btn-primary flex items-center gap-1.5 !px-3 !py-1.5 text-xs disabled:opacity-40"
              >
                {busy === 'apply' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {job.status === 'approved' ? 'Apply refined script' : 'Apply anyway'}
              </button>
            )}
            {!isActive(job) && !job.result && (
              <button type="button" onClick={start} disabled={Boolean(busy) || !plan || mediaExists} className="studio-btn-primary flex items-center gap-1.5 !px-3 !py-1.5 text-xs">
                <Play className="h-3.5 w-3.5" /> Start a new run
              </button>
            )}
          </div>

          {job.error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{job.error}</div>
          )}

          {job.result && (
            <div className="rounded-xl border border-border bg-bg/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">
                  Final score: {job.result.finalScore}/100 · {job.result.passes.length} pass{job.result.passes.length === 1 ? '' : 'es'}
                </span>
                <span className="text-[11px] text-muted">{job.result.modelCalls} model calls</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-300">{job.result.stopReason}</p>
              {job.result.remainingFindings.length > 0 && (
                <p className="mt-1 text-[11px] text-amber-300">
                  {job.result.remainingFindings.length} finding{job.result.remainingFindings.length === 1 ? '' : 's'} still open.
                </p>
              )}
            </div>
          )}

          {job.passes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {job.passes.map(pass => (
                <button
                  key={pass.pass}
                  type="button"
                  onClick={() => setSelectedPass(pass.pass)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${
                    selectedPass === pass.pass ? 'border-indigo-400/60 bg-indigo-500/15 text-white' : 'border-border bg-bg/40 text-gray-300 hover:border-indigo-400/40'
                  }`}
                >
                  Pass {pass.pass} · {pass.score}/100
                </button>
              ))}
            </div>
          )}

          {activePass && <PassDetails pass={activePass} decisions={job.decisions} onDecide={decide} />}
        </div>
      )}
    </details>
  );
}

function PassDetails({ pass, decisions, onDecide }: {
  pass: WritersRoomPass;
  decisions: Record<string, 'accepted' | 'rejected'>;
  onDecide: (findingId: string, decision: 'accepted' | 'rejected') => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          {pass.decision === 'approved' ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : pass.decision === 'repair' ? <Sparkles className="h-4 w-4 text-indigo-300" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />}
          Pass {pass.pass} {pass.kind === 'fresh_eyes' ? '(fresh eyes)' : ''} · {pass.score}/100 · {DECISION_LABELS[pass.decision] || pass.decision}
        </div>
        <span className="text-[11px] text-muted">{pass.mergedFindings.length} finding{pass.mergedFindings.length === 1 ? '' : 's'}</span>
      </div>

      <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
        {pass.critiques.map(critique => (
          <div key={critique.critic} className="rounded-lg border border-border/70 bg-surface/40 p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted">{CRITIC_LABELS[critique.critic] || critique.critic}</p>
            <p className={`text-sm font-bold ${critique.error ? 'text-rose-400' : critique.score >= 90 ? 'text-emerald-400' : 'text-amber-300'}`}>
              {critique.error ? 'failed' : `${critique.score}/100`}
            </p>
            <p className="mt-0.5 line-clamp-3 text-[10px] leading-relaxed text-gray-400">{critique.error || critique.summary}</p>
          </div>
        ))}
      </div>

      {pass.diffs.length > 0 && (
        <details className="mt-2 rounded-lg border border-border/70 bg-surface/30 p-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-gray-200">Scene changes ({pass.diffs.length})</summary>
          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {pass.diffs.map(diff => (
              <div key={diff.sceneId} className="rounded-lg border border-border/60 bg-bg/50 p-2 text-[11px] leading-relaxed">
                <p className="font-semibold text-accent">{diff.sceneId}{diff.chapter ? ` · ${diff.chapter}` : ''}</p>
                <p className="mt-1 text-rose-300/90"><span className="font-semibold">Before:</span> {diff.beforeNarration}</p>
                <p className="mt-1 text-emerald-300/90"><span className="font-semibold">After:</span> {diff.afterNarration}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      {pass.mergedFindings.length > 0 ? (
        <div className="mt-2 space-y-2">
          {pass.mergedFindings.map(finding => (
            <FindingRow key={finding.id} finding={finding} decision={decisions[finding.id]} onDecide={onDecide} />
          ))}
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> No open findings in this pass.</p>
      )}

      {pass.notes.length > 0 && (
        <details className="mt-2 text-[11px] text-gray-400">
          <summary className="cursor-pointer font-semibold text-gray-300">Fixer notes</summary>
          <ul className="mt-1 list-inside list-disc space-y-1">
            {pass.notes.map((note, index) => <li key={index}>{note}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function FindingRow({ finding, decision, onDecide }: {
  finding: WritersRoomFinding;
  decision?: 'accepted' | 'rejected';
  onDecide: (findingId: string, decision: 'accepted' | 'rejected') => void;
}) {
  return (
    <div className={`rounded-lg border p-2.5 text-[11px] ${SEVERITY_STYLES[finding.severity]}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold uppercase tracking-wide">{finding.severity} · {finding.category}</span>
        <div className="flex items-center gap-1.5">
          {decision && <span className={`rounded-full border px-2 py-0.5 text-[10px] ${decision === 'accepted' ? 'border-emerald-500/30 text-emerald-300' : 'border-gray-500/30 text-gray-400'}`}>{decision}</span>}
          <button type="button" onClick={() => onDecide(finding.id, 'accepted')} className={`rounded border px-1.5 py-0.5 text-[10px] ${decision === 'accepted' ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200' : 'border-border text-gray-300 hover:text-white'}`}>Accept</button>
          <button type="button" onClick={() => onDecide(finding.id, 'rejected')} className={`rounded border px-1.5 py-0.5 text-[10px] ${decision === 'rejected' ? 'border-gray-400/50 bg-gray-500/10 text-gray-200' : 'border-border text-gray-300 hover:text-white'}`}>Reject</button>
        </div>
      </div>
      <p className="mt-1 leading-relaxed text-gray-100">{finding.detail}</p>
      {finding.sceneIds.length > 0 && <p className="mt-1 text-[10px] text-gray-400">Scenes: {finding.sceneIds.join(', ')}</p>}
      {finding.evidence && <p className="mt-1 text-[10px] leading-relaxed text-gray-400"><span className="font-semibold">Evidence:</span> {finding.evidence}</p>}
      {finding.suggestedFix && <p className="mt-1 text-[10px] leading-relaxed text-gray-300"><span className="font-semibold">Suggested fix:</span> {finding.suggestedFix}</p>}
    </div>
  );
}
