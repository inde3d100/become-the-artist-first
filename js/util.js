/* Shared helpers. Each other file adds its own part to window.LG. */
(function () {
  "use strict";

  const listeners = {};

  function on(name, fn) {
    listeners[name] = (listeners[name] || []).concat(fn);
  }

  function emit(name, detail) {
    (listeners[name] || []).forEach(function (fn) {
      fn(detail);
    });
  }

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  function reducedMotion() {
    return motionQuery.matches;
  }

  /* Storage can throw in a private window. The page works without it. */
  function recall(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function remember(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      return false;
    }
  }

  function param(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  /* Tokens of a data attribute: "a b c" or "a,b,c". */
  function tokens(text) {
    return (text || "").split(/[\s,]+/).filter(Boolean);
  }

  /* A number with two digits: 5 gives "05". */
  function twoDigits(value) {
    return String(value).padStart(2, "0");
  }

  /* The name of a part, as the rail shows it. */
  function placeName(id) {
    const link = qsa(".rail a").find(function (item) {
      return tokens(item.dataset.places).indexOf(id) !== -1;
    });
    return link ? link.textContent.trim() : "";
  }

  window.LG = {
    twoDigits: twoDigits,
    placeName: placeName,
    on: on,
    emit: emit,
    clamp: clamp,
    lerp: lerp,
    easeInOut: easeInOut,
    qs: qs,
    qsa: qsa,
    reducedMotion: reducedMotion,
    recall: recall,
    remember: remember,
    param: param,
    tokens: tokens,
  };
})();
