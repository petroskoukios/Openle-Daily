/* Opening tree: builds the display tree from game state, lays it out
   (Metazooa-style staggered branching), renders it as SVG, and provides the
   pan/zoom viewport for both the inline and fullscreen trees.

   renderTreeInto is a pipeline of named phases:
     buildDisplayTree → layoutTree → paintTree → wireTreeNav → focusTree */
import { state } from "./state.js";
import { OPENINGS } from "./data.js";
import { confirmedDepth } from "./domain.js";
import { esc } from "./format.js";
import { boardMaxDepth, goBoardDepth, goBoardLine } from "./board.js";

function buildTree(state) {
  const target = state.target;
  const root = { move: null, depth: 0, path: [], children: new Map(), onTarget: false, guesses: [], guessIds: new Set() };
  const get = (node, mv, depth) => {
    if (!node.children.has(mv))
      node.children.set(mv, { move: mv, depth, path: [...node.path, mv], children: new Map(), onTarget: false, guesses: [], guessIds: new Set() });
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
const TREE_FULLSCREEN_AUTO_ZOOM_MIN = 1;
const TREE_FULLSCREEN_AUTO_ZOOM_MAX = 1.5;
const TREE_ZOOM_STEP = .15;
const TREE_DEFAULT_ZOOM = 1.2;
const treeViews = new WeakMap();
const treeLineMaps = new WeakMap();
let boardPosition = null;       // position shown on the main board (inline tree)
let inspectorPosition = null;   // position shown on the inspector board (fullscreen tree)

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

export function renderTreeInto(state, el) {
  const view = treeView(el);
  const boardNavigationEnabled = true;
  // Fullscreen is an inspector: only whole openings are selectable there — not
  // the root, sequence boxes, or individual moves.
  const openingsOnly = el.id === "treeFullscreen";
  if (view.zoomFrame) {
    cancelAnimationFrame(view.zoomFrame);
    view.zoomFrame = null;
    view.zoomTarget = view.zoom;
  }

  const { displayRoot, treeLines } = buildDisplayTree(state, boardNavigationEnabled, openingsOnly);
  const { allNodes, svgWidth, svgHeight } = layoutTree(displayRoot, el, view);
  const prevScroll = { left: el.scrollLeft, top: el.scrollTop };
  paintTree(el, displayRoot, allNodes, svgWidth, svgHeight, view, boardNavigationEnabled, openingsOnly);
  wireTreeNav(el, treeLines);
  focusTree(el, state, view, allNodes, displayRoot, prevScroll);
}

// Phase 1 — turn game state into a tree of display nodes (boxes), collapsing
// linear runs, merging single-guess leaves, and ordering siblings.
function buildDisplayTree(state, boardNavigationEnabled, openingsOnly) {
  const { root, tip } = buildTree(state);
  const latestGuessId = state.results.length ? state.results[state.results.length - 1].guessId : null;
  const targetTone = "target";
  let nextId = 0;
  let nextLineId = 0;
  const treeLines = new Map();
  const registerLine = (moves, depth) => {
    const id = String(++nextLineId);
    treeLines.set(id, { moves: moves.slice(), depth });
    return id;
  };
  const targetBoardLine = state.target.moves.slice(0, boardMaxDepth(state));

  const create = (type, tone, width, height, html, extra = {}) => ({
    id: ++nextId, type, tone, edgeTone: tone, width, height, html,
    children: [], latest: false, main: false, sortKey: "", ...extra,
  });
  const moveParts = (move, depth) => ({
    number: depth % 2 ? `${Math.ceil(depth / 2)}.` : `${depth / 2}...`,
    move,
  });
  const guessLeaf = (g, latest) => create(
    "guess", "off", 136, 36,
    `<span class="tree-node__name" title="${esc(g.name)}">${esc(g.name)}</span>`,
    { latest, sortKey: g.name, edgeTone: "off", openingId: g.id, lineId: registerLine(g.moves, g.moves.length) },
  );
  const answerLeaf = () => create(
    "answer", targetTone, 156, 44,
    `<span class="tree-node__name">${esc(state.target.name)}</span>` +
      `<span class="tree-node__answer-mark">${state.solved ? "★" : "Failed"}</span>`,
    { main: true, latest: state.solved, sortKey: state.target.name, openingId: state.target.id, lineId: registerLine(state.target.moves, state.target.moves.length) },
  );
  const tipLeaf = () => create(
    "tip", "tip", 104, 30,
    `<span class="tree-node__question">?</span>`,
    { main: true, edgeTone: "hidden", sortKey: "target" },
  );

  const orderChildren = children => {
    const main = children.find(child => child.main);
    // Branches fan out first, then leaves — keeping sibling leaves contiguous so
    // they can pack into staggered lanes instead of being split up by a branch.
    const rank = c => (c.children.length ? 0 : 1);
    const sides = children.filter(child => child !== main)
      .sort((a, b) => rank(a) - rank(b) || a.sortKey.localeCompare(b.sortKey));
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
  // In openings-only mode (fullscreen) moves aren't individually selectable, so
  // they render as plain text rather than clickable tokens.
  const moveToken = (html, moves, depth) => (boardNavigationEnabled && !openingsOnly)
    ? `<span class="tree-seq__move" data-tree-line="${registerLine(moves, depth)}" role="button" tabindex="0" title="Show this position on the board">${html}</span>`
    : `<span>${html}</span>`;

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
    const inner = Math.min(142, Math.max(64, tokenPx.reduce((a, b) => a + b, 0)));
    let lines = 1, used = 0;
    for (const w of tokenPx) {
      if (used > 0 && used + w > inner) { lines++; used = w; }
      else used += w;
    }
    return { width: Math.ceil(inner + 10), height: 11 + lines * 14 };
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
      moveToken(`${seqTokenNum(node, i)}${esc(node.move)}`, node.path, node.depth)
    ).join(" ");
    const { width, height } = seqMetrics(run);
    const branches = [...end.children.values()].map(child => child.onTarget ? displayTargetMove(child) : displayOffPath(child));

    // A guess whose line simply ends here (one opening, no further branching)
    // becomes a single labelled leaf — moves and name in one box — instead of a
    // moves node with the name dangling below it. Fewer nodes, and it lets
    // sibling guesses pack into staggered lanes.
    if (branches.length === 0 && end.guesses.length === 1) {
      const g = end.guesses[0];
      return create(
        "guess", "off", Math.max(width, 138), height + 24,
        `<span class="tree-node__name" title="${esc(g.name)}">${esc(g.name)}</span>` +
          `<span class="tree-node__sequence">${sequence}</span>`,
        { latest: g.id === latestGuessId, sortKey: g.name, edgeTone: "off", openingId: g.id, lineId: registerLine(g.moves, g.moves.length) },
      );
    }

    const node = create(
      "sequence", "off", width, height,
      `<span class="tree-node__sequence">${sequence}</span>`,
      {
        latest: latestGuessId != null && run.some(item => item.guessIds.has(latestGuessId)),
        sortKey: run.map(item => item.move).join(" "),
        lineId: registerLine(end.path, end.depth), // clicking the box → its last move
      },
    );
    const leaves = end.guesses.map(g => guessLeaf(g, g.id === latestGuessId));
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
      moveToken(`${seqTokenNum(node, i)}${esc(node.move)}`, targetBoardLine, node.depth)
    ).join(" ");
    const { width, height } = seqMetrics(run);
    const node = create(
      "sequence", targetTone, width, height,
      `<span class="tree-node__sequence">${sequence}</span>`,
      {
        main: true,
        latest: latestGuessId != null && run.some(item => item.guessIds.has(latestGuessId)),
        sortKey: raw.move,
        lineId: registerLine(targetBoardLine, end.depth), // clicking the box → its last move
      },
    );
    const branches = [...end.children.values()].map(child => child.onTarget ? displayTargetMove(child) : displayOffPath(child));
    const leaves = end.isTargetEnd
      ? [answerLeaf()]
      : end.guesses.map(g => guessLeaf(g, g.id === latestGuessId));
    if (end === tip && !state.solved && !state.gaveUp) leaves.push(tipLeaf());
    node.children = orderChildren([...branches, ...leaves]);
    return node;
  };

  const displayRoot = create(
    "root", state.solved ? targetTone : "root", 126, 31, "Starting position",
    { main: true, boardDepth: 0, sortKey: "root" },
  );
  const rootBranches = [...root.children.values()].map(child => child.onTarget ? displayTargetMove(child) : displayOffPath(child));
  if (tip === root && !state.solved && !state.gaveUp) rootBranches.push(tipLeaf());
  displayRoot.children = orderChildren(rootBranches);

  return { displayRoot, treeLines };
}

