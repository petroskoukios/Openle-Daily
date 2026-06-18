/* ===================================================================
   Openle — daily chess opening puzzle
   Pure client-side. Data: window.OPENINGS = [{n,e,m,tier}, ...]
   =================================================================== */
(function () {
"use strict";

/* ---------- 1. Build the opening database ---------- */
const OPENINGS = window.OPENINGS.map((o, i) => {
  const moves = o.m.split(" ");
  const colon = o.n.indexOf(":");
  const family = (colon === -1 ? o.n : o.n.slice(0, colon)).trim();
  const segs = colon === -1 ? 0 : o.n.slice(colon + 1).split(",").length;
  return {
    id: i,
    name: o.n,
    eco: o.e,
    moves,
    movesStr: o.m,
    family,
    firstMove: moves[0],
    section: o.e[0],
    plies: moves.length,
    nameLower: o.n.toLowerCase(),
    segs,
    curatedTier: o.tier || "reserve",
  };
});

/* ---------- 1b. Difficulty tiers ----------
   Every playable opening has a manually reviewed tier in openings.js. Pools are
   cumulative: each difficulty includes all openings from the tiers below it. */
const DIFFS = ["easy", "medium", "hard", "expert"];
const DIFF_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert" };
const GUESS_LIMITS = { easy: 10, medium: 15, hard: 20, expert: 25 };
const HINT_COST = 3;
const TIER_ORDER = { easy: 0, medium: 1, hard: 2, expert: 3 };
function tierOf(o) {
  return o.curatedTier;
}
const POOLS = Object.fromEntries(DIFFS.map(diff => [
  diff,
  OPENINGS.filter(o => DIFFS.includes(tierOf(o)) && TIER_ORDER[tierOf(o)] <= TIER_ORDER[diff]),
]));
const DIFF_LIMITS = Object.fromEntries(DIFFS.map(diff => [diff, POOLS[diff].length]));

/* ---------- 2. Deterministic daily selection ---------- */
function localDayNumber(d = new Date()) {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((local - new Date(2024, 0, 1)) / 86400000);
}
// xmur3 + mulberry32 for a stable seeded shuffle of the pool.
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// One fixed permutation per difficulty, so consecutive days don't repeat for a
// long time and each tier walks its own independent order.
const PERMS = {};
for (const diff of DIFFS) {
  const idx = POOLS[diff].map((_, i) => i);
  const rnd = mulberry32(xmur3("opening-tree-v1:" + diff)());
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  PERMS[diff] = idx;
}
// Each (day, difficulty) is a distinct deterministic puzzle, identical for everyone.
function dailyTarget(dayNo, diff) {
  const perm = PERMS[diff], pool = POOLS[diff];
  return pool[perm[((dayNo % perm.length) + perm.length) % perm.length]];
}

/* ---------- 3. Comparison engine ---------- */
function compare(guess, target) {
  const g = guess.moves, t = target.moves;
  let k = 0;
  const max = Math.min(g.length, t.length);
  while (k < max && g[k] === t[k]) k++;

  return {
    guessId: guess.id,
    sharedPlies: k,
    isWin: guess.movesStr === target.movesStr,
  };
}

function confirmedDepth(state) {
  let best = state.hintPlies || 0;
  for (const cmp of state.results) best = Math.max(best, cmp.sharedPlies);
  return Math.min(best, state.target.moves.length);
}

function hintsUsed(state) {
  return state.hintCount || 0;
}

function guessBudgetUsed(state) {
  return state.results.length + hintsUsed(state) * HINT_COST;
}

function guessLimit(stateOrDiff = state) {
  const diff = typeof stateOrDiff === "string" ? stateOrDiff : stateOrDiff?.difficulty;
  return GUESS_LIMITS[diff] || GUESS_LIMITS.medium;
}

function guessBudgetLeft(state) {
  return Math.max(0, guessLimit(state) - guessBudgetUsed(state));
}

function guessWord(n) {
  return n + (n === 1 ? " guess" : " guesses");
}

function hintWord(n) {
  return n + (n === 1 ? " hint" : " hints");
}

/* ---------- 4. Move-notation formatting ---------- */
function esc(s) { return s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

// Render an array of plies as "1.e4 e5 2.Nf3" with numbered spans.
function fmtMoves(moves, cls) {
  if (!moves.length) return "";
  let out = "", n = 1;
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) out += `<span class="num">${n}.</span>`;
    else if (i === 0) {} // never (first ply is white)
    out += `<span class="${cls || ""}">${esc(moves[i])}</span> `;
    if (i % 2 === 1) n++;
  }
  return out.trim();
}

// History line: shared path + first diverging move + rest.
function fmtGuessLine(guess, cmp) {
  const m = guess.moves, k = cmp.sharedPlies;
  let out = "", n = 1;
  for (let i = 0; i < m.length; i++) {
    if (i % 2 === 0) out += `<span class="num">${n}.</span>`;
    let cls = "rest";
    if (i < k) cls = "sh";
    else if (i === k) cls = "dv";
    out += `<span class="${cls}">${esc(m[i])}</span> `;
    if (i % 2 === 1) n++;
  }
  return out.trim();
}


/* ---------- 5. Tree builder & renderer ---------- */
function buildTree(state) {
  const target = state.target;
  const root = { move: null, depth: 0, children: new Map(), onTarget: false, guesses: [], guessIds: new Set() };
  const get = (node, mv, depth) => {
    if (!node.children.has(mv))
      node.children.set(mv, { move: mv, depth, children: new Map(), onTarget: false, guesses: [], guessIds: new Set() });
    return node.children.get(mv);
  };
  const insert = (moves, upTo, onTargetUpTo, guessId = null) => {
    let node = root;
    for (let i = 0; i < upTo; i++) {
      node = get(node, moves[i], i + 1);
      if (i < onTargetUpTo) node.onTarget = true;
      if (guessId != null) node.guessIds.add(guessId);
    }
    return node;
  };

  // Deepest confirmed-shared depth across all guesses.
  let best = confirmedDepth(state);

  let tip = root;
  if (state.solved || state.gaveUp) {
    // Reveal the full target line (on a win, or when the player gives up).
    const leaf = insert(target.moves, target.moves.length, target.moves.length);
    leaf.isTargetEnd = true;
  } else {
    // Only the confirmed trunk is shown.
    tip = best > 0 ? insert(target.moves, best, best) : root;
    tip.isTip = true;
  }

  // Full guessed lines are safe to show: the player already chose them. Keeping
  // them lets wrong guesses form their own shared subtrees after they diverge.
  for (const cmp of state.results) {
    const g = OPENINGS[cmp.guessId];
    const leaf = insert(g.moves, g.moves.length, cmp.sharedPlies, g.id);
    leaf.guesses.push(g);
  }

  return { root, tip, best };
}

const TREE_ZOOM_MIN = .5;
const TREE_FULLSCREEN_ZOOM_MIN = .2;
const TREE_ZOOM_MAX = 2;
const TREE_FULLSCREEN_ZOOM_MAX = 4;
const TREE_ZOOM_STEP = .15;
const TREE_BUTTON_ZOOM_FACTOR = 1.3;
const TREE_DEFAULT_ZOOM = 1.1;
const treeViews = new WeakMap();

function treeView(el) {
  if (!treeViews.has(el)) {
    const zoom = el.id === "tree" ? TREE_DEFAULT_ZOOM : 1;
    treeViews.set(el, { zoom, zoomTarget: zoom, baseWidth: 0, baseHeight: 0 });
  }
  return treeViews.get(el);
}

function treeMotionAllowed() {
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function panTreeTo(el, left, top, smooth = false) {
  left = Math.max(0, left);
  top = Math.max(0, top);
  if (smooth && treeMotionAllowed()) el.scrollTo({ left, top, behavior: "smooth" });
  else { el.scrollLeft = left; el.scrollTop = top; }
}

function renderTreeInto(state, el) {
  const view = treeView(el);
  if (view.zoomFrame) {
    cancelAnimationFrame(view.zoomFrame);
    view.zoomFrame = null;
    view.zoomTarget = view.zoom;
  }
  const { root, tip } = buildTree(state);
  const latestGuessId = state.results.length ? state.results[state.results.length - 1].guessId : null;
  const targetTone = "target";
  let nextId = 0;

  const create = (type, tone, width, height, html, extra = {}) => ({
    id: ++nextId, type, tone, edgeTone: tone, width, height, html,
    children: [], latest: false, main: false, sortKey: "", ...extra,
  });
  const moveParts = (move, depth) => ({
    number: depth % 2 ? `${Math.ceil(depth / 2)}.` : `${depth / 2}...`,
    move,
  });
  const guessLeaf = (g, tone, latest) => create(
    "guess", tone, 140, 38,
    `<span class="tree-node__name" title="${esc(g.name)}">${esc(g.name)}</span>`,
    { latest, sortKey: g.name, edgeTone: tone === "here" ? "target-soft" : "off" },
  );
  const answerLeaf = () => create(
    "answer", targetTone, 162, 46,
    `<span class="tree-node__answer-mark">${state.solved ? "★" : "Revealed"}</span>` +
      `<span class="tree-node__name">${esc(state.target.name)}</span>`,
    { main: true, latest: state.solved, sortKey: state.target.name },
  );
  const tipLeaf = () => {
    const lineFound = confirmedDepth(state) >= state.target.moves.length;
    const prompt = !state.results.length && confirmedDepth(state) === 0
      ? "Make a guess"
      : lineFound ? "Name the opening" : "Target continues";
    return create(
      "tip", "tip", 116, 34,
      `<span class="tree-node__question">?</span><span class="tree-node__prompt">${prompt}</span>`,
      { main: true, edgeTone: "hidden", sortKey: "target" },
    );
  };

  const orderChildren = children => {
    const main = children.find(child => child.main);
    const sides = children.filter(child => child !== main)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    if (!main) return sides;
    const split = Math.ceil(sides.length / 2);
    return [...sides.slice(0, split), main, ...sides.slice(split)];
  };

  // Standard notation: show the move number on White's moves and on the first
  // token of a run; a Black move that directly follows its White move drops it
  // ("1. d4 Nf6", not "1. d4 1... Nf6").
  const showMoveNumber = (depth, i) => i === 0 || depth % 2 === 1;
  const seqTokenNum = (node, i) =>
    showMoveNumber(node.depth, i) ? `<i>${moveParts(node.move, node.depth).number}</i>` : "";

  const seqMetrics = run => {
    // Estimate each move token's pixel width (small number prefix + SAN + gap),
    // then first-fit pack them into rows. This makes the line count match how the
    // tokens actually wrap, so the height never clips a wrapped line.
    const tokenPx = run.map((node, i) => {
      const numLen = showMoveNumber(node.depth, i) ? moveParts(node.move, node.depth).number.length : 0;
      // ~4.7px/char number (8px) + ~6.35px/char SAN (10px) + gap (margin + the
      // whitespace between inline-block tokens). Rounded up so width never undercounts.
      return numLen * 4.9 + node.move.length * 6.5 + 8;
    });
    const inner = Math.min(152, Math.max(70, tokenPx.reduce((a, b) => a + b, 0)));
    let lines = 1, used = 0;
    for (const w of tokenPx) {
      if (used > 0 && used + w > inner) { lines++; used = w; }
      else used += w;
    }
    return { width: Math.ceil(inner + 12), height: 13 + lines * 14 };
  };

  const displayOffPath = start => {
    const run = [start];
    let end = start;
    while (end.guesses.length === 0 && end.children.size === 1) {
      const next = [...end.children.values()][0];
      if (next.onTarget) break;
      run.push(next);
      end = next;
    }
    const sequence = run.map((node, i) =>
      `<span>${seqTokenNum(node, i)}${esc(node.move)}</span>`
    ).join(" ");
    const { width, height } = seqMetrics(run);
    const node = create(
      "sequence", "off", width, height,
      `<span class="tree-node__sequence">${sequence}</span>`,
      {
        latest: latestGuessId != null && run.some(item => item.guessIds.has(latestGuessId)),
        sortKey: run.map(item => item.move).join(" "),
      },
    );
    const branches = [...end.children.values()].map(child => child.onTarget ? displayTargetMove(child) : displayOffPath(child));
    const leaves = end.guesses.map(g => guessLeaf(g, end.onTarget ? "here" : "off", g.id === latestGuessId));
    node.children = orderChildren([...branches, ...leaves]);
    return node;
  };

  const displayTargetMove = raw => {
    // Collapse a linear run of confirmed target moves — those with no diverging
    // guess and a single on-target child — into one node, e.g. "1. d4 Nf6",
    // rather than one node per ply. Splits only where a real branch occurs.
    const run = [raw];
    let end = raw;
    while (end.guesses.length === 0 && end.children.size === 1 && end !== tip && !end.isTargetEnd) {
      const next = [...end.children.values()][0];
      if (!next.onTarget) break;
      run.push(next);
      end = next;
    }
    const sequence = run.map((node, i) =>
      `<span class="tree-seq__move" data-tree-depth="${node.depth}" role="button" tabindex="0" title="Show this position on the board">` +
        `${seqTokenNum(node, i)}${esc(node.move)}</span>`
    ).join(" ");
    const { width, height } = seqMetrics(run);
    const node = create(
      "sequence", targetTone, width, height,
      `<span class="tree-node__sequence">${sequence}</span>`,
      {
        main: true,
        latest: latestGuessId != null && run.some(item => item.guessIds.has(latestGuessId)),
        sortKey: raw.move,
      },
    );
    const branches = [...end.children.values()].map(child => child.onTarget ? displayTargetMove(child) : displayOffPath(child));
    const leaves = end.isTargetEnd
      ? [answerLeaf()]
      : end.guesses.map(g => guessLeaf(g, "here", g.id === latestGuessId));
    if (end === tip && !state.solved && !state.gaveUp) leaves.push(tipLeaf());
    node.children = orderChildren([...branches, ...leaves]);
    return node;
  };

  const displayRoot = create(
    "root", "root", 116, 27, "Starting position",
    { main: true, boardDepth: 0, sortKey: "root" },
  );
  const rootBranches = [...root.children.values()].map(child => child.onTarget ? displayTargetMove(child) : displayOffPath(child));
  if (tip === root && !state.solved && !state.gaveUp) rootBranches.push(tipLeaf());
  displayRoot.children = orderChildren(rootBranches);

  const H_GAP = 8, V_GAP = 24, PAD = 10;
  const allNodes = [], levelHeights = [];
  const assignLevels = (node, level) => {
    node.level = level;
    allNodes.push(node);
    levelHeights[level] = Math.max(levelHeights[level] || 0, node.height);
    for (const child of node.children) assignLevels(child, level + 1);
  };
  const measure = node => {
    for (const child of node.children) measure(child);
    node.childrenSpan = node.children.reduce((sum, child) => sum + child.subtreeWidth, 0) +
      Math.max(0, node.children.length - 1) * H_GAP;
    node.subtreeWidth = Math.max(node.width, node.childrenSpan);
  };
  assignLevels(displayRoot, 0);
  measure(displayRoot);

  const levelTops = [];
  let nextTop = PAD;
  for (let i = 0; i < levelHeights.length; i++) {
    levelTops[i] = nextTop;
    nextTop += levelHeights[i] + V_GAP;
  }
  const minWidth = Math.max(430, el.clientWidth || 0);
  const svgWidth = Math.ceil(Math.max(minWidth, displayRoot.subtreeWidth + PAD * 2));
  const svgHeight = Math.ceil(nextTop - V_GAP + PAD);
  view.baseWidth = svgWidth;
  view.baseHeight = svgHeight;
  view.contentWidth = displayRoot.subtreeWidth + PAD * 2;
  view.contentHeight = svgHeight;
  view.contentCenterX = svgWidth / 2;
  view.contentCenterY = svgHeight / 2;
  // Over-pan slack: empty space around the tree so it can be dragged well past
  // its own edges in every direction, not just up to the content bounds.
  const slackX = Math.max(160, Math.round((el.clientWidth || 0) * 0.8));
  const slackY = Math.max(140, Math.round((el.clientHeight || 0) * 0.8));
  view.padX = slackX;
  view.padY = slackY;
  const place = (node, left) => {
    node.cx = left + node.subtreeWidth / 2;
    node.x = node.cx - node.width / 2;
    node.y = levelTops[node.level] + (levelHeights[node.level] - node.height) / 2;
    let childLeft = left + (node.subtreeWidth - node.childrenSpan) / 2;
    for (const child of node.children) {
      place(child, childLeft);
      childLeft += child.subtreeWidth + H_GAP;
    }
  };
  place(displayRoot, (svgWidth - displayRoot.subtreeWidth) / 2);

  const edges = [];
  const collectEdges = node => {
    for (const child of node.children) {
      const sy = node.y + node.height, ey = child.y;
      const bend = Math.max(10, (ey - sy) * .46);
      const cls = `tree-edge tree-edge--${child.edgeTone}${child.latest ? " is-latest" : ""}`;
      edges.push(`<path class="${cls}" d="M ${node.cx} ${sy} C ${node.cx} ${sy + bend}, ${child.cx} ${ey - bend}, ${child.cx} ${ey}"/>`);
      collectEdges(child);
    }
  };
  collectEdges(displayRoot);

  const nodeMarkup = node => {
    const clickable = node.boardDepth != null;
    const tag = clickable ? "button" : "div";
    const depthAttr = clickable ? ` data-tree-depth="${node.boardDepth}" title="Show this position on the board"` : "";
    return `<foreignObject x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}">` +
      `<${tag} xmlns="http://www.w3.org/1999/xhtml"${clickable ? " type=\"button\"" : ""} ` +
      `class="tree-node tree-node--${node.type} tree-node--${node.tone}${node.latest ? " is-latest" : ""}"${depthAttr}>` +
      `${node.html}</${tag}></foreignObject>`;
  };
  const renderW = Math.round(svgWidth * view.zoom);
  const renderH = Math.round(svgHeight * view.zoom);
  const prevScrollLeft = el.scrollLeft, prevScrollTop = el.scrollTop;
  el.innerHTML = `<div class="tree-pan" style="width:${renderW + slackX * 2}px;height:${renderH + slackY * 2}px">` +
    `<svg class="tree-map" style="left:${slackX}px;top:${slackY}px" viewBox="0 0 ${svgWidth} ${svgHeight}" ` +
    `width="${renderW}" height="${renderH}" role="group" aria-label="Opening tree">` +
    `<g class="tree-edges">${edges.join("")}</g><g class="tree-nodes">${allNodes.map(nodeMarkup).join("")}</g></svg></div>`;

  el.querySelectorAll("[data-tree-depth]").forEach(node => {
    const activate = () => goBoardDepth(Number(node.dataset.treeDepth));
    node.addEventListener("click", activate);
    if (node.tagName === "BUTTON") return;
    node.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      activate();
    });
  });

  const mainNodes = allNodes.filter(node => node.main);
  const targetFocus = mainNodes[mainNodes.length - 1] || displayRoot;
  const latestNodes = allNodes.filter(node => node.latest);
  const latestFocus = latestNodes[latestNodes.length - 1];
  const focusPts = (latestFocus ? [latestFocus, targetFocus] : [targetFocus])
    .map(node => ({ x: node.cx, y: node.y + node.height / 2 }));
  const focusX = focusPts.reduce((s, p) => s + p.x, 0) / focusPts.length;
  const focusY = focusPts.reduce((s, p) => s + p.y, 0) / focusPts.length;
  // Centered scroll target. The vertical clamp anchors a shallow tree to the top
  // (slack) rather than floating it mid-slack.
  const centeredLeft = Math.max(0, slackX + focusX * view.zoom - el.clientWidth / 2);
  const centeredTop = slackY + Math.max(0, focusY * view.zoom - el.clientHeight / 2);
  // A guess or hint shouldn't yank the tree back to center: hold the player's
  // current view and only re-pan when a focus point drifts out of sight. A new
  // puzzle (mode/difficulty/target change, or solve/give-up) re-centers afresh.
  const puzzleKey = `${state.mode}|${state.difficulty}|${state.target.id}|${state.dayNo}|${state.solved}|${state.gaveUp}`;
  const targetKey = `${state.mode}|${state.difficulty}|${state.target.id}|${state.dayNo}`;
  const freshView = view.puzzleKey !== puzzleKey;
  const newTarget = view.targetKey !== targetKey;
  const rootCx = displayRoot.cx;
  requestAnimationFrame(() => {
    if (freshView) {
      panTreeTo(el, centeredLeft, centeredTop, !newTarget && view.puzzleKey != null);
    } else {
      // Hold position, compensating for the tree re-centering as it grows wider.
      const dxRoot = view.prevRootCx == null ? 0 : (rootCx - view.prevRootCx) * view.zoom;
      let left = prevScrollLeft + dxRoot, top = prevScrollTop;
      const mx = el.clientWidth * 0.1, my = el.clientHeight * 0.1;
      const outOfView = focusPts.some(p => {
        const sx = slackX + p.x * view.zoom - left, sy = slackY + p.y * view.zoom - top;
        return sx < mx || sx > el.clientWidth - mx || sy < my || sy > el.clientHeight - my;
      });
      if (outOfView) panTreeTo(el, centeredLeft, centeredTop, true);
      else panTreeTo(el, left, top);
    }
    view.puzzleKey = puzzleKey;
    view.targetKey = targetKey;
    view.prevRootCx = rootCx;
  });
}

