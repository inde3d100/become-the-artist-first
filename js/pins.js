/* Pins: page parts that follow a point of the 3D picture. */
(function (LG) {
  "use strict";

  const REACH_FRAMES = 9;
  const FIRST_YEAR = 1;
  const LAST_YEAR = 23;
  const YEAR_MARKS = [
    ["conga", 0],
    ["walk_a", 1],
    ["walk_break", 8],
    ["walk_b", LAST_YEAR],
  ];

  let pins = [];
  let years = null;
  let yearNumber = null;
  let yearText = "";
  let yearsOn = false;

  function readPin(el) {
    return {
      el: el,
      anchor: el.dataset.anchor,
      beats: LG.tokens(el.dataset.beats),
      reach: Number(el.dataset.reach) || REACH_FRAMES,
      on: false,
    };
  }

  function placePin(pin, frame, beat) {
    const near = Boolean(beat) && pin.beats.indexOf(beat.id) !== -1 && Math.abs(frame - beat.frame) <= pin.reach;
    const spot = near ? LG.tour.point(pin.anchor, frame) : null;
    const on = Boolean(spot && spot.visible);
    if (on) {
      pin.el.style.transform = "translate3d(" + spot.x.toFixed(1) + "px," + spot.y.toFixed(1) + "px,0)";
    }
    if (on === pin.on) return pin;
    pin.el.classList.toggle("is-on", on);
    return Object.assign({}, pin, { on: on });
  }

  function yearAt(frame) {
    const marks = YEAR_MARKS.map(function (mark) {
      return [LG.tour.stopFrame(mark[0]), mark[1]];
    });
    let before = marks[0];
    for (const mark of marks) {
      if (mark[0] > frame) {
        const span = mark[0] - before[0] || 1;
        return LG.lerp(before[1], mark[1], LG.clamp((frame - before[0]) / span, 0, 1));
      }
      before = mark;
    }
    return before[1];
  }

  function showYears(frame, beat) {
    if (!years) return;
    const on = Boolean(beat) && "year" in beat.el.dataset;
    if (on !== yearsOn) {
      yearsOn = on;
      years.classList.toggle("is-on", on);
    }
    if (!on) return;
    const counted = LG.tour.hasData ? Math.round(yearAt(frame)) : Number(beat.el.dataset.year);
    const value = Math.max(FIRST_YEAR, counted);
    const text = value >= LAST_YEAR ? LAST_YEAR + "+" : String(value);
    if (text === yearText) return;
    yearText = text;
    yearNumber.textContent = text;
    /* One year has its own label. */
    years.classList.toggle("is-one", value === FIRST_YEAR);
  }

  function tick(frame, beat) {
    pins = pins.map(function (pin) {
      return placePin(pin, frame, beat);
    });
    showYears(frame, beat);
  }

  function init() {
    pins = LG.qsa(".pin[data-anchor]").map(readPin);
    years = LG.qs(".years");
    yearNumber = years ? LG.qs(".years__n", years) : null;
  }

  LG.pins = { init: init, tick: tick };
})(window.LG);
