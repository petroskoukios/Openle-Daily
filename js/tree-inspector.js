/* Fullscreen tree inspector: opening metadata plus a live mirror of the board. */
import { OPENINGS } from "./data.js";
import { fmtMoves } from "./format.js";
import { fitFullscreenTree } from "./tree.js";

const modal = document.querySelector(".tree-modal");
const panel = document.getElementById("treeInspector");
const inspectorBoard = document.getElementById("treeInspectorBoard");
const inspectorMoves = document.getElementById("treeInspectorMoves");
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
  selected = { openingId, moves: moves.slice(), depth };

  document.getElementById("treeInspectorName").textContent = opening.name;
  document.getElementById("treeInspectorEco").textContent = opening.eco;
  document.getElementById("treeInspectorFamily").textContent =
    `${opening.family} family · ${opening.plies} plies in the catalogued line.`;
  document.getElementById("treeInspectorFamilyStat").textContent = opening.family;
  document.getElementById("treeInspectorDepth").textContent = `${opening.plies} plies`;
  document.getElementById("treeInspectorFirstMove").textContent = opening.firstMove;
  inspectorMoves.innerHTML = fmtMoves(moves.slice(0, depth), "");

  modal.classList.add("inspector-open");
  panel.setAttribute("aria-hidden", "false");
  scheduleMirrorSync();
  refitDuringTransition();
}

export function closeTreeInspector({ refit = true } = {}) {
  selected = null;
  modal.classList.remove("inspector-open");
  panel.setAttribute("aria-hidden", "true");
  document.querySelectorAll("#treeFullscreen .tree-node.is-inspected")
    .forEach(node => node.classList.remove("is-inspected"));
  if (refit) refitDuringTransition();
}

export function refreshTreeInspector() {
  if (!selected) return;
  scheduleMirrorSync();
}

new MutationObserver(scheduleMirrorSync).observe(sourceBoard, { childList: true, subtree: true, attributes: true });
new MutationObserver(scheduleMirrorSync).observe(sourceMoves, { childList: true, subtree: true, characterData: true });

document.addEventListener("ot:tree-opening-select", e => openTreeInspector(e.detail));
document.getElementById("treeInspectorCollapse").addEventListener("click", closeTreeInspector);
document.getElementById("treeInspectorBack").addEventListener("click", closeTreeInspector);
document.getElementById("treeInspectorFit").addEventListener("click", () =>
  fitFullscreenTree(document.getElementById("treeFullscreen")));
