/* Entry point: modal helpers, event wiring, boot, and the window.__OT hook
   that the test harness (tests.html) reads. Importing this module pulls in the
   whole graph, so the self-wiring modules (search, history) initialise too. */
import { OPENINGS, POOLS, TARGET_POOLS, DIFFS, DIFF_LIMITS, GUESS_LIMITS, HINT_COST, tierOf, customBaseOptions } from "./data.js";
import { dailyTarget } from "./daily.js";
import { compare, guessLimit, confirmedDepth, hintsUsed, guessBudgetUsed, guessBudgetLeft } from "./domain.js";
import { commonMoveDepth, esc } from "./format.js";
import { state, setState, setDifficulty, freshDaily, freshPractice, freshCustom, LS } from "./state.js";
import { render } from "./render.js";
import { renderTreeInto, fitFullscreenTree, zoomTreeByFactor, setTreeZoom, enableTreeViewport } from "./tree.js";
import { stepBoard, clearBoardPlayback, resetBoardNav } from "./board.js";
import { createBoardView, resolveBoardView, navCeiling } from "./board-view.js";
import { submitGuess, requestHint, giveUp } from "./actions.js";
import { looksLikeMoves, moveTokens, isMoveSearchEnabled, scoreMatch } from "./search.js";
import { isCustomActive, setCustomActive, customTreeState, addCustomOpening, removeCustomOpening } from "./custom-tree.js";
import { openStats, renderStatsView, startPracticeFromWin, recordPractice } from "./stats.js";
import { doShare } from "./share.js";
import { modal, input, suggestEl, toast } from "./dom.js";
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

// The fullscreen tree shows either the live puzzle or the separate custom tree.
function fullscreenState() { return isCustomActive() ? customTreeState() : state; }

function renderFullscreen({ refit = true } = {}) {
  const el = document.getElementById("treeFullscreen");
  renderTreeInto(fullscreenState(), el);
  if (refit) requestAnimationFrame(() => fitFullscreenTree(el));
}

