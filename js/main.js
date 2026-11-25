/* The start of the page: connects the parts and runs one animation loop. */
(function (LG) {
  "use strict";

  const root = document.documentElement;
  const SWAY_STEPS = 8;
  const REST_FRAMES = 0.5;
  const MAX_STEP_SECONDS = 0.1;

  let before = 0;
  let swayArmed = false;
  let railLinks = [];

  function drawSway(beat, now) {
    const length = LG.tour.loopLength("sway");
    const step = LG.rhythm.position(now);
    if (!length || step < 0) return false;
    const frame = ((step % SWAY_STEPS) / SWAY_STEPS) * length;
    /* The loop starts at its first frame, so the picture does not jump. */
    if (!swayArmed && frame > 1) return false;
    swayArmed = true;
    return LG.tour.drawLoop("sway", frame, true, beat.frame);
  }

  function drawChut(beat) {
    const length = LG.tour.loopLength("chut");
    if (!length) return false;
    return LG.tour.drawLoop("chut", LG.rhythm.slider() * (length - 1), false, beat.frame);
  }

  /* Draws the picture. Returns the tour frame that the pins follow. */
  function drawStage(now) {
    const beat = LG.scroll.active();
    const loop = beat ? beat.el.dataset.loop : "";
    const atRest = Boolean(loop) && Math.abs(LG.scroll.frame() - beat.frame) < REST_FRAMES;
    if (!atRest) swayArmed = false;
    if (atRest && loop === "sway" && drawSway(beat, now)) return beat.frame;
    if (atRest && loop === "chut" && drawChut(beat)) return beat.frame;
    const frame = atRest ? beat.frame : LG.scroll.shown();
    LG.tour.draw(frame);
    return frame;
  }

  function loop(now) {
    /* The page asks for the next frame first, so one error does not stop the loop. */
    window.requestAnimationFrame(loop);
    const dt = Math.min((now - before) / 1000, MAX_STEP_SECONDS);
    before = now;
    LG.scroll.tick(dt, now);
    const frame = LG.tour.hasData ? drawStage(now) : 0;
    LG.pins.tick(frame, LG.scroll.active());
    LG.rhythm.tick(now);
    LG.present.tick(now);
  }

  function markRail(place) {
    const index = railLinks.findIndex(function (link) {
      return LG.tokens(link.dataset.places).indexOf(place) !== -1;
    });
    railLinks.forEach(function (link, i) {
      link.classList.toggle("is-current", i === index);
      if (i === index) link.setAttribute("aria-current", "step");
      else link.removeAttribute("aria-current");
    });
    const rail = LG.qs(".rail");
    if (rail && index >= 0) rail.style.setProperty("--progress", String(index / Math.max(1, railLinks.length - 1)));
  }

  function loopOf(el) {
    return el ? el.dataset.loop || "" : "";
  }

  /* The loops of this beat and of its two neighbours stay in memory. */
  function onBeat(change) {
    const el = change.beat.el;
    const wanted = [el, el.previousElementSibling, el.nextElementSibling].map(loopOf).filter(Boolean);
    LG.tour.keepLoops(wanted);
    wanted.forEach(function (id) {
      LG.tour.loadLoop(id);
    });
  }

  function boot() {
    root.classList.remove("no-js");
    root.classList.add("js");
    railLinks = LG.qsa(".rail a");
    const hasTour = LG.tour.init(LG.qs("#stage-canvas"));
    root.classList.toggle("no-tour", !hasTour);
    LG.on("place", markRail);
    LG.on("live", function () {
      root.classList.add("is-live");
    });
    LG.on("tour-lost", function () {
      root.classList.add("no-tour");
    });
    LG.on("language", LG.scroll.measure);
    if (hasTour) LG.on("beat", onBeat);
    LG.rhythm.init();
    LG.i18n.init();
    LG.map.init();
    LG.pins.init();
    LG.scroll.init();
    LG.present.init();
    window.requestAnimationFrame(loop);
  }

  boot();
})(window.LG);
