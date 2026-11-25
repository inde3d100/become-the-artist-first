/* The map: lights the links of one node, and opens as a full-screen layer. */
(function (LG) {
  "use strict";

  const root = document.documentElement;
  const SVG_SPACE = "http://www.w3.org/2000/svg";
  /* The ring around the node of the reader stays this far from the node, in units of the picture. */
  const HALO_GAP = 8;
  /* The free room below that node, in pixels of the screen. */
  const HERE_MARGIN = 24;
  let svg = null;
  let links = [];
  let nodes = [];
  let title = null;
  let opener = null;
  let savedY = 0;
  let savedPlace = "";
  let savedLayout = "";
  let open = false;
  let here = null;
  let herePlace = "";
  let halos = [];

  function clear() {
    if (!svg) return;
    svg.classList.remove("has-focus");
    LG.qsa(".is-lit", svg).forEach(function (el) {
      el.classList.remove("is-lit");
    });
  }

  function light(id) {
    clear();
    const joined = links.filter(function (link) {
      return link.dataset.a === id || link.dataset.b === id;
    });
    const ids = joined.reduce(
      function (all, link) {
        return all.concat(link.dataset.a, link.dataset.b);
      },
      [id]
    );
    svg.classList.add("has-focus");
    joined.forEach(function (link) {
      link.classList.add("is-lit");
    });
    nodes
      .filter(function (node) {
        return ids.indexOf(node.dataset.node) !== -1;
      })
      .forEach(function (node) {
        node.classList.add("is-lit");
      });
  }

  /* The nodes of one part. A node of the path wins over an influence. */
  function nodesOf(place) {
    const all = nodes.filter(function (node) {
      return node.dataset.go === place;
    });
    const path = all.filter(function (node) {
      return !node.classList.contains("node--inf");
    });
    return path.length ? path : all;
  }

  /* A ring around a node. It is a mark, not a control. */
  function haloFor(node) {
    const rect = LG.qs("rect", node);
    const halo = document.createElementNS(SVG_SPACE, "rect");
    const grow = { x: -HALO_GAP, y: -HALO_GAP, width: 2 * HALO_GAP, height: 2 * HALO_GAP, rx: HALO_GAP };
    Object.keys(grow).forEach(function (name) {
      halo.setAttribute(name, Number(rect.getAttribute(name)) + grow[name]);
    });
    halo.setAttribute("class", "map__halo");
    halo.setAttribute("aria-hidden", "true");
    node.parentNode.insertBefore(halo, node);
    return halo;
  }

  /* The line of the legend: the number and the name of the part. */
  function describeHere() {
    if (!here || !herePlace) return;
    const list = LG.scroll.steps();
    const number = list.indexOf(herePlace) + 1;
    const count = number ? LG.twoDigits(number) + " / " + LG.twoDigits(list.length) : "";
    here.step.textContent = [count, LG.placeName(herePlace)].filter(Boolean).join(" · ");
  }

  /* On a small screen the map is larger than the screen. The map moves, so the node is in view. */
  function showNode(node) {
    const box = svg.closest(".map__scroll");
    const layer = svg.closest(".map");
    if (!node || !box || !layer) return;
    const item = node.getBoundingClientRect();
    const frame = box.getBoundingClientRect();
    const outside = item.left < frame.left || item.right > frame.right;
    if (outside) box.scrollLeft += item.left + item.width / 2 - (frame.left + frame.width / 2);
    const below = item.bottom + HERE_MARGIN - window.innerHeight;
    if (below > 0) layer.scrollTop += below;
  }

  function clearHere() {
    halos.forEach(function (halo) {
      halo.remove();
    });
    halos = [];
    nodes.forEach(function (node) {
      node.classList.remove("is-here");
      node.removeAttribute("aria-current");
    });
    herePlace = "";
    if (!here) return;
    here.box.hidden = true;
    here.step.textContent = "";
  }

  /* The open map shows the part that the reader came from. A part without a node shows only the line. */
  function markHere(place) {
    clearHere();
    if (!svg || !place) return;
    const found = nodesOf(place);
    found.forEach(function (node) {
      node.classList.add("is-here");
      node.setAttribute("aria-current", "step");
    });
    halos = found.map(haloFor);
    herePlace = place;
    if (here) here.box.hidden = false;
    describeHere();
    showNode(found[0]);
  }

  /* The parts of the page that the open map covers. */
  function covered() {
    return LG.qsa(".beats, .pins, .finale > *").filter(function (el) {
      return !el.classList.contains("map");
    });
  }

  /* The keyboard and a screen reader stay out of the covered parts. */
  function setCovered(on) {
    covered().forEach(function (el) {
      el.inert = on;
    });
  }

  function focusOn(el) {
    if (el) el.focus({ preventScroll: true });
  }

  /* The open map leaves the flow of the page. Its section keeps its height, so no other part moves. */
  function holdRoom(on) {
    const box = svg ? svg.closest(".finale") : null;
    if (box) box.style.minHeight = on ? box.offsetHeight + "px" : "";
  }

  function inStage() {
    return root.classList.contains("is-present");
  }

  /* The mode, the language and the size of the screen set the layout. */
  function layoutKey() {
    return [inStage(), root.lang, window.innerWidth, window.innerHeight].join(" ");
  }

  /* After a change of the layout, the page returns to the same part, not to the same position. */
  function restore() {
    const back = opener && opener !== document.body && document.contains(opener) ? opener : null;
    if (layoutKey() === savedLayout) LG.scroll.setY(savedY);
    else LG.scroll.goTo(savedPlace, true);
    if (back) focusOn(back);
    else if (document.activeElement) document.activeElement.blur();
  }

  /* On close, the focus returns to the control that opened the map.
     keepPlace: a map link closed the layer, so the scroll code moves the page. */
  function setOpen(next, keepPlace) {
    if (next === open) return;
    let cameFrom = "";
    if (next) {
      opener = document.activeElement;
      savedY = LG.scroll.settle();
      savedPlace = LG.scroll.place();
      savedLayout = layoutKey();
      /* Stage mode knows the part that the page travels to. */
      cameFrom = LG.present.place();
      holdRoom(true);
    }
    open = next;
    root.classList.toggle("is-map", open);
    if (!open) holdRoom(false);
    LG.qsa('[data-action="map"]').forEach(function (button) {
      button.setAttribute("aria-pressed", String(open));
    });
    setCovered(open);
    LG.scroll.measure();
    markHere(cameFrom);
    if (open) focusOn(title);
    else if (!keepPlace) restore();
  }

  function onClick(event) {
    if (event.target.closest('[data-action="map"]')) {
      setOpen(!open);
      return;
    }
    if (open && event.target.closest(".map [data-go]")) setOpen(false, true);
  }

  function onKey(event) {
    if (event.key !== "Escape" || !open) return;
    /* Stage mode reads this mark and stays on. */
    event.preventDefault();
    setOpen(false);
  }

  function watch(node) {
    const id = node.dataset.node;
    node.addEventListener("pointerenter", function () {
      light(id);
    });
    node.addEventListener("focus", function () {
      light(id);
    });
    node.addEventListener("pointerleave", clear);
    node.addEventListener("blur", clear);
  }

  function init() {
    svg = LG.qs(".map svg");
    title = LG.qs(".map .title");
    if (title) title.setAttribute("tabindex", "-1");
    /* The capture phase closes the layer before the scroll code reads the page. */
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey);
    if (!svg) return;
    links = LG.qsa("[data-a]", svg);
    nodes = LG.qsa("[data-node]", svg);
    nodes.forEach(watch);
    const box = LG.qs(".map__here");
    here = box ? { box: box, step: LG.qs(".map__here-step", box) } : null;
    /* The open map puts the focus on the title. A screen reader then reads the line with the title. */
    if (box && box.id && title) title.setAttribute("aria-describedby", box.id);
    LG.on("language", describeHere);
  }

  LG.map = {
    init: init,
    toggle: function () {
      setOpen(!open);
    },
    isOpen: function () {
      return open;
    },
  };
})(window.LG);
