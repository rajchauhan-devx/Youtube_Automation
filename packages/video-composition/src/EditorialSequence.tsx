import { AbsoluteFill, Img } from 'remotion';
import type { ArtifactComposition, EditingProject } from '@tubeflow/editing-contracts';
import type { DocumentaryAssets } from './DocumentaryComposition.js';

const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

/** Scene-level motion design. Footage stays the hero; explanatory stages build
 * their own visual hierarchy, rather than putting photographic cards over it. */
export function EditorialSequence({ project, artifact, frame, assets }: {
  project: EditingProject; artifact: ArtifactComposition; frame: number; assets: DocumentaryAssets;
}) {
  const spec = artifact.graphic!.composition!.editorial!;
  const { width: w, height: h, fps } = project.inputs, portrait = h > w, unit = Math.min(w, h);
  const seconds = (frame - artifact.startFrame) / fps, duration = (artifact.endFrame - artifact.startFrame) / fps;
  const enter = ease(seconds / 0.65), exit = ease((duration - seconds - 1 / fps) / 0.35);
  const accent = project.style.colors.accent || '#d9ad68';
  const family = project.style.fontAssetIds.map(id => `"editing-${id}"`).join(', ');
  const x = w * 0.075, contentW = w * (portrait ? 0.74 : 0.84), top = h * (portrait ? 0.12 : 0.1);
  const designed = spec.template === 'process' || spec.template === 'assembly';
  const subject = spec.subjectAssetId ? assets[spec.subjectAssetId] : undefined;
  const Text = ({ children, size, style = {} }: { children: React.ReactNode; size: number; style?: React.CSSProperties }) =>
    <div data-editing-text="editorial" data-artifact-id={artifact.id} style={{ fontFamily: family, fontSize: size,
      lineHeight: 1.5, overflowWrap: 'anywhere', color: '#f4eee5', ...style }}>{children}</div>;
  const Fact = ({ index, size = unit * 0.12 }: { index: number; size?: number }) => spec.facts[index] &&
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: unit * 0.018, maxWidth: '100%' }}>
      <Text size={Math.min(size, unit * 0.1)} style={{ fontWeight: 700, color: '#f4eee5', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0, maxWidth: '100%' }}>{spec.facts[index].value}</Text>
      <Text size={unit * 0.034} style={{ maxWidth: '100%', lineHeight: 1.4, color: '#e4e7eb' }}>{spec.facts[index].label}</Text>
    </div>;
  return <AbsoluteFill data-editorial-sequence={spec.template} style={{ opacity: designed ? 1 : exit, fontFamily: family }}>
    {designed ? <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 60% 38%, #26313b 0%, #101820 52%, #0a1016 100%)' }}>
      <svg width={w} height={h} style={{ opacity: 0.06 }}><defs><pattern id={`grid-${artifact.id}`} width={unit * 0.055} height={unit * 0.055} patternUnits="userSpaceOnUse"><path d={`M ${unit * 0.055} 0 L0 0 0 ${unit * 0.055}`} fill="none" stroke="#dbe4e8" strokeWidth="1" /></pattern></defs><rect width={w} height={h} fill={`url(#grid-${artifact.id})`} /></svg>
    </AbsoluteFill> : <AbsoluteFill style={{ background: spec.template === 'impact'
      ? 'linear-gradient(0deg, #071018e6 0%, #071018a6 37%, transparent 78%)'
      : 'linear-gradient(90deg, #071018dd 0%, #07101866 46%, transparent 85%)', opacity: enter }} />}
    <div style={{ position: 'absolute', left: x, top, width: contentW, opacity: enter,
      transform: `translateY(${(1 - enter) * unit * 0.025}px)` }}>
      {spec.kicker && <Text size={unit * 0.028} style={{ color: accent, marginBottom: unit * 0.025, letterSpacing: project.inputs.language === 'en' ? '0.08em' : 0 }}>{spec.kicker}</Text>}
      <div style={{ clipPath: `inset(0 ${100 * (1 - enter)}% 0 0)` }}>
        <Text size={unit * (portrait ? 0.057 : 0.064)} style={{ fontWeight: 700, maxWidth: contentW }}>{spec.headline}</Text>
      </div>
    </div>
    {spec.template === 'impact' && <div style={{ position: 'absolute', left: x, top: h * (portrait ? 0.47 : 0.43), width: contentW,
      overflow: 'hidden', paddingBottom: unit * 0.02 }}>
      <div style={{ transform: `translateY(${(1 - enter) * 120}%)`, opacity: enter }}><Fact index={0} size={unit * 0.19} /></div>
      <div style={{ width: contentW * 0.24 * ease((seconds - 0.35) / 0.6), height: unit * 0.003, background: accent, marginTop: unit * 0.025 }} />
      {spec.facts[1] && <div style={{ marginTop: unit * 0.025, opacity: ease((seconds - 0.55) / 0.5) }}><Fact index={1} size={unit * 0.07} /></div>}
    </div>}
    {spec.template === 'measure' && <>
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0 }}>
        <path d={`M${x} ${h * 0.31}v${h * 0.32}`} fill="none" stroke={accent} strokeWidth={unit * 0.003} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ease((seconds - 0.15) / 1.1)} />
        {[0.31, 0.63].map(y => <path key={y} d={`M${x - unit * 0.012} ${h * y}h${unit * 0.025}`} stroke={accent} strokeWidth={unit * 0.003} opacity={enter} />)}
      </svg>
      <div style={{ position: 'absolute', left: x + unit * 0.04, top: h * 0.37, width: contentW * 0.8, opacity: ease((seconds - 0.35) / 0.7) }}>
        <Fact index={0} />
        {spec.facts[1] && <div style={{ marginTop: unit * 0.06 }}><Fact index={1} size={unit * 0.085} /></div>}
      </div>
    </>}
    {spec.template === 'process' && (() => {
      const start = { x: w * (portrait ? 0.13 : 0.10), y: h * (portrait ? 0.60 : 0.72) }, end = { x: w * (portrait ? 0.76 : 0.63), y: h * (portrait ? 0.46 : 0.48) };
      const build = ease((seconds - 0.3) / 1.0), travel = ease((seconds - 1.1) / Math.max(1.8, duration - 2));
      const dx = end.x - start.x, dy = spec.direction === 'incline' ? end.y - start.y : 0;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const center = { x: start.x + dx * (0.13 + travel * 0.70), y: start.y + dy * (0.13 + travel * 0.70) };
      const subjectW = w * (portrait ? 0.45 : 0.23), ratio = subject ? subject.record.height! / subject.record.width! : 0.5;
      return <>
        <svg width={w} height={h} style={{ position: 'absolute', inset: 0 }}>
          <path d={`M${start.x} ${start.y}L${start.x + dx * build} ${start.y + dy * build}L${start.x + dx * build} ${start.y + unit * 0.035}L${start.x} ${start.y + unit * 0.035}Z`} fill="#ad795232" />
          <path d={`M${start.x} ${start.y}L${end.x} ${start.y + dy}`} fill="none" stroke={accent} strokeWidth={unit * 0.005} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - build} />
          <path d={`M${start.x} ${start.y + unit * 0.10}h${dx}`} stroke="#e8e0d0" strokeWidth={unit * 0.002} pathLength={1} strokeDasharray="0.025 0.02" opacity={build * 0.4} />
        </svg>
        <div style={{ position: 'absolute', left: center.x, top: center.y, width: subjectW, height: subjectW * ratio,
          transform: `translate(-50%, -88%) rotate(${angle}deg)`, opacity: ease((seconds - 0.75) / 0.5), transformOrigin: '50% 88%' }}>
          {subject ? <Img src={subject.url} style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 12px 10px #0007)' }} />
            : <div style={{ width: '100%', height: '100%', borderRadius: unit * 0.01, background: 'linear-gradient(145deg,#8a8172,#504d46)', border: '1px solid #ccbda3' }} />}
        </div>
        <div style={{ position: 'absolute', left: portrait ? x : w * 0.75, top: h * (portrait ? 0.68 : 0.40), width: portrait ? contentW : w * 0.17, opacity: ease((seconds - 0.65) / 0.7) }}><Fact index={0} size={unit * 0.09} /></div>
      </>;
    })()}
    {spec.template === 'assembly' && (() => {
      const join = ease((seconds - 0.7) / 1.1), scale = Math.min(contentW / 850, h * 0.22 / 300);
      const cx = w * (portrait ? 0.45 : 0.5), cy = h * (portrait ? 0.46 : 0.5);
      return <>
        <svg width={w} height={h} style={{ position: 'absolute', inset: 0, opacity: enter }}>
          <defs><linearGradient id={`stone-${artifact.id}`} x2="0.5" y2="1"><stop stopColor="#a99477" /><stop offset="1" stopColor="#514b43" /></linearGradient>
            <filter id={`grain-${artifact.id}`} x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="3" seed="12" result="noise" /><feColorMatrix in="noise" type="saturate" values="0" /><feComponentTransfer><feFuncA type="linear" slope="0.18" /></feComponentTransfer><feComposite in2="SourceGraphic" operator="in" /><feBlend in="SourceGraphic" mode="soft-light" /></filter>
          </defs>
          <g transform={`translate(${cx} ${cy}) scale(${scale})`}>
            <path transform={`translate(${-145 * (1 - join) + 18} 24)`} d="M-330-130H0V-50H85V50H0V130H-330Z" fill="#393a36" stroke="#776b58" strokeWidth="2" />
            <path transform={`translate(${145 * (1 - join) + 18} 24)`} d="M0-130H330V130H0V50H85V-50H0Z" fill="#393a36" stroke="#776b58" strokeWidth="2" />
            <path transform={`translate(${-145 * (1 - join)} 0)`} d="M-330-130H0V-50H85V50H0V130H-330Z" fill={`url(#stone-${artifact.id})`} stroke="#c6b598" strokeWidth="3" filter={`url(#grain-${artifact.id})`} />
            <path transform={`translate(${145 * (1 - join)} 0)`} d="M0-130H330V130H0V50H85V-50H0Z" fill="#777065" stroke="#c6b598" strokeWidth="3" filter={`url(#grain-${artifact.id})`} />
            <path d="M0-130V-50H85V50H0V130" fill="none" stroke={accent} strokeWidth="6" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ease((seconds - 1.8) / 0.8)} />
          </g>
        </svg>
        <div style={{ position: 'absolute', left: x, top: h * (portrait ? 0.65 : 0.68), width: contentW, opacity: ease((seconds - 1.6) / 0.7) }}>
          {spec.facts.map((fact, i) => <Text key={i} size={unit * 0.04} style={{ marginBottom: unit * 0.016 }}>{fact.value}{fact.label ? ` · ${fact.label}` : ''}</Text>)}
        </div>
      </>;
    })()}
    {spec.disclosure && <div style={{ position: 'absolute', left: x, top: h * (portrait ? 0.765 : 0.74), width: contentW, opacity: enter * 0.75 }}>
      <Text size={unit * 0.026}>{spec.disclosure}</Text>
    </div>}
  </AbsoluteFill>;
}