function renderTree(state) {
  renderTreeInto(state, document.getElementById("tree"));
  const fullscreenTree = document.getElementById("treeFullscreen");
  if (fullscreenTree.closest(".modal-bg").classList.contains("open")) {
    renderTreeInto(state, fullscreenTree);
  }
}

function applyTreeZoom(el, view, zoom, contentX, contentY, anchorX, anchorY) {
  view.zoom = zoom;
  const padX = view.padX || 0, padY = view.padY || 0;
  const renderW = Math.round(view.baseWidth * zoom);
  const renderH = Math.round(view.baseHeight * zoom);
  const map = el.querySelector(".tree-map");
  if (!map) return;
  map.setAttribute("width", renderW);
  map.setAttribute("height", renderH);
  const pan = el.querySelector(".tree-pan");
  if (pan) {
    pan.style.width = (renderW + padX * 2) + "px";
    pan.style.height = (renderH + padY * 2) + "px";
  }
  el.scrollLeft = padX + contentX * zoom - anchorX;
  el.scrollTop = padY + contentY * zoom - anchorY;
}

function fitFullscreenTree(el) {
  const view = treeView(el);
  if (!view.baseWidth || !view.baseHeight) return;
  if (view.zoomFrame) {
    cancelAnimationFrame(view.zoomFrame);
    view.zoomFrame = null;
  }

  const marginX = Math.min(36, el.clientWidth * .03);
  const marginY = Math.min(32, el.clientHeight * .04);
  const fitX = (el.clientWidth - marginX * 2) / view.contentWidth;
  const fitY = (el.clientHeight - marginY * 2) / view.contentHeight;
  const zoom = Math.max(TREE_FULLSCREEN_ZOOM_MIN,
    Math.min(TREE_FULLSCREEN_ZOOM_MAX, fitX, fitY));
  view.zoomTarget = zoom;
  applyTreeZoom(el, view, zoom, view.contentCenterX, view.contentCenterY,
    el.clientWidth / 2, el.clientHeight / 2);
}