// Phase 2 — assign each box an (x, y): level rows, staggered lanes, tidy
// leftward compaction, then horizontal normalisation. Also stamps view metrics.
function layoutTree(displayRoot, el, view) {
  const H_GAP = 16, V_GAP = 36, PAD = 10;
  const allNodes = [], levelHeights = [];
  const assignLevels = (node, level) => {
    node.level = level;
    allNodes.push(node);
    levelHeights[level] = Math.max(levelHeights[level] || 0, node.height);
    for (const child of node.children) assignLevels(child, level + 1);
  };
  // Sibling fans alternate between two vertical lanes. Terminal leaf runs can
  // then overlap horizontally, spending spare vertical room to keep the tree
  // narrower and less flat, like Metazooa's branching layout.
  const LANE_OFFSET = 38, PITCH_FACTOR = 0.94;
  const isLeaf = n => n.children.length === 0 && !n.main;
  const measure = node => {
    for (const child of node.children) measure(child);
    // Keep the correct (on-target) branch central, like Metazooa's lineage: with
    // an odd number of children it sits dead middle (3 branches → the middle
    // one); with an even number it alternates between the two middle slots by
    // row, so the blue spine snakes gently rather than swinging to the edges.
    let kids = node.children;
    const mainIdx = kids.findIndex(c => c.main);
    if (mainIdx >= 0 && kids.length > 1) {
      const main = kids[mainIdx];
      const rest = kids.filter((_, i) => i !== mainIdx);
      const mid = node.level % 2 === 0 ? Math.floor(rest.length / 2) : Math.ceil(rest.length / 2);
      kids = [...rest.slice(0, mid), main, ...rest.slice(mid)];
    }

    // Stagger the entire sibling fan, including the continuing target branch.
    // This produces two clean interleaved rows while keeping the blue branch in
    // one of the two central slots selected by the alternating rule above.
    kids.forEach((child, index) => {
      child.lane = kids.length > 1 ? index % 2 : 0;
    });

    // Stay compact for small fans, but as a level gathers many leaves widen the
    // packing so it spreads into an airy arc instead of a cramped band of
    // overlapping boxes. Based on the node's total leaf count, since the spine
    // node splits them into separate runs.
    const leafCount = kids.filter(isLeaf).length;
    const pitchFactor = leafCount <= 4 ? PITCH_FACTOR : Math.min(1, PITCH_FACTOR + (leafCount - 4) * .015);

    const layout = [];
    let cursor = 0;
    for (let i = 0; i < kids.length; ) {
      let j = i;
      while (j < kids.length && isLeaf(kids[j])) j++;
      if (j - i >= 2) {
        const run = kids.slice(i, j);
        const w = Math.max(...run.map(c => c.width));
        const pitch = (w + H_GAP) * pitchFactor;
        const runId = {}; // tags this run so compaction keeps it together
        run.forEach((child, r) => {
          child.runId = runId;
          layout.push({ child, cx: cursor + w / 2 + r * pitch });
        });
        cursor += (run.length - 1) * pitch + w + H_GAP;
        i = j;
      } else {
        const child = kids[i++];
        layout.push({ child, cx: cursor + child.subtreeWidth / 2 });
        cursor += child.subtreeWidth + H_GAP;
      }
    }
    node.childLayout = layout;
    node.childrenSpan = Math.max(0, cursor - H_GAP);
    node.subtreeWidth = Math.max(node.width, node.childrenSpan);
  };
  assignLevels(displayRoot, 0);
  measure(displayRoot);

  // Keep the second lane close and consistent. Deriving this from the tallest
  // box made rows with wrapped opening names drop much farther than others.
  const levelDrop = [];
  for (const n of allNodes)
    if (n.lane === 1) levelDrop[n.level] = LANE_OFFSET;

  const levelTops = [];
  let nextTop = PAD;
  for (let i = 0; i < levelHeights.length; i++) {
    levelTops[i] = nextTop;
    nextTop += levelHeights[i] + (levelDrop[i] || 0) + V_GAP;
  }
  const svgHeight = Math.ceil(nextTop - V_GAP + PAD);
  // Over-pan slack: empty space around the tree so it can be dragged well past
  // its own edges in every direction, not just up to the content bounds.
  const slackX = Math.max(160, Math.round((el.clientWidth || 0) * 0.8));
  const slackY = Math.max(140, Math.round((el.clientHeight || 0) * 0.8));
  view.padX = slackX;
  view.padY = slackY;
  const place = (node, left) => {
    node.cx = left + node.subtreeWidth / 2;
    node.x = node.cx - node.width / 2;
    node.y = node.lane
      ? levelTops[node.level] + (levelDrop[node.level] || 0)
      : levelTops[node.level];
    const spanLeft = left + (node.subtreeWidth - node.childrenSpan) / 2;
    for (const item of node.childLayout)
      place(item.child, spanLeft + item.cx - item.child.subtreeWidth / 2);
  };
  place(displayRoot, PAD);

  // Tidy compaction: width-based placement reserves each subtree a full column,
  // leaving big gaps where a narrow junction node's children sit a level below
  // (empty space above them). Bottom-up, pull each sibling subtree left into any
  // vertical gap its neighbours leave, then recentre the parent over its kids.
  const BIN = 4;
  const subtreeNodes = node => {
    const out = [];
    (function rec(n) { out.push(n); n.children.forEach(rec); })(node);
    return out;
  };
  const compact = node => {
    for (const child of node.children) compact(child);
    if (node.children.length > 1) {
      const profile = new Map(); // vertical bin -> furthest-right edge so far
      // Treat both staggered lanes as one collision band. Using only each box's
      // visible height lets compaction slide a lower-lane sibling directly under
      // an earlier upper-lane sibling, destroying the intended fan ordering.
      const levelBins = n => ({
        first: Math.floor(levelTops[n.level] / BIN),
        last: Math.ceil((levelTops[n.level] + levelHeights[n.level] + (levelDrop[n.level] || 0)) / BIN),
      });
      const stamp = nodes => { for (const n of nodes) {
        const { first, last } = levelBins(n);
        for (let b = first; b < last; b++)
          profile.set(b, Math.max(profile.get(b) ?? -Infinity, n.x + n.width));
      } };
      // Group children into units; a staggered run stays rigid so its diagonal
      // overlap survives compaction instead of being pulled apart.
      const kids = [...node.children].sort((a, b) => a.cx - b.cx);
      const units = [];
      for (const k of kids) {
        const last = units[units.length - 1];
        if (k.runId && last && last.runId === k.runId) last.nodes.push(...subtreeNodes(k));
        else units.push({ runId: k.runId, nodes: subtreeNodes(k) });
      }
      stamp(units[0].nodes);
      for (let i = 1; i < units.length; i++) {
        const nodes = units[i].nodes;
        let shift = Infinity;
        for (const n of nodes) {
          let wall = -Infinity;
          const { first, last } = levelBins(n);
          for (let b = first; b < last; b++)
            if (profile.has(b)) wall = Math.max(wall, profile.get(b));
          if (wall > -Infinity) shift = Math.min(shift, n.x - wall - H_GAP);
        }
        if (shift > 0 && shift < Infinity) for (const n of nodes) { n.x -= shift; n.cx -= shift; }
        stamp(nodes);
      }
    }
    if (node.children.length) {
      const cxs = node.children.map(c => c.cx);
      node.cx = (Math.min(...cxs) + Math.max(...cxs)) / 2;
      node.x = node.cx - node.width / 2;
    }
  };
  compact(displayRoot);

  // Normalise horizontally: drop the empty left margin, size the canvas to the
  // compacted content, and centre it if it's narrower than the panel.
  const minX = Math.min(...allNodes.map(n => n.x));
  const maxRight = Math.max(...allNodes.map(n => n.x + n.width));
  const contentW = (maxRight - minX) + PAD * 2;
  const minWidth = Math.max(430, el.clientWidth || 0);
  const svgWidth = Math.ceil(Math.max(minWidth, contentW));
  const offsetX = (PAD - minX) + Math.max(0, (svgWidth - contentW) / 2);
  for (const n of allNodes) { n.x += offsetX; n.cx += offsetX; }
  view.baseWidth = svgWidth;
  view.baseHeight = svgHeight;
  view.contentWidth = contentW;
  view.contentHeight = svgHeight;
  view.contentCenterX = svgWidth / 2;
  view.contentCenterY = svgHeight / 2;

  return { allNodes, svgWidth, svgHeight };
}

