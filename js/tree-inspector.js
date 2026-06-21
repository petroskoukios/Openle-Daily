/* Fullscreen tree inspector: opening metadata plus a board that is fully
   independent of the main board. It shows whatever line was selected in the
   fullscreen tree (defaulting to the starting position) and has its own
   prev/next navigation — navigating it never touches the main board, and the
   main board never changes it. */
import { OPENINGS } from "./data.js";
import { fmtBoardMoves, commonMoveDepth } from "./format.js";
import { fitFullscreenTree } from "./tree.js";
import { state } from "./state.js";
import { renderStaticBoard, BOARD_PLAYBACK_STEP_MS } from "./board.js";

const modal = document.querySelector(".tree-modal");
const panel = document.getElementById("treeInspector");
const inspectorCard = document.querySelector(".tree-inspector-card");
const inspectorBoard = document.getElementById("treeInspectorBoard");
const inspectorMoves = document.getElementById("treeInspectorMoves");
const inspectorCardMoves = document.getElementById("treeInspectorCardMoves");
const copyButton = document.getElementById("treeInspectorCopy");
const copyFenButton = document.getElementById("treeInspectorCopyFen");
const prevButton = document.getElementById("treeInspectorPrev");
const nextButton = document.getElementById("treeInspectorNext");

let selected = null;       // { openingId } whose info card is currently shown
let lastSelected = null;   // last full selection, so the tab can re-expand to it
let line = [];             // moves of the line on the inspector board
let lineDepth = 0;         // plies of `line` shown (0 = starting position)
let queuedMoves = null;    // line the playback is walking toward (null = idle)
let queuedDepth = null;    // destination depth within queuedMoves
let sliding = false;       // a single-ply slide is currently in flight
let stepTimer = null;      // ply-by-ply playback timer
let refitFrame = null;

function movesToPgn(moves) {
  let pgn = "";
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) pgn += `${Math.floor(i / 2) + 1}.`;
    pgn += `${moves[i]} `;
  }
  return pgn.trim();
}