function zoomTree(el, amount, clientX = null, clientY = null, smooth = false) {
  const view = treeView(el);
  const minZoom = el.id === "treeFullscreen" ? TREE_FULLSCREEN_ZOOM_MIN : TREE_ZOOM_MIN;
  const maxZoom = el.id === "treeFullscreen" ? TREE_FULLSCREEN_ZOOM_MAX : TREE_ZOOM_MAX;
  const nextZoom = Math.min(maxZoom, Math.max(minZoom,
    Math.round((view.zoom + amount) * 100) / 100));
  if (nextZoom === view.zoom || !view.baseWidth) return;
  view.zoomTarget = nextZoom;

  const rect = el.getBoundingClientRect();
  const anchorX = clientX == null ? el.clientWidth / 2 : clientX - rect.left;
  const anchorY = clientY == null ? el.clientHeight / 2 : clientY - rect.top;
  const padX = view.padX || 0, padY = view.padY || 0;
  const contentX = (el.scrollLeft + anchorX - padX) / view.zoom;
  const contentY = (el.scrollTop + anchorY - padY) / view.zoom;

  if (view.zoomFrame) cancelAnimationFrame(view.zoomFrame);
  if (!smooth || !treeMotionAllowed()) {
    view.zoomFrame = null;
    applyTreeZoom(el, view, nextZoom, contentX, contentY, anchorX, anchorY);
    return;
  }

  const startZoom = view.zoom;
  const startTime = performance.now();
  const duration = 190;
  const animate = now => {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    applyTreeZoom(el, view, startZoom + (nextZoom - startZoom) * eased,
      contentX, contentY, anchorX, anchorY);
    if (t < 1) view.zoomFrame = requestAnimationFrame(animate);
    else view.zoomFrame = null;
  };
  view.zoomFrame = requestAnimationFrame(animate);
}

