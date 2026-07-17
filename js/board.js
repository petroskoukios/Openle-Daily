/* Board: "how far you've gotten". Renders the position at the deepest confirmed
   line, with move-by-move slide animation and prev/next navigation. All view
   state lives in one BoardView object (board-view.js); the DOM rendering and
   the timer scheduling live here. */
import { state } from "./state.js";
import { confirmedDepth } from "./domain.js";
import { commonMoveDepth, fmtBoardMoves } from "./format.js";
import { createBoardView, resolveBoardView, navCeiling } from "./board-view.js";
import { play } from "./sound.js";

const OTChess = window.OTChess; // classic chess.js sets this before modules run

const PIECE_NAME = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const pieceColor = p => (p === p.toUpperCase() ? "w" : "b");
function announceBoardDestination(moves, depth) {
  document.dispatchEvent(new CustomEvent("ot:board-position", {
    detail: { moves: moves.slice(), depth },
  }));
}
// Board pieces are CC BY-SA SVGs by Uray M. János in pieces-svg/ (see README credits).
function pieceImg(p, cls = "") {
  const color = pieceColor(p);
  // decoding="sync" makes a freshly-created piece rasterize before it paints,
  // so a moving piece landing on a new square doesn't flash a blank frame while
  // the SVG decodes (visible on mobile).
  return `<img class="pc ${color}${cls}" src="pieces-svg/${PIECE_NAME[p.toLowerCase()]}-${color}.svg" alt="" draggable="false" decoding="sync">`;
}

export const BOARD_PLAYBACK_STEP_MS = 220; // Keep in sync with .move-ghost in styles.css.
const view = createBoardView();

// Board orientation: false = White at the bottom (default), true = Black at the
// bottom. The main board and the fullscreen inspector board flip independently.
let mainFlipped = false;
let inspectorFlipped = false;

// Squares in display order. Flipped reverses both axes (files h→a, rank 1 on top)
// and moves the rank/file coordinate labels to the new edges.
function squaresHtml(boardArr, changed, hide, captured, flipped) {
  const ranks = flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const files = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const leftFile = flipped ? 7 : 0, bottomRank = flipped ? 7 : 0;
  let html = "";
  for (const r of ranks) for (const f of files) {
    const p = boardArr[r][f];
    const key = r * 8 + f;
    const pieceClass = (hide.has(key) ? " hide" : "") + (captured.has(key) ? " captured-exit" : "");
    const glyph = p ? pieceImg(p, pieceClass) : "";
    const cls = ((r + f) % 2 === 0 ? "d" : "l") + (changed.has(key) ? " hl" : "");
    const coord = (f === leftFile ? `<span class="rk">${r + 1}</span>` : "") +
                  (r === bottomRank ? `<span class="fl">${OTChess.FILES[f]}</span>` : "");
    html += `<div class="sq ${cls}">${coord}${glyph}</div>`;
  }
  return html;
}

// Move-ghost coords feed CSS (left = f·12.5%, top = (7−r)·12.5%); flipping the
// view mirrors both axes so the slide animation lands on the displayed squares.
function ghostsHtml(slides, flipped) {
  const T = x => flipped ? 7 - x : x;
  return slides.map(m =>
    `<div class="move-ghost" style="--from-f:${T(m.fromF)};--from-r:${T(m.fromR)};--to-f:${T(m.toF)};--to-r:${T(m.toR)}">${pieceImg(m.p)}</div>`
  ).join("");
}

