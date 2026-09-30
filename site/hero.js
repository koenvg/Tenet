(() => {
  const hero = document.querySelector("[data-keypress]");
  if (!hero) return;

  const key = hero.querySelector("[data-key]");
  const shadow = hero.querySelector("[data-key-shadow]");
  const blocked = hero.querySelector("[data-blocked]");
  const status = hero.querySelector("[data-hero-status]");
  const control = hero.querySelector("[data-motion-control]");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const duration = 4;
  const pressDuration = 0.48;
  const announcement = hero.querySelector("[data-press-announcement]");
  const illustration = hero.querySelector(".keypress-art");
  const pressControl = document.createElement("button");
  pressControl.type = "button";
  pressControl.className = "key-button";
  pressControl.setAttribute("aria-label", "Try pressing delete");
  pressControl.setAttribute("aria-describedby", "example-rule keypress-description");
  pressControl.title = "Try pressing the key";
  illustration.before(pressControl);
  pressControl.append(illustration);
  let pressElapsed = pressDuration;
  let pressFrom = 42;
  let keyPosition = 42;
  let attempts = 0;
  let elapsed = reducedMotion.matches ? duration : 0;
  let paused = false;
  let visible = false;
  let frame = null;
  let lastTime = null;

  const clamp = (value) => Math.min(1, Math.max(0, value));
  const mix = (from, to, progress) => from + (to - from) * progress;
  const ease = (value) => 1 - (1 - clamp(value)) ** 3;

  function render() {
    const press = ease(elapsed / 1.7);
    const settling = Math.max(0, elapsed - 1.7);
    const recoil = elapsed < duration
      ? Math.sin(settling * 8) * Math.exp(-settling * 4) * 8 : 0;
    const push = clamp(pressElapsed / pressDuration);
    if (pressElapsed < pressDuration) {
      keyPosition = push < 0.3
        ? mix(pressFrom, 60, ease(push / 0.3))
        : mix(60, 42, ease((push - 0.3) / 0.7));
    } else keyPosition = mix(-20, 42, press) + recoil;
    // A click also stops above the plate. It never executes the depicted action.
    key.setAttribute("transform", `translate(0 ${keyPosition.toFixed(2)})`);
    const pressure = clamp((keyPosition - 42) / 18);
    shadow.setAttribute("opacity", (mix(0.2, 0.45, press) + pressure * 0.15).toFixed(2));
    blocked.setAttribute("opacity", clamp((elapsed - 1.5) / 0.25).toFixed(2));
    status.style.opacity = clamp((elapsed - 2.3) / 0.5);
  }

  function updateControl() {
    const complete = elapsed >= duration && pressElapsed >= pressDuration;
    control.textContent = complete ? "Replay animation" : paused ? "Resume animation" : "Pause animation";
    hero.dataset.motion = complete ? "finished" : paused ? "paused" : "playing";
  }

  function stopFrame() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastTime = null;
  }

  function canPlay() {
    return !paused && visible && !document.hidden && (elapsed < duration || pressElapsed < pressDuration);
  }

  function tick(now) {
    frame = null;
    if (!canPlay()) { lastTime = null; return; }
    if (lastTime !== null) {
      const delta = (now - lastTime) / 1000;
      elapsed = Math.min(duration, elapsed + delta);
      pressElapsed = Math.min(pressDuration, pressElapsed + delta);
    }
    lastTime = now;
    render();
    if (elapsed >= duration && pressElapsed >= pressDuration) { updateControl(); lastTime = null; }
    else frame = requestAnimationFrame(tick);
  }

  function syncPlayback() {
    if (!canPlay()) stopFrame();
    else if (frame === null) frame = requestAnimationFrame(tick);
  }

  pressControl.addEventListener("click", () => {
    stopFrame();
    pressFrom = keyPosition;
    elapsed = duration;
    pressElapsed = reducedMotion.matches ? pressDuration : 0;
    paused = false;
    attempts += 1;
    announcement.textContent = `Attempt ${attempts} blocked by your example rule. No action was executed.`;
    render();
    updateControl();
    syncPlayback();
  });

  control.addEventListener("click", () => {
    if (elapsed >= duration && pressElapsed >= pressDuration) {
      elapsed = 0;
      paused = false;
      lastTime = null;
      render();
    } else paused = !paused;
    updateControl();
    syncPlayback();
  });

  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) {
      elapsed = duration;
      pressElapsed = pressDuration;
      paused = false;
      stopFrame();
      render();
      updateControl();
    }
    // Disabling reduced motion does not unexpectedly restart the scene.
  });
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    syncPlayback();
  }).observe(illustration);
  document.addEventListener("visibilitychange", syncPlayback);
  window.addEventListener("pagehide", stopFrame);
  window.addEventListener("pageshow", syncPlayback);

  render();
  updateControl();
  control.hidden = false;
})();