function zoomTreeByFactor(el, factor) {
  const view = treeView(el);
  const base = view.zoomFrame ? view.zoomTarget : view.zoom;
  zoomTree(el, base * factor - view.zoom, null, null, true);
}

function enableTreeViewport(el) {
  let drag = null;
  let suppressClick = false;

  el.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    drag = {
      id: e.pointerId, x: e.clientX, y: e.clientY,
      left: el.scrollLeft, top: el.scrollTop, moved: false,
    };
    suppressClick = false;
  });
  el.addEventListener("pointermove", e => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      el.setPointerCapture(e.pointerId);
      el.classList.add("is-panning");
    }
    el.scrollLeft = drag.left - dx;
    el.scrollTop = drag.top - dy;
  });
  const endDrag = e => {
    if (!drag || drag.id !== e.pointerId) return;
    suppressClick = drag.moved;
    drag = null;
    el.classList.remove("is-panning");
  };
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);
  el.addEventListener("click", e => {
    if (!suppressClick) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClick = false;
  }, true);
  el.addEventListener("dragstart", e => e.preventDefault());
  el.addEventListener("wheel", e => {
    if (!e.ctrlKey && !e.metaKey) {
      if (el.id === "treeFullscreen") e.preventDefault();
      return;
    }
    e.preventDefault();
    zoomTree(el, e.deltaY < 0 ? TREE_ZOOM_STEP : -TREE_ZOOM_STEP, e.clientX, e.clientY);
  }, { passive: false });
}

/* ---------- 6. Guess log ---------- */
// A simple, most-recent-first list of guesses. Each shows the line with shared
// moves plus the first diverging move — the tree carries the rest.
function renderHistory(state) {
  const panel = document.getElementById("historyPanel");
  if (!state.results.length) { panel.style.display = "none"; return; }
  panel.style.display = "";

  let bestPlies = -1;
  for (const c of state.results) bestPlies = Math.max(bestPlies, c.sharedPlies);

  const items = state.results.slice().reverse().map(cmp => {
    const g = OPENINGS[cmp.guessId];
    const cls = cmp.isWin ? "win" : (cmp.sharedPlies === bestPlies && !state.solved ? "best" : "");
    return `<div class="ghist-item ${cls}">
      <div class="gn">${cmp.isWin ? "★ " : ""}${esc(g.name)}<span class="eco">${esc(g.eco)}</span></div>
      <div class="line">${fmtGuessLine(g, cmp)}</div>
    </div>`;
  });
  document.getElementById("historyBody").innerHTML = items.join("");
}

/* ---------- 6b. Board: how far you've gotten ---------- */
const PIECE_NAME = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const pieceColor = p => (p === p.toUpperCase() ? "w" : "b");
// Board pieces are CC BY-SA SVGs by Uray M. János in pieces-svg/ (see README credits).
function pieceImg(p, cls = "") {
  const color = pieceColor(p);
  return `<img class="pc ${color}${cls}" src="pieces-svg/${PIECE_NAME[p.toLowerCase()]}-${color}.svg" alt="" draggable="false">`;
}
let boardPlaybackDepth = null;
let boardSlideFromDepth = null;
let boardPlaybackTimers = [];
let boardStepTimer = null;
const BOARD_PLAYBACK_STEP_MS = 280;
let boardManualDepth = null;
let boardQueuedDepth = null;

function boardMaxDepth(state) {
  return (state.solved || state.gaveUp) ? state.target.moves.length : confirmedDepth(state);
}

function movingPieces(fromBoard, toBoard) {
  const removed = [], added = [];
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const from = fromBoard[r][f], to = toBoard[r][f];
    if (from !== to) {
      if (from) removed.push({ f, r, p: from });
      if (to) added.push({ f, r, p: to });
    }
  }
  const moves = [];
  for (const a of added) {
    let idx = removed.findIndex(x => x.p === a.p);
    if (idx < 0) idx = removed.findIndex(x => pieceColor(x.p) === pieceColor(a.p));
    if (idx < 0) continue;
    const src = removed.splice(idx, 1)[0];
    moves.push({ fromF: src.f, fromR: src.r, toF: a.f, toR: a.r, p: a.p });
  }
  return moves;
}

