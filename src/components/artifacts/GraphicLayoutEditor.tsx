import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { graphicSafeArea } from '@tubeflow/video-composition';
import type { MotionGraphicSpec } from '@tubeflow/editing-contracts';

type Bounds = MotionGraphicSpec['bounds'];
type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';
type Props = { graphic: MotionGraphicSpec; width: number; height: number; onChange: (bounds: Bounds) => void; onPause: () => void };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function GraphicLayoutEditor({ graphic, width, height, onChange, onPause }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; handle: Handle; x: number; y: number; bounds: Bounds; scaleX: number; scaleY: number }>();
  const safe = graphic.composition?.layout === 'cutaway' ? { x: 0, y: 0, width, height } : graphicSafeArea(width, height);
  const b = graphic.bounds;
  function change(start: Bounds, handle: Handle, dx: number, dy: number) {
    if (handle === 'move') {
      onChange({ ...start, x: clamp(start.x + dx, safe.x, safe.x + safe.width - start.width), y: clamp(start.y + dy, safe.y, safe.y + safe.height - start.height) });
      return;
    }
    const minW = Math.min(start.width, width * 0.06), minH = Math.min(start.height, height * 0.025);
    const left = handle.includes('w') ? clamp(start.x + dx, safe.x, start.x + start.width - minW) : start.x;
    const top = handle.includes('n') ? clamp(start.y + dy, safe.y, start.y + start.height - minH) : start.y;
    const right = handle.includes('e') ? clamp(start.x + start.width + dx, left + minW, safe.x + safe.width) : start.x + start.width;
    const bottom = handle.includes('s') ? clamp(start.y + start.height + dy, top + minH, safe.y + safe.height) : start.y + start.height;
    onChange({ x: left, y: top, width: right - left, height: bottom - top });
  }
  function down(event: PointerEvent<HTMLElement>, handle: Handle) {
    if (event.button !== 0 || drag.current || !stage.current) return;
    event.preventDefault(); event.stopPropagation(); onPause();
    event.currentTarget.focus();
    const rect = stage.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    drag.current = { pointer: event.pointerId, handle, x: event.clientX, y: event.clientY, bounds: { ...b }, scaleX: width / rect.width, scaleY: height / rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    change(current.bounds, current.handle, (event.clientX - current.x) * current.scaleX, (event.clientY - current.y) * current.scaleY);
  }
  function key(event: KeyboardEvent<HTMLElement>, handle: Handle) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); onPause();
    const step = event.shiftKey ? 10 : 1;
    change(b, handle, event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
  }
  const events = (handle: Handle) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => down(event, handle), onPointerMove: move,
    onPointerUp: () => { drag.current = undefined; },
    onPointerCancel: () => { if (drag.current) onChange(drag.current.bounds); drag.current = undefined; },
    onLostPointerCapture: () => { drag.current = undefined; },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => key(event, handle),
  });
  return <div ref={stage} className="pointer-events-none absolute inset-0 z-10" aria-label="Graphic layout editor">
    <div className="absolute border border-dashed border-sky-300/40" style={{ left: `${safe.x / width * 100}%`, top: `${safe.y / height * 100}%`, width: `${safe.width / width * 100}%`, height: `${safe.height / height * 100}%` }} />
    <div role="button" tabIndex={0} aria-label="Move selected graphic" className="pointer-events-auto absolute cursor-move border-2 border-amber-300 outline-none focus:ring-2 focus:ring-white" style={{ left: `${b.x / width * 100}%`, top: `${b.y / height * 100}%`, width: `${b.width / width * 100}%`, height: `${b.height / height * 100}%`, touchAction: 'none' }} {...events('move')}>
      <span className="pointer-events-none absolute left-0 top-0 max-w-full truncate bg-amber-300 px-1 text-[10px] text-black">{graphic.title}</span>
    </div>
    {(['nw', 'ne', 'sw', 'se'] as const).map(handle => <button key={handle} type="button" aria-label={`Resize graphic ${handle}`} className="pointer-events-auto absolute h-4 w-4 rounded-sm border border-black bg-amber-200 focus:ring-2 focus:ring-white" style={{
      left: `${(b.x + (handle.includes('e') ? b.width : 0)) / width * 100}%`, top: `${(b.y + (handle.includes('s') ? b.height : 0)) / height * 100}%`,
      transform: 'translate(-50%, -50%)', cursor: handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize', touchAction: 'none',
    }} {...events(handle)} />)}
  </div>;
}
