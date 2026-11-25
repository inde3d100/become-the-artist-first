/* The scroll: turns the scroll position into a tour frame and an active beat. */
(function (LG) {
  "use strict";

  const HOLD_MARGIN = 0.16;
  const TALL_HOLD_BEFORE = 0.2;
  const TALL_HOLD_AFTER = 0.1;
  /* On a tall screen a jump puts the top of the panel at this share of the screen height. */
  const TALL_LAND = 0.3;
  /* The camera stays at its stop a little past the line of a jump. A short panel then shows its own stop. */
  const TALL_LAND_HOLD = 0.24;
  const FOLLOW_SPEED = 7;
  const POINTER_SPEED = 5;
  const FADE_FROM = 0.1;
  const FADE_TO = 0.42;
  const LAYER_RANGE = 1.5;
  const GLIDE_MS_PER_PIXEL = 0.9;
  const GLIDE_MIN_MS = 900;
  const GLIDE_MAX_MS = 3200;
  /* A curtain is a dark section between two groups of beats. The camera changes its place behind it. */
  const CURTAINS = ".finale--curtain";
  const STEPS = ".beat, [data-step]";
  const PAGE_SHARE = 0.7;
  const PAGE_SLACK = 24;
  /* A panel below this share of the screen height sits in the centre of the screen. */
  const CENTRE_SHARE = 0.8;
  /* The smallest free room at the top and at the lower edge, as shares of the screen height. */
  const HEAD_ROOM = 0.08;
  const FOOT_ROOM = 0.02;
  /* The bars that lie on the page. A panel stays clear of each bar by this gap, in pixels. */
  const BARS = ".brand, .deck";
  const BAR_GAP = 4;
  const SCROLL_SLACK = 1;
  /* Below this speed, in frames for each second, the picture goes to one whole frame. */
  const REST_SPEED = 0.6;
  const SETTLE_SPEED = 12;

  const root = document.documentElement;
  const written = new Map();
  let beats = [];
  let marks = [];
  let layers = [];
  let curtains = [];
  let order = [];
  let stale = true;
  let current = 0;
  let snap = true;
  let sideBefore = -1;
  let active = null;
  let place = "";
  let glide = null;
  let wroteY = null;
  let maxScroll = 1;
  let room = { head: 0, foot: 0 };
  let progressBar = null;
  let shownFrame = 0;
  let rawBefore = 0;
  let pointer = { x: 0, y: 0, goalX: 0, goalY: 0 };

  /* A frame between two stops. The text names the first stop, the second stop and the share. */
  function between(text) {
    const parts = LG.tokens(text);
    if (parts.length < 3) return null;
    const frame = LG.lerp(LG.tour.stopFrame(parts[0]), LG.tour.stopFrame(parts[1]), Number(parts[2]));
    /* A beat rests on one whole frame, so the picture does not mix two frames. */
    return Number.isFinite(frame) ? Math.round(frame) : null;
  }

  function frameOf(el) {
    if (el.dataset.stop) return LG.tour.stopFrame(el.dataset.stop);
    const frame = between(el.dataset.between);
    return frame === null ? 0 : frame;
  }

  /* The frame where the camera enters or leaves a beat behind a curtain. The default is the frame of the beat. */
  function edgeFrame(text, frame) {
    const edge = between(text);
    return edge === null ? frame : edge;
  }

  function isTall() {
    return window.innerHeight > window.innerWidth;
  }

  function readBeat(el, index) {
    const vh = window.innerHeight;
    const rect = (LG.qs(".panel, .cover", el) || el).getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const bottom = rect.bottom + window.scrollY;
    const margin = Math.min((bottom - top) * 0.3, vh * HOLD_MARGIN);
    const tall = isTall() && index > 0;
    const frame = frameOf(el);
    return {
      id: el.id,
      el: el,
      index: index,
      frame: frame,
      enter: edgeFrame(el.dataset.enter, frame),
      leave: edgeFrame(el.dataset.leave, frame),
      top: top,
      bottom: bottom,
      holdStart: tall ? top - vh * TALL_HOLD_BEFORE : top + margin,
      holdEnd: tall ? Math.max(bottom - vh * TALL_HOLD_AFTER, top + vh * TALL_LAND_HOLD) : bottom - margin,
    };
  }

  /* The room that the bars use at the top and at the lower edge of the screen. */
  function readRoom(vh) {
    return LG.qsa(BARS).reduce(
      function (found, bar) {
        const rect = bar.getBoundingClientRect();
        if (rect.height === 0) return found;
        if (rect.top < vh / 2) return { head: Math.max(found.head, rect.bottom + BAR_GAP), foot: found.foot };
        return { head: found.head, foot: Math.max(found.foot, vh - rect.top + BAR_GAP) };
      },
      { head: vh * HEAD_ROOM, foot: vh * FOOT_ROOM }
    );
  }

  function measure() {
    const y = window.scrollY;
    stale = false;
    maxScroll = Math.max(1, root.scrollHeight - window.innerHeight);
    room = readRoom(window.innerHeight);
    progressBar = LG.qs(".progress");
    curtains = LG.qsa(CURTAINS).map(function (el) {
      const rect = el.getBoundingClientRect();
      return rect.top + y + rect.height / 2;
    });
    beats = LG.qsa(".beat").map(readBeat).map(withTurn);
    marks = LG.qsa("[data-step]").map(function (el) {
      const rect = el.getBoundingClientRect();
      return { id: el.id, top: rect.top + y, bottom: rect.bottom + y };
    });
    order = LG.qsa(STEPS).map(function (el) {
      return el.id;
    });
    layers = LG.qsa("[data-parallax]").map(function (el) {
      const rect = el.getBoundingClientRect();
      return { el: el, centre: rect.top + y + rect.height / 2 };
    });
  }

  /* The turn: the position where a beat gives the picture to the next beat.
     The middle of a curtain between them is the turn, and the picture cuts there. */
  function withTurn(beat, index, all) {
    const next = all[index + 1];
    if (!next) return beat;
    const middle = curtains.find(function (item) {
      return item > beat.bottom && item < next.top;
    });
    const cut = middle !== undefined;
    return Object.assign({}, beat, { cut: cut, turn: cut ? middle : (beat.holdEnd + next.holdStart) / 2 });
  }

  function share(c, from, to) {
    return LG.clamp((c - from) / (to - from || 1), 0, 1);
  }

  /* A curtain covers the picture. The camera leaves one place. Then it enters the next place. */
  function cutFrame(here, next, c) {
    if (c < here.turn) return LG.lerp(here.frame, here.leave, share(c, here.holdEnd, here.turn));
    return LG.lerp(next.enter, next.frame, share(c, here.turn, next.holdStart));
  }

  function frameAt(c) {
    for (let i = 0; i < beats.length - 1; i += 1) {
      const here = beats[i];
      const next = beats[i + 1];
      if (c <= here.holdEnd) return here.frame;
      if (c < next.holdStart) {
        return here.cut ? cutFrame(here, next, c) : LG.lerp(here.frame, next.frame, share(c, here.holdEnd, next.holdStart));
      }
    }
    return beats.length ? beats[beats.length - 1].frame : 0;
  }

  function beatAt(c) {
    for (let i = 0; i < beats.length - 1; i += 1) {
      if (c < beats[i].turn) return beats[i];
    }
    return beats[beats.length - 1] || null;
  }

  /* The number of curtains above the centre of the screen. A change of this number is a cut. */
  function sideAt(c) {
    return curtains.filter(function (middle) {
      return c >= middle;
    }).length;
  }

  /* The place is the section at the centre of the screen. Outside a section, it is the last part above the centre. */
  function placeAt(c, beat) {
    const passed = marks.filter(function (item) {
      return c > item.top;
    });
    const mark = passed[passed.length - 1];
    if (!mark) return beat ? beat.id : "";
    if (!beat || c <= mark.bottom) return mark.id;
    return order.indexOf(mark.id) > order.indexOf(beat.id) ? mark.id : beat.id;
  }

  function setVar(el, name, value) {
    const text = value.toFixed(3);
    const before = written.get(el) || {};
    if (before[name] === text) return;
    written.set(el, Object.assign({}, before, { [name]: text }));
    el.style.setProperty(name, text);
  }

  function offsetOf(beat, c, vh) {
    if (LG.reducedMotion()) return 0;
    if (c < beat.holdStart) return (beat.holdStart - c) / vh;
    if (c > beat.holdEnd) return (beat.holdEnd - c) / vh;
    return 0;
  }

  function fadeOf(beat, c, vh) {
    const outside = Math.max(beat.top - c, c - beat.bottom, 0) / vh;
    return 1 - LG.clamp((outside - FADE_FROM) / (FADE_TO - FADE_FROM), 0, 1);
  }

  function moveLayers(c, vh) {
    beats.forEach(function (beat) {
      if (Math.max(beat.top - c, c - beat.bottom) > vh * LAYER_RANGE) return;
      setVar(beat.el, "--p", LG.clamp(offsetOf(beat, c, vh), -1.2, 1.2));
      setVar(beat.el, "--o", fadeOf(beat, c, vh));
    });
    if (LG.reducedMotion()) return;
    layers.forEach(function (layer) {
      const p = (layer.centre - c) / vh;
      if (Math.abs(p) < LAYER_RANGE) setVar(layer.el, "--p", p);
    });
  }

  function setBeat(next) {
    if (next === active) return;
    const before = active;
    active = next;
    if (!next) return;
    root.dataset.beat = next.id;
    root.classList.toggle("is-quiet", "quiet" in next.el.dataset);
    root.style.setProperty("--shade", next.el.dataset.shade || "1");
    LG.emit("beat", { beat: next, before: before });
  }

  function setPlace(next) {
    if (next === place) return;
    place = next;
    LG.emit("place", next);
  }

  function movePointer(dt) {
    const k = 1 - Math.exp(-dt * POINTER_SPEED);
    pointer = Object.assign({}, pointer, {
      x: LG.lerp(pointer.x, pointer.goalX, k),
      y: LG.lerp(pointer.y, pointer.goalY, k),
    });
    setVar(root, "--tilt-x", pointer.x);
    setVar(root, "--tilt-y", pointer.y);
  }

  /* The code remembers each position that it writes. Any other scroll comes from the reader. */
  function writeScroll(y) {
    window.scrollTo(0, y);
    wroteY = window.scrollY;
  }

  /* The picture mixes two frames while the camera moves. At rest it shows one whole frame. */
  function settleShown(dt, jump) {
    /* Only the scroll moves the camera along the tour. The mouse does not. */
    const raw = LG.clamp(current, 0, Math.max(0, LG.tour.frameCount - 1));
    const atRest = Math.abs(raw - rawBefore) <= REST_SPEED * dt;
    const goal = atRest ? Math.round(raw) : raw;
    rawBefore = raw;
    shownFrame = jump || LG.reducedMotion() ? Math.round(raw) : LG.lerp(shownFrame, goal, 1 - Math.exp(-dt * SETTLE_SPEED));
  }

  function stepGlide(now) {
    if (!glide) return;
    const start = glide.start === null ? now : glide.start;
    const t = LG.clamp((now - start) / glide.ms, 0, 1);
    writeScroll(LG.lerp(glide.from, glide.to, LG.easeInOut(t)));
    glide = t >= 1 ? null : Object.assign({}, glide, { start: start });
  }

  function tick(dt, now) {
    if (stale) measure();
    stepGlide(now);
    const vh = window.innerHeight;
    const y = window.scrollY;
    const c = y + vh / 2;
    const beat = beatAt(c);
    const wanted = LG.reducedMotion() && beat ? beat.frame : frameAt(c);
    const goal = Number.isFinite(wanted) ? wanted : current;
    const close = Math.abs(goal - current) < 0.01;
    const side = sideAt(c);
    const jump = snap || side !== sideBefore;
    current = jump || close || LG.reducedMotion() ? goal : LG.lerp(current, goal, 1 - Math.exp(-dt * FOLLOW_SPEED));
    snap = false;
    sideBefore = side;
    setBeat(beat);
    setPlace(placeAt(c, beat));
    moveLayers(c, vh);
    if (!LG.reducedMotion()) movePointer(dt);
    settleShown(dt, jump);
    setVar(progressBar || root, "--progress", LG.clamp(y / maxScroll, 0, 1));
  }

  /* The distance from the top of the screen to a panel. A panel that fits stays whole between the bars. */
  function panelTop(height, vh) {
    const centred = (vh - height) / 2;
    const clear = centred >= Math.max(room.head, room.foot);
    if (clear && height <= vh * CENTRE_SHARE) return centred;
    const free = vh - room.head - room.foot;
    return room.head + Math.max(0, (free - height) / 2);
  }

  function positionOf(id) {
    const vh = window.innerHeight;
    const beat = beats.find(function (item) {
      return item.id === id;
    });
    if (beat && beat.index === 0) return 0;
    if (beat && isTall()) return beat.top - vh * TALL_LAND;
    if (beat) return beat.top - panelTop(beat.bottom - beat.top, vh);
    const el = document.getElementById(id);
    return el ? el.getBoundingClientRect().top + window.scrollY - vh * 0.1 : null;
  }

  function glideTo(y, instant) {
    const to = LG.clamp(y, 0, root.scrollHeight - window.innerHeight);
    if (instant || LG.reducedMotion()) {
      glide = null;
      snap = Boolean(instant);
      writeScroll(to);
      return;
    }
    const ms = LG.clamp(Math.abs(to - window.scrollY) * GLIDE_MS_PER_PIXEL, GLIDE_MIN_MS, GLIDE_MAX_MS);
    glide = { from: window.scrollY, to: to, ms: ms, start: null };
  }

  function goTo(id, instant) {
    if (stale) measure();
    const y = positionOf(id);
    if (y !== null) glideTo(y, instant);
  }

  /* A beat taller than the screen: one step shows its lower end before the next beat. */
  function within(id, delta) {
    if (stale) measure();
    const beat = beats.find(function (item) {
      return item.id === id;
    });
    if (!beat || beat.index === 0) return false;
    const vh = window.innerHeight;
    const y = glide ? glide.to : window.scrollY;
    const high = positionOf(id);
    const low = beat.bottom - (vh - room.foot);
    if (low - high < PAGE_SLACK) return false;
    /* One step is not larger than the free area, so no line stays behind a bar. */
    const step = Math.max(PAGE_SLACK, Math.min(vh * PAGE_SHARE, vh - room.head - room.foot - PAGE_SLACK));
    if (delta > 0 && y < low - PAGE_SLACK) {
      glideTo(Math.min(low, y + step));
      return true;
    }
    if (delta < 0 && y > high + PAGE_SLACK) {
      glideTo(Math.max(high, y - step));
      return true;
    }
    return false;
  }

  /* The steps of stage mode, in the order of the page. */
  function steps() {
    return order.slice();
  }

  function onPointer(event) {
    if (event.pointerType !== "mouse") return;
    pointer = Object.assign({}, pointer, {
      goalX: (event.clientX / window.innerWidth) * 2 - 1,
      goalY: (event.clientY / window.innerHeight) * 2 - 1,
    });
  }

  /* The keyboard continues from the part that a link opens. */
  function focusPart(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  }

  function onClick(event) {
    const link = event.target.closest("[data-go]");
    if (!link) return;
    const id = link.dataset.go;
    event.preventDefault();
    goTo(id);
    focusPart(id);
    window.history.replaceState(null, "", "#" + id);
    LG.emit("jump", id);
  }

  function stopGlide() {
    glide = null;
  }

  /* A scroll bar, a key or a touch moved the page. The glide stops and the reader leads. */
  function onScroll() {
    if (wroteY !== null && Math.abs(window.scrollY - wroteY) <= SCROLL_SLACK) return;
    glide = null;
    LG.emit("free");
  }

  /* Puts the page at one position without a glide. */
  function setY(y) {
    if (stale) measure();
    glideTo(y, true);
  }

  /* Ends a glide at its goal. The place then names the part at the goal. Returns the position of the page. */
  function settle() {
    if (!glide) return window.scrollY;
    glideTo(glide.to, true);
    const c = window.scrollY + window.innerHeight / 2;
    setPlace(placeAt(c, beatAt(c)));
    return window.scrollY;
  }

  function markStale() {
    stale = true;
  }

  function init() {
    measure();
    window.addEventListener("resize", markStale);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("wheel", stopGlide, { passive: true });
    window.addEventListener("touchstart", stopGlide, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClick);
    if ("ResizeObserver" in window) new ResizeObserver(markStale).observe(document.body);
    const first = LG.param("at") || window.location.hash.slice(1);
    if (first) goTo(first, true);
    tick(0, 0);
  }

  LG.scroll = {
    init: init,
    tick: tick,
    measure: markStale,
    goTo: goTo,
    setY: setY,
    settle: settle,
    within: within,
    steps: steps,
    frame: function () {
      return current;
    },
    shown: function () {
      return shownFrame;
    },
    active: function () {
      return active;
    },
    place: function () {
      return place;
    },
  };
})(window.LG);