function renderBoard(state) {
  const tgt = state.target;
  const done = state.solved || state.gaveUp;
  const playing = boardPlaybackDepth != null;
  const sliding = boardSlideFromDepth != null;
  // depth shown = deepest confirmed-shared line, or the whole target once finished.
  let depth = 0;
  if (playing) depth = boardPlaybackDepth;
  else if (boardManualDepth != null) depth = Math.min(boardManualDepth, boardMaxDepth(state));
  else depth = boardMaxDepth(state);
  if (boardManualDepth != null && boardManualDepth !== depth) boardManualDepth = depth;

  const board = OTChess.positionAfter(tgt.moves, depth);
  const slideFrom = sliding ? OTChess.positionAfter(tgt.moves, boardSlideFromDepth) : null;
  const shownBoard = slideFrom || board;
  const prev = OTChess.positionAfter(tgt.moves, Math.max(0, depth - 1));
  const changed = new Set();
  if (depth > 0) for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++)
    if (board[r][f] !== prev[r][f]) changed.add(r * 8 + f);
  const slides = slideFrom ? movingPieces(slideFrom, board) : [];
  const hide = new Set();
  for (const m of slides) {
    hide.add(m.fromR * 8 + m.fromF);
    hide.add(m.toR * 8 + m.toF);
  }

  let html = "";
  for (let r = 7; r >= 0; r--) {
    for (let f = 0; f < 8; f++) {
      const p = shownBoard[r][f];
      const hidden = hide.has(r * 8 + f) ? " hide" : "";
      const glyph = p ? pieceImg(p, hidden) : "";
      const cls = ((r + f) % 2 === 0 ? "d" : "l") + (changed.has(r * 8 + f) ? " hl" : "");
      const coord = (f === 0 ? `<span class="rk">${r + 1}</span>` : "") +
                    (r === 0 ? `<span class="fl">${OTChess.FILES[f]}</span>` : "");
      html += `<div class="sq ${cls}">${coord}${glyph}</div>`;
    }
  }
  for (const m of slides) {
    html += `<div class="move-ghost" style="--from-f:${m.fromF};--from-r:${m.fromR};--to-f:${m.toF};--to-r:${m.toR}">` +
      `${pieceImg(m.p)}</div>`;
  }
  document.getElementById("board").innerHTML = html;

  const title = document.getElementById("boardTitle");
  const cap = document.getElementById("boardCap");
  const prevBtn = document.getElementById("boardPrev");
  const nextBtn = document.getElementById("boardNext");
  const maxDepth = boardMaxDepth(state);
  if (prevBtn && nextBtn) {
    const queued = boardQueuedDepth ?? depth;
    prevBtn.disabled = playing || queued <= 0;
    nextBtn.disabled = playing || queued >= maxDepth;
  }
  if (playing) {
    title.textContent = "How far you've gotten";
    cap.innerHTML = depth === 0
      ? `<span class="muted">starting position</span>`
      : `<span class="ln">${fmtMoves(tgt.moves.slice(0, depth), "")}</span>` +
        `<span class="muted"> · ${depth} opening ${depth === 1 ? "move" : "moves"} matched</span>`;
  } else if (done) {
    title.textContent = state.solved ? "Solved — target position" : "Revealed — target position";
    cap.innerHTML = `<span class="ln">${fmtMoves(tgt.moves, "")}</span>`;
  } else if (depth === 0) {
    title.textContent = "How far you've gotten";
    cap.innerHTML = `<span class="muted">Starting position — no shared moves yet</span>`;
  } else {
    title.textContent = "How far you've gotten";
    cap.innerHTML = `<span class="ln">${fmtMoves(tgt.moves.slice(0, depth), "")}</span>` +
      `<span class="muted"> · ${depth} opening ${depth === 1 ? "move" : "moves"} matched</span>`;
  }
}

function clearBoardPlayback() {
  for (const t of boardPlaybackTimers) clearTimeout(t);
  clearTimeout(boardStepTimer);
  boardPlaybackTimers = [];
  boardStepTimer = null;
  boardPlaybackDepth = null;
  boardSlideFromDepth = null;
  boardQueuedDepth = null;
}

function resetBoardNav() {
  boardManualDepth = null;
  boardQueuedDepth = null;
}

function currentBoardDepth() {
  return boardManualDepth == null ? boardMaxDepth(state) : boardManualDepth;
}

function playQueuedBoardStep() {
  if (!state || boardPlaybackDepth != null || boardSlideFromDepth != null || boardQueuedDepth == null) return;
  const maxDepth = boardMaxDepth(state);
  const current = currentBoardDepth();
  if (boardQueuedDepth === current) { boardQueuedDepth = null; renderBoard(state); return; }
  const next = current + Math.sign(boardQueuedDepth - current);
  boardSlideFromDepth = current;
  boardManualDepth = Math.max(0, Math.min(maxDepth, next));
  renderBoard(state);
  boardStepTimer = setTimeout(() => {
    boardSlideFromDepth = null;
    boardStepTimer = null;
    if (boardQueuedDepth !== boardManualDepth) playQueuedBoardStep();
    else { boardQueuedDepth = null; renderBoard(state); }
  }, BOARD_PLAYBACK_STEP_MS);
}

function stepBoard(delta) {
  if (!state || boardPlaybackDepth != null) return;
  const maxDepth = boardMaxDepth(state);
  const base = boardQueuedDepth ?? currentBoardDepth();
  const next = Math.max(0, Math.min(maxDepth, base + delta));
  if (next === base) return;
  boardQueuedDepth = next;
  playQueuedBoardStep();
}

function goBoardDepth(depth) {
  if (!state) return;
  clearBoardPlayback();
  const destination = Math.max(0, Math.min(boardMaxDepth(state), depth));
  const current = currentBoardDepth();
  if (destination === current) { renderBoard(state); return; }
  boardQueuedDepth = destination;
  playQueuedBoardStep();
}

function animateBoardProgress(fromDepth, toDepth) {
  clearBoardPlayback();
  resetBoardNav();
  if (toDepth <= fromDepth) return;
  boardPlaybackDepth = fromDepth;
  for (let d = fromDepth + 1; d <= toDepth; d++) {
    boardPlaybackTimers.push(setTimeout(() => {
      boardPlaybackDepth = d;
      boardSlideFromDepth = d - 1;
      renderBoard(state);
      if (d === toDepth) {
        boardPlaybackTimers.push(setTimeout(() => {
          boardPlaybackDepth = null;
          boardSlideFromDepth = null;
          renderBoard(state);
        }, BOARD_PLAYBACK_STEP_MS));
      }
    }, (d - fromDepth) * BOARD_PLAYBACK_STEP_MS));
  }
}

/* ---------- 7. Autocomplete ---------- */
const input = document.getElementById("guessInput");
const suggestEl = document.getElementById("suggest");
const moveSearchToggle = document.getElementById("moveSearchToggle");
const MOVE_SEARCH_KEY = "ot.moveSearch";
function loadMoveSearchEnabled() {
  try { return JSON.parse(localStorage.getItem(MOVE_SEARCH_KEY)) === true; } catch { return false; }
}
let moveSearchEnabled = loadMoveSearchEnabled();
moveSearchToggle.checked = moveSearchEnabled;
let activeIdx = -1, currentList = [];