// Phase 3 — serialise edges + node boxes to SVG and write it into the element.
function paintTree(el, displayRoot, allNodes, svgWidth, svgHeight, view, boardNavigationEnabled, openingsOnly) {
  const slackX = view.padX, slackY = view.padY;
  const edges = [];
  const collectEdges = node => {
    for (const child of node.children) {
      // Anchor edges at the vertical centre of each box. The boxes are drawn
      // after the edges, so the stubs running inside them are covered, leaving
      // clean connectors between box edges even when children are offset or
      // staggered — and every child line clearly radiates from the node centre.
      const sx = node.cx, sy = node.y + node.height / 2;
      const ex = child.cx, ey = child.y + child.height / 2;
      const bend = Math.max(10, (ey - sy) * .4);
      const cls = `tree-edge tree-edge--${child.edgeTone}${child.latest ? " is-latest" : ""}`;
      edges.push(`<path class="${cls}" d="M ${sx} ${sy} C ${sx} ${sy + bend}, ${ex} ${ey - bend}, ${ex} ${ey}"/>`);
      collectEdges(child);
    }
  };
  collectEdges(displayRoot);

  const nodeMarkup = node => {
    // Root navigates to a board depth; guess/answer boxes play their whole line.
    // The box is the click target; inner move tokens stop propagation so they
    // still navigate to their own ply instead of the full line.
    // In openings-only mode (fullscreen) only opening boxes are interactive; the
    // root and sequence boxes keep their data-* hooks (so the position highlight
    // still finds them) but render as plain, non-clickable boxes.
    const openingBox = node.openingId != null;
    const depthClickable = boardNavigationEnabled && !openingsOnly && node.boardDepth != null;
    const lineClickable = boardNavigationEnabled && node.lineId != null && (!openingsOnly || openingBox);
    const tag = depthClickable ? "button" : "div";
    let attrs = "";
    if (depthClickable) attrs = ` type="button" data-tree-depth="${node.boardDepth}" title="Show this position on the board"`;
    else if (lineClickable) attrs = ` role="button" tabindex="0" data-tree-line="${node.lineId}" title="${openingsOnly ? "Inspect this opening" : "Play this opening on the board"}"`;
    else if (node.boardDepth != null) attrs = ` data-tree-depth="${node.boardDepth}"`;       // hook only
    else if (node.lineId != null) attrs = ` data-tree-line="${node.lineId}"`;                 // hook only
    if (node.openingId != null) attrs += ` data-opening-id="${node.openingId}"`;
    const interactive = (depthClickable || lineClickable) ? " tree-node--clickable" : "";
    return `<foreignObject x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}">` +
      `<${tag} xmlns="http://www.w3.org/1999/xhtml" ` +
      `class="tree-node tree-node--${node.type} tree-node--${node.tone}${node.latest ? " is-latest" : ""}${interactive}"${attrs}>` +
      `${node.html}</${tag}></foreignObject>`;
  };
  const renderW = Math.round(svgWidth * view.zoom);
  const renderH = Math.round(svgHeight * view.zoom);
  el.innerHTML = `<div class="tree-pan" style="width:${renderW + slackX * 2}px;height:${renderH + slackY * 2}px">` +
    `<svg class="tree-map" style="left:${slackX}px;top:${slackY}px" viewBox="0 0 ${svgWidth} ${svgHeight}" ` +
    `width="${renderW}" height="${renderH}" role="group" aria-label="Opening tree">` +
    `<g class="tree-edges">${edges.join("")}</g><g class="tree-nodes">${allNodes.map(nodeMarkup).join("")}</g></svg></div>`;
}

