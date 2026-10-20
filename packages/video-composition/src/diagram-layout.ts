import type { DocumentarySpec } from '@tubeflow/editing-contracts';
import { graphicSafeArea } from './graphics.js';

/** Reflow the visual, numbered anchors, leaders and annotation cards as a unit.
 * No text is scaled with the source image; both orientations reserve caption/UI space. */
export function diagramLayout(width: number, height: number, diagram: NonNullable<DocumentarySpec['diagram']>,
  source: { width: number; height: number }) {
  const portrait = height > width, safe = portrait
    ? { x: width * 0.06, y: height * 0.07, width: width * 0.78, height: height * 0.68 }
    : graphicSafeArea(width, height);
  const gap = Math.min(width, height) * 0.022, rows = portrait ? Math.ceil(diagram.labels.length / 2) : diagram.labels.length;
  const fontSize = Math.min(width, height) * 0.034;
  const pane = portrait
    ? { x: safe.x, y: safe.y, width: safe.width, height: safe.height * (rows > 2 ? 0.48 : 0.62) }
    : { x: safe.x, y: safe.y, width: safe.width * 0.59, height: safe.height * 0.84 };
  const labelArea = portrait
    ? { x: safe.x, y: pane.y + pane.height + gap, width: safe.width, height: safe.height - pane.height - gap }
    : { x: pane.x + pane.width + gap, y: safe.y, width: safe.width - pane.width - gap, height: safe.height * 0.84 };
  const crop = diagram.sourceCrop;
  const scale = Math.min(pane.width / (source.width * crop.width), pane.height / (source.height * crop.height));
  const image = { x: pane.x + (pane.width - source.width * crop.width * scale) / 2,
    y: pane.y + (pane.height - source.height * crop.height * scale) / 2,
    width: source.width * crop.width * scale, height: source.height * crop.height * scale };
  const columns = portrait && diagram.labels.length > 1 ? 2 : 1;
  const cardWidth = (labelArea.width - gap * (columns - 1)) / columns;
  const cardHeight = (labelArea.height - gap * (rows - 1)) / rows;
  const cards = diagram.labels.map((label, i) => ({
    ...label, x: labelArea.x + (i % columns) * (cardWidth + gap),
    y: labelArea.y + Math.floor(i / columns) * (cardHeight + gap), width: cardWidth, height: cardHeight,
    point: { x: image.x + label.anchor.x * image.width, y: image.y + label.anchor.y * image.height },
  }));
  return { portrait, safe, image, cards, fontSize, scale };
}