function scoreMatch(o, tokens, raw) {
  // require every token to appear somewhere
  for (const tk of tokens) if (o.nameLower.indexOf(tk) === -1 && o.eco.toLowerCase().indexOf(tk) === -1) return -1;
  let s = 0;
  if (o.nameLower === raw) s += 1000;
  if (o.nameLower.startsWith(raw)) s += 200;
  if (o.nameLower.startsWith(tokens[0])) s += 60;
  // word-boundary bonus
  if (new RegExp("\\b" + tokens[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(o.nameLower)) s += 30;
  s -= o.name.length * 0.05;       // prefer shorter / canonical names
  s -= o.segs * 2;
  return s;
}

// A token is "move-ish" if it begins like SAN (file a-h, piece NBRQK, or O) and
// continues only with SAN characters. Opening names contain other letters, so they
// naturally fall through to name search.
const SANISH = /^[a-hnbrqko][a-h1-8xo+#=-]*$/i;
function looksLikeMoves(raw) {
  const toks = raw.replace(/\d+\.+/g, " ").trim().split(/\s+/).filter(Boolean);
  return toks.length > 0 && toks.every(t => SANISH.test(t));
}
function moveTokens(raw) {
  return raw.replace(/\d+\.+/g, " ").trim().split(/\s+/).filter(Boolean);
}
// Search is limited to the current difficulty's pool — on Easy you only see
// (and can only guess) Easy openings, and so on for each tier.
function activePool() { return POOLS[state.difficulty]; }

function moveSearch(raw) {
  const q = moveTokens(raw).map(t => t.toLowerCase());
  const last = q.length - 1;
  const out = [];
  for (const o of activePool()) {
    const m = o.moves;
    if (m.length < q.length) continue;
    let ok = true;
    for (let i = 0; i < q.length; i++) {
      const mv = m[i].toLowerCase();
      if (i < last ? mv !== q[i] : !mv.startsWith(q[i])) { ok = false; break; }
    }
    if (ok) out.push(o);
  }
  out.sort((a, b) => (a.plies === q.length ? -1 : 0) - (b.plies === q.length ? -1 : 0)
    || a.plies - b.plies || a.name.localeCompare(b.name));
  return out.slice(0, 50);
}
function search(q) {
  const raw = q.trim().toLowerCase();
  if (!raw) return { mode: "name", list: [] };
  if (moveSearchEnabled && looksLikeMoves(raw)) return { mode: "move", list: moveSearch(raw) };
  const tokens = raw.split(/\s+/).filter(Boolean);
  const out = [];
  for (const o of activePool()) {
    const s = scoreMatch(o, tokens, raw);
    if (s > -1) out.push([s, o]);
  }
  out.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
  return { mode: "name", list: out.slice(0, 50).map(x => x[1]) };
}

function highlight(name, tokens) {
  let html = esc(name);
  for (const tk of tokens) {
    if (!tk) continue;
    const re = new RegExp("(" + tk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
    html = html.replace(re, "<em>$1</em>");
  }
  return html;
}

// Move preview with the matched prefix emphasised.
function movePreview(o, matchedPlies) {
  const show = Math.min(o.moves.length, Math.max(6, matchedPlies + 1));
  const parts = o.moves.slice(0, show).map((mv, i) =>
    i < matchedPlies ? `<em>${esc(mv)}</em>` : esc(mv));
  return parts.join(" ") + (o.moves.length > show ? "…" : "");
}

function renderSuggest(q) {
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const res = search(q);
  currentList = res.list;
  activeIdx = currentList.length ? 0 : -1;
  if (!q.trim()) { suggestEl.classList.remove("open"); return; }
  if (!currentList.length) {
    suggestEl.innerHTML = `<li class="empty">No <b>${DIFF_LABEL[state.difficulty]}</b> openings match “${esc(q)}”.</li>`;
    suggestEl.classList.add("open"); return;
  }
  const matchedPlies = res.mode === "move" ? moveTokens(q).length : 0;
  suggestEl.innerHTML = currentList.map((o, i) => {
    const nm = res.mode === "move" ? esc(o.name) : highlight(o.name, tokens);
    const mv = res.mode === "move" ? movePreview(o, matchedPlies)
      : esc(o.moves.slice(0, 6).join(" ") + (o.moves.length > 6 ? "…" : ""));
    return `<li data-i="${i}" class="${i === activeIdx ? "active" : ""}">
      <span class="nm">${nm}</span>
      <span class="eco">${esc(o.eco)}</span>
      <span class="mv">${mv}</span></li>`;
  }).join("");
  suggestEl.classList.add("open");
}

function setActive(i) {
  const items = suggestEl.querySelectorAll("li[data-i]");
  if (!items.length) return;
  activeIdx = (i + items.length) % items.length;
  items.forEach(li => li.classList.toggle("active", +li.dataset.i === activeIdx));
  items[activeIdx].scrollIntoView({ block: "nearest" });
}

input.addEventListener("input", () => renderSuggest(input.value));
input.addEventListener("focus", () => { if (input.value.trim()) renderSuggest(input.value); });
moveSearchToggle.addEventListener("change", () => {
  moveSearchEnabled = moveSearchToggle.checked;
  try { localStorage.setItem(MOVE_SEARCH_KEY, JSON.stringify(moveSearchEnabled)); } catch {}
  if (input.value.trim()) renderSuggest(input.value);
  input.focus();
});
input.addEventListener("keydown", e => {
  if (!suggestEl.classList.contains("open")) {
    if (e.key === "ArrowDown" && input.value.trim()) renderSuggest(input.value);
    return;
  }
  if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIdx + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIdx - 1); }
  else if (e.key === "Enter") { e.preventDefault(); if (currentList[activeIdx]) submitGuess(currentList[activeIdx]); }
  else if (e.key === "Escape") { suggestEl.classList.remove("open"); }
});
suggestEl.addEventListener("mousedown", e => {
  const li = e.target.closest("li[data-i]");
  if (li) { e.preventDefault(); submitGuess(currentList[+li.dataset.i]); }
});
document.addEventListener("click", e => {
  if (!e.target.closest(".search")) suggestEl.classList.remove("open");
});

/* ---------- 8. Game state & persistence ---------- */
const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
// Daily progress is per (day, difficulty); stats are per (mode, difficulty).
// Version daily saves whenever opening IDs or pool assignments change.
const kDaily = (dayNo, diff) => `ot.daily.v8.${dayNo}.${diff}`;
const kStats = (mode, diff) => `ot.stats.${mode}.${diff}`;
const K_DIFF = "ot.diff";           // last-used difficulty

function loadDiff() {
  const d = LS.get(K_DIFF, "easy");
  return DIFFS.includes(d) ? d : "easy";
}
let difficulty = loadDiff();        // current difficulty, shared across modes

let state = null; // {mode, difficulty, target, dayNo, results:[cmp], guessedIds:Set, solved, gaveUp, hintPlies, hintCount}

function freshDaily(diff) {
  diff = diff || difficulty;
  const dayNo = localDayNumber();
  const target = dailyTarget(dayNo, diff);
  const st = { mode: "daily", difficulty: diff, target, dayNo, results: [], guessedIds: new Set(), solved: false, gaveUp: false, hintPlies: 0, hintCount: 0 };
  const saved = LS.get(kDaily(dayNo, diff), null);
  if (saved && saved.guesses) {
    for (const id of saved.guesses) {
      st.results.push(compare(OPENINGS[id], target));
      st.guessedIds.add(id);
    }
    st.solved = !!saved.solved;
    st.gaveUp = !!saved.gaveUp;
    st.hintPlies = Math.min(saved.hintPlies || 0, target.moves.length);
    st.hintCount = saved.hintCount || 0;
  }
  return st;
}
function freshPractice(diff) {
  diff = diff || difficulty;
  const pool = POOLS[diff];
  const target = pool[Math.floor(Math.random() * pool.length)];
  return { mode: "practice", difficulty: diff, target, dayNo: null, results: [], guessedIds: new Set(), solved: false, gaveUp: false, hintPlies: 0, hintCount: 0 };
}

function saveDaily() {
  if (state.mode !== "daily") return;
  LS.set(kDaily(state.dayNo, state.difficulty), {
    guesses: state.results.map(r => r.guessId),
    solved: state.solved, gaveUp: state.gaveUp, hintPlies: state.hintPlies || 0, hintCount: hintsUsed(state),
  });
}

/* ---------- 9. Submitting guesses ---------- */
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1900);
}

function finishOutOfGuesses() {
  clearBoardPlayback();
  resetBoardNav();
  state.gaveUp = true;
  if (state.mode === "daily") { saveDaily(); recordDaily(false); }
  else recordPractice(false);
  toast("Out of guesses.");
}

function submitGuess(opening) {
  if (!opening || state.solved || state.gaveUp) return;
  if (guessBudgetLeft(state) < 1) { finishOutOfGuesses(); render(); return; }
  if (state.guessedIds.has(opening.id)) { toast("Already guessed that one."); input.select(); return; }
  const beforeDepth = confirmedDepth(state);
  const cmp = compare(opening, state.target);
  state.results.push(cmp);
  state.guessedIds.add(opening.id);
  if (cmp.isWin) state.solved = true;
  else if (guessBudgetLeft(state) === 0) finishOutOfGuesses();
  const afterDepth = (state.solved || state.gaveUp) ? state.target.moves.length : confirmedDepth(state);
  const shouldAnimateBoard = afterDepth > beforeDepth;
  if (shouldAnimateBoard) boardPlaybackDepth = beforeDepth;
  else { clearBoardPlayback(); resetBoardNav(); }

  input.value = "";
  suggestEl.classList.remove("open");
  if (state.mode === "daily") saveDaily();
  if (cmp.isWin) {
    const modalDelay = shouldAnimateBoard
      ? (afterDepth - beforeDepth + 1) * BOARD_PLAYBACK_STEP_MS + 250
      : 700;
    onSolve(modalDelay);
  }
  render();
  if (shouldAnimateBoard) animateBoardProgress(beforeDepth, afterDepth);
  if (!state.solved && !state.gaveUp) input.focus();
}

