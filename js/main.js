/* Entry point: modal helpers, event wiring, boot, and the window.__OT hook
   that the test harness (tests.html) reads. Importing this module pulls in the
   whole graph, so the self-wiring modules (search, history) initialise too. */
import { OPENINGS, POOLS, TARGET_POOLS, DIFFS, DIFF_LIMITS, GUESS_LIMITS, HINT_COST, tierOf } from "./data.js";
import { dailyTarget } from "./daily.js";
import { compare, guessLimit, confirmedDepth, hintsUsed, guessBudgetUsed, guessBudgetLeft } from "./domain.js";
import { commonMoveDepth } from "./format.js";
import { state, setState, setDifficulty, freshDaily, freshPractice, LS } from "./state.js";
import { render } from "./render.js";
import { renderTreeInto, fitFullscreenTree, zoomTreeByFactor, setTreeZoom, enableTreeViewport } from "./tree.js";
import { stepBoard, clearBoardPlayback, resetBoardNav } from "./board.js";
import { createBoardView, resolveBoardView, navCeiling } from "./board-view.js";
import { submitGuess, requestHint, giveUp } from "./actions.js";
import { looksLikeMoves, moveTokens, isMoveSearchEnabled } from "./search.js";
import { openStats, renderStatsView, startPracticeFromWin, recordPractice } from "./stats.js";
import { doShare } from "./share.js";
import { modal, input, suggestEl } from "./dom.js";
import { closeTreeInspector, stepTreeInspector } from "./tree-inspector.js?v=7";

const TREE_BUTTON_ZOOM_FACTOR = 1.3;
const fullscreenZoomSlider = document.getElementById("treeModalZoomSlider");

function syncFullscreenZoomSlider(zoom) {
  const value = Math.round(zoom * 100);
  const min = Number(fullscreenZoomSlider.min), max = Number(fullscreenZoomSlider.max);
  fullscreenZoomSlider.value = value;
  fullscreenZoomSlider.style.setProperty("--zoom-progress", `${(value - min) / (max - min) * 100}%`);
  fullscreenZoomSlider.setAttribute("aria-valuetext", `${value}%`);
  fullscreenZoomSlider.title = `${value}%`;
}

function openTreeModal() {
  closeTreeInspector({ refit: false });
  modal("treeModal", true);
  requestAnimationFrame(() => {
    const el = document.getElementById("treeFullscreen");
    renderTreeInto(state, el);
    requestAnimationFrame(() => fitFullscreenTree(el));
  });
}

/* ---------- Modal helpers ---------- */
document.querySelectorAll("[data-close]").forEach(b =>
  b.addEventListener("click", () => {
    const bg = b.closest(".modal-bg");
    if (bg.id === "treeModal") closeTreeInspector({ refit: false });
    bg.classList.remove("open");
  }));
document.querySelectorAll(".modal-bg").forEach(bg =>
  bg.addEventListener("click", e => {
    if (e.target !== bg) return;
    if (bg.id === "treeModal") closeTreeInspector({ refit: false });
    bg.classList.remove("open");
  }));
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeTreeInspector({ refit: false });
    document.querySelectorAll(".modal-bg.open").forEach(m => m.classList.remove("open"));
    return;
  }
  const typing = e.target.closest?.("input, textarea, select, [contenteditable='true']");
  if (typing || suggestEl.classList.contains("open")) return;
  // In the fullscreen tree, arrows drive the inspector board; elsewhere (no
  // modal open) they drive the main board.
  if (document.getElementById("treeModal").classList.contains("open")) {
    if (e.key === "ArrowLeft") { e.preventDefault(); stepTreeInspector(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); stepTreeInspector(1); }
    return;
  }
  if (document.querySelector(".modal-bg.open")) return;
  if (e.key === "ArrowLeft") { e.preventDefault(); stepBoard(-1); }
  else if (e.key === "ArrowRight") { e.preventDefault(); stepBoard(1); }
});

