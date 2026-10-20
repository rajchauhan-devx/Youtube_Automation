import type { DocumentarySpec } from '@tubeflow/editing-contracts';

type Layer = DocumentarySpec['layers'][number];
/** Shared deterministic camera transform for documentary image layers. */
export function imageMotionAt(layer: Layer, progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  const eased = t * t * (3 - 2 * t);
  const amount = layer.strength ?? 0.055;
  const focus = layer.focus || { x: 0.5, y: 0.5 };
  const pull = layer.motion === 'pull-out';
  const zoom = ['push-in', 'pull-out', 'diagonal-in', 'focus-in'].includes(layer.motion);
  const scale = zoom ? 1 + amount * (pull ? 1 - eased : eased) : 1;
  // Legacy horizontal drifts retain their original travel unless explicitly tuned.
  const travel = layer.strength ?? 0.025;
  const x = layer.motion === 'drift-left' ? -travel * eased : layer.motion === 'drift-right' ? travel * eased
    : layer.motion === 'diagonal-in' ? -amount * 0.3 * eased : 0;
  const y = layer.motion === 'drift-up' ? -travel * eased : layer.motion === 'drift-down' ? travel * eased
    : layer.motion === 'diagonal-in' ? -amount * 0.3 * eased : 0;
  return { scale, x, y, originX: layer.motion === 'focus-in' ? focus.x : 0.5, originY: layer.motion === 'focus-in' ? focus.y : 0.5 };
}
