/* The rhythm controls: mixer, voice buttons, count, step grid and slider. */
(function (LG) {
  "use strict";

  const HIT = 2;
  const SOFT = 1;
  const BREATH_EVERY = 4;

  let mixer = null;
  let slider = null;
  let columns = [];
  let countItems = [];
  let studs = [];
  let shownStep = -1;
  let silentCount = false;

  function labelOf(name) {
    const chip = LG.qs('.mixer [data-voice="' + name + '"]');
    return chip ? chip.textContent : name;
  }

  function make(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  function makeHead() {
    const row = make("div", "grid__row grid__head");
    const cells = make("div", "grid__cells");
    for (let step = 0; step < LG.audio.steps; step += 1) {
      const cell = make("i");
      const count = step / 2 + 1;
      if (step % 2 === 0) cell.textContent = String(count);
      if (step % 2 === 0 && count % BREATH_EVERY === 0) cell.className = "is-breath";
      cells.appendChild(cell);
    }
    row.append(make("span"), cells);
    /* The hidden text of the grid gives the counts to a screen reader. */
    row.setAttribute("aria-hidden", "true");
    return row;
  }

  function makeRow(name) {
    const row = make("div", "grid__row");
    const button = make("button", "grid__name");
    const cells = make("div", "grid__cells");
    row.dataset.row = name;
    button.type = "button";
    button.dataset.voice = name;
    button.dataset.i18n = "voice." + name;
    button.textContent = labelOf(name);
    button.disabled = !LG.audio.supported;
    LG.audio.patterns[name].forEach(function (strength) {
      const cell = make("i");
      if (strength === HIT) cell.className = "is-hit";
      if (strength === SOFT) cell.className = "is-soft";
      cells.appendChild(cell);
    });
    cells.setAttribute("aria-hidden", "true");
    row.append(button, cells);
    return row;
  }

  function buildGrid(container) {
    const rows = [makeHead()].concat(LG.audio.names.map(makeRow));
    container.append.apply(container, rows);
    columns = Array.from({ length: LG.audio.steps }, function (_, step) {
      return rows.map(function (row) {
        return LG.qs(".grid__cells", row).children[step];
      });
    });
    const text = LG.qs(".grid-text");
    if (text) text.classList.add("sr");
  }

  function sync() {
    const playing = LG.audio.isPlaying();
    LG.qsa("[data-voice]").forEach(function (button) {
      const on = playing && LG.audio.isEnabled(button.dataset.voice);
      button.setAttribute("aria-pressed", String(on));
    });
    LG.qsa('[data-action="power"]').forEach(function (button) {
      button.setAttribute("aria-pressed", String(playing));
    });
    LG.qsa(".grid__row[data-row]").forEach(function (row) {
      row.classList.toggle("is-off", !LG.audio.isEnabled(row.dataset.row));
    });
    if (mixer) mixer.classList.toggle("is-on", playing);
  }

  function pressVoice(name) {
    if (!LG.audio.isPlaying()) {
      LG.audio.setVoice(name, true);
      LG.audio.start();
      return;
    }
    LG.audio.setVoice(name, !LG.audio.isEnabled(name));
  }

  function togglePower() {
    if (LG.audio.isPlaying()) LG.audio.stop();
    else LG.audio.start();
  }

  function onClick(event) {
    const voice = event.target.closest("[data-voice]");
    if (voice) {
      pressVoice(voice.dataset.voice);
      return;
    }
    const action = event.target.closest("[data-action]");
    if (!action) return;
    if (action.dataset.action === "power") togglePower();
    if (action.dataset.action === "band") {
      LG.audio.setMix(LG.audio.names);
      LG.audio.start();
    }
  }

  /* Each beat sets the band. The reader can change it until the next beat. */
  function onBeat(change) {
    const data = change.beat.el.dataset;
    silentCount = "pulse" in data;
    if (data.mix === undefined) return;
    LG.audio.setLevel(data.mix === "none" ? 0 : 1);
    if (data.mix !== "none") LG.audio.setMix(data.mix === "all" ? LG.audio.names : LG.tokens(data.mix));
  }

  function setColumn(step, on) {
    (columns[step] || []).forEach(function (cell) {
      cell.classList.toggle("is-now", on);
    });
  }

  function mark(step) {
    if (step === shownStep) return;
    setColumn(shownStep, false);
    setColumn(step, true);
    shownStep = step;
    const count = step < 0 ? 0 : Math.floor(step / 2) + 1;
    countItems.forEach(function (item) {
      item.classList.toggle("is-now", Number(item.dataset.count) === count);
    });
    studs.forEach(function (stud) {
      stud.classList.toggle("is-now", Number(stud.dataset.count) === count);
    });
  }

  /* The step in the pattern with a fraction. -1 when nothing moves. */
  function position(now) {
    const live = LG.audio.position();
    if (live >= 0) return live;
    if (!silentCount || LG.reducedMotion()) return -1;
    return (now / 1000 / LG.audio.stepSeconds) % LG.audio.steps;
  }

  function tick(now) {
    mark(Math.floor(position(now)));
  }

  /* A screen reader gets the value of the slider with the names of its two ends. */
  function describeSlider() {
    const ends = LG.qsa(".chut__ends span").map(function (el) {
      return el.textContent;
    });
    if (!slider || ends.length < 2) return;
    slider.setAttribute("aria-valuetext", slider.value + " (" + ends[0] + " 0, " + ends[1] + " " + slider.max + ")");
  }

  function init() {
    mixer = LG.qs(".mixer");
    slider = LG.qs("#chut-range");
    countItems = LG.qsa(".count [data-count]");
    studs = LG.qsa(".stud[data-count]");
    const grid = LG.qs(".grid");
    if (grid) buildGrid(grid);
    if (slider) slider.addEventListener("input", describeSlider);
    LG.on("language", describeSlider);
    describeSlider();
    if (!LG.audio.supported) {
      /* Without sound the page hides each sound control. */
      document.documentElement.classList.add("no-sound");
      return;
    }
    document.addEventListener("click", onClick);
    LG.on("beat", onBeat);
    LG.on("sound", sync);
    LG.on("mix", sync);
    sync();
  }

  LG.rhythm = {
    init: init,
    tick: tick,
    position: position,
    slider: function () {
      return slider ? Number(slider.value) / Number(slider.max || 100) : 0;
    },
    setSlider: function (share) {
      if (slider) slider.value = String(Math.round(share * Number(slider.max || 100)));
    },
  };
})(window.LG);