function movesToFen(moves, depth) {
  const board = window.OTChess.positionAfter(moves, depth);
  const rows = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = "", empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece) empty++;
      else {
        if (empty) row += empty;
        row += piece;
        empty = 0;
      }
    }
    rows.push(row + (empty || ""));
  }

  let whiteKingMoved = false, blackKingMoved = false;
  let whiteRookMoved = false, blackRookMoved = false;
  for (let i = 0; i < depth; i++) {
    const move = moves[i].replace(/[+#?!]/g, "");
    if (i % 2 === 0) {
      if (/^(K|O-O)/.test(move)) whiteKingMoved = true;
      if (/^R/.test(move)) whiteRookMoved = true;
    } else {
      if (/^(K|O-O)/.test(move)) blackKingMoved = true;
      if (/^R/.test(move)) blackRookMoved = true;
    }
  }
  let castling = "";
  if (!whiteKingMoved && !whiteRookMoved && board[0][4] === "K") {
    if (board[0][7] === "R") castling += "K";
    if (board[0][0] === "R") castling += "Q";
  }
  if (!blackKingMoved && !blackRookMoved && board[7][4] === "k") {
    if (board[7][7] === "r") castling += "k";
    if (board[7][0] === "r") castling += "q";
  }

  let enPassant = "-";
  const last = moves[depth - 1]?.replace(/[+#?!]/g, "") || "";
  if (/^[a-h]4$/.test(last) && depth % 2 === 1) enPassant = `${last[0]}3`;
  if (/^[a-h]5$/.test(last) && depth % 2 === 0) enPassant = `${last[0]}6`;

  let halfmove = 0;
  for (let i = depth - 1; i >= 0; i--) {
    const move = moves[i].replace(/[+#?!]/g, "");
    if (/^[a-h]/.test(move) || move.includes("x")) break;
    halfmove++;
  }
  return `${rows.join("/")} ${depth % 2 ? "b" : "w"} ${castling || "-"} ${enPassant} ${halfmove} ${Math.floor(depth / 2) + 1}`;
}

async function copyText(button, text, idleLabel, fallbackPrompt) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    prompt(fallbackPrompt, text);
    return;
  }
  const label = button.querySelector("span");
  label.textContent = "Copied";
  setTimeout(() => { label.textContent = idleLabel; }, 1200);
}

function copyCurrentLine() {
  copyText(copyButton, movesToPgn(line.slice(0, lineDepth)), "Copy PGN", "Copy the current line:");
}

function copyCurrentFen() {
  copyText(copyFenButton, movesToFen(line, lineDepth), "Copy FEN", "Copy the current position:");
}

// Tell the fullscreen tree which position to highlight. Defaults to what's on
// the board, but a selection announces its destination up front so the tree's
// highlight jumps to the clicked opening immediately, before the moves animate.
function announceInspectorPosition(moves = line, depth = lineDepth) {
  document.dispatchEvent(new CustomEvent("ot:inspector-position", {
    detail: { moves: moves.slice(), depth },
  }));
}

// Enable/disable the nav arrows from the queued destination (like the main
// board), so the buttons reflect where you'll end up — not whether a slide is
// mid-flight. Repeated presses queue instead of being blocked.
function updateInspectorNav() {
  const navMax = (queuedMoves || line).length;
  const ceiling = queuedDepth ?? lineDepth;
  if (prevButton) prevButton.disabled = ceiling <= 0;
  if (nextButton) nextButton.disabled = ceiling >= navMax;
}

// Draw the board (optionally mid-slide) and refresh the caption + nav state.
function paintInspector(slide) {
  inspectorBoard.innerHTML = renderStaticBoard(line, lineDepth, slide);
  const targetMoves = (state && state.target) ? state.target.moves : line;
  inspectorMoves.innerHTML = lineDepth === 0
    ? `<span class="muted">Starting position</span>`
    : fmtBoardMoves(line, lineDepth, targetMoves);
  updateInspectorNav();
}

function clearInspectorPlayback() {
  if (stepTimer) { clearTimeout(stepTimer); stepTimer = null; }
  queuedMoves = null;
  queuedDepth = null;
  sliding = false;
}

// Walk one ply toward the queued destination — sliding the moved piece — until
// we arrive, so the inspector plays its moves in order like the main board.
// Steps back along the current line to the shared point, then forward along the
// destination. A press during a slide just re-points the queue; this no-ops
// while sliding and the slide's timer resumes it toward the latest target.
function playQueuedInspectorStep() {
  if (sliding || queuedDepth == null || !queuedMoves) return;
  const current = lineDepth;
  const currentMoves = line;
  const destination = Math.max(0, Math.min(queuedMoves.length, queuedDepth));
  const common = commonMoveDepth(currentMoves, current, queuedMoves, destination);
  if (current === destination && common === destination) {
    line = queuedMoves.slice();
    lineDepth = destination;
    queuedMoves = null;
    queuedDepth = null;
    paintInspector(null);
    announceInspectorPosition();
    return;
  }
  const movingBack = current > common;
  const nextMoves = (movingBack ? currentMoves : queuedMoves).slice();
  const next = movingBack ? current - 1 : current + 1;
  const slide = { fromMoves: nextMoves, fromDepth: current };
  line = nextMoves;
  lineDepth = next;
  sliding = true;
  paintInspector(slide);
  stepTimer = setTimeout(() => {
    sliding = false;
    stepTimer = null;
    playQueuedInspectorStep();
  }, BOARD_PLAYBACK_STEP_MS);
}

// Queue the inspector board to walk to (moves, depth), animating in order.
function queueInspectorLine(moves, depth) {
  queuedMoves = moves.slice();
  queuedDepth = Math.max(0, Math.min(queuedMoves.length, depth));
  announceInspectorPosition(queuedMoves, queuedDepth); // highlight the destination now
  updateInspectorNav();
  playQueuedInspectorStep();
}

// Jump straight to (moves, depth) with no animation (reset / initial state).
function setInspectorLine(moves, depth) {
  clearInspectorPlayback();
  line = moves.slice();
  lineDepth = Math.max(0, Math.min(depth, line.length));
  paintInspector(null);
  announceInspectorPosition();
}

// One step of forward/back navigation. Presses queue: the base is the queued
// destination (if a walk is already in flight) so rapid presses accumulate.
function stepInspector(delta) {
  const navMax = (queuedMoves || line).length;
  const base = queuedDepth ?? lineDepth;
  const next = Math.max(0, Math.min(navMax, base + delta));
  if (next === base) return;
  queuedMoves = queuedMoves || line.slice();
  queuedDepth = next;
  updateInspectorNav();
  playQueuedInspectorStep();
}

// Keyboard arrows drive the inspector board while the panel is open.
export function stepTreeInspector(delta) {
  if (!modal.classList.contains("inspector-open")) return;
  stepInspector(delta);
}

function showOpeningCard(openingId, moves, depth) {
  const opening = OPENINGS[openingId];
  if (!opening) return;
  document.getElementById("treeInspectorName").textContent = opening.name;
  document.getElementById("treeInspectorEco").textContent = opening.eco;
  // Only the puzzle's target opening gets the accent (blue) name/star/moves.
  inspectorCard.classList.toggle("is-target", !!state && state.target.id === openingId);
  // Colour each ply by whether it stays on the target path (.sh) or diverges (.branch).
  const targetMoves = (state && state.target) ? state.target.moves : moves;
  inspectorCardMoves.innerHTML = fmtBoardMoves(moves, depth, targetMoves);
}

function refitDuringTransition() {
  if (refitFrame) cancelAnimationFrame(refitFrame);
  const tree = document.getElementById("treeFullscreen");
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    fitFullscreenTree(tree);
    return;
  }

  const startedAt = performance.now();
  const followLayout = now => {
    fitFullscreenTree(tree);
    if (now - startedAt < 460) refitFrame = requestAnimationFrame(followLayout);
    else refitFrame = null;
  };
  refitFrame = requestAnimationFrame(followLayout);
}

// Open (or update) the inspector for a line selected in the fullscreen tree.
export function openTreeInspector({ openingId, moves, depth }) {
  const wasOpen = modal.classList.contains("inspector-open");
  queueInspectorLine(moves, depth);   // play the moves in order onto the board
  if (openingId != null) {
    selected = { openingId };
    showOpeningCard(openingId, moves, depth);
  }
  lastSelected = { openingId, moves: moves.slice(), depth };

  modal.classList.add("inspector-open");
  panel.setAttribute("aria-hidden", "false");
  if (!wasOpen) refitDuringTransition();
}

export function closeTreeInspector({ refit = true, forget = true } = {}) {
  const wasOpen = modal.classList.contains("inspector-open");
  selected = null;
  if (forget) {                 // a collapse (forget:false) keeps the line for re-expand
    lastSelected = null;
    setInspectorLine([], 0);    // reset to the starting position for the next open
  }
  modal.classList.remove("inspector-open");
  panel.setAttribute("aria-hidden", "true");
  if (refit && wasOpen) refitDuringTransition();
}

// The edge tab toggles the panel: collapse when open, re-expand otherwise.
function toggleTreeInspector() {
  if (modal.classList.contains("inspector-open")) {
    closeTreeInspector({ forget: false });
  } else if (lastSelected) {
    openTreeInspector(lastSelected);
  } else {
    setInspectorLine([], 0);    // default state: the starting position
    modal.classList.add("inspector-open");
    panel.setAttribute("aria-hidden", "false");
    refitDuringTransition();
  }
}

export function refreshTreeInspector() {
  paintInspector(null);
}

document.addEventListener("ot:tree-line-select", e => openTreeInspector(e.detail));
document.getElementById("treeInspectorCollapse").addEventListener("click", toggleTreeInspector);
prevButton?.addEventListener("click", () => stepInspector(-1));
nextButton?.addEventListener("click", () => stepInspector(1));
copyButton.addEventListener("click", copyCurrentLine);
copyFenButton.addEventListener("click", copyCurrentFen);

setInspectorLine([], 0); // initial state: the starting position
