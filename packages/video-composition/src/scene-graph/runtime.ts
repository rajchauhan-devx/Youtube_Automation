import type { SceneGraphData } from '@tubeflow/editing-contracts';

export const SCENE_GRAPH_RUNTIME_VERSION = 'scene-graph-2';
export interface SceneGraphRenderOptions {
  width: number;
  height: number;
  durationFrames: number;
  fps: number;
  idPrefix?: string;
  assets?: Record<string, string>;
  fonts?: Record<string, string>;
  imageSizes?: Record<string, {width:number;height:number}>;
  motion?: 'subtle' | 'balanced' | 'expressive' | 'still';
}

/** Pure, seekable SVG renderer. Keep dependencies inside this function: export embeds
 * this exact evaluator, while React calls it directly. No playback callbacks/state. */
export function renderSceneGraphSvg(graph: SceneGraphData, frame: number, options: SceneGraphRenderOptions): string {
  const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
  const prefix = (options.idPrefix || 'sg').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeUrl = (s?: string) => s && /^(?:https?:\/\/|\/[^/]|\.\/|data:image\/(?:png|jpeg|webp);base64,)/i.test(s) ? esc(s) : '';
  type Matrix = [number, number, number, number, number, number];
  const identity: Matrix = [1, 0, 0, 1, 0, 0];
  const mul = (a: Matrix, b: Matrix): Matrix => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
  const apply = (m: Matrix, p: {x:number;y:number}) => ({ x: m[0]*p.x+m[2]*p.y+m[4], y: m[1]*p.x+m[3]*p.y+m[5] });
  const inverse = (m: Matrix): Matrix => { const d = m[0]*m[3]-m[1]*m[2]; return Math.abs(d)<1e-9 ? identity : [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d]; };
  const easing = (t: number, e: SceneGraphData['nodes'][number]['tracks'][number]['keyframes'][number]['easing']) => {
    if (e.kind === 'linear') return t;
    if (e.kind === 'spring') {
      const w = Math.sqrt(e.stiffness/e.mass), z = e.damping/(2*Math.sqrt(e.stiffness*e.mass));
      const response = (s:number) => {
        if (z < 1) { const wd=w*Math.sqrt(1-z*z); return 1-Math.exp(-z*w*s)*(Math.cos(wd*s)+z*w/wd*Math.sin(wd*s)); }
        if (Math.abs(z-1)<1e-6) return 1-Math.exp(-w*s)*(1+w*s);
        const r1=-w*(z-Math.sqrt(z*z-1)),r2=-w*(z+Math.sqrt(z*z-1));
        return 1+(r2*Math.exp(r1*s)-r1*Math.exp(r2*s))/(r1-r2);
      };
      return response(t)/Math.max(0.001,response(1));
    }
    const cubic = (u:number,a:number,b:number) => 3*(1-u)**2*u*a+3*(1-u)*u*u*b+u**3;
    let lo=0,hi=1;
    for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(cubic(mid,e.x1,e.x2)<t)lo=mid;else hi=mid;}
    return cubic((lo+hi)/2,e.y1,e.y2);
  };
  const trackValue = (track: SceneGraphData['nodes'][number]['tracks'][number], f:number) => {
    const keys=track.keyframes;
    if(f<=keys[0].frame)return keys[0].value;
    for(let i=1;i<keys.length;i++) if(f<keys[i].frame){ const a=keys[i-1],b=keys[i];return a.value+(b.value-a.value)*easing((f-a.frame)/(b.frame-a.frame),a.easing); }
    return keys[keys.length-1].value;
  };
  const path = (commands: Extract<SceneGraphData['nodes'][number],{kind:'path'}>['commands']) => commands.map(c => {
    if(c.op==='Z')return 'Z';
    if(c.op==='C')return `C ${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`;
    if(c.op==='Q')return `Q ${c.x1} ${c.y1} ${c.x} ${c.y}`;
    return `${c.op} ${c.x} ${c.y}`;
  }).join(' ');
  const geometry = (g: Extract<SceneGraphData['nodes'][number],{kind:'shape'}>['geometry'], attrs='') => {
    if(g.kind==='polygon')return `<polygon points="${g.points.map(p=>`${p.x},${p.y}`).join(' ')}" ${attrs}/>`;
    const b=g.bounds;
    return g.kind==='rect' ? `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${g.radius}" ${attrs}/>` : `<ellipse cx="${b.x+b.width/2}" cy="${b.y+b.height/2}" rx="${b.width/2}" ry="${b.height/2}" ${attrs}/>`;
  };
  const f=clamp(frame,0,options.durationFrames-1), still=options.motion==='still';
  const intensity = options.motion==='subtle' ? 0.45 : options.motion==='expressive' ? 1.15 : 1;
  const map=new Map(graph.nodes.map(n=>[n.id,n]));
  const states=new Map<string,{matrix:Matrix;opacity:number;strokeProgress:number;clipProgress:number}>();
  const state=(id:string): {matrix:Matrix;opacity:number;strokeProgress:number;clipProgress:number} => {
    if(states.has(id))return states.get(id)!;
    const node=map.get(id)!;const t={...node.transform};let opacity=node.opacity,strokeProgress=1,clipProgress=1;
    for(const track of node.tracks){ const v=trackValue(track,still?options.durationFrames:f);
      if(track.property==='opacity')opacity=clamp(still?Math.max(...track.keyframes.map(k=>k.value)):v);else if(track.property==='strokeProgress')strokeProgress=still?1:clamp(v);else if(track.property==='clipProgress')clipProgress=still?1:clamp(v);
      else { const base=t[track.property];t[track.property]=still?base:base+(v-base)*intensity; }
    }
    const r=t.rotation*Math.PI/180,c=Math.cos(r),s=Math.sin(r),p=t.pivot;
    const matrix:Matrix=[c*t.scaleX,s*t.scaleX,-s*t.scaleY,c*t.scaleY,t.x+p.x-c*t.scaleX*p.x+s*t.scaleY*p.y,t.y+p.y-s*t.scaleX*p.x-c*t.scaleY*p.y];
    const result={matrix,opacity,strokeProgress,clipProgress};states.set(id,result);return result;
  };
  const world=(id:string):Matrix => {const n=map.get(id)!;return n.parentId?mul(world(n.parentId),state(id).matrix):state(id).matrix;};
  const bounds=(id:string) => { const n=map.get(id)!;if('bounds'in n)return n.bounds;if(n.kind==='shape'){if(n.geometry.kind!=='polygon')return n.geometry.bounds;const p=n.geometry.points;const xs=p.map(p=>p.x),ys=p.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};}throw new Error(`Anchor target ${id} has no bounds`); };
  const anchor=(a: Extract<SceneGraphData['nodes'][number],{kind:'connector'}>['from']) => {
    if(a.kind==='screen')return a.point;
    if(a.kind!=='node')throw new Error(`Unsupported scene graph anchor ${a.kind}`);
    const b=bounds(a.nodeId),p=apply(world(a.nodeId),{x:b.x+b.width*a.point.x,y:b.y+b.height*a.point.y});return {x:p.x+a.offset.x,y:p.y+a.offset.y};
  };
  const defs:string[]=[];
  const paint=(p:Extract<SceneGraphData['nodes'][number],{kind:'shape'}>['paint'],id:string,progress:number) => {
    let fill=p.fill||'none';
    if(p.gradient){ const r=p.gradient.angle*Math.PI/180;defs.push(`<linearGradient id="${id}-gradient" x1="${50-Math.cos(r)*50}%" y1="${50-Math.sin(r)*50}%" x2="${50+Math.cos(r)*50}%" y2="${50+Math.sin(r)*50}%">${p.gradient.stops.map(s=>`<stop offset="${s.offset}" stop-color="${esc(s.color)}"/>`).join('')}</linearGradient>`);fill=`url(#${id}-gradient)`; }
    let filter='';if(p.shadow){defs.push(`<filter id="${id}-shadow" filterUnits="userSpaceOnUse" x="-60" y="-60" width="${graph.bounds.width+120}" height="${graph.bounds.height+120}"><feDropShadow dx="${p.shadow.x}" dy="${p.shadow.y}" stdDeviation="${p.shadow.blur/2}" flood-color="${esc(p.shadow.color)}"/></filter>`);filter=`filter="url(#${id}-shadow)"`;}
    return `fill="${esc(fill)}" stroke="${esc(p.stroke||'none')}" stroke-width="${p.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" ${progress<1?`pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1-progress}"`:`stroke-dasharray="${p.dash.join(' ')}"`} ${filter}`;
  };
  const wrap=(text:string,width:number,size:number) => {
    const lines:string[]=[];let line='';let length=0;
    for(const paragraph of text.split('\n')){for(const word of paragraph.split(/\s+/u)){
      // Conservative fallback; designers persist measured line breaks where available.
      const wordLength=Array.from(word).reduce((n,c)=>n+(/\p{Mark}/u.test(c)?0:/[ilI.,' ]/.test(c)?0.28:/[MW@]/.test(c)?0.9:0.59),0)*size;
      if(line&&length+size*0.3+wordLength>width){lines.push(line);line='';length=0;}
      const gap=line?size*0.3:0;line+=(line?' ':'')+word;length+=wordLength+gap;
    }lines.push(line);line='';length=0;}return lines;
  };
  const text=(value:string,b:{x:number;y:number;width:number;height:number},st:Extract<SceneGraphData['nodes'][number],{kind:'text'}>['style'],id:string) => {
    // Devanagari glyph ink can extend left of its advance box. Keep that ink
    // and the contrast stroke inside the persisted clipping rectangle.
    const inset=Math.max(3,st.fontSize*0.08);
    const lines=wrap(value,Math.max(1,b.width-inset*2),st.fontSize),primary=options.fonts?.[st.fontAssetId]||graph.theme?.fontFamily||'sans-serif';
    const family=[primary,...Object.values(options.fonts||{}).filter(font=>font!==primary),'sans-serif'].join(', ');
    const x=st.align==='center'?b.x+b.width/2:st.align==='right'?b.x+b.width-inset:b.x+inset;
    defs.push(`<clipPath id="${id}-text"><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}"/></clipPath>`);
    return `${st.background?`<rect x="${b.x-8}" y="${b.y-4}" width="${b.width+16}" height="${b.height+8}" rx="6" fill="${esc(st.background)}"/>`:''}<text data-text-node="${id}" data-layout-x="${b.x}" data-layout-y="${b.y}" data-layout-width="${b.width}" data-layout-height="${b.height}" clip-path="url(#${id}-text)" fill="${esc(st.color)}" font-family="${esc(family)}" font-size="${st.fontSize}" font-weight="${st.fontWeight}" dominant-baseline="text-before-edge" text-anchor="${st.align==='center'?'middle':st.align==='right'?'end':'start'}" style="paint-order:stroke;stroke:#000000b3;stroke-width:2px;stroke-linejoin:round">${lines.map((line,i)=>`<tspan x="${x}" y="${b.y+st.fontSize*i*st.lineHeight}">${esc(line)}</tspan>`).join('')}</text>`;
  };
  const children=(parent?:string):string => graph.nodes.filter(n=>n.parentId===parent).sort((a,b)=>a.zIndex-b.zIndex).map(n=>{
    const id=`${prefix}-${n.id}`,s=state(n.id);let body='';
    if(n.kind==='group')body=children(n.id);
    else if(n.kind==='shape')body=geometry(n.geometry,paint(n.paint,id,s.strokeProgress));
    else if(n.kind==='path')body=`<path d="${path(n.commands)}" ${paint(n.paint,id,s.strokeProgress)}/>`;
    else if(n.kind==='connector'){
      const inv=inverse(world(n.id)),a=apply(inv,anchor(n.from)),b=apply(inv,anchor(n.to)),mid=(a.x+b.x)/2;
      const d=n.route==='line'?`M ${a.x} ${a.y} L ${b.x} ${b.y}`:n.route==='elbow'?`M ${a.x} ${a.y} L ${mid} ${a.y} L ${mid} ${b.y} L ${b.x} ${b.y}`:`M ${a.x} ${a.y} C ${mid} ${a.y} ${mid} ${b.y} ${b.x} ${b.y}`;
      body=`<path d="${d}" ${paint({...n.paint,fill:null},id,s.strokeProgress)}/>`;
    } else if(n.kind==='text')body=text(n.text,n.bounds,n.style,id);
    else if(n.kind==='metric'){
      const progress=still?1:clamp(f/Math.max(1,Math.min(options.durationFrames*0.45,options.fps*1.2))),e=1-(1-progress)**3;
      const value=n.startValue+(n.targetValue-n.startValue)*e;
      const labelSize=Math.max(12,options.width*(options.height>options.width?0.026:0.016),n.style.fontSize*0.4);
      const labels=[n.label,n.subLabel].filter((label):label is string=>Boolean(label));
      const labelHeight=labels.length*labelSize*1.7;
      body=text(`${n.prefix||''}${value.toFixed(n.decimals)}${n.unit?' '+n.unit:''}${n.suffix||''}`,{...n.bounds,height:n.bounds.height-labelHeight},n.style,id);
      labels.forEach((label,i)=>{body+=text(label,{...n.bounds,y:n.bounds.y+n.bounds.height-labelHeight+i*labelSize*1.7,height:labelSize*1.7},{...n.style,fontSize:labelSize,fontWeight:'400'},`${id}-label-${i}`);});
    } else if(n.kind==='image'){
      const b=n.bounds,url=safeUrl(options.assets?.[n.assetId]);if(!url)throw new Error(`Missing image asset ${n.assetId}`);
      const c=n.crop||{x:0,y:0,width:1,height:1},size=options.imageSizes?.[n.assetId]||{width:b.width,height:b.height};
      body=`<svg x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" viewBox="${c.x*size.width} ${c.y*size.height} ${c.width*size.width} ${c.height*size.height}" preserveAspectRatio="${n.fit==='contain'?'xMidYMid meet':'xMidYMid slice'}" overflow="hidden"><image href="${url}" x="0" y="0" width="${size.width}" height="${size.height}" preserveAspectRatio="none"/></svg>`;
    }
    let clip='';if(n.clip){ const c=n.clip;
      if(c.kind==='mask')throw new Error('Scene graph image masks are not supported');
      const clipMatrix=c.space==='screen'?inverse(world(n.id)):inverse(s.matrix);
      defs.push(`<clipPath id="${id}-clip" transform="matrix(${clipMatrix.join(' ')})">${c.kind==='geometry'?geometry(c.geometry):`<path d="${path(c.commands)}"/>`}</clipPath>`);clip=`clip-path="url(#${id}-clip)"`;
    }
    if(s.clipProgress<1){const reveal=("bounds" in n)?n.bounds:n.kind==='shape'?bounds(n.id):{x:0,y:0,width:graph.bounds.width,height:graph.bounds.height};defs.push(`<clipPath id="${id}-reveal"><rect x="${reveal.x}" y="${reveal.y}" width="${reveal.width*s.clipProgress}" height="${reveal.height}"/></clipPath>`);body=`<g clip-path="url(#${id}-reveal)">${body}</g>`;}
    return `<g data-node-id="${esc(n.id)}" transform="matrix(${s.matrix.join(' ')})" opacity="${s.opacity}" ${clip}>${body}</g>`;
  }).join('');
  const fade=Math.max(1,Math.min(options.fps*0.18,options.durationFrames*0.12));
  const opacity=frame<0||frame>=options.durationFrames?0:still?1:Math.min(clamp(f/fade),clamp((options.durationFrames-1-f)/fade));
  const body=children();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}" style="width:100%;height:100%;overflow:hidden" aria-hidden="true"><defs>${defs.join('')}</defs><g transform="translate(${graph.bounds.x} ${graph.bounds.y})" opacity="${opacity}">${body}</g></svg>`;
}
