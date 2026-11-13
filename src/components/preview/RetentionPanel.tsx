import type { Script } from '../../data';

export function RetentionPanel({ script }: { script: Script }) {
  const plan = script.retentionPlan;
  if (!plan) return null;

  const storyMap = script.vettedTopic?.storyMap || plan.storyMap;
  const audit = script.retentionEdit?.auditReport;
  const docSummary = script.retentionEdit?.scriptDoctorSummary;

  return (
    <details className="mx-5 my-4 rounded-xl border border-accent/25 bg-accent/5 p-4" open>
      <summary className="cursor-pointer text-sm font-semibold text-white">
        YouTube Retention Architecture &amp; Script Doctor
      </summary>

      {/* Script Doctor Audit & Perfection Scorecard */}
      {docSummary && (
        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/20 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400">
                Retention Score: {docSummary.finalScore}/100
              </span>
              <span className="text-[11px] font-medium text-gray-300">
                {docSummary.finalScore >= 90 ? '🏆 YouTube Documentary Perfection' : '✨ High Retention Standard'}
              </span>
            </div>
            <div className="text-[11px] text-muted">
              Pass Progression:{' '}
              {docSummary.scoreProgression.map((p) => `P${p.pass}: ${p.score}`).join(' → ')} ({docSummary.iterationsCount} pass{docSummary.iterationsCount > 1 ? 'es' : ''})
            </div>
          </div>

          {audit && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg bg-bg/40 p-2">
                <span className="text-[10px] text-muted">Gate 1: Hook</span>
                <p className="text-sm font-bold text-emerald-400">{audit.gate1_hook.score}/25</p>
              </div>
              <div className="rounded-lg bg-bg/40 p-2">
                <span className="text-[10px] text-muted">Gate 2: Curiosity Chain</span>
                <p className="text-sm font-bold text-emerald-400">{audit.gate2_curiosityChain.score}/25</p>
              </div>
              <div className="rounded-lg bg-bg/40 p-2">
                <span className="text-[10px] text-muted">Gate 3: Diction &amp; Cadence</span>
                <p className="text-sm font-bold text-emerald-400">{audit.gate3_dictionAndCadence.score}/25</p>
              </div>
              <div className="rounded-lg bg-bg/40 p-2">
                <span className="text-[10px] text-muted">Gate 4: Climax &amp; Outro</span>
                <p className="text-sm font-bold text-emerald-400">{audit.gate4_climaxAndOutro.score}/25</p>
              </div>
            </div>
          )}

          {audit && audit.deadZonesDetected.length > 0 && (
            <div className="mt-2.5 text-[11px] text-amber-300">
              ⚠️ {audit.deadZonesDetected.length} dead zone(s) addressed during repair loop.
            </div>
          )}
        </div>
      )}

      {/* 5-Act Retention Story Map */}
      {storyMap && (
        <details className="mt-3 rounded-lg border border-border/80 bg-bg/40 p-3 text-xs">
          <summary className="cursor-pointer font-semibold text-accent">
            5-Act Retention Story Map ({storyMap.coreViewerPromise})
          </summary>
          <div className="mt-2.5 space-y-2">
            <div className="rounded border border-border/50 p-2">
              <strong className="text-emerald-400">Act 1 ({storyMap.act1_hook.timeframe}): </strong>
              <span className="text-gray-200">{storyMap.act1_hook.name}</span> — {storyMap.act1_hook.description}
            </div>
            <div className="rounded border border-border/50 p-2">
              <strong className="text-emerald-400">Act 2 ({storyMap.act2_escalation.timeframe}): </strong>
              <span className="text-gray-200">{storyMap.act2_escalation.name}</span> — {storyMap.act2_escalation.description}
            </div>
            <div className="rounded border border-border/50 p-2">
              <strong className="text-amber-400">Act 3 ({storyMap.act3_midpoint_reversal.timeframe}): </strong>
              <span className="text-gray-200">{storyMap.act3_midpoint_reversal.name}</span> — {storyMap.act3_midpoint_reversal.description}
            </div>
            <div className="rounded border border-border/50 p-2">
              <strong className="text-rose-400">Act 4 ({storyMap.act4_climax.timeframe}): </strong>
              <span className="text-gray-200">{storyMap.act4_climax.name}</span> — {storyMap.act4_climax.description}
            </div>
            <div className="rounded border border-border/50 p-2">
              <strong className="text-sky-400">Act 5 ({storyMap.act5_payoff_outro.timeframe}): </strong>
              <span className="text-gray-200">{storyMap.act5_payoff_outro.name}</span> — {storyMap.act5_payoff_outro.description}
            </div>
          </div>
          {storyMap.curiosityLoops && storyMap.curiosityLoops.length > 0 && (
            <div className="mt-3">
              <span className="font-semibold text-muted">Open Curiosity Loops:</span>
              <ul className="mt-1 list-inside list-disc space-y-1 text-muted">
                {storyMap.curiosityLoops.map((loop, idx) => (
                  <li key={idx}>
                    <strong className="text-gray-300">{loop.timestampApprox}:</strong> {loop.openQuestion} → <em>{loop.promisedPayoff}</em>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </details>
      )}

      <p className="mt-2 text-xs leading-relaxed text-gray-300">{plan.viewerPromise}</p>
      <p className="mt-2 text-xs text-muted">Story structure: {plan.structure}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {plan.hooks.map((hook, i) => (
          <div
            key={i}
            className={`min-w-0 rounded-lg border p-3 ${
              i === plan.selectedHookIndex ? 'border-accent/50 bg-accent/10' : 'border-border'
            }`}
          >
            <p className="text-[11px] font-semibold text-accent">
              Hook {i + 1}
              {i === plan.selectedHookIndex ? ' · Selected' : ''}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-white">{hook.openingLine}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">{hook.reason}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-300">
        <strong>Planned title:</strong> {plan.titles[0]}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        <strong>Thumbnail:</strong> {plan.thumbnailConcept}
      </p>
      {script.retentionEdit && (
        <details className="mt-3 rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-xs font-semibold text-white">
            Edited narration &amp; editorial notes ({script.retentionEdit.notes.length} improvements)
          </summary>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted">
            {script.retentionEdit.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
          <div className="mt-3 max-h-64 space-y-3 overflow-y-auto text-xs leading-relaxed text-gray-200">
            {script.retentionEdit.plan.scenes.map((scene) => (
              <p key={scene.id}>
                <strong className="text-accent">{scene.chapter}: </strong>
                {scene.narration}
              </p>
            ))}
          </div>
        </details>
      )}
      {script.retentionReview && (
        <div className="mt-3 rounded-lg border border-border p-3 text-xs">
          <p
            className={
              script.retentionReview.status === 'passed'
                ? 'font-semibold text-emerald-300'
                : 'font-semibold text-amber-300'
            }
          >
            Final rendered review: {script.retentionReview.status}
          </p>
          <p className="mt-1 leading-relaxed text-gray-300">{script.retentionReview.summary}</p>
          <p className="mt-1 text-muted">
            Sampled final frames and opening/ending audio; unsampled sections still need editorial judgment.
          </p>
          {script.retentionReview.findings.map((finding, i) => (
            <p key={i} className="mt-1 text-muted">
              {finding.category}: {finding.detail}
            </p>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted">
        Hook selection and Script Doctor checks enforce verified retention standards before production.
      </p>
    </details>
  );
}