// The fullscreen tree drives its own inspector board, kept fully separate from
// the main board: clicks dispatch a line-select event instead of touching the
// live board. The "you are here" highlight uses the same is-board-position
// marker the main board uses, and switches to the clicked opening box right
// away — before the moves animate onto the inspector board.
function selectInspectorLine(openingNode, moves, depth) {
  if (openingNode) {
    document.querySelectorAll("#treeFullscreen .tree-node.is-board-position")
      .forEach(node => node.classList.remove("is-board-position"));
    openingNode.classList.add("is-board-position");
  }
  document.dispatchEvent(new CustomEvent("ot:tree-line-select", {
    detail: {
      openingId: openingNode ? Number(openingNode.dataset.openingId) : null,
      moves: moves.slice(), depth,
    },
  }));
}

// Phase 4 — wire click/keyboard navigation on the freshly painted boxes.
function wireTreeNav(el, treeLines) {
  treeLineMaps.set(el, treeLines);

  // Fullscreen: only whole openings are selectable. Wire just the opening boxes
  // (which carry the full opening line); the root, sequence boxes and moves were
  // painted as non-interactive, so nothing else responds to clicks.
  if (el.id === "treeFullscreen") {
    el.querySelectorAll(".tree-node[data-opening-id][data-tree-line]").forEach(node => {
      const activate = e => {
        e.stopPropagation();
        const line = treeLines.get(node.dataset.treeLine);
        if (line) selectInspectorLine(node, line.moves, line.depth);
      };
      node.addEventListener("click", activate);
      node.addEventListener("keydown", e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        activate(e);
      });
    });
    if (inspectorPosition) syncTreeBoardPosition(el, treeLines, inspectorPosition.moves, inspectorPosition.depth);
    return;
  }

  // Inline tree: full navigation — root depth, opening lines, and single moves.
  el.querySelectorAll("[data-tree-depth]").forEach(node => {
    const depth = Number(node.dataset.treeDepth);
    const activate = () => goBoardDepth(depth);
    node.addEventListener("click", activate);
    if (node.tagName === "BUTTON") return;
    node.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      activate();
    });
  });
  el.querySelectorAll("[data-tree-line]").forEach(node => {
    const activate = e => {
      e.stopPropagation(); // a move token shouldn't also trigger its box's full line
      const line = treeLines.get(node.dataset.treeLine);
      if (line) goBoardLine(line.moves, line.depth);
    };
    node.addEventListener("click", activate);
    node.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      activate(e);
    });
  });
  if (boardPosition) syncTreeBoardPosition(el, treeLines, boardPosition.moves, boardPosition.depth);
}