function giveUp() {
  if (state.solved || state.gaveUp) return;
  if (!confirm("Reveal the target opening and end this puzzle?")) return;
  clearBoardPlayback();
  resetBoardNav();
  state.gaveUp = true;
  if (state.mode === "daily") { saveDaily(); recordDaily(false); }
  else recordPractice(false);
  render();
}

function requestHint() {
  if (state.solved || state.gaveUp) return;
  clearBoardPlayback();
  resetBoardNav();
  if (guessBudgetLeft(state) < HINT_COST) {
    toast(`Hints cost ${HINT_COST} guesses.`);
    return;
  }
  const depth = confirmedDepth(state);
  if (depth >= state.target.moves.length) { toast("The full line is already revealed."); return; }
  state.hintPlies = depth + 1;
  state.hintCount = hintsUsed(state) + 1;
  if (guessBudgetLeft(state) === 0) finishOutOfGuesses();
  if (state.mode === "daily") saveDaily();
  render();
}

/* ---------- 10. Stats (kept per difficulty) ---------- */
function recordDaily(won) {
  const key = kStats("daily", state.difficulty);
  const s = LS.get(key, { played: 0, won: 0, streak: 0, maxStreak: 0, dist: {}, lastDay: null });
  if (s.lastDay === state.dayNo) return;        // already recorded today at this difficulty
  s.played++;
  if (won) {
    s.won++;
    s.streak = (s.lastDay === state.dayNo - 1) ? s.streak + 1 : 1;
    s.maxStreak = Math.max(s.maxStreak, s.streak);
    const g = guessBudgetUsed(state);
    s.dist[g] = (s.dist[g] || 0) + 1;
  } else {
    s.streak = 0;
  }
  s.lastDay = state.dayNo;
  LS.set(key, s);
}
function recordPractice(won) {
  const key = kStats("practice", state.difficulty);
  const s = LS.get(key, { played: 0, won: 0, totalGuesses: 0, best: null });
  s.played++;
  if (won) {
    s.won++;
    const spent = guessBudgetUsed(state);
    s.totalGuesses += spent;
    s.best = s.best == null ? spent : Math.min(s.best, spent);
  }
  LS.set(key, s);
}

function onSolve(delayMs = 700) {
  if (state.mode === "daily") recordDaily(true);
  else recordPractice(true);
  clearTimeout(openWinModal._timer);
  openWinModal._timer = setTimeout(() => {
    if (state.solved && !state.gaveUp) openWinModal();
  }, delayMs);
}

function winStatsForCurrentState() {
  if (state.mode === "daily") {
    const s = LS.get(kStats("daily", state.difficulty), { played: 0, won: 0, streak: 0, maxStreak: 0, dist: {} });
    return [
      ["Played", s.played],
      ["Won", s.won],
      ["Current", s.streak],
      ["Max", s.maxStreak],
    ];
  }
  const s = LS.get(kStats("practice", state.difficulty), { played: 0, won: 0, totalGuesses: 0, best: null });
  const avg = s.won ? (s.totalGuesses / s.won).toFixed(1) : "—";
  return [
    ["Played", s.played],
    ["Solved", s.won],
    ["Avg", avg],
    ["Best", s.best ?? "—"],
  ];
}

function openWinModal() {
  document.getElementById("winAnswer").innerHTML =
    `${esc(state.target.name)} <span class="eco">${esc(state.target.eco)}</span>` +
    `<span class="moves">${fmtMoves(state.target.moves, "")}</span>`;
  document.getElementById("winStats").innerHTML = winStatsForCurrentState()
    .map(([label, value]) => `<div class="win-stat"><div class="n">${value}</div><div class="l">${label}</div></div>`)
    .join("");
  document.getElementById("winPrompt").textContent =
    state.mode === "daily" ? "Share your score or play a practice game." : "Share your score or try another practice puzzle.";
  modal("winModal", true);
}

function startPracticeFromWin() {
  clearBoardPlayback();
  resetBoardNav();
  document.querySelectorAll("#modes button").forEach(x => x.classList.toggle("active", x.dataset.mode === "practice"));
  state = freshPractice();
  input.value = "";
  modal("winModal", false);
  render();
  input.focus();
}

/* ---------- 11. Sharing ---------- */
function closenessSquare(cmp) {
  if (cmp.isWin) return "★";
  const r = cmp.sharedPlies / state.target.plies;
  if (cmp.sharedPlies === 0) return "⬛";
  if (r < 0.34) return "🟥";
  if (r < 0.5) return "🟧";
  if (r < 0.75) return "🟨";
  return "🟩";
}
function shareText() {
  const n = guessBudgetUsed(state);
  const h = hintsUsed(state);
  const limit = guessLimit(state);
  const head = state.mode === "daily"
    ? `Openle #${state.dayNo} · ${DIFF_LABEL[state.difficulty]} — ${state.solved ? `${guessWord(n)}/${limit}` : "X"}${h ? ` · ${hintWord(h)}` : ""}`
    : `Openle · ${DIFF_LABEL[state.difficulty]} practice — ${guessWord(n)}/${limit}${h ? ` · ${hintWord(h)}` : ""}`;
  const squares = state.results.map(closenessSquare);
  // group into rows of 5 for a tidy grid
  let grid = "";
  for (let i = 0; i < squares.length; i += 5) grid += squares.slice(i, i + 5).join("") + "\n";
  return `${head}\n${grid}♟ guess the chess opening`;
}
async function doShare() {
  const text = shareText();
  try {
    await navigator.clipboard.writeText(text);
    toast("Result copied to clipboard!");
  } catch {
    toast("Copy the result from the Stats panel.");
  }
  // also surface in stats modal
  if (statsMode === state.mode && statsDiff === state.difficulty)
    document.getElementById("shareArea").innerHTML = `<div class="shareout">${esc(text)}</div>`;
}

/* ---------- 12. Master render ---------- */
function render() {
  // meta
  const mt = document.getElementById("metaTitle");
  const ms = document.getElementById("metaSub");
  const diff = document.getElementById("diff");
  if (state.mode === "daily") {
    mt.textContent = `Daily #${state.dayNo}`;
    ms.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  } else {
    mt.textContent = "Practice";
    ms.textContent = "random opening";
  }
  // difficulty selector is available in both modes
  diff.querySelectorAll("button").forEach(x => x.classList.toggle("active", x.dataset.diff === state.difficulty));
  const gc = document.getElementById("gcount");
  const spent = guessBudgetUsed(state), left = guessBudgetLeft(state), hintN = hintsUsed(state);
  const limit = guessLimit(state);
  gc.innerHTML = spent
    ? `<b>${spent}</b>/${limit} guesses` + (hintN ? ` · ${hintWord(hintN)}` : "")
    : `<b>${limit}</b> guesses`;

  // input lock
  input.disabled = state.solved || state.gaveUp;
  input.placeholder = state.solved || state.gaveUp
    ? "Puzzle complete"
    : "Search an opening to guess — e.g. Sicilian, Ruy Lopez…";

  // panels
  renderTree(state);
  renderHistory(state);
  renderBoard(state);

  // actions
  const done = state.solved || state.gaveUp;
  document.getElementById("shareBtn").style.display = (done && state.solved) ? "" : "none";
  document.getElementById("hintBtn").style.display = (!done && confirmedDepth(state) < state.target.moves.length && left >= HINT_COST) ? "" : "none";
  document.getElementById("newBtn").style.display = (state.mode === "practice") ? "" : "none";
  document.getElementById("giveUpBtn").style.display = (!done && spent >= 5) ? "" : "none";
}

/* ---------- 13. Stats modal ---------- */
let statsMode = "daily";
let statsDiff = "easy";

