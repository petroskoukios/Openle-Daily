/* Board: "how far you've gotten". Renders the position at the deepest confirmed
   line, with move-by-move slide animation and prev/next navigation. All view
   state lives in one BoardView object (board-view.js); the DOM rendering and
   the timer scheduling live here. */
import { state } from "./state.js";
import { confirmedDepth } from "./domain.js";
import { commonMoveDepth, fmtMoves, fmtBoardMoves } from "./format.js";
import { createBoardView, resolveBoardView, navCeiling } from "./board-view.js";

const OTChess = window.OTChess; // classic chess.js sets this before modules run

const PIECE_NAME = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const pieceColor = p => (p === p.toUpperCase() ? "w" : "b");
// Board pieces are CC BY-SA SVGs by Uray M. János in pieces-svg/ (see README credits).
function pieceImg(p, cls = "") {
  const color = pieceColor(p);
  return `<img class="pc ${color}${cls}" src="pieces-svg/${PIECE_NAME[p.toLowerCase()]}-${color}.svg" alt="" draggable="false">`;
}

export const BOARD_PLAYBACK_STEP_MS = 220; // Keep in sync with .move-ghost in styles.css.
const view = createBoardView();

export function boardMaxDepth(state) {
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

export function renderBoard(state) {
  const tgt = state.target;
  const done = state.solved || state.gaveUp;
  const liveMax = boardMaxDepth(state);
  // depth shown = deepest confirmed-shared line, or the whole target once finished.
  const { playing, depth, lineMoves } = resolveBoardView(view, liveMax, tgt.moves);
  if (view.manualDepth != null && view.manualDepth !== depth) view.manualDepth = depth;

  const sliding = view.slideFromDepth != null;
  const slideMoves = view.slideFromMoves || lineMoves;
  const board = OTChess.positionAfter(lineMoves, depth);
  const slideFrom = sliding ? OTChess.positionAfter(slideMoves, view.slideFromDepth) : null;
  const movingForward = slideFrom && depth > view.slideFromDepth;
  // Forward uses the old position so a captured piece remains until impact.
  // Reverse uses the restored position so that piece is revealed as the mover leaves.
  const shownBoard = slideFrom ? (movingForward ? slideFrom : board) : board;
  const prev = OTChess.positionAfter(lineMoves, Math.max(0, depth - 1));
  const comparisonBoard = slideFrom || prev;
  const changed = new Set();
  if (slideFrom || depth > 0) for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++)
    if (board[r][f] !== comparisonBoard[r][f]) changed.add(r * 8 + f);
  const slides = slideFrom ? movingPieces(slideFrom, board) : [];
  const hide = new Set();
  for (const m of slides) {
    const hiddenR = movingForward ? m.fromR : m.toR;
    const hiddenF = movingForward ? m.fromF : m.toF;
    hide.add(hiddenR * 8 + hiddenF);
  }
  const captured = new Set();
  if (movingForward) {
    const movingOrigins = new Set(slides.map(m => m.fromR * 8 + m.fromF));
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const key = r * 8 + f;
      if (slideFrom[r][f] && slideFrom[r][f] !== board[r][f] && !movingOrigins.has(key)) {
        captured.add(key);
      }
    }
  }

  let html = "";
  for (let r = 7; r >= 0; r--) {
    for (let f = 0; f < 8; f++) {
      const p = shownBoard[r][f];
      const key = r * 8 + f;
      const pieceClass = (hide.has(key) ? " hide" : "") + (captured.has(key) ? " captured-exit" : "");
      const glyph = p ? pieceImg(p, pieceClass) : "";
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
  const navMax = navCeiling(view, liveMax);
  if (prevBtn && nextBtn) {
    const queued = view.queuedDepth ?? depth;
    prevBtn.disabled = playing || queued <= 0;
    nextBtn.disabled = playing || queued >= navMax;
  }
  const sharedDepth = commonMoveDepth(lineMoves, depth, tgt.moves, tgt.moves.length);
  const exploringBranch = sharedDepth < depth;
  const lineHtml = fmtBoardMoves(lineMoves, depth, tgt.moves);
  if (playing) {
    title.textContent = "How far you've gotten";
    cap.innerHTML = depth === 0
      ? `<span class="muted">starting position</span>`
      : `<span class="ln">${fmtMoves(tgt.moves.slice(0, depth), "")}</span>` +
        `<span class="muted"> · ${depth} opening ${depth === 1 ? "move" : "moves"} matched</span>`;
  } else if (exploringBranch) {
    title.textContent = "Opening tree position";
    cap.innerHTML = `<span class="ln">${lineHtml}</span>`;
  } else if (done && view.manualDepth == null) {
    title.textContent = state.solved ? "Solved — target position" : "Failed — target position";
    cap.innerHTML = `<span class="ln">${fmtMoves(tgt.moves, "")}</span>`;
  } else if (depth === 0) {
    title.textContent = "How far you've gotten";
    cap.innerHTML = `<span class="muted">Starting position — no shared moves yet</span>`;
  } else {
    title.textContent = "How far you've gotten";
    cap.innerHTML = `<span class="ln">${lineHtml}</span>` +
      `<span class="muted"> · ${depth} opening ${depth === 1 ? "move" : "moves"} matched</span>`;
  }

  document.dispatchEvent(new CustomEvent("ot:board-position", {
    detail: { moves: lineMoves.slice(), depth },
  }));
}

export function clearBoardPlayback() {
  for (const t of view.timers) clearTimeout(t);
  clearTimeout(view.stepTimer);
  view.timers = [];
  view.stepTimer = null;
  view.playbackDepth = null;
  view.slideFromDepth = null;
  view.slideFromMoves = null;
  view.queuedDepth = null;
  view.queuedMoves = null;
}

export function resetBoardNav() {
  view.manualDepth = null;
  view.manualMoves = null;
  view.queuedDepth = null;
  view.queuedMoves = null;
}

// Freeze the board at a depth before re-rendering, so the first frame shows the
// start of an upcoming progress animation rather than jumping to the end.
export function primeBoardAnimation(fromDepth) {
  view.playbackDepth = fromDepth;
}

function currentBoardDepth() {
  return view.manualDepth == null ? boardMaxDepth(state) : view.manualDepth;
}

function currentBoardMoves() {
  return view.manualMoves || state.target.moves.slice(0, boardMaxDepth(state));
}

function playQueuedBoardStep() {
  if (!state || view.playbackDepth != null || view.slideFromDepth != null || view.queuedDepth == null || !view.queuedMoves) return;
  const currentMoves = currentBoardMoves();
  const current = currentBoardDepth();
  const destinationMoves = view.queuedMoves;
  const destination = Math.max(0, Math.min(destinationMoves.length, view.queuedDepth));
  const common = commonMoveDepth(currentMoves, current, destinationMoves, destination);
  if (current === destination && common === destination) {
    view.manualMoves = destinationMoves;
    view.manualDepth = destination;
    view.queuedDepth = null;
    view.queuedMoves = null;
    renderBoard(state);
    return;
  }

  const movingBack = current > common;
  const nextMoves = movingBack ? currentMoves : destinationMoves;
  const next = movingBack ? current - 1 : current + 1;
  view.slideFromDepth = current;
  view.slideFromMoves = currentMoves;
  view.manualMoves = nextMoves;
  view.manualDepth = next;
  renderBoard(state);
  view.stepTimer = setTimeout(() => {
    view.slideFromDepth = null;
    view.slideFromMoves = null;
    view.stepTimer = null;
    playQueuedBoardStep();
  }, BOARD_PLAYBACK_STEP_MS);
}

export function stepBoard(delta) {
  if (!state || view.playbackDepth != null) return;
  const max = navCeiling(view, boardMaxDepth(state));
  const base = view.queuedDepth ?? currentBoardDepth();
  const next = Math.max(0, Math.min(max, base + delta));
  if (next === base) return;
  view.queuedMoves = view.queuedMoves || currentBoardMoves();
  view.queuedDepth = next;
  playQueuedBoardStep();
}

export function goBoardDepth(depth) {
  if (!state) return;
  goBoardLine(state.target.moves.slice(0, boardMaxDepth(state)), depth);
}

export function goBoardLine(moves, depth) {
  if (!state || !moves) return;
  clearBoardPlayback();
  const destinationMoves = moves.slice();
  const destination = Math.max(0, Math.min(destinationMoves.length, depth));
  const currentMoves = currentBoardMoves();
  const current = currentBoardDepth();
  const common = commonMoveDepth(currentMoves, current, destinationMoves, destination);
  if (destination === current && common === destination) {
    view.manualMoves = destinationMoves;
    view.manualDepth = destination;
    renderBoard(state);
    return;
  }
  view.queuedMoves = destinationMoves;
  view.queuedDepth = destination;
  playQueuedBoardStep();
}

export function animateBoardProgress(fromDepth, toDepth) {
  clearBoardPlayback();
  resetBoardNav();
  if (toDepth <= fromDepth) return;
  view.playbackDepth = fromDepth;
  for (let d = fromDepth + 1; d <= toDepth; d++) {
    view.timers.push(setTimeout(() => {
      view.playbackDepth = d;
      view.slideFromDepth = d - 1;
      view.slideFromMoves = state.target.moves;
      renderBoard(state);
      if (d === toDepth) {
        view.timers.push(setTimeout(() => {
          view.playbackDepth = null;
          view.slideFromDepth = null;
          view.slideFromMoves = null;
          renderBoard(state);
        }, BOARD_PLAYBACK_STEP_MS));
      }
    }, (d - fromDepth) * BOARD_PLAYBACK_STEP_MS));
  }
}
