import type { SceneGraphData } from '@tubeflow/editing-contracts';
import { renderSceneGraphSvg, type SceneGraphRenderOptions } from './runtime.js';

export interface CompileSceneGraphOptions {
  artifactId: string;
  startSec: number;
  durationSec: number;
  fps: number;
  projectWidth: number;
  projectHeight: number;
  assetUrlResolver?: (assetId: string) => string;
  fonts?: Record<string, string>;
  imageSizes?: SceneGraphRenderOptions['imageSizes'];
  motion?: SceneGraphRenderOptions['motion'];
}
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** GSAP writes a frame property; its setter evaluates the shared renderer even
 * during seek(time, true), when timeline callbacks are suppressed. */
export function compileSceneGraph(graph: SceneGraphData, opts: CompileSceneGraphOptions): { html: string; css: string; js: string } {
  const rootId = `sg-${opts.artifactId}`;
  const assets = Object.fromEntries(graph.nodes.filter(n => n.kind === 'image').map(n => [n.assetId, opts.assetUrlResolver?.(n.assetId) || '']));
  const options: SceneGraphRenderOptions = { width: opts.projectWidth, height: opts.projectHeight,
    durationFrames: Math.max(1, Math.round(opts.durationSec * opts.fps)), fps: opts.fps, idPrefix: rootId, assets, fonts: opts.fonts, imageSizes: opts.imageSizes, motion: opts.motion };
  return {
    html: `<div id="${rootId}" class="scene-graph-stage">${renderSceneGraphSvg(graph, -1, options)}</div>`,
    css: `#${rootId}{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;visibility:hidden;}`,
    js: `{
      const render = ${renderSceneGraphSvg.toString()};
      const graph = ${json(graph)}, options = ${json(options)};
      const target = document.getElementById(${json(rootId)});
      let value = -1;
      const clock = {};
      Object.defineProperty(clock, 'frame', {get:()=>value,set:(frame)=>{
        value=frame;
        target.innerHTML=render(graph,Math.round(frame),options);
      }});
      tl.set(target,{visibility:'visible'},${opts.startSec});
      tl.set(target,{visibility:'hidden'},${opts.startSec + opts.durationSec});
      tl.fromTo(clock,{frame:0},{frame:options.durationFrames,duration:${opts.durationSec},ease:'none',immediateRender:false},${opts.startSec});
    }`,
  };
}
