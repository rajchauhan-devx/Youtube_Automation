import type { PathCommandType, PointType } from "@tubeflow/editing-contracts";

/** Convert PathCommand array into standard SVG 'd' path string */
export function commandsToSvgPath(commands: PathCommandType[]): string {
  const parts: string[] = [];
  for (const cmd of commands) {
    switch (cmd.op) {
      case "M":
        parts.push(`M ${cmd.x} ${cmd.y}`);
        break;
      case "L":
        parts.push(`L ${cmd.x} ${cmd.y}`);
        break;
      case "Q":
        parts.push(`Q ${cmd.x1} ${cmd.y1} ${cmd.x} ${cmd.y}`);
        break;
      case "C":
        parts.push(`C ${cmd.x1} ${cmd.y1} ${cmd.x2} ${cmd.y2} ${cmd.x} ${cmd.y}`);
        break;
      case "Z":
        parts.push("Z");
        break;
    }
  }
  return parts.join(" ");
}

/** Convert array of points to SVG polygon 'points' attribute */
export function pointsToSvg(points: PointType[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

/** Compute connector path between two coordinates with specific routing */
export function computeConnectorPath(
  from: PointType,
  to: PointType,
  route: "line" | "elbow" | "curve"
): string {
  if (route === "line") {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }
  if (route === "elbow") {
    const midX = (from.x + to.x) / 2;
    return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
  }
  // Smooth cubic bezier curve
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const cx1 = from.x + dx * 0.5;
  const cy1 = from.y;
  const cx2 = from.x + dx * 0.5;
  const cy2 = to.y;
  return `M ${from.x} ${from.y} C ${cx1} ${cy1} ${cx2} ${cy2} ${to.x} ${to.y}`;
}