function renderStatsView(mode = statsMode, diff = statsDiff) {
  statsMode = mode;
  statsDiff = diff;
  const isDaily = mode === "daily";
  document.querySelectorAll("#statsMode button").forEach(x => x.classList.toggle("active", x.dataset.statsMode === mode));
  document.querySelectorAll("#statsDiff button").forEach(x => x.classList.toggle("active", x.dataset.statsDiff === diff));
  const grid = document.getElementById("statsGrid");
  const dist = document.getElementById("statsDist");
  if (isDaily) {
    const s = LS.get(kStats("daily", diff), { played: 0, won: 0, streak: 0, maxStreak: 0, dist: {} });
    grid.innerHTML = [
      ["Played", s.played], ["Solved", s.won], ["Streak", s.streak], ["Max streak", s.maxStreak],
    ].map(([l, n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
    const keys = Object.keys(s.dist).map(Number).sort((a, b) => a - b);
    const maxC = Math.max(1, ...keys.map(k => s.dist[k]));
    const curG = state.solved && state.mode === mode && state.difficulty === diff ? guessBudgetUsed(state) : -1;
    dist.innerHTML = `<div class="l" style="color:var(--muted);font-size:11px;letter-spacing:.04em;text-transform:uppercase">Guess distribution</div>` +
      (keys.length ? keys.map(k =>
        `<div class="dist-row"><span class="k">${k}</span>
         <span class="bar ${k === curG ? "cur" : ""}" style="width:${Math.round((s.dist[k] / maxC) * 100)}%">${s.dist[k]}</span></div>`).join("")
        : `<div class="hint" style="margin-top:6px">No solves yet.</div>`);
  } else {
    const s = LS.get(kStats("practice", diff), { played: 0, won: 0, totalGuesses: 0, best: null });
    const avg = s.won ? (s.totalGuesses / s.won).toFixed(1) : "—";
    grid.innerHTML = [
      ["Played", s.played], ["Solved", s.won], ["Avg guesses", avg], ["Best", s.best ?? "—"],
    ].map(([l, n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
    dist.innerHTML = "";
  }
  // share area
  const sa = document.getElementById("shareArea");
  sa.innerHTML = (state.solved && isDaily && state.mode === mode && state.difficulty === diff) ? `<div class="shareout">${esc(shareText())}</div>` : "";
}

function openStats() {
  renderStatsView(state.mode, state.difficulty);
  modal("statsModal", true);
}

function openTreeModal() {
  modal("treeModal", true);
  requestAnimationFrame(() => {
    const el = document.getElementById("treeFullscreen");
    renderTreeInto(state, el);
    requestAnimationFrame(() => fitFullscreenTree(el));
  });
}

/* ---------- 14. Modal helpers ---------- */
function modal(id, open) { document.getElementById(id).classList.toggle("open", open); }
document.querySelectorAll("[data-close]").forEach(b =>
  b.addEventListener("click", () => b.closest(".modal-bg").classList.remove("open")));
document.querySelectorAll(".modal-bg").forEach(bg =>
  bg.addEventListener("click", e => { if (e.target === bg) bg.classList.remove("open"); }));
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-bg.open").forEach(m => m.classList.remove("open"));
    return;
  }
  const typing = e.target.closest?.("input, textarea, select, [contenteditable='true']");
  if (typing || suggestEl.classList.contains("open") || document.querySelector(".modal-bg.open")) return;
  if (e.key === "ArrowLeft") { e.preventDefault(); stepBoard(-1); }
  else if (e.key === "ArrowRight") { e.preventDefault(); stepBoard(1); }
});

/* ---------- 15. Wiring ---------- */
document.getElementById("howBtn").addEventListener("click", () => modal("howModal", true));
document.getElementById("statsBtn").addEventListener("click", openStats);
document.getElementById("treeExpandBtn").addEventListener("click", openTreeModal);
document.getElementById("treeZoomOut").addEventListener("click", () => zoomTreeByFactor(document.getElementById("tree"), 1 / TREE_BUTTON_ZOOM_FACTOR));
document.getElementById("treeZoomIn").addEventListener("click", () => zoomTreeByFactor(document.getElementById("tree"), TREE_BUTTON_ZOOM_FACTOR));
document.getElementById("treeModalZoomOut").addEventListener("click", () => zoomTreeByFactor(document.getElementById("treeFullscreen"), 1 / TREE_BUTTON_ZOOM_FACTOR));
document.getElementById("treeModalZoomIn").addEventListener("click", () => zoomTreeByFactor(document.getElementById("treeFullscreen"), TREE_BUTTON_ZOOM_FACTOR));
enableTreeViewport(document.getElementById("tree"));
enableTreeViewport(document.getElementById("treeFullscreen"));
document.getElementById("statsMode").addEventListener("click", e => {
  const b = e.target.closest("button[data-stats-mode]"); if (!b) return;
  renderStatsView(b.dataset.statsMode, statsDiff);
});
document.getElementById("statsDiff").addEventListener("click", e => {
  const b = e.target.closest("button[data-stats-diff]"); if (!b) return;
  renderStatsView(statsMode, b.dataset.statsDiff);
});
document.getElementById("shareBtn").addEventListener("click", doShare);
document.getElementById("winShareBtn").addEventListener("click", doShare);
document.getElementById("winPracticeBtn").addEventListener("click", startPracticeFromWin);
document.getElementById("boardPrev").addEventListener("click", () => stepBoard(-1));
document.getElementById("boardNext").addEventListener("click", () => stepBoard(1));
document.getElementById("hintBtn").addEventListener("click", requestHint);
document.getElementById("giveUpBtn").addEventListener("click", giveUp);
document.getElementById("newBtn").addEventListener("click", () => {
  if (guessBudgetUsed(state) && !state.solved && !state.gaveUp) recordPractice(false);
  clearBoardPlayback();
  resetBoardNav();
  state = freshPractice(); input.value = ""; render(); input.focus();
});
document.getElementById("diff").addEventListener("click", e => {
  const b = e.target.closest("button[data-diff]"); if (!b) return;
  const d = b.dataset.diff; if (d === state.difficulty) return;
  // abandoning an in-progress practice game counts as a loss; daily just switches.
  if (state.mode === "practice" && guessBudgetUsed(state) && !state.solved && !state.gaveUp) recordPractice(false);
  clearBoardPlayback();
  resetBoardNav();
  difficulty = d; LS.set(K_DIFF, d);
  state = state.mode === "daily" ? freshDaily(d) : freshPractice(d);
  input.value = ""; render(); if (!input.disabled) input.focus();
});
document.getElementById("modes").addEventListener("click", e => {
  const b = e.target.closest("button[data-mode]"); if (!b) return;
  const mode = b.dataset.mode; if (mode === state.mode) return;
  document.querySelectorAll("#modes button").forEach(x => x.classList.toggle("active", x === b));
  if (state.mode === "practice" && guessBudgetUsed(state) && !state.solved && !state.gaveUp) recordPractice(false);
  clearBoardPlayback();
  resetBoardNav();
  state = (mode === "daily") ? freshDaily() : freshPractice();
  input.value = ""; render(); if (!input.disabled) input.focus();
});

/* ---------- 16. Boot ---------- */
function boot() {
  state = freshDaily();
  render();
  // First-time visitors get the how-to.
  if (!LS.get("ot.seen", false)) { modal("howModal", true); LS.set("ot.seen", true); }
}
boot();

// expose a little debug hook
window.__OT = {
  OPENINGS, POOLS, DIFFS, DIFF_LIMITS, GUESS_LIMITS, HINT_COST, guessLimit, tierOf, dailyTarget, compare, submitGuess, requestHint,
  byName: n => OPENINGS.find(o => o.name === n),
  byMoves: m => OPENINGS.find(o => o.movesStr === m),
  get moveSearchEnabled() { return moveSearchEnabled; },
  get state() { return state; },
};

})();
