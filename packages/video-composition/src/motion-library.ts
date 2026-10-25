import { SceneGraph, MotionTemplateContent, identity, type MotionTemplateContentData, type SceneGraphData, type SceneGraphNodeData, type SceneGraphThemeData } from '@tubeflow/editing-contracts';

type Recipe = 'rings' | 'dimension' | 'quote' | 'radial' | 'scale' | 'sequence' | 'annotation' | 'comparison' | 'tree' | 'list' | 'layers';
export interface MotionLibraryTemplate {
  id: string;
  name: string;
  category: string;
  recipe: Recipe;
  description: string;
  useWhen: string;
  avoidWhen: string;
  minItems: number;
  maxItems: number;
  keywords: string[];
}
const family = (id: string, name: string, category: string, recipe: Recipe, description: string, useWhen: string, avoidWhen: string, minItems: number, maxItems: number, keywords: string[]): MotionLibraryTemplate =>
  ({ id, name, category, recipe, description, useWhen, avoidWhen, minItems, maxItems, keywords });

/** Shared by the profile browser and the production director. No baked-in claims or artwork. */
export const ANCIENT_DHARMA_LIBRARY: readonly MotionLibraryTemplate[] = [
  family('ad_bell_shockwave', 'Sound & resonance', 'science', 'rings', 'Soft concentric line reveals with narration-supported labels.', 'A concrete explanation of sound or resonance.', 'Decorative religious symbolism or claims about measured frequencies.', 1, 2, ['bell', 'sound', 'resonance', 'ध्वनि', 'नाद']),
  family('ad_contour_trace', 'Architectural dimensions', 'architecture', 'dimension', 'A schematic dimension rule with labels, without an invented building outline.', 'A spoken architectural dimension or proportion.', 'Tracing or measuring a real object without verified tracking.', 1, 3, ['temple', 'height', 'वास्तु', 'ऊंचाई']),
  family('ad_floating_shloka', 'Verse & meaning', 'scripture', 'quote', 'Staged verse and supporting wording with a long reading hold.', 'A short verse or quotation actually spoken in the scene.', 'Unspoken translations or a full paragraph that cannot fit.', 1, 2, ['verse', 'shloka', 'श्लोक', 'गीता']),
  family('ad_yantra_wireframe', 'Radial concepts', 'philosophy', 'radial', 'Related concepts arranged around a neutral central point.', 'Narrated relationships between concepts.', 'Invented sacred geometry or a claim to reproduce an exact yantra.', 2, 5, ['concept', 'mandala', 'पुरुषार्थ', 'संबंध']),
  family('ad_laser_scanline', 'Inscription reading', 'evidence', 'quote', 'Calm ink-like phrase reveal, without electronic scanning effects.', 'A narrated inscription passage and its supported context.', 'Invented ancient glyphs, fabricated readings or archive credits.', 1, 2, ['inscription', 'edict', 'अभिलेख', 'शिलालेख']),
  family('ad_metric_odometer', 'Quantity & scale', 'science', 'scale', 'Static supported quantities with a restrained rule reveal.', 'A spoken quantity needs emphasis or context.', 'Rolling counters, inferred conversions or unsupported scale ratios.', 1, 3, ['quantity', 'weight', 'मीटर', 'वजन']),
  family('ad_river_route', 'Journey sequence', 'geography', 'sequence', 'Ordered named stops as a schematic, without invented geography.', 'Narration explicitly describes a journey or ordered route.', 'Geographic maps, boundaries or coordinates without a real source map.', 2, 7, ['journey', 'route', 'यात्रा', 'मार्ग']),
  family('ad_equinox_ray', 'Celestial relationships', 'science', 'radial', 'A word-led spatial relationship diagram with gentle line reveals.', 'Narration explicitly relates celestial or architectural elements.', 'Precise astronomical angles, orbits or alignments not supported by sources.', 2, 4, ['sun', 'solstice', 'सूर्य', 'खगोल']),
  family('ad_leader_pointer', 'Schematic callout', 'evidence', 'annotation', 'A diagram dot and leader to a supported phrase, placed in open space.', 'A conceptual detail benefits from an explanatory callout.', 'Attaching a pointer to footage; use verified spotlight tooling for real objects.', 1, 2, ['detail', 'callout', 'विवरण', 'विशेषता']),
  family('ad_vyuha_tactics', 'Formation relationships', 'history', 'radial', 'Staged radial relationships between narrated groups.', 'A narrated formation can be explained schematically.', 'Claiming exact historical troop positions or counts.', 2, 5, ['formation', 'vyuha', 'व्यूह', 'सेना']),
  family('ad_timeline', 'Timeline & eras', 'history', 'sequence', 'Three to seven events reflow into a vertical or horizontal sequence.', 'Explicit spoken dates or chronological order.', 'Proportional time spacing or invented dates.', 2, 7, ['timeline', 'era', 'कालक्रम', 'काल']),
  family('ad_comparison', 'Side-by-side comparison', 'explanation', 'comparison', 'Two clear groups, stacked in portrait and paired in landscape.', 'An explicit narrated contrast.', 'Invented numerical bars or implying unsupported equivalence.', 2, 2, ['comparison', 'versus', 'तुलना', 'अंतर']),
  family('ad_process', 'Cause & effect', 'explanation', 'sequence', 'Connected steps reveal in narration order.', 'A concrete narrated mechanism or causal sequence.', 'Inventing intermediate steps or causal relationships.', 2, 7, ['process', 'cause', 'प्रक्रिया', 'कारण']),
  family('ad_lineage', 'Lineage & relationships', 'history', 'tree', 'A responsive tree with explicit parent-child links.', 'Named teachers, dynasties or schools have stated relationships.', 'Inferring ancestry or chronology from names alone.', 2, 7, ['lineage', 'dynasty', 'वंश', 'परंपरा']),
  family('ad_reconstruction', 'Before & after', 'architecture', 'comparison', 'Supported before/after descriptions in a paired explanatory layout.', 'Narration describes how a structure or landscape changed.', 'Fabricating a reconstruction image or presenting a schematic as evidence.', 2, 2, ['before', 'after', 'पहले', 'बाद']),
  family('ad_evidence', 'Evidence & uncertainty', 'evidence', 'comparison', 'Two supported accounts or evidence statements remain visibly separate.', 'Narration distinguishes evidence, tradition or interpretation.', 'Invented verification badges or adding certainty absent from narration.', 2, 2, ['evidence', 'interpretation', 'प्रमाण', 'व्याख्या']),
  family('ad_chapter', 'Chapter introduction', 'structure', 'quote', 'A brief supported heading with a fine rule and calm hold.', 'A new chapter needs orientation.', 'Repeating titles on ordinary scenes.', 1, 1, ['chapter', 'अध्याय']),
  family('ad_recap', 'Key-point recap', 'structure', 'list', 'A staggered list of concise narration phrases.', 'The scene actually summarizes its key points.', 'Turning an entire narration paragraph into on-screen captions.', 2, 5, ['recap', 'summary', 'सार', 'निष्कर्ष']),
  family('ad_etymology', 'Word & meaning', 'scripture', 'tree', 'Explicit relationships between a spoken term and its meanings.', 'Narration supplies a word derivation or named meanings.', 'Invented translations or linguistic derivations.', 2, 5, ['word', 'meaning', 'शब्द', 'अर्थ']),
  family('ad_stratigraphy', 'Layers & cross-section', 'science', 'layers', 'Schematic stacked layers with native labels and staged rule reveals.', 'Narration explicitly describes ordered material or excavation layers.', 'Inventing layer depths, dating results or laboratory identifiers.', 2, 5, ['layer', 'stratigraphy', 'परत', 'स्तर']),
];

