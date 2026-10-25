import fs from 'node:fs';
import { chromium } from 'playwright';
import type { ArtifactComposition, EditingProject } from '@tubeflow/editing-contracts';
import { renderSceneGraphSvg, type SceneGraphRenderOptions } from '@tubeflow/video-composition';
import { assetFile, assetRecord } from './repository.js';
import { editingConfig } from './config.js';

/** Measures actual font glyphs and animation envelopes at every artifact frame. */
export async function inspectGraphLayout(project: EditingProject, artifact: ArtifactComposition, signal: AbortSignal, fitText = false): Promise<string[]> {
  if (!artifact.sceneGraph) return [];
  signal.throwIfAborted();
  const graph=artifact.sceneGraph;
  const fonts=Object.fromEntries(project.style.fontAssetIds.map(id=>[id,`sg-font-${id}`]));
  const style=project.style.fontAssetIds.map(id=>`@font-face{font-family:sg-font-${id};src:url(data:font/woff2;base64,${fs.readFileSync(assetFile(id)).toString('base64')});font-weight:400;}`).join('');
  const assets=Object.fromEntries(graph.nodes.flatMap(n=>n.kind==='image'?[[n.assetId,`data:${assetRecord(n.assetId).mime};base64,${fs.readFileSync(assetFile(n.assetId)).toString('base64')}`]]:[]));
  const options:SceneGraphRenderOptions={width:project.inputs.width,height:project.inputs.height,fps:project.inputs.fps,durationFrames:artifact.endFrame-artifact.startFrame,idPrefix:`qa-${artifact.id}`,fonts,assets,imageSizes:Object.fromEntries(graph.nodes.flatMap(n=>n.kind==='image'?[[n.assetId,{width:assetRecord(n.assetId).width!,height:assetRecord(n.assetId).height!}]]:[])),motion:project.settings.motionLevel};
  const browser=await chromium.launch({headless:true,executablePath:editingConfig().browser});
  const aborted=()=>{void browser.close();};signal.addEventListener('abort',aborted,{once:true});
  try {
    const page=await browser.newPage({viewport:{width:project.inputs.width,height:project.inputs.height}});
    await page.addInitScript(() => {
      (window as any).__name = (fn: any) => fn;
      (globalThis as any).__name = (fn: any) => fn;
    });
    await page.setContent(`<script>window.__name = (fn) => fn; globalThis.__name = (fn) => fn;</script><style>body{margin:0}${style}</style><div id="stage">${renderSceneGraphSvg(graph, 5, options)}</div>`);
    await page.evaluate(async () => {
      (window as any).__name = (fn: any) => fn;
      (globalThis as any).__name = (fn: any) => fn;
      await document.fonts.ready;
    });
    await page.addScriptTag({content:`window.__name = (fn) => fn; globalThis.__name = (fn) => fn; window.renderGraph = ${renderSceneGraphSvg.toString()};`});
    if (fitText) {
      // Resolve actual glyph height once and persist it; never alter factual copy.
      const measured = await page.evaluate(() => Array.from(document.querySelectorAll<SVGTextElement>('text')).map(t => ({id:t.dataset.textNode||'',height:t.getBBox().height})));
      for (const item of measured) {
        const node = graph.nodes.find(n => `qa-${artifact.id}-${n.id}` === item.id);
        if (node?.kind === 'text') node.bounds.height = Math.max(node.bounds.height, Math.ceil(item.height + 4));
      }
    }
    const regions=project.scenes.find(s=>s.id===artifact.sceneId)?.reservedRegions||[];
    const findings=await page.evaluate(({graph,options,regions})=>{
      const issues=new Set<string>(),stage=document.getElementById('stage')!;
      const readable=new Map<string,{count:number;words:number}>();
      const render=(window as unknown as {renderGraph:(g:typeof graph,f:number,o:typeof options)=>string}).renderGraph;
      const overlap=(a:DOMRect,b:{x:number;y:number;width:number;height:number})=>Math.min(a.right,b.x+b.width)-Math.max(a.left,b.x)>2&&Math.min(a.bottom,b.y+b.height)-Math.max(a.top,b.y)>2;
      for(let frame=0;frame<options.durationFrames;frame++){
        stage.innerHTML=render(graph,frame,options);
        const texts=Array.from(stage.querySelectorAll<SVGTextElement>('text'));
        const isVisible=(t:Element)=>{let el:Element|null=t;let opacity=1;while(el&&el!==stage){opacity*=Number(el.getAttribute('opacity')||1);el=el.parentElement;}return opacity>0.15;};
        const visible=texts.filter(isVisible);
        // Inspect actual drawable leaves as well as text; paths/shapes can leave
        // the frame or cover protected areas even when their labels fit.
        for(const el of Array.from(stage.querySelectorAll<SVGGraphicsElement>('[data-node-id] > path, [data-node-id] > rect, [data-node-id] > ellipse, [data-node-id] > polygon, [data-node-id] > image'))){
          if(!isVisible(el))continue;
          const r=el.getBoundingClientRect(),id=el.parentElement?.getAttribute('data-node-id');
          if(r.left<options.width*0.04-1||r.right>options.width*0.96+1||r.top<options.height*0.06-1||r.bottom>options.height*0.82+1)issues.add(`${id}: diagram geometry leaves the safe area during animation`);
          if(regions.some(region=>overlap(r,region)))issues.add(`${id}: diagram geometry overlaps a protected scene region`);
        }
        for(const t of visible){
          const key=t.dataset.textNode||'';const read=readable.get(key)||{count:0,words:(t.textContent||'').trim().split(/\s+/u).length};read.count++;readable.set(key,read);
          const box=t.getBBox(),x=Number(t.dataset.layoutX),y=Number(t.dataset.layoutY),w=Number(t.dataset.layoutWidth),h=Number(t.dataset.layoutHeight),id=t.dataset.textNode;
          if(box.x<x-1||box.y<y-2||box.x+box.width>x+w+1||box.y+box.height>y+h+2)issues.add(`${id}: text overflows its bounds (${box.x.toFixed(1)},${box.y.toFixed(1)},${box.width.toFixed(1)},${box.height.toFixed(1)} inside ${x},${y},${w},${h}); wrap or enlarge its box`);
          const minSize=Math.max(12,options.width*(options.height>options.width?0.026:0.016));
          if(Number(t.getAttribute('font-size'))<minSize-0.5)issues.add(`${id}: font is too small for the output format; use at least ${Math.ceil(minSize)}px`);
          const r=t.getBoundingClientRect();
          if(r.left<options.width*0.04||r.right>options.width*0.96||r.top<options.height*0.06||r.bottom>options.height*0.82)issues.add(`${id}: readable content leaves the safe area during animation`);
          if(regions.some(region=>overlap(r,region)))issues.add(`${id}: text overlaps a protected scene region`);
        }
        for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){
          const a=visible[i].getBoundingClientRect(),b=visible[j].getBoundingClientRect();
          if(overlap(a,b))issues.add(`${visible[i].dataset.textNode}/${visible[j].dataset.textNode}: readable text overlaps`);
        }
        if(issues.size>=16)break;
      }
      if (!readable.size && graph.nodes.some(n=>n.kind==='text'||n.kind==='metric')) issues.add('The composition has no readable visible text');
      for (const [id,read] of readable) if (read.count/options.fps < Math.min(options.durationFrames/options.fps*0.7,Math.max(0.65,read.words/3.5))) issues.add(`${id}: reveal earlier and hold longer for reading`);
      return [...issues];
    },{graph,options,regions});
    signal.throwIfAborted();return findings;
  } finally { signal.removeEventListener('abort',aborted);await browser.close(); }
}
