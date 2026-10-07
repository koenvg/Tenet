import { useEffect, useRef, useState, type RefObject } from 'react';

export function useKeyMotion(hero: RefObject<HTMLElement | null>) {
  const [ready, setReady] = useState(false);
  const [playback, setPlayback] = useState({ motion: 'static', controlLabel: 'Replay animation' });
  const [announcement, setAnnouncement] = useState('');
  const actions = useRef<{ press: () => void; toggle: () => void } | null>(null);
  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    if (!ready || !hero.current) return;
    const root = hero.current;
    const key = root.querySelector<SVGElement>('[data-key]')!;
    const shadow = root.querySelector<SVGElement>('[data-key-shadow]')!;
    const blocked = root.querySelector<SVGElement>('[data-blocked]')!;
    const status = root.querySelector<HTMLElement>('[data-hero-status]')!;
    const illustration = root.querySelector<SVGElement>('.keypress-art')!;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const duration = 4, pressDuration = .48;
    let pressElapsed = pressDuration, pressFrom = 42, keyPosition = 42, attempts = 0;
    let elapsed = reducedMotion.matches ? duration : 0, paused = false, visible = false;
    let frame: number | null = null, lastTime: number | null = null;
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;
    const ease = (value: number) => 1 - (1 - clamp(value)) ** 3;
    function render() {
      const progress = ease(elapsed / 1.7), settling = Math.max(0, elapsed - 1.7);
      const recoil = elapsed < duration ? Math.sin(settling * 8) * Math.exp(-settling * 4) * 8 : 0;
      const push = clamp(pressElapsed / pressDuration);
      keyPosition = pressElapsed < pressDuration
        ? push < .3 ? mix(pressFrom, 60, ease(push / .3)) : mix(60, 42, ease((push - .3) / .7))
        : mix(-20, 42, progress) + recoil;
      // Both the intro and attempted press stop above the plate. No action runs.
      key.setAttribute('transform', `translate(0 ${keyPosition.toFixed(2)})`);
      const pressure = clamp((keyPosition - 42) / 18);
      shadow.setAttribute('opacity', (mix(.2, .45, progress) + pressure * .15).toFixed(2));
      blocked.setAttribute('opacity', clamp((elapsed - 1.5) / .25).toFixed(2));
      status.style.opacity = String(clamp((elapsed - 2.3) / .5));
    }
    function updateControl() {
      const complete = elapsed >= duration && pressElapsed >= pressDuration;
      setPlayback({ motion: complete ? 'finished' : paused ? 'paused' : 'playing',
        controlLabel: complete ? 'Replay animation' : paused ? 'Resume animation' : 'Pause animation' });
    }
    function stopFrame() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; lastTime = null;
    }
    function canPlay() {
      return !paused && visible && !document.hidden && (elapsed < duration || pressElapsed < pressDuration);
    }
    function tick(now: number) {
      frame = null;
      if (!canPlay()) { lastTime = null; return; }
      if (lastTime !== null) {
        const delta = (now - lastTime) / 1000;
        elapsed = Math.min(duration, elapsed + delta);
        pressElapsed = Math.min(pressDuration, pressElapsed + delta);
      }
      lastTime = now; render();
      if (elapsed >= duration && pressElapsed >= pressDuration) { updateControl(); lastTime = null; }
      else frame = requestAnimationFrame(tick);
    }
    function syncPlayback() {
      if (!canPlay()) stopFrame();
      else if (frame === null) frame = requestAnimationFrame(tick);
    }
    actions.current = {
      press() {
        stopFrame(); pressFrom = keyPosition; elapsed = duration;
        pressElapsed = reducedMotion.matches ? pressDuration : 0;
        paused = false; attempts++;
        setAnnouncement(`Attempt ${attempts} blocked by your example rule. No action was executed.`);
        render(); updateControl(); syncPlayback();
      },
      toggle() {
        if (elapsed >= duration && pressElapsed >= pressDuration) { elapsed = 0; paused = false; lastTime = null; render(); }
        else paused = !paused;
        updateControl(); syncPlayback();
      },
    };
    function motionChanged() {
      if (reducedMotion.matches) {
        elapsed = duration; pressElapsed = pressDuration; paused = false;
        stopFrame(); render(); updateControl();
      }
      // Disabling reduced motion does not restart the scene.
    }
    reducedMotion.addEventListener('change', motionChanged);
    const observer = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; syncPlayback(); });
    observer.observe(illustration);
    document.addEventListener('visibilitychange', syncPlayback);
    window.addEventListener('pagehide', stopFrame);
    window.addEventListener('pageshow', syncPlayback);
    render(); updateControl();
    return () => {
      stopFrame(); observer.disconnect(); actions.current = null;
      reducedMotion.removeEventListener('change', motionChanged);
      document.removeEventListener('visibilitychange', syncPlayback);
      window.removeEventListener('pagehide', stopFrame);
      window.removeEventListener('pageshow', syncPlayback);
    };
  }, [ready, hero]);
  return { ready, ...playback, announcement, press: () => actions.current?.press(), toggle: () => actions.current?.toggle() };
}