export const motionLibraryTemplate = (id: string) => ANCIENT_DHARMA_LIBRARY.find(t => t.id === id);
export const ANCIENT_DHARMA_THEME: SceneGraphThemeData = {
  name: 'Ancient Dharma', primary: '#C59B52', accent: '#BC8056', background: '#281B24', text: '#FFF3D7',
  fontFamily: 'Noto Sans Devanagari', lineWeight: 2, radius: 0,
};
export interface MotionTemplateOptions {
  templateId: string;
  content: MotionTemplateContentData;
  width: number;
  height: number;
  durationFrames: number;
  fps: number;
  fontAssetId: string;
  sceneId: string;
  tokens: { id: string; text: string }[];
  theme?: SceneGraphThemeData;
  openArea?: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'none';
  layout?: 'auto' | 'horizontal' | 'vertical';
}

/** Deterministic parametric composition. Accepted nodes are persisted and replayed as-is. */
export function compileMotionTemplate(options: MotionTemplateOptions): SceneGraphData {
  const t = motionLibraryTemplate(options.templateId);
  if (!t) throw new Error('Unknown motion library template');
  const content = MotionTemplateContent.parse(options.content), items = content.items;
  if(t.recipe!=='tree'&&content.links.length)throw new Error('Only relationship trees accept explicit links');
  if (items.length < t.minItems || items.length > t.maxItems) throw new Error(`${t.name} requires ${t.minItems}–${t.maxItems} items`);
  if (options.openArea === 'none') throw new Error('No open area for a readable overlay');
  if (!Number.isInteger(options.durationFrames) || options.durationFrames < options.fps * 1.5) throw new Error('Insufficient duration for a motion template');
  const { width: w, height: h, durationFrames: duration, fps } = options;
  if (![w,h,fps].every(v => Number.isFinite(v) && v > 0)) throw new Error('Invalid motion template dimensions');
  const theme = options.theme || ANCIENT_DHARMA_THEME;
  // All coordinates are in the final video frame, with space reserved for captions.
  const bounds = { x: w * 0.07, y: h * 0.12, width: w * 0.86, height: h * 0.64 };
  if (options.openArea === 'left' || options.openArea === 'right') {
    bounds.width = w * 0.40;
    bounds.x = options.openArea === 'left' ? w * 0.07 : w * 0.53;
  } else if (options.openArea === 'top' || options.openArea === 'bottom') {
    bounds.height = h * 0.30;
    bounds.y = options.openArea === 'top' ? h * 0.10 : h * 0.46;
  }
  const W = bounds.width, H = bounds.height, pad = Math.max(12, w * 0.008);
  const vertical = ['rings','list','layers'].includes(t.recipe) || options.layout === 'vertical' || (options.layout !== 'horizontal' && (W / H < 1.55 || items.length > 4));
  const layout = t.recipe === 'radial' && W / H > 1.3 && items.length <= 4 ? 'radial' : vertical ? 'vertical' : 'horizontal';
  const nodes: SceneGraphNodeData[] = [], evidence: SceneGraphData['evidence'] = [];
  const fontSize = Math.max(18, Math.round(w * (h > w ? 0.031 : 0.020)));
  const revealSpan = Math.min(Math.round(fps * 0.85), Math.round(duration * 0.18));
  const base = (id: string, index = 0) => ({ id, space: 'screen' as const, zIndex: 0, transform: identity(), opacity: 1,
    tracks: [{ property: 'opacity' as const, keyframes: [
      { frame: 0, value: 0, easing: { kind: 'linear' as const } },
      { frame: Math.max(1, Math.round(index * revealSpan / Math.max(1, items.length))), value: 0, easing: { kind: 'linear' as const } },
      { frame: Math.max(2, Math.round(index * revealSpan / Math.max(1, items.length)) + Math.max(1, Math.round(fps * 0.18))), value: 1, easing: { kind: 'linear' as const } },
    ].filter((k, i, all) => !i || k.frame > all[i-1].frame) }] });
  const paint = { fill: null, stroke: theme.primary, strokeWidth: theme.lineWeight, dash: [] };
  const strokeReveal = (index: number) => ({property:'strokeProgress' as const,keyframes:[
    {frame:0,value:0,easing:{kind:'linear' as const}},
    {frame:Math.max(1,Math.min(duration-1,Math.round(fps*0.5+index*revealSpan/Math.max(1,items.length)))),value:1,easing:{kind:'linear' as const}},
  ]});
  const line = (id: string, x1: number, y1: number, x2: number, y2: number, index = 0) => {
    const b=base(id,index);
    nodes.push({ ...b, tracks:[...b.tracks,strokeReveal(index)], zIndex: -1, kind: 'path', commands: [{ op: 'M', x: x1, y: y1 }, { op: 'L', x: x2, y: y2 }], paint });
  };
  const dot = (id: string, x: number, y: number, index = 0, radius = Math.max(3, w * 0.003)) => {
    const b=base(id,index);
    nodes.push({ ...b, tracks:[...b.tracks,strokeReveal(index)], zIndex: -1, kind: 'shape', geometry: { kind: 'ellipse', bounds: { x: x-radius, y: y-radius, width: radius*2, height: radius*2 } }, paint });
  };
  const label = (index: number, x: number, y: number, width: number, height: number) => {
    const item = items[index];
    const add = (text: string, suffix: string, yy: number, hh: number, size: number, color: string) => {
      const id = `item-${index}${suffix}`;
      nodes.push({ ...base(id, index), kind: 'text', text, bounds: { x, y: yy, width, height: hh },
        style: { fontAssetId: options.fontAssetId, fontSize: size, fontWeight: '700', color, align: 'left', lineHeight: 1.35 } });
      // Bind only matching token spans, preserving the distinction from independent verification.
      const norm = (s: string) => s.normalize('NFC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
      const target = norm(text); let refs: string[] = [];
      outer: for (let start = 0; start < options.tokens.length; start++) for (let end = start+1; end <= Math.min(options.tokens.length,start+64); end++) {
        const span=norm(options.tokens.slice(start,end).map(t=>t.text).join(' '));
        if ((` ${span} `).includes(` ${target} `)) { refs=options.tokens.slice(start,end).map(t=>t.id); break outer; }
      }
      evidence.push({ targetNodeId: id, sourceId: options.sceneId, narrationTokenIds: refs, verifiedValue: text, status: 'narration' });
    };
    if (item.detail) {
      add(item.text, '', y, height * 0.48, fontSize, theme.text);
      add(item.detail, '-detail', y + height * 0.52, height * 0.48, fontSize, theme.primary);
    } else add(item.text, '', y, height, fontSize, theme.text);
  };
  const count = items.length;
  const cells: { x: number; y: number; width: number; height: number }[] = [];
  if (layout === 'radial') {
    const cx = W/2, cy = H/2;
    dot('origin', cx, cy);
    items.forEach((_, i) => {
      const left = i % 2 === 0, top = i < 2, x = left ? pad : W*0.57, y = top ? pad : H*0.62;
      const cw = W*0.40-pad, ch = H*0.30-pad;
      cells.push({ x, y, width: cw, height: ch });
      line(`relation-${i}`, cx, cy, left ? x+cw : x, y+ch/2, i);
    });
  } else if (t.recipe === 'tree') {
    const links = content.links;
    if (links.length !== count-1 || links.some(l=>l.from>=count || l.to>=count || l.from>=l.to) || new Set(links.map(l=>l.to)).size !== count-1 || links.some(l=>l.to===0))
      throw new Error('A relationship tree needs one explicit earlier parent for every item after the first');
    const levels = [0];
    for (let i=1;i<count;i++) levels[i] = levels[links.find(l=>l.to===i)!.from]+1;
    const depth = Math.max(...levels)+1;
    items.forEach((_,i)=>{
      if(layout==='vertical'){
        const indent=Math.min(W*0.07,(W*0.30)/Math.max(1,depth-1));
        const x=pad+fontSize+levels[i]*indent;
        cells.push({x,y:pad+i*(H-2*pad)/count,width:W-pad-x,height:(H-2*pad)/count-pad});
      }else{
        const row = levels[i], peers = levels.flatMap((level,j)=>level===row?[j]:[]), slot=peers.indexOf(i);
        cells.push({x:pad+slot*(W-2*pad)/peers.length,y:pad+row*(H-2*pad)/depth,width:(W-2*pad)/peers.length-pad,height:(H-2*pad)/depth-pad});
      }
    });
    links.forEach((l,i)=>{
      const a=cells[l.from],b=cells[l.to];
      if(layout==='vertical'){
        const x=a.x-fontSize*0.55,y=a.y+fontSize*0.6,yy=b.y+fontSize*0.6;
        line(`branch-${i}-stem`,x,y,x,yy,i);line(`branch-${i}`,x,yy,b.x-fontSize*0.15,yy,i);
      }else line(`branch-${i}`,a.x+a.width/2,a.y+a.height,b.x+b.width/2,b.y,i);
    });
  } else {
    const stacked = layout === 'vertical' || t.recipe === 'list' || t.recipe === 'layers';
    items.forEach((_, i) => {
      const step = (stacked ? H-2*pad : W-2*pad)/count;
      const marker = ['sequence','list','layers','dimension','scale','radial'].includes(t.recipe) ? fontSize : 0;
      cells.push(stacked
        ? {x:pad+marker,y:pad+i*step,width:W-2*pad-marker,height:step-pad}
        : {x:pad+i*step,y:pad+marker,width:step-pad,height:H-2*pad-marker});
      if (marker) {
        if (stacked) { dot(`point-${i}`, pad+4, pad+i*step+fontSize/2,i); if(i<count-1&&t.recipe==='sequence')line(`step-${i}`,pad+4,pad+i*step+fontSize/2,pad+4,pad+(i+1)*step+fontSize/2,i); }
        else { dot(`point-${i}`,pad+i*step+4,pad+4,i);if(i<count-1&&t.recipe==='sequence')line(`step-${i}`,pad+i*step+4,pad+4,pad+(i+1)*step+4,pad+4,i); }
      }
      if (t.recipe === 'layers') line(`layer-${i}`,pad,pad+i*step-4,W-pad,pad+i*step-4,i);
    });
  }
  cells.forEach((cell,i)=>{
    if (cell.width < fontSize*3 || cell.height < fontSize*1.5) throw new Error('Content cannot fit this layout; simplify it or choose another open area');
    label(i,cell.x,cell.y,cell.width,cell.height);
  });
  if (t.recipe === 'rings') {
    // Diagram geometry only: no bell glyph, sacred symbol or claimed measurement.
    const radius = Math.min(W,H)*0.13;
    for(let i=0;i<3;i++) dot(`resonance-${i}`, W*0.80,H*0.70,i,radius*(0.5+i*0.35));
    cells.forEach((cell,i)=>{ const n=nodes.find(n=>n.id===`item-${i}`);if(n?.kind==='text')n.bounds.width=Math.min(cell.width,W*0.58); });
  }
  if (t.recipe === 'dimension') {
    line('dimension-rule',W-pad,H*0.12,W-pad,H*0.88);
    line('dimension-top',W-pad-fontSize,H*0.12,W-pad,H*0.12);
    line('dimension-base',W-pad-fontSize,H*0.88,W-pad,H*0.88);
  }
  if (t.recipe === 'annotation') line('callout-rule',pad,H-pad,W*0.45,H*0.60);
  if (t.recipe === 'quote' || t.recipe === 'comparison' || t.recipe === 'scale') line('editorial-rule',pad,H-pad,W-pad,H-pad);
  return SceneGraph.parse({version:1,seed:42,bounds,theme,nodes,evidence,soundCues:[],capabilities:['svg-2d','frame-animation'],
    template:{id:t.id,version:1,layout}});
}