/* ---------- Wiring ---------- */
document.getElementById("howBtn").addEventListener("click", () => modal("howModal", true));
document.getElementById("statsBtn").addEventListener("click", openStats);
document.getElementById("treeExpandBtn").addEventListener("click", openTreeModal);
document.getElementById("treeZoomOut").addEventListener("click", () => zoomTreeByFactor(document.getElementById("tree"), 1 / TREE_BUTTON_ZOOM_FACTOR));
document.getElementById("treeZoomIn").addEventListener("click", () => zoomTreeByFactor(document.getElementById("tree"), TREE_BUTTON_ZOOM_FACTOR));
document.getElementById("treeModalZoomOut").addEventListener("click", () => zoomTreeByFactor(document.getElementById("treeFullscreen"), 1 / TREE_BUTTON_ZOOM_FACTOR));
document.getElementById("treeModalZoomIn").addEventListener("click", () => zoomTreeByFactor(document.getElementById("treeFullscreen"), TREE_BUTTON_ZOOM_FACTOR));
fullscreenZoomSlider.addEventListener("input", () => {
  setTreeZoom(document.getElementById("treeFullscreen"), Number(fullscreenZoomSlider.value) / 100);
});
document.getElementById("treeFullscreen").addEventListener("treezoomchange", e => {
  syncFullscreenZoomSlider(e.detail.zoom);
});
syncFullscreenZoomSlider(1);
enableTreeViewport(document.getElementById("tree"));
enableTreeViewport(document.getElementById("treeFullscreen"));
document.getElementById("statsMode").addEventListener("click", e => {
  const b = e.target.closest("button[data-stats-mode]"); if (!b) return;
  renderStatsView(b.dataset.statsMode);            // diff defaults to current
});
document.getElementById("statsDiff").addEventListener("click", e => {
  const b = e.target.closest("button[data-stats-diff]"); if (!b) return;
  renderStatsView(undefined, b.dataset.statsDiff); // mode defaults to current
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
  setState(freshPractice()); input.value = ""; render(); input.focus();
});
document.getElementById("diff").addEventListener("click", e => {
  const b = e.target.closest("button[data-diff]"); if (!b) return;
  const d = b.dataset.diff; if (d === state.difficulty) return;
  // abandoning an in-progress practice game counts as a loss; daily just switches.
  if (state.mode === "practice" && guessBudgetUsed(state) && !state.solved && !state.gaveUp) recordPractice(false);
  clearBoardPlayback();
  resetBoardNav();
  setDifficulty(d);
  setState(state.mode === "daily" ? freshDaily(d) : freshPractice(d));
  input.value = ""; render(); if (!input.disabled) input.focus();
});
document.getElementById("modes").addEventListener("click", e => {
  const b = e.target.closest("button[data-mode]"); if (!b) return;
  const mode = b.dataset.mode; if (mode === state.mode) return;
  document.querySelectorAll("#modes button").forEach(x => x.classList.toggle("active", x === b));
  if (state.mode === "practice" && guessBudgetUsed(state) && !state.solved && !state.gaveUp) recordPractice(false);
  clearBoardPlayback();
  resetBoardNav();
  setState((mode === "daily") ? freshDaily() : freshPractice());
  input.value = ""; render(); if (!input.disabled) input.focus();
});

/* ---------- Boot ---------- */
function boot() {
  setState(freshDaily());
  render();
  // First-time visitors get the how-to.
  if (!LS.get("ot.seen", false)) { modal("howModal", true); LS.set("ot.seen", true); }
}
boot();

// Debug / test hook — read by tests.html via the iframe's window.__OT.
window.__OT = {
  OPENINGS, POOLS, TARGET_POOLS, DIFFS, DIFF_LIMITS, GUESS_LIMITS, HINT_COST, guessLimit, tierOf, dailyTarget, compare, submitGuess, requestHint,
  // Pure helpers exposed for the test harness (tests.html):
  commonMoveDepth, confirmedDepth, hintsUsed, guessBudgetUsed, guessBudgetLeft, looksLikeMoves, moveTokens,
  createBoardView, resolveBoardView, navCeiling,
  byName: n => OPENINGS.find(o => o.name === n),
  byMoves: m => OPENINGS.find(o => o.movesStr === m),
  get moveSearchEnabled() { return isMoveSearchEnabled(); },
  get state() { return state; },
};
