/* The tour data: checks the file that the Blender scripts write, before the page uses it. */
(function (LG) {
  "use strict";

  const MAX_FRAMES = 5000;

  function isCount(value, most) {
    return Number.isInteger(value) && value > 0 && value <= most;
  }

  function isPattern(value) {
    return typeof value === "string" && value.indexOf("{n}") !== -1;
  }

  function isSize(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  }

  function isSpot(value) {
    return Array.isArray(value) && Number.isFinite(value[0]) && Number.isFinite(value[1]);
  }

  function asObject(value) {
    return value && typeof value === "object" ? value : {};
  }

  /* The file gives the stops as a list of { id, frame }. A map of id to frame also passes. */
  function stopPairs(raw) {
    if (Array.isArray(raw)) {
      return raw.map(function (item) {
        const stop = asObject(item);
        return [stop.id, stop.frame];
      });
    }
    const source = asObject(raw);
    return Object.keys(source).map(function (id) {
      return [id, source[id]];
    });
  }

  /* Keeps only the stops that have a name and a real frame number. */
  function readStops(raw, lastFrame) {
    return stopPairs(raw).reduce(function (all, pair) {
      const id = pair[0];
      const frame = pair[1];
      if (typeof id !== "string" || !id) return all;
      if (typeof frame !== "number" || !Number.isFinite(frame)) return all;
      return Object.assign({}, all, { [id]: LG.clamp(frame, 0, lastFrame) });
    }, {});
  }

  /* A wrong shape gives no tour. The text of the page stays complete. */
  function read(raw) {
    const source = asObject(raw);
    if (!isCount(source.frameCount, MAX_FRAMES) || !isPattern(source.pattern)) return null;
    if (!isSize(source.width) || !isSize(source.height)) return null;
    const stops = readStops(source.stops, source.frameCount - 1);
    if (!Object.keys(stops).length) return null;
    return {
      frameCount: source.frameCount,
      width: source.width,
      height: source.height,
      pattern: source.pattern,
      stops: stops,
      loops: asObject(source.loops),
      anchors: asObject(source.anchors),
      focus: asObject(source.focus),
    };
  }

  LG.tourData = {
    value: read(window.LG_TOUR),
    isCount: isCount,
    isPattern: isPattern,
    isSpot: isSpot,
    asObject: asObject,
  };
})(window.LG);