function sameBoardPosition(line, moves, depth) {
  if (!line || line.depth !== depth || moves.length < depth || line.moves.length < depth) return false;
  for (let i = 0; i < depth; i++) if (line.moves[i] !== moves[i]) return false;
  return true;
}

function syncTreeBoardPosition(el, treeLines, moves, depth) {
  el.querySelectorAll(".tree-node.is-board-position").forEach(node => node.classList.remove("is-board-position"));

  if (depth === 0) {
    el.querySelector('[data-tree-depth="0"]')?.classList.add("is-board-position");
    return;
  }

  // Every node whose registered line is exactly this position.
  const matches = [];
  for (const target of el.querySelectorAll("[data-tree-line]")) {
    if (!sameBoardPosition(treeLines.get(target.dataset.treeLine), moves, depth)) continue;
    const node = target.closest(".tree-node");
    if (node && !matches.includes(node)) matches.push(node);
  }
  if (!matches.length) return;

  if (el.id === "treeFullscreen") {
    // Fullscreen: a single highlight on the opening box (selection is an opening),
    // since an opening's full line can coincide with a collapsed sequence box.
    const opening = matches.find(node => node.hasAttribute("data-opening-id"));
    (opening || matches[0]).classList.add("is-board-position");
  } else {
    // Main tree: highlight every node at this position — e.g. the final target
    // sequence node and the answer/opening leaf both share the same position.
    for (const node of matches) node.classList.add("is-board-position");
  }
}

