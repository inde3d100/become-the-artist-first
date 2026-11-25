/* The tour: loads the rendered frames and draws one picture on the canvas. */
(function (LG) {
  "use strict";

  const MAX_PIXEL_RATIO = 2;
  const LOADS_AT_ONE_TIME = 6;
  const TALL_PICTURE_HEIGHT = 0.62;
  const TALL_PICTURE_TOP = 0.05;
  const NIGHT = "#070605";
  const FRAME_DIGITS = 4;
  const LOOP_DIGITS = 2;
  const MAX_LOOP_FRAMES = 200;
  /* Frames that stay in memory on each side of the camera. A small screen keeps fewer. */
  const KEEP_FRAMES = 44;
  const KEEP_FRAMES_SMALL = 22;
  const SMALL_SCREEN = 1000;
  const RECENTRE_FRAMES = 12;
  const MAX_TRIES = 2;
  const LOST_AFTER = 8;
  const IDLE = 0;
  const LOADING = 1;
  const READY = 2;
  const FAILED = 3;
  const LOOP_DEFAULTS = {
    sway: { pattern: "assets/loops/sway/s_{n}.webp", count: 24 },
    chut: { pattern: "assets/loops/chut/c_{n}.webp", count: 12 },
  };

  const check = LG.tourData;
  const data = check.value;
  /* The picture store. It changes in place: a copy for each frame costs too much. */
  const frames = { images: [], status: [], tries: [] };
  const loops = {};
  let canvas = null;
  let ctx = null;
  let queue = [];
  let loading = 0;
  let size = { w: 0, h: 0, ratio: 1 };
  let box = { scale: 1, dx: 0, dy: 0, w: 0, h: 0 };
  let track = [];
  let stopFrames = [];
  let centre = -1;
  let failures = 0;
  let lost = false;
  let paintedKey = "";
  let live = false;

  function name(pattern, index, digits) {
    return pattern.replace("{n}", String(index).padStart(digits, "0"));
  }

  function last() {
    return data.frameCount - 1;
  }

  function stopFrame(id) {
    return data && Object.prototype.hasOwnProperty.call(data.stops, id) ? data.stops[id] : 0;
  }

  /* The point of interest for each stop. A tall screen follows it. */
  function buildTrack() {
    return Object.keys(data.stops)
      .map(function (id) {
        const spot = data.focus[id];
        return { frame: data.stops[id], u: Array.isArray(spot) && Number.isFinite(spot[0]) ? spot[0] : 0.5 };
      })
      .sort(function (a, b) {
        return a.frame - b.frame;
      });
  }

  function focusAt(frame) {
    let before = track[0];
    for (const stop of track) {
      if (stop.frame > frame) {
        const span = stop.frame - before.frame || 1;
        return LG.lerp(before.u, stop.u, (frame - before.frame) / span);
      }
      before = stop;
    }
    return before ? before.u : 0.5;
  }

  function layout(frame) {
    const fw = data.width;
    const fh = data.height;
    if (size.h > size.w) {
      const tall = (size.h * TALL_PICTURE_HEIGHT) / fh;
      const w = fw * tall;
      const dx = w <= size.w ? (size.w - w) / 2 : LG.clamp(size.w / 2 - focusAt(frame) * w, size.w - w, 0);
      return { scale: tall, dx: dx, dy: size.h * TALL_PICTURE_TOP, w: w, h: fh * tall };
    }
    const cover = Math.max(size.w / fw, size.h / fh);
    return { scale: cover, dx: (size.w - fw * cover) / 2, dy: (size.h - fh * cover) / 2, w: fw * cover, h: fh * cover };
  }

  function whenLoaded(image) {
    return new Promise(function (resolve) {
      image.onload = function () {
        resolve(true);
      };
      image.onerror = function () {
        resolve(false);
      };
    });
  }

  /* The browser decodes the picture before the first draw, so the scroll stays smooth. */
  function whenDecoded(image, loaded) {
    if (!loaded || typeof image.decode !== "function") return loaded;
    const yes = function () {
      return true;
    };
    return image.decode().then(yes, yes);
  }

  function fetchImage(source) {
    const image = new Image();
    const loaded = whenLoaded(image);
    image.decoding = "async";
    image.src = source;
    return {
      image: image,
      ready: loaded.then(function (ok) {
        return whenDecoded(image, ok);
      }),
    };
  }

  function reach() {
    return Math.max(size.w, size.h) < SMALL_SCREEN ? KEEP_FRAMES_SMALL : KEEP_FRAMES;
  }

  function keeps(index) {
    return Math.abs(index - centre) <= reach() || stopFrames.indexOf(index) !== -1;
  }

  /* Frames far from the camera leave the memory. The stop frames stay. */
  function release() {
    frames.images.forEach(function (image, index) {
      if (!image || keeps(index)) return;
      /* An empty address stops a load in progress, so its slot is free again. */
      if (frames.status[index] === LOADING) image.src = "";
      frames.images[index] = null;
      frames.status[index] = IDLE;
    });
  }

  function markFailed(index) {
    const tries = (frames.tries[index] || 0) + 1;
    frames.images[index] = null;
    frames.tries[index] = tries;
    frames.status[index] = tries >= MAX_TRIES ? FAILED : IDLE;
    failures += 1;
    /* The second try starts at once, so a camera at rest does not wait for it. */
    if (tries < MAX_TRIES && keeps(index)) queue = [index].concat(queue);
    if (live || lost || failures < LOST_AFTER) return;
    lost = true;
    queue = [];
    LG.emit("tour-lost");
  }

  function settle(index, image, ok) {
    loading -= 1;
    /* A frame that left the memory while it loaded gets no place. */
    if (frames.images[index] === image) {
      if (ok) frames.status[index] = READY;
      else markFailed(index);
      paintedKey = "";
    }
    pump();
  }

  function loadFrame(index) {
    const entry = fetchImage(name(data.pattern, index, FRAME_DIGITS));
    frames.status[index] = LOADING;
    frames.images[index] = entry.image;
    loading += 1;
    entry.ready.then(function (ok) {
      settle(index, entry.image, ok);
    });
  }

  function pump() {
    while (!lost && loading < LOADS_AT_ONE_TIME && queue.length) {
      const index = queue[0];
      queue = queue.slice(1);
      if (frames.status[index]) continue;
      loadFrame(index);
    }
  }

  /* Loads the frames near one frame first. The stops stay at the front. */
  function loadAround(frame) {
    if (!data || lost) return;
    const span = reach();
    centre = LG.clamp(Math.round(frame), 0, last());
    release();
    const near = Array.from({ length: span * 2 + 1 }, function (_, i) {
      return centre - span + i;
    })
      .filter(function (i) {
        return i >= 0 && i <= last();
      })
      .sort(function (a, b) {
        return Math.abs(a - centre) - Math.abs(b - centre);
      });
    queue = [centre].concat(stopFrames, near).filter(function (i) {
      return !frames.status[i];
    });
    pump();
  }

  function nearestReady(index) {
    for (let step = 0; step <= last(); step += 1) {
      if (frames.status[index - step] === READY) return index - step;
      if (frames.status[index + step] === READY) return index + step;
    }
    return -1;
  }

  function paint(key, first, second, mix) {
    if (key === paintedKey) return;
    paintedKey = key;
    ctx.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = NIGHT;
    ctx.fillRect(0, 0, size.w, size.h);
    if (!first) return;
    if (!live) {
      live = true;
      LG.emit("live");
    }
    ctx.drawImage(first, box.dx, box.dy, box.w, box.h);
    if (second && mix > 0.02) {
      ctx.globalAlpha = mix;
      ctx.drawImage(second, box.dx, box.dy, box.w, box.h);
    }
  }

  /* The frame window follows the camera. */
  function follow(frame) {
    if (centre < 0 || Math.abs(frame - centre) > RECENTRE_FRAMES) loadAround(frame);
  }

  function draw(frame) {
    if (!ctx || lost) return;
    const at = LG.clamp(frame, 0, last());
    follow(at);
    const low = Math.floor(at);
    const high = Math.min(low + 1, last());
    const bothReady = frames.status[low] === READY && frames.status[high] === READY;
    const shown = bothReady ? low : nearestReady(Math.round(at));
    const mix = bothReady ? at - low : 0;
    box = layout(at);
    const key = ["tour", shown, mix.toFixed(2), box.dx.toFixed(1), size.w, size.h].join("|");
    paint(key, frames.images[shown], bothReady ? frames.images[high] : null, mix);
  }

  function loadLoop(id) {
    if (!data || lost || !Object.prototype.hasOwnProperty.call(LOOP_DEFAULTS, id) || loops[id]) return;
    const spec = Object.assign({}, LOOP_DEFAULTS[id], check.asObject(data.loops[id]));
    if (!check.isPattern(spec.pattern) || !check.isCount(spec.count, MAX_LOOP_FRAMES)) return;
    const entry = { count: spec.count, images: [], ready: 0 };
    loops[id] = entry;
    for (let i = 0; i < spec.count; i += 1) {
      const item = fetchImage(name(spec.pattern, i, LOOP_DIGITS));
      entry.images[i] = item.image;
      item.ready.then(function (ok) {
        if (!ok) return;
        entry.ready += 1;
        paintedKey = "";
      });
    }
  }

  /* Only the loops near the active beat stay in memory. */
  function keepLoops(ids) {
    Object.keys(loops).forEach(function (id) {
      if (ids.indexOf(id) === -1) delete loops[id];
    });
  }

  /* Draws one frame of a loop. Returns false while the loop is not ready. */
  function drawLoop(id, position, wraps, tourFrame) {
    const entry = loops[id];
    if (!ctx || lost || !entry || entry.ready < entry.count) return false;
    follow(LG.clamp(tourFrame, 0, last()));
    const count = entry.count;
    const at = wraps ? ((position % count) + count) % count : LG.clamp(position, 0, count - 1);
    const low = Math.floor(at);
    const high = wraps ? (low + 1) % count : Math.min(low + 1, count - 1);
    box = layout(tourFrame);
    const key = [id, low, (at - low).toFixed(2), box.dx.toFixed(1), size.w, size.h].join("|");
    paint(key, entry.images[low], entry.images[high], at - low);
    return true;
  }

  function loopLength(id) {
    return loops[id] ? loops[id].count : 0;
  }

  /* Where a named 3D point sits on the screen, in CSS pixels. */
  function point(anchor, frame) {
    const list = data && !lost ? data.anchors[anchor] : null;
    if (!Array.isArray(list)) return null;
    const at = LG.clamp(frame, 0, last());
    const low = Math.floor(at);
    const a = list[low];
    const b = list[Math.min(low + 1, last())];
    if (!check.isSpot(a) || !check.isSpot(b)) return null;
    const t = at - low;
    return {
      x: box.dx + LG.lerp(a[0], b[0], t) * box.w,
      y: box.dy + LG.lerp(a[1], b[1], t) * box.h,
      visible: Boolean(a[2] && b[2]),
    };
  }

  /* The canvas keeps the size of its own box, so a scroll bar does not stretch the picture. */
  function resize() {
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w === size.w && h === size.h && ratio === size.ratio) return;
    size = { w: w, h: h, ratio: ratio };
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    paintedKey = "";
  }

  function init(element) {
    if (!data || !element) return false;
    canvas = element;
    ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return false;
    track = buildTrack();
    stopFrames = Object.keys(data.stops).map(function (id) {
      return Math.round(data.stops[id]);
    });
    resize();
    box = layout(0);
    window.addEventListener("resize", resize);
    return true;
  }

  LG.tour = {
    init: init,
    hasData: Boolean(data),
    frameCount: data ? data.frameCount : 0,
    stopFrame: stopFrame,
    draw: draw,
    loadLoop: loadLoop,
    keepLoops: keepLoops,
    drawLoop: drawLoop,
    loopLength: loopLength,
    point: point,
  };
})(window.LG);
