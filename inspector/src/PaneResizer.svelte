<script lang="ts">
  export let value: number;
  export let min: number;
  export let max: number;
  export let label: string;
  export let controls: string;
  export let unit: 'pixels' | 'percent' = 'pixels';
  let pointerId: number | null = null;
  let startX = 0, startValue = 0, containerWidth = 0;
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)));
  function start(event: PointerEvent) {
    if (event.button !== 0 || event.isPrimary === false || pointerId !== null) return;
    const target = event.currentTarget as HTMLElement;
    containerWidth = target.parentElement?.getBoundingClientRect().width ?? 0;
    if (unit === 'percent' && containerWidth <= 0) return;
    target.setPointerCapture(event.pointerId);
    event.preventDefault(); target.focus();
    pointerId = event.pointerId; startX = event.clientX; startValue = value;
  }
  function move(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    const delta = event.clientX - startX;
    value = clamp(startValue + (unit === 'percent' ? delta / containerWidth * 100 : delta));
  }
  function stop(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  }
  function keydown(event: KeyboardEvent) {
    const step = (unit === 'pixels' ? 10 : 1) * (event.shiftKey ? 5 : 1);
    const next = event.key === 'ArrowLeft' ? value - step : event.key === 'ArrowRight' ? value + step
      : event.key === 'Home' ? min : event.key === 'End' ? max : null;
    if (next === null) return;
    event.preventDefault(); value = clamp(next);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions (WAI-ARIA adjustable window splitter: focusable separator with arrow-key controls and range values.) -->
<div class="pane-resizer" class:dragging={pointerId !== null} role="separator" tabindex="0"
  aria-label={label} aria-controls={controls} aria-orientation="vertical"
  aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${value} ${unit}`}
  title={`${label}. Drag or use Left and Right arrows. Home and End set the limits.`}
  on:pointerdown={start} on:pointermove={move} on:pointerup={stop} on:pointercancel={stop}
  on:lostpointercapture={() => pointerId = null} on:keydown={keydown}></div>

<style>
  .pane-resizer { position: relative; min-height: 0; align-self: stretch; cursor: col-resize; touch-action: none; user-select: none; background: #f3f5f8; border-inline: 1px solid #d9dfe6; }
  .pane-resizer::after { content: ''; position: absolute; left: 50%; top: 50%; width: 3px; height: 28px; border-radius: 2px; background: #96a6b8; transform: translate(-50%, -50%); }
  .pane-resizer:hover, .pane-resizer:focus-visible, .pane-resizer.dragging { background: #e5eefb; }
  .pane-resizer:hover::after, .pane-resizer:focus-visible::after, .pane-resizer.dragging::after { background: #285fa6; }
  .pane-resizer:focus-visible { outline: 2px solid #285fa6; outline-offset: -2px; z-index: 1; }
  @media (max-width: 1100px) { .pane-resizer { display: none; } }
</style>