// Paint the LIVE board in place instead of replacing innerHTML. Recreating the
// whole board every move re-decodes all 32 piece SVGs, which flashes on mobile
// (desktop keeps them cached). Reusing the square/piece elements and only
// swapping a piece's src when it actually changed means the ~28 unmoved pieces
// are never touched — no flash. Ghosts are few and transient, so recreated.
const pieceSrc = p => `pieces-svg/${PIECE_NAME[p.toLowerCase()]}-${pieceColor(p)}.svg`;
function paintBoard(boardEl, boardArr, changed, hide, captured, flipped, slides) {
  const ranks = flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const files = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const cells = [];
  for (const r of ranks) for (const f of files) cells.push([r, f]);

  // Build the 64-square skeleton once; rebuild only when the flip flips (the
  // rank/file coordinate labels sit on different edges) or the board is empty.
  let squares = boardEl.querySelectorAll(".sq");
  if (squares.length !== 64 || boardEl.dataset.flip !== String(flipped)) {
    boardEl.dataset.flip = String(flipped);
    const leftFile = flipped ? 7 : 0, bottomRank = flipped ? 7 : 0;
    boardEl.innerHTML = cells.map(([r, f]) => {
      const cls = (r + f) % 2 === 0 ? "d" : "l";
      const coord = (f === leftFile ? `<span class="rk">${r + 1}</span>` : "") +
                    (r === bottomRank ? `<span class="fl">${OTChess.FILES[f]}</span>` : "");
      return `<div class="sq ${cls}">${coord}</div>`;
    }).join("");
    squares = boardEl.querySelectorAll(".sq");
  }

  boardEl.querySelectorAll(".move-ghost").forEach(g => g.remove());

  // Current vs desired piece per display square.
  const curImg = [], curPiece = [], desired = [];
  cells.forEach(([r, f], i) => {
    const img = squares[i].querySelector(".pc");
    curImg[i] = img || null;
    curPiece[i] = img ? img.dataset.piece : null;
    desired[i] = boardArr[r][f] || null;
  });

  // A piece that moved lands as a *new* square's requirement. Relocate the
  // existing element instead of destroying it at the origin and creating a fresh
  // one at the destination — a new <img> re-decodes its SVG and flashes on
  // mobile. Match a square that needs piece P to a square losing that same P
  // (covers ordinary moves, captures, castling, en passant). Only promotion
  // (piece type changes) has no donor and legitimately makes a new element.
  const vacated = [], needs = [];
  for (let i = 0; i < 64; i++) {
    if (curPiece[i] && curPiece[i] !== desired[i]) vacated.push(i);
    if (desired[i] && desired[i] !== curPiece[i]) needs.push(i);
  }
  const used = new Set();
  for (const ni of needs) {
    const donor = vacated.find(vi => !used.has(vi) && curPiece[vi] === desired[ni]);
    if (donor == null) continue;
    used.add(donor);
    const img = curImg[donor];
    const dest = squares[ni];
    const occupant = dest.querySelector(".pc");
    if (occupant && occupant !== img) occupant.remove();   // the captured piece leaves
    dest.appendChild(img);                                  // moves the element (same node)
    curImg[ni] = img; curPiece[ni] = desired[ni];
    curImg[donor] = null; curPiece[donor] = null;
  }
  for (const vi of vacated)
    if (!used.has(vi) && curImg[vi]) { curImg[vi].remove(); curImg[vi] = null; }

  cells.forEach(([r, f], i) => {
    const sq = squares[i];
    const key = r * 8 + f;
    sq.classList.toggle("hl", changed.has(key));
    const p = desired[i];
    let img = sq.querySelector(".pc");
    if (!p) { if (img) img.remove(); return; }
    if (!img) { img = document.createElement("img"); img.alt = ""; img.draggable = false; img.decoding = "sync"; sq.appendChild(img); }
    // src only changes on a genuine piece-type change (e.g. promotion); moved
    // pieces were relocated above with their src intact.
    if (img.dataset.piece !== p) {
      img.src = pieceSrc(p);
      img.dataset.piece = p;
      img.className = `pc ${pieceColor(p)}`;
    }
    img.classList.toggle("hide", hide.has(key));
    img.classList.toggle("captured-exit", captured.has(key));
  });

  if (slides.length) boardEl.insertAdjacentHTML("beforeend", ghostsHtml(slides, flipped));
}

