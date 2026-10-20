import type { Script } from '../../data';

export function RetentionPanel({ script }: { script: Script }) {
  const plan = script.retentionPlan;
  if (!plan) return null;
  return <details className="mx-5 my-4 rounded-xl border border-accent/25 bg-accent/5 p-4" open>
    <summary className="cursor-pointer text-sm font-semibold text-white">Hooks, Story Edit & Final Review</summary>
    <p className="mt-2 text-xs leading-relaxed text-gray-300">{plan.viewerPromise}</p>
    <p className="mt-2 text-xs text-muted">Story structure: {plan.structure}</p>
    <div className="mt-3 grid gap-2 md:grid-cols-3">
      {plan.hooks.map((hook, i) => <div key={i} className={`min-w-0 rounded-lg border p-3 ${i === plan.selectedHookIndex ? 'border-accent/50 bg-accent/10' : 'border-border'}`}>
        <p className="text-[11px] font-semibold text-accent">Hook {i + 1}{i === plan.selectedHookIndex ? ' · Selected' : ''}</p>
        <p className="mt-1 text-xs leading-relaxed text-white">{hook.openingLine}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">{hook.reason}</p>
      </div>)}
    </div>
    <p className="mt-3 text-xs text-gray-300"><strong>Planned title:</strong> {plan.titles[0]}</p>
    <p className="mt-1 text-xs leading-relaxed text-muted"><strong>Thumbnail:</strong> {plan.thumbnailConcept}</p>
    {script.retentionEdit && <details className="mt-3 rounded-lg border border-border p-3">
      <summary className="cursor-pointer text-xs font-semibold text-white">Edited narration & editorial notes</summary>
      <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted">{script.retentionEdit.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>
      <div className="mt-3 max-h-64 space-y-3 overflow-y-auto text-xs leading-relaxed text-gray-200">
        {script.retentionEdit.plan.scenes.map(scene => <p key={scene.id}><strong className="text-accent">{scene.chapter}: </strong>{scene.narration}</p>)}
      </div>
    </details>}
    {script.retentionReview && <div className="mt-3 rounded-lg border border-border p-3 text-xs">
      <p className={script.retentionReview.status === 'passed' ? 'font-semibold text-emerald-300' : 'font-semibold text-amber-300'}>Final rendered review: {script.retentionReview.status}</p>
      <p className="mt-1 leading-relaxed text-gray-300">{script.retentionReview.summary}</p>
      <p className="mt-1 text-muted">Sampled final frames and opening/ending audio; unsampled sections still need editorial judgment.</p>
      {script.retentionReview.findings.map((finding, i) => <p key={i} className="mt-1 text-muted">{finding.category}: {finding.detail}</p>)}
    </div>}
    <p className="mt-3 text-[11px] text-muted">Hook selection is an editorial hypothesis. Actual viewer retention is learned after publication.</p>
  </details>;
}
