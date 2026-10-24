import { useId, useState } from 'react';

const demos = [
  { id: 'comparison', title: 'Comparison', description: 'Animated bars with a 2:1 scale and a subtle sound cue.' },
  { id: 'branching', title: 'Branching diagram', description: 'Three destinations revealed with animated connections and sound.' },
] as const;

export function MotionDemoGallery() {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<(typeof demos)[number]['id']>('comparison');
  const [failed, setFailed] = useState(false);
  const demo = demos.find(item => item.id === selected)!;

  return <section aria-label="Motion graphics demos" className="rounded-2xl border border-sky-400/20 bg-surface/90 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-white">Motion graphics demos</h3>
        <p className="mt-1 text-xs text-muted">Watch both completed examples with sound, right here.</p>
      </div>
      <button type="button" aria-expanded={open} aria-controls={panelId} className="rounded-xl border border-sky-400/40 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-400/20" onClick={() => { setOpen(value => !value); setFailed(false); }}>
        {open ? 'Close demos' : 'Watch demos'}
      </button>
    </div>
    {open && <div id={panelId} className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a motion demo">
        {demos.map(item => <button key={item.id} type="button" aria-pressed={selected === item.id} className={`rounded-lg border px-3 py-2 text-xs font-medium ${selected === item.id ? 'border-sky-300/60 bg-sky-400/15 text-sky-100' : 'border-border text-muted hover:text-white'}`} onClick={() => { setSelected(item.id); setFailed(false); }}>{item.title}</button>)}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-black">
        <video key={selected} aria-label={`${demo.title} demo video`} controls playsInline preload="metadata" poster={`/motion-demos/${selected}.png`} src={`/motion-demos/${selected}.mp4`} className="block w-full" style={{ maxHeight: '65vh', aspectRatio: selected === 'branching' ? '9 / 16' : '16 / 9', objectFit: 'contain' }} onError={() => setFailed(true)} />
      </div>
      {failed && <p role="alert" className="text-xs text-red-300">This demo could not load. Refresh the app and try again.</p>}
      <p className="text-xs text-gray-300">{demo.description}</p>
      <p className="text-[11px] text-muted">Press play to hear the sound. Demo audio and background media are synthetic.</p>
    </div>}
  </section>;
}
