import type {
  SceneGraphData,
  SceneGraphNodeData,
  MetricNode,
} from "@tubeflow/editing-contracts";
import { commandsToSvgPath, pointsToSvg, computeConnectorPath } from "./geometry.js";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface CompileSceneGraphOptions {
  artifactId: string;
  startSec: number;
  durationSec: number;
  fps: number;
  projectWidth: number;
  projectHeight: number;
  assetUrlResolver?: (assetId: string) => string;
}

export function compileSceneGraph(
  graph: SceneGraphData,
  opts: CompileSceneGraphOptions
): { html: string; css: string; js: string } {
  const rootId = `sg-${opts.artifactId}`;
  const theme = graph.theme || {
    name: "default",
    primary: "#F07835",
    accent: "#FFE600",
    background: "rgba(15, 23, 42, 0.94)",
    text: "#FFFFFF",
    fontFamily: "'Montserrat', 'Inter', sans-serif",
    secondaryFont: "'JetBrains Mono', monospace",
    lineWeight: 2,
    radius: 6,
  };

  const svgNodes: string[] = [];
  const htmlNodes: string[] = [];
  const cssRules: string[] = [];
  const jsLines: string[] = [];

  // Container styling
  cssRules.push(`
    #${rootId}.scene-graph-container {
      position: absolute;
      left: ${graph.bounds.x}px;
      top: ${graph.bounds.y}px;
      width: ${graph.bounds.width}px;
      height: ${graph.bounds.height}px;
      pointer-events: none;
      z-index: 30;
      opacity: 0;
      font-family: ${theme.fontFamily};
    }
    #${rootId} .sg-svg-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      filter: drop-shadow(0 2px 8px rgba(0,0,0,0.75));
    }
  `);

  // Node position map for connectors
  const nodeCenters = new Map<string, { x: number; y: number }>();
  for (const node of graph.nodes) {
    if ("bounds" in node && node.bounds) {
      nodeCenters.set(node.id, {
        x: node.bounds.x + node.bounds.width / 2,
        y: node.bounds.y + node.bounds.height / 2,
      });
    }
  }

  // Compile each node
  for (const node of graph.nodes) {
    const nodeId = `${rootId}-node-${node.id}`;

    if (node.kind === "shape") {
      const g = node.geometry;
      const p = node.paint;
      const fill = p.fill || "none";
      const stroke = p.stroke || "none";
      const strokeWidth = p.strokeWidth ?? theme.lineWeight;
      const dash = p.dash?.length ? `stroke-dasharray="${p.dash.join(" ")}"` : "";

      if (g.kind === "rect") {
        svgNodes.push(
          `<rect id="${nodeId}" class="sg-node" x="${g.bounds.x}" y="${g.bounds.y}" width="${g.bounds.width}" height="${g.bounds.height}" rx="${g.radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${dash} />`
        );
      } else if (g.kind === "ellipse") {
        const cx = g.bounds.x + g.bounds.width / 2;
        const cy = g.bounds.y + g.bounds.height / 2;
        const rx = g.bounds.width / 2;
        const ry = g.bounds.height / 2;
        svgNodes.push(
          `<ellipse id="${nodeId}" class="sg-node" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${dash} />`
        );
      } else if (g.kind === "polygon") {
        svgNodes.push(
          `<polygon id="${nodeId}" class="sg-node" points="${pointsToSvg(g.points)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${dash} />`
        );
      }
    } else if (node.kind === "path") {
      const p = node.paint;
      const fill = p.fill || "none";
      const stroke = p.stroke || "none";
      const strokeWidth = p.strokeWidth ?? theme.lineWeight;
      const dash = p.dash?.length ? `stroke-dasharray="${p.dash.join(" ")}"` : "";
      const d = commandsToSvgPath(node.commands);
      svgNodes.push(
        `<path id="${nodeId}" class="sg-node" d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${dash} />`
      );
    } else if (node.kind === "connector") {
      let fromPt = { x: 0, y: 0 };
      let toPt = { x: 100, y: 100 };

      if (node.from.kind === "screen") fromPt = node.from.point;
      else if (node.from.kind === "node" && nodeCenters.has(node.from.nodeId)) {
        fromPt = nodeCenters.get(node.from.nodeId)!;
      }

      if (node.to.kind === "screen") toPt = node.to.point;
      else if (node.to.kind === "node" && nodeCenters.has(node.to.nodeId)) {
        toPt = nodeCenters.get(node.to.nodeId)!;
      }

      const d = computeConnectorPath(fromPt, toPt, node.route);
      const p = node.paint;
      const stroke = p.stroke || theme.primary;
      const strokeWidth = p.strokeWidth ?? theme.lineWeight;
      const dash = p.dash?.length ? `stroke-dasharray="${p.dash.join(" ")}"` : "";
      svgNodes.push(
        `<path id="${nodeId}" class="sg-node sg-connector" d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" ${dash} stroke-linecap="round" />`
      );
    } else if (node.kind === "text") {
      const st = node.style;
      cssRules.push(`
        #${nodeId} {
          position: absolute;
          left: ${node.bounds.x}px;
          top: ${node.bounds.y}px;
          width: ${node.bounds.width}px;
          color: ${st.color || theme.text};
          font-size: ${st.fontSize}px;
          font-weight: ${st.fontWeight};
          text-align: ${st.align};
          line-height: ${st.lineHeight};
          text-shadow: 0 2px 8px rgba(0,0,0,0.9);
          letter-spacing: 0.04em;
          ${st.background ? `background: ${st.background}; padding: 4px 8px; border-radius: 4px;` : ""}
        }
      `);
      htmlNodes.push(
        `<div id="${nodeId}" class="sg-node sg-text">${escapeHtml(node.text)}</div>`
      );
    } else if (node.kind === "metric") {
      const m = node;
      cssRules.push(`
        #${nodeId} {
          position: absolute;
          left: ${m.bounds.x}px;
          top: ${m.bounds.y}px;
          width: ${m.bounds.width}px;
          font-family: ${theme.secondaryFont || theme.fontFamily};
        }
        #${nodeId} .sg-metric-val {
          font-size: ${m.style.fontSize || 36}px;
          font-weight: ${m.style.fontWeight || "900"};
          color: ${m.style.color || theme.primary};
          line-height: 1.1;
          text-shadow: 0 2px 12px rgba(0,0,0,0.9);
          letter-spacing: -0.02em;
        }
        #${nodeId} .sg-metric-unit {
          font-size: ${Math.round((m.style.fontSize || 36) * 0.55)}px;
          color: ${theme.accent};
          margin-left: 4px;
        }
        #${nodeId} .sg-metric-label {
          font-size: 11px;
          font-weight: 700;
          color: ${theme.text};
          opacity: 0.85;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-top: 2px;
        }
      `);
      htmlNodes.push(`
        <div id="${nodeId}" class="sg-node sg-metric">
          <div class="sg-metric-val">
            ${m.prefix ? `<span>${escapeHtml(m.prefix)}</span>` : ""}
            <span id="${nodeId}-num">${m.startValue}</span>
            ${m.unit ? `<span class="sg-metric-unit">${escapeHtml(m.unit)}</span>` : ""}
            ${m.suffix ? `<span>${escapeHtml(m.suffix)}</span>` : ""}
          </div>
          ${m.label ? `<div class="sg-metric-label">${escapeHtml(m.label)}</div>` : ""}
        </div>
      `);

      // Odometer number animation
      const countDuration = Math.max(0.6, opts.durationSec * 0.5);
      const varId = node.id.replace(/[^a-zA-Z0-9_]/g, '_');
      jsLines.push(`
        const mObj_${varId} = { val: ${m.startValue} };
        tl.to(mObj_${varId}, {
          val: ${m.targetValue},
          duration: ${countDuration},
          ease: "power2.out",
          onUpdate: function() {
            const el = document.getElementById("${nodeId}-num");
            if (el) el.textContent = mObj_${varId}.val.toFixed(${m.decimals});
          }
        }, ${opts.startSec + 0.2});
      `);
    }

    // Process node animation tracks
    if (node.tracks && node.tracks.length > 0) {
      for (const track of node.tracks) {
        const kfs = track.keyframes;
        if (kfs.length >= 2) {
          const prop = track.property === "strokeProgress" ? "strokeDashoffset" : track.property;
          const fromVal = kfs[0].value;
          const toVal = kfs[1].value;
          const trackStartSec = opts.startSec + kfs[0].frame / opts.fps;
          const trackDurationSec = Math.max(0.1, (kfs[1].frame - kfs[0].frame) / opts.fps);
          
          let easeStr = "power2.out";
          if (kfs[1].easing.kind === "linear") easeStr = "none";
          else if (kfs[1].easing.kind === "spring") easeStr = "back.out(1.7)";

          jsLines.push(`
            tl.fromTo("#${nodeId}",
              { ${prop}: ${fromVal} },
              { ${prop}: ${toVal}, duration: ${trackDurationSec}, ease: "${easeStr}" },
              ${trackStartSec}
            );
          `);
        }
      }
    }
  }

  // Master entrance & exit for container
  jsLines.unshift(`
    // SceneGraph Entrance
    tl.fromTo("#${rootId}",
      { opacity: 0, scale: 0.96 },
      { opacity: 1, scale: 1, duration: 0.35, ease: "power2.out" },
      ${opts.startSec}
    );
  `);
  jsLines.push(`
    // SceneGraph Exit
    tl.to("#${rootId}",
      { opacity: 0, scale: 0.96, duration: 0.25, ease: "power2.in" },
      ${opts.startSec + opts.durationSec - 0.25}
    );
  `);

  const html = `
    <div id="${rootId}" class="scene-graph-container" data-start="${opts.startSec}" data-duration="${opts.durationSec}">
      <svg class="sg-svg-canvas" viewBox="0 0 ${graph.bounds.width} ${graph.bounds.height}">
        ${svgNodes.join("\n        ")}
      </svg>
      <div class="sg-html-layer">
        ${htmlNodes.join("\n        ")}
      </div>
    </div>
  `;

  return {
    html,
    css: cssRules.join("\n"),
    js: jsLines.join("\n"),
  };
}
