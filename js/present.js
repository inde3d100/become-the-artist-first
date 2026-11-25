/* Stage mode: one part at a time, for a room. */
(function (LG) {
  "use strict";

  const root = document.documentElement;
  const KEY_STEPS = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, " ": 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 };
  const TYPING_TAGS = ["INPUT", "TEXTAREA", "SELECT"];
  const LETTER_CODES = { KeyP: "p", KeyF: "f", KeyM: "m", KeyL: "l" };

  let on = false;
  let aim = null;
  let startedAt = 0;
  let clockText = "";
  let parts = {};

  const two = LG.twoDigits;

  /* The part that the page shows, or the part that it travels to. */
  function place() {
    return aim || LG.scroll.place();
  }

  function describe() {
    const id = place();
    const el = document.getElementById(id);
    if (!el || !parts.name) return;
    const list = LG.scroll.steps();
    parts.number.textContent = two(list.indexOf(id) + 1) + " / " + two(list.length);
    parts.name.textContent = LG.placeName(id);
    parts.minutes.textContent = el.dataset.min || "";
    parts.minutes.parentElement.hidden = !el.dataset.min;
  }

  function move(delta) {
    const list = LG.scroll.steps();
    const id = place();
    if (LG.scroll.within(id, delta)) return;
    const here = Math.max(0, list.indexOf(id));
    aim = list[LG.clamp(here + delta, 0, list.length - 1)];
    LG.scroll.goTo(aim);
    describe();
  }

  function setOn(next) {
    const here = LG.scroll.place();
    on = next;
    aim = on && here ? here : null;
    startedAt = 0;
    root.classList.toggle("is-present", on);
    LG.qsa('[data-action="present"]').forEach(function (button) {
      button.setAttribute("aria-pressed", String(on));
    });
    LG.scroll.measure();
    window.requestAnimationFrame(function () {
      LG.scroll.goTo(here, true);
    });
    describe();
  }

  /* The screen or the text changed its size. The part on the screen returns to its place. */
  function restore() {
    if (!on || !aim) return;
    LG.scroll.measure();
    LG.scroll.goTo(aim, true);
  }

  function fullScreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }
    if (!root.requestFullscreen) return;
    root.requestFullscreen().catch(function () {
      /* The browser refused full screen. Stage mode works without it. */
    });
  }

  function onLetter(key) {
    if (key === "p") setOn(!on);
    if (key === "f") fullScreen();
    if (key === "m") LG.map.toggle();
    if (key === "l") LG.i18n.apply(LG.i18n.language() === "en" ? "el" : "en");
  }

  /* The letter of a key. A Greek keyboard gives the letter through the place of the key. */
  function letterOf(event) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : "";
    if (key >= "a" && key <= "z") return key;
    return LETTER_CODES[event.code] || "";
  }

  function stepOf(event) {
    return Object.prototype.hasOwnProperty.call(KEY_STEPS, event.key) ? KEY_STEPS[event.key] : 0;
  }

  function onKey(event) {
    /* The map closes on Escape first and marks the key as used. */
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (TYPING_TAGS.indexOf(event.target.tagName) !== -1) return;
    if (!event.repeat) onLetter(letterOf(event));
    if (event.key === "Escape" && on) setOn(false);
    const step = stepOf(event);
    if (!on || !step || LG.map.isOpen()) return;
    if (event.key === " " && event.target.closest("button, a, summary")) return;
    event.preventDefault();
    if (!event.repeat) move(step);
  }

  function onClick(event) {
    const action = event.target.closest("[data-action]");
    if (!action) return;
    if (action.dataset.action === "present") setOn(!on);
    if (action.dataset.action === "next") move(1);
    if (action.dataset.action === "previous") move(-1);
    if (action.dataset.action === "full") fullScreen();
  }

  function forgetAim() {
    aim = null;
  }

  /* A link moved the page. The next step starts from the part that the link opened. */
  function onJump(id) {
    aim = LG.scroll.steps().indexOf(id) !== -1 ? id : null;
    describe();
  }

  function tick(now) {
    if (!on || !parts.clock) return;
    if (!startedAt) startedAt = now;
    const seconds = Math.floor((now - startedAt) / 1000);
    const text = two(Math.floor(seconds / 60)) + ":" + two(seconds % 60);
    if (text === clockText) return;
    clockText = text;
    parts.clock.textContent = text;
  }

  function init() {
    const bar = LG.qs(".deck");
    if (bar) {
      parts = {
        number: LG.qs(".deck__number", bar),
        name: LG.qs(".deck__name", bar),
        minutes: LG.qs(".deck__minutes", bar),
        clock: LG.qs(".deck__clock", bar),
      };
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    LG.on("free", forgetAim);
    LG.on("jump", onJump);
    LG.on("place", describe);
    LG.on("language", describe);
    LG.on("language", restore);
    window.addEventListener("resize", restore);
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", restore);
    if (LG.param("present")) setOn(true);
  }

  LG.present = { init: init, tick: tick, place: place };
})(window.LG);