function applyTreeBoardPosition(id, pos) {
  const el = document.getElementById(id);
  const treeLines = el && treeLineMaps.get(el);
  if (treeLines && pos) syncTreeBoardPosition(el, treeLines, pos.moves, pos.depth);
}

// The main board highlights the inline tree; the inspector board highlights the
// fullscreen tree. The two stay independent so navigating one never moves the
// other's "you are here" marker.
document.addEventListener("ot:board-position", e => {
  boardPosition = e.detail;
  applyTreeBoardPosition("tree", boardPosition);
});
document.addEventListener("ot:inspector-position", e => {
  inspectorPosition = e.detail;
  applyTreeBoardPosition("treeFullscreen", inspectorPosition);
});

// Phase 5 — centre the newly confirmed move on first render of a puzzle, but
// otherwise hold the player's current view (only re-panning if focus drifts off).
function focusTree(el, state, view, allNodes, displayRoot, prevScroll) {
  const slackX = view.padX, slackY = view.padY;
  const mainNodes = allNodes.filter(node => node.main);
  const targetFocus = mainNodes[mainNodes.length - 1] || displayRoot;
  const latestNodes = allNodes.filter(node => node.latest);
  const latestFocus = latestNodes[latestNodes.length - 1];
  const focusPts = (latestFocus ? [latestFocus, targetFocus] : [targetFocus])
    .map(node => ({ x: node.cx, y: node.y + node.height / 2 }));
  const focusX = focusPts.reduce((s, p) => s + p.x, 0) / focusPts.length;
  const focusY = focusPts.reduce((s, p) => s + p.y, 0) / focusPts.length;
  // Keep horizontal focus centered, but place progress near the bottom so more
  // of the path leading into the newly confirmed move remains visible above it.
  const centeredLeft = Math.max(0, slackX + focusX * view.zoom - el.clientWidth / 2);
  const focusedTop = slackY + Math.max(0, focusY * view.zoom - el.clientHeight * .78);
  // A guess or hint shouldn't yank the tree back to center: hold the player's
  // current view and only re-pan when a focus point drifts out of sight. A new
  // puzzle (mode/difficulty/target change, or solve/give-up) re-centers afresh.
  const puzzleKey = `${state.mode}|${state.difficulty}|${state.target.id}|${state.dayNo}|${state.solved}|${state.gaveUp}`;
  const targetKey = `${state.mode}|${state.difficulty}|${state.target.id}|${state.dayNo}`;
  const freshView = view.puzzleKey !== puzzleKey;
  const newTarget = view.targetKey !== targetKey;
  const rootCx = displayRoot.cx;
  view.rootCenterX = displayRoot.cx;
  view.rootCenterY = displayRoot.y + displayRoot.height / 2;
  requestAnimationFrame(() => {
    if (freshView) {
      panTreeTo(el, centeredLeft, focusedTop, !newTarget && view.puzzleKey != null);
    } else {
      // Hold position, compensating for the tree re-centering as it grows wider.
      const dxRoot = view.prevRootCx == null ? 0 : (rootCx - view.prevRootCx) * view.zoom;
      let left = prevScroll.left + dxRoot, top = prevScroll.top;
      const mx = el.clientWidth * 0.1, my = el.clientHeight * 0.1;
      const outOfView = focusPts.some(p => {
        const sx = slackX + p.x * view.zoom - left, sy = slackY + p.y * view.zoom - top;
        return sx < mx || sx > el.clientWidth - mx || sy < my || sy > el.clientHeight - my;
      });
      if (outOfView) panTreeTo(el, centeredLeft, focusedTop, true);
      else panTreeTo(el, left, top);
    }
    view.puzzleKey = puzzleKey;
    view.targetKey = targetKey;
    view.prevRootCx = rootCx;
  });
}

export function renderTree(state) {
  renderTreeInto(state, document.getElementById("tree"));
  const fullscreenTree = document.getElementById("treeFullscreen");
  if (fullscreenTree.closest(".modal-bg").classList.contains("open")) {
    renderTreeInto(state, fullscreenTree);
  }
}

function applyTreeZoom(el, view, zoom, contentX, contentY, anchorX, anchorY) {
  view.zoom = zoom;
  el.dispatchEvent(new CustomEvent("treezoomchange", { detail: { zoom } }));
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

export function fitFullscreenTree(el) {
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
  const zoom = Math.max(TREE_FULLSCREEN_AUTO_ZOOM_MIN,
    Math.min(TREE_FULLSCREEN_AUTO_ZOOM_MAX, fitX, fitY));
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

export function zoomTreeByFactor(el, factor) {
  const view = treeView(el);
  const base = view.zoomFrame ? view.zoomTarget : view.zoom;
  zoomTree(el, base * factor - view.zoom, null, null, true);
}

export function setTreeZoom(el, zoom) {
  const view = treeView(el);
  zoomTree(el, zoom - view.zoom);
}

export function enableTreeViewport(el) {
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
