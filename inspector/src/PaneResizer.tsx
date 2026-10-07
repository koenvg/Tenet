import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';

export default function PaneResizer({ value, min, max, label, controls, unit = 'pixels', onValueChange }: {
  value: number; min: number; max: number; label: string; controls: string; unit?: 'pixels' | 'percent'; onValueChange?: (value: number) => void;
}) {
  const [position, setPosition] = useState(value), [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; value: number; width: number } | null>(null);
  useEffect(() => { setPosition(value); }, [value]);
  function change(next: number) {
    const clamped = Math.min(max, Math.max(min, Math.round(next)));
    setPosition(clamped); onValueChange?.(clamped);
  }
  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.isPrimary === false || drag.current) return;
    const width = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0;
    if (unit === 'percent' && width <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault(); event.currentTarget.focus();
    drag.current = { id: event.pointerId, x: event.clientX, value: position, width }; setDragging(true);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const delta = event.clientX - current.x;
    change(current.value + (unit === 'percent' ? delta / current.width * 100 : delta));
  }
  function stop(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerId !== drag.current?.id) return;
    drag.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keydown(event: KeyboardEvent<HTMLDivElement>) {
    const step = (unit === 'pixels' ? 10 : 1) * (event.shiftKey ? 5 : 1);
    const next = event.key === 'ArrowLeft' ? position - step : event.key === 'ArrowRight' ? position + step : event.key === 'Home' ? min : event.key === 'End' ? max : null;
    if (next === null) return;
    event.preventDefault(); change(next);
  }
  return <div className={`pane-resizer ${dragging ? 'dragging' : ''}`} role="separator" tabIndex={0}
    aria-label={label} aria-controls={controls} aria-orientation="vertical"
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={position} aria-valuetext={`${position} ${unit}`}
    title={`${label}. Drag or use Left and Right arrows. Home and End set the limits.`}
    onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}
    onLostPointerCapture={() => { drag.current = null; setDragging(false); }} onKeyDown={keydown} />;
}
