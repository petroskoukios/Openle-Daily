/* Fullscreen tree inspector: opening metadata plus a live mirror of the board. */
import { OPENINGS } from "./data.js";
import { fmtBoardMoves } from "./format.js";
import { fitFullscreenTree } from "./tree.js";
import { state } from "./state.js";

const modal = document.querySelector(".tree-modal");
const panel = document.getElementById("treeInspector");
const inspectorCard = document.querySelector(".tree-inspector-card");
const inspectorBoard = document.getElementById("treeInspectorBoard");
const inspectorMoves = document.getElementById("treeInspectorMoves");
const inspectorCardMoves = document.getElementById("treeInspectorCardMoves");
const copyButton = document.getElementById("treeInspectorCopy");
const copyFenButton = document.getElementById("treeInspectorCopyFen");
const sourceBoard = document.getElementById("board");
const sourceMoves = document.getElementById("boardCap");
let selected = null;
let syncFrame = null;
let refitFrame = null;

function syncBoardMirror() {
  syncFrame = null;
  if (!modal.classList.contains("inspector-open")) return;
  inspectorBoard.innerHTML = sourceBoard.innerHTML;
  if (sourceMoves.textContent.trim()) inspectorMoves.innerHTML = sourceMoves.innerHTML;
}

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
  if (!selected) return;
  const pgn = movesToPgn(selected.moves.slice(0, selected.depth));
  copyText(copyButton, pgn, "Copy PGN", "Copy the current line:");
}

function copyCurrentFen() {
  if (!selected) return;
  const fen = movesToFen(selected.moves, selected.depth);
  copyText(copyFenButton, fen, "Copy FEN", "Copy the current position:");
}

function scheduleMirrorSync() {
  if (syncFrame) return;
  syncFrame = requestAnimationFrame(syncBoardMirror);
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

export function openTreeInspector({ openingId, moves, depth }) {
  const opening = OPENINGS[openingId];
  if (!opening) return;
  const wasOpen = modal.classList.contains("inspector-open");
  selected = { openingId, moves: moves.slice(), depth };

  document.getElementById("treeInspectorName").textContent = opening.name;
  document.getElementById("treeInspectorEco").textContent = opening.eco;
  // Only the puzzle's target opening gets the accent (blue) name/star/moves.
  inspectorCard.classList.toggle("is-target", !!state && state.target.id === openingId);
  // Colour each ply by whether it stays on the target path (.sh) or diverges (.branch).
  const targetMoves = (state && state.target) ? state.target.moves : moves;
  const lineHtml = fmtBoardMoves(moves, depth, targetMoves);
  inspectorMoves.innerHTML = lineHtml;
  inspectorCardMoves.innerHTML = lineHtml;

  modal.classList.add("inspector-open");
  panel.setAttribute("aria-hidden", "false");
  scheduleMirrorSync();
  if (!wasOpen) refitDuringTransition();
}

export function closeTreeInspector({ refit = true } = {}) {
  const wasOpen = modal.classList.contains("inspector-open");
  selected = null;
  modal.classList.remove("inspector-open");
  panel.setAttribute("aria-hidden", "true");
  document.querySelectorAll("#treeFullscreen .tree-node.is-inspected")
    .forEach(node => node.classList.remove("is-inspected"));
  if (refit && wasOpen) refitDuringTransition();
}

export function refreshTreeInspector() {
  if (!selected) return;
  scheduleMirrorSync();
}

new MutationObserver(scheduleMirrorSync).observe(sourceBoard, { childList: true, subtree: true, attributes: true });
new MutationObserver(scheduleMirrorSync).observe(sourceMoves, { childList: true, subtree: true, characterData: true });

document.addEventListener("ot:tree-opening-select", e => openTreeInspector(e.detail));
document.getElementById("treeInspectorCollapse").addEventListener("click", closeTreeInspector);
copyButton.addEventListener("click", copyCurrentLine);
copyFenButton.addEventListener("click", copyCurrentFen);
