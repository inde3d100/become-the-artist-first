/* Two languages. The page holds the English text. This file puts in the Greek text. */
(function (LG) {
  "use strict";

  const STORE_KEY = "lg-artist-language";
  const DEFAULT_LANGUAGE = "en";
  const OTHER_NAME = { en: "ΕΛ", el: "EN" };
  /* The button names the other language, in that language. */
  const OTHER_LABEL = { en: "Ελληνικά", el: "English" };
  const OTHER_CODE = { en: "el", el: "en" };
  const texts = { el: window.LG_COPY_EL || {} };
  const originals = new Map();
  const originalLabels = new Map();
  let language = DEFAULT_LANGUAGE;

  /* Markers in a text: *word* is emphasis and | is a line break. */
  function build(text) {
    const fragment = document.createDocumentFragment();
    text.split("|").forEach(function (line, lineIndex) {
      if (lineIndex) fragment.appendChild(document.createElement("br"));
      line.split("*").forEach(function (part, partIndex) {
        if (!part) return;
        if (partIndex % 2 === 0) {
          fragment.appendChild(document.createTextNode(part));
          return;
        }
        const em = document.createElement("em");
        em.textContent = part;
        fragment.appendChild(em);
      });
    });
    return fragment;
  }

  function copies(nodes) {
    return nodes.map(function (node) {
      return node.cloneNode(true);
    });
  }

  function swapText(el, dictionary) {
    const key = el.dataset.i18n;
    if (!originals.has(el)) originals.set(el, copies(Array.from(el.childNodes)));
    if (dictionary && key in dictionary) {
      el.replaceChildren(build(dictionary[key]));
      return;
    }
    el.replaceChildren.apply(el, copies(originals.get(el)));
  }

  function swapLabel(el, dictionary) {
    const key = el.dataset.i18nLabel;
    if (!originalLabels.has(el)) originalLabels.set(el, el.getAttribute("aria-label"));
    const text = dictionary && key in dictionary ? dictionary[key] : originalLabels.get(el);
    el.setAttribute("aria-label", text);
  }

  function apply(next) {
    language = Object.prototype.hasOwnProperty.call(texts, next) ? next : DEFAULT_LANGUAGE;
    const dictionary = texts[language] || null;
    LG.qsa("[data-i18n]").forEach(function (el) {
      swapText(el, dictionary);
    });
    LG.qsa("[data-i18n-label]").forEach(function (el) {
      swapLabel(el, dictionary);
    });
    LG.qsa('[data-action="language"]').forEach(function (button) {
      button.textContent = OTHER_NAME[language];
      button.setAttribute("aria-label", OTHER_LABEL[language]);
      button.lang = OTHER_CODE[language];
    });
    document.documentElement.lang = language;
    LG.remember(STORE_KEY, language);
    LG.emit("language", language);
  }

  function onClick(event) {
    if (!event.target.closest('[data-action="language"]')) return;
    apply(language === DEFAULT_LANGUAGE ? "el" : DEFAULT_LANGUAGE);
  }

  function init() {
    document.addEventListener("click", onClick);
    const first = LG.param("lang") || LG.recall(STORE_KEY) || DEFAULT_LANGUAGE;
    if (first !== DEFAULT_LANGUAGE) apply(first);
  }

  LG.i18n = {
    init: init,
    apply: apply,
    language: function () {
      return language;
    },
  };
})(window.LG);