export function toggleBoardFlip() {
  mainFlipped = !mainFlipped;
  if (state) renderBoard(state);
  return mainFlipped;
}

export function toggleInspectorFlip() {
  inspectorFlipped = !inspectorFlipped;   // caller re-renders the inspector board
  return inspectorFlipped;
}

export function boardMaxDepth(state) {
  return (state.solved || state.gaveUp) ? state.target.moves.length : confirmedDepth(state);
}

// Render for secondary boards (the fullscreen inspector). Mirrors the square /
// piece / coordinate markup of the live board so the same styling applies.
// With no `slide`, draws the position at (moves, depth) and highlights the last
// ply. With `slide = { fromMoves, fromDepth }`, animates that single ply using
// the same move-ghost overlay as the live board, so secondary boards can play
// their moves in order rather than snapping to the final position.
export function renderStaticBoard(moves, depth, slide = null) {
  const board = OTChess.positionAfter(moves, depth);
  const slideFrom = slide ? OTChess.positionAfter(slide.fromMoves, slide.fromDepth) : null;
  const movingForward = slideFrom && depth > slide.fromDepth;
  // Forward shows the old position so a captured piece lingers until impact;
  // reverse shows the new position so the mover reveals what it left behind.
  const shownBoard = slideFrom ? (movingForward ? slideFrom : board) : board;
  const prev = OTChess.positionAfter(moves, Math.max(0, depth - 1));
  const comparison = slideFrom || prev;
  const changed = new Set();
  if (slideFrom || depth > 0) for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++)
    if (board[r][f] !== comparison[r][f]) changed.add(r * 8 + f);
  const slides = slideFrom ? movingPieces(slideFrom, board) : [];
  if (slideFrom && slides.length) {
    const san = movingForward ? moves[depth - 1] : (slide.fromMoves[slide.fromDepth - 1] || "");
    play(movingForward && san && san.includes("x") ? "capture" : "move");
  }
  const hide = new Set();
  for (const m of slides)
    hide.add((movingForward ? m.fromR : m.toR) * 8 + (movingForward ? m.fromF : m.toF));
  const captured = new Set();
  if (movingForward) {
    const origins = new Set(slides.map(m => m.fromR * 8 + m.fromF));
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const key = r * 8 + f;
      if (slideFrom[r][f] && slideFrom[r][f] !== board[r][f] && !origins.has(key)) captured.add(key);
    }
  }
  return squaresHtml(shownBoard, changed, hide, captured, inspectorFlipped) + ghostsHtml(slides, inspectorFlipped);
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
  if (slideFrom && slides.length) {
    const san = movingForward ? lineMoves[depth - 1] : (slideMoves[view.slideFromDepth - 1] || "");
    play(movingForward && san && san.includes("x") ? "capture" : "move");
  }
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

  paintBoard(document.getElementById("board"), shownBoard, changed, hide, captured, mainFlipped, slides);

  const cap = document.getElementById("boardCap");
  const prevBtn = document.getElementById("boardPrev");
  const nextBtn = document.getElementById("boardNext");
  const navMax = navCeiling(view, liveMax);
  if (prevBtn && nextBtn) {
    const queued = view.queuedDepth ?? depth;
    prevBtn.disabled = playing || queued <= 0;
    nextBtn.disabled = playing || queued >= navMax;
  }
  const lineHtml = fmtBoardMoves(lineMoves, depth, tgt.moves);
  cap.innerHTML = depth === 0
    ? `<span class="muted">Starting position</span>`
    : `<span class="ln">${lineHtml}</span>`;

  const navigating = playing || view.queuedDepth != null || view.slideFromDepth != null;
  if (!navigating) announceBoardDestination(lineMoves, depth);
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
  announceBoardDestination(view.queuedMoves, next);
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
  announceBoardDestination(destinationMoves, destination);
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
  announceBoardDestination(state.target.moves, toDepth);
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