function setTreeMode(mode) {
  const custom = mode === "custom";
  setCustomActive(custom);
  document.querySelectorAll(".tree-mode-tab").forEach(b => {
    const on = b.dataset.treeMode === mode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelector(".tree-modal").classList.toggle("is-custom", custom);
  closeTreeInspector({ refit: false });   // the inspector belongs to whichever tree was showing
  if (!custom) closeCustomSuggest();
  renderFullscreen();
  if (custom) document.getElementById("treeCustomInput").focus();
}

function openTreeModal() {
  closeTreeInspector({ refit: false });
  // The custom tree persists across opens — don't reset it; just start on the
  // puzzle tab with a clear search box.
  document.getElementById("treeCustomInput").value = "";
  closeCustomSuggest();
  setCustomActive(false);
  document.querySelectorAll(".tree-mode-tab").forEach(b => {
    const on = b.dataset.treeMode === "puzzle";
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelector(".tree-modal").classList.remove("is-custom");
  modal("treeModal", true);
  requestAnimationFrame(() => {
    const el = document.getElementById("treeFullscreen");
    renderTreeInto(state, el);
    requestAnimationFrame(() => fitFullscreenTree(el));
  });
}

/* ---------- Custom tree: tabs + add-opening search ---------- */
const customInput = document.getElementById("treeCustomInput");
const customSuggestEl = document.getElementById("treeCustomSuggest");
let customList = [], customActiveIdx = -1;

function closeCustomSuggest() { customSuggestEl.classList.remove("open"); customList = []; customActiveIdx = -1; }

// Search every opening by name (the custom tree isn't tier-limited), excluding
// ones already in the tree. Reuses the puzzle search's scoring.
function rankCustom(q) {
  const raw = q.trim().toLowerCase();
  if (!raw) return [];
  const tokens = raw.split(/\s+/).filter(Boolean);
  const added = customTreeState().guessedIds;
  const out = [];
  for (const o of OPENINGS) {
    if (added.has(o.id)) continue;
    const s = scoreMatch(o, tokens, raw);
    if (s > -1) out.push([s, o]);
  }
  out.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
  return out.slice(0, 50).map(x => x[1]);
}

function renderCustomSuggest() {
  const q = customInput.value;
  customList = rankCustom(q);
  customActiveIdx = customList.length ? 0 : -1;
  if (!q.trim()) { closeCustomSuggest(); return; }
  if (!customList.length) {
    customSuggestEl.innerHTML = `<li class="empty">No openings match “${esc(q)}”.</li>`;
    customSuggestEl.classList.add("open"); return;
  }
  customSuggestEl.innerHTML = customList.map((o, i) =>
    `<li data-i="${i}" class="${i === customActiveIdx ? "active" : ""}">
      <span class="nm">${esc(o.name)}</span>
      <span class="mv">${esc(o.moves.slice(0, 6).join(" ") + (o.moves.length > 6 ? "…" : ""))}</span></li>`).join("");
  customSuggestEl.classList.add("open");
}

function setCustomActiveIdx(i) {
  const items = customSuggestEl.querySelectorAll("li[data-i]");
  if (!items.length) return;
  customActiveIdx = (i + items.length) % items.length;
  items.forEach(li => li.classList.toggle("active", +li.dataset.i === customActiveIdx));
  items[customActiveIdx].scrollIntoView({ block: "nearest" });
}

function addFromCustom(o) {
  if (!o) return;
  addCustomOpening(o);
  customInput.value = "";
  closeCustomSuggest();
  renderFullscreen();
  customInput.focus();
}

customInput.addEventListener("input", renderCustomSuggest);
customInput.addEventListener("focus", () => { if (customInput.value.trim()) renderCustomSuggest(); });
customInput.addEventListener("keydown", e => {
  if (!customSuggestEl.classList.contains("open")) {
    if (e.key === "ArrowDown" && customInput.value.trim()) renderCustomSuggest();
    return;
  }
  if (e.key === "ArrowDown") { e.preventDefault(); setCustomActiveIdx(customActiveIdx + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setCustomActiveIdx(customActiveIdx - 1); }
  else if (e.key === "Enter") { e.preventDefault(); addFromCustom(customList[customActiveIdx]); }
  else if (e.key === "Escape") { e.stopPropagation(); closeCustomSuggest(); }
});
customSuggestEl.addEventListener("mousedown", e => {
  const li = e.target.closest("li[data-i]");
  if (li) { e.preventDefault(); addFromCustom(customList[+li.dataset.i]); }
});
document.addEventListener("click", e => {
  if (!e.target.closest("#treeCustomSearch")) closeCustomSuggest();
});
document.querySelector(".tree-modal-context").addEventListener("click", e => {
  const b = e.target.closest("button[data-tree-mode]");
  if (b && !b.classList.contains("active")) setTreeMode(b.dataset.treeMode);
});
document.addEventListener("ot:custom-remove-opening", e => {
  if (removeCustomOpening(e.detail.openingId)) renderFullscreen();
});

/* ---------- Custom practice: base-opening picker ---------- */
const baseBar = document.getElementById("customBaseBar");
const baseInput = document.getElementById("customBaseInput");
const baseSuggestEl = document.getElementById("customBaseSuggest");
const guessSearch = document.getElementById("guessInput").closest(".search");
let baseList = [], baseActiveIdx = -1;

// While picking a base the guess box is replaced by the base picker; once a base
// is chosen (or the picker is dismissed) the guess box comes back.
function closeCustomBasePicker() {
  baseBar.style.display = "none";
  guessSearch.style.display = "";
  baseSuggestEl.classList.remove("open"); baseList = []; baseActiveIdx = -1;
}
function openCustomBasePicker() {
  if (state.mode !== "practice") return;       // custom is practice-only
  guessSearch.style.display = "none";
  baseBar.style.display = "";
  baseInput.value = "";
  baseSuggestEl.classList.remove("open");
  baseInput.focus();
}

// Search the eligible base openings (those with enough variations) by name.
function rankBases(q) {
  const raw = q.trim().toLowerCase();
  if (!raw) return [];
  const tokens = raw.split(/\s+/).filter(Boolean);
  const out = [];
  for (const o of customBaseOptions()) {
    const s = scoreMatch(o, tokens, raw);
    if (s > -1) out.push([s, o]);
  }
  out.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
  return out.slice(0, 50).map(x => x[1]);
}

function renderBaseSuggest() {
  const q = baseInput.value;
  baseList = rankBases(q);
  baseActiveIdx = baseList.length ? 0 : -1;
  if (!q.trim()) { baseSuggestEl.classList.remove("open"); return; }
  if (!baseList.length) {
    baseSuggestEl.innerHTML = `<li class="empty">No openings with variations match “${esc(q)}”.</li>`;
    baseSuggestEl.classList.add("open"); return;
  }
  baseSuggestEl.innerHTML = baseList.map((o, i) =>
    `<li data-i="${i}" class="${i === baseActiveIdx ? "active" : ""}">
      <span class="nm">${esc(o.name)}</span>
      <span class="mv">${esc(o.moves.slice(0, 6).join(" ") + (o.moves.length > 6 ? "…" : ""))}</span></li>`).join("");
  baseSuggestEl.classList.add("open");
}

function setBaseActiveIdx(i) {
  const items = baseSuggestEl.querySelectorAll("li[data-i]");
  if (!items.length) return;
  baseActiveIdx = (i + items.length) % items.length;
  items.forEach(li => li.classList.toggle("active", +li.dataset.i === baseActiveIdx));
  items[baseActiveIdx].scrollIntoView({ block: "nearest" });
}

function pickCustomBase(o) {
  if (!o) return;
  if (state.mode === "practice" && guessBudgetUsed(state) && !state.solved && !state.gaveUp) recordPractice(false);
  closeCustomBasePicker();
  clearBoardPlayback();
  resetBoardNav();
  setState(freshCustom(o));
  input.value = ""; render(); input.focus();
}

baseInput.addEventListener("input", renderBaseSuggest);
baseInput.addEventListener("keydown", e => {
  if (!baseSuggestEl.classList.contains("open")) {
    if (e.key === "ArrowDown" && baseInput.value.trim()) renderBaseSuggest();
    return;
  }
  if (e.key === "ArrowDown") { e.preventDefault(); setBaseActiveIdx(baseActiveIdx + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setBaseActiveIdx(baseActiveIdx - 1); }
  else if (e.key === "Enter") { e.preventDefault(); pickCustomBase(baseList[baseActiveIdx]); }
  else if (e.key === "Escape") { closeCustomBasePicker(); }
});
baseSuggestEl.addEventListener("mousedown", e => {
  const li = e.target.closest("li[data-i]");
  if (li) { e.preventDefault(); pickCustomBase(baseList[+li.dataset.i]); }
});
document.addEventListener("click", e => {
  if (!e.target.closest("#customBaseBar") && !e.target.closest('[data-diff="custom"]')) closeCustomBasePicker();
});

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
// Footer placeholder links toast "Coming soon" until they're wired up.
document.querySelector(".site-footer")?.addEventListener("click", e => {
  const a = e.target.closest("a[data-soon]"); if (!a) return;
  e.preventDefault();
  toast("Coming soon");
});
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
  // A new custom puzzle keeps the same base; otherwise a fresh random practice one.
  const next = state.difficulty === "custom" && state.base ? freshCustom(state.base) : freshPractice();
  setState(next); input.value = ""; render(); input.focus();
});
document.getElementById("diff").addEventListener("click", e => {
  const b = e.target.closest("button[data-diff]"); if (!b) return;
  const d = b.dataset.diff;
  if (d === "custom") { openCustomBasePicker(); return; }  // pick a base first
  if (d === state.difficulty) return;
  // abandoning an in-progress practice game counts as a loss; daily just switches.
  if (state.mode === "practice" && guessBudgetUsed(state) && !state.solved && !state.gaveUp) recordPractice(false);
  closeCustomBasePicker();
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
