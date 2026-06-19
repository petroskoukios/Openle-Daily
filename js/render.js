/* Master render: refreshes meta, guess count, input lock, the three panels
   (tree / history / board), and the footer action buttons from current state.
   Extracted into its own module so actions/stats can call it without a cycle. */
import { state } from "./state.js";
import { confirmedDepth, guessBudgetUsed, guessBudgetLeft, hintsUsed, guessLimit, hintWord } from "./domain.js";
import { HINT_COST } from "./data.js";
import { renderTree } from "./tree.js";
import { renderHistory } from "./history.js";
import { renderBoard } from "./board.js";
import { input } from "./dom.js";

export function render() {
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
