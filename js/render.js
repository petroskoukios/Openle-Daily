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

// Time left until the next daily, which rolls over at UTC midnight (global time).
// Returns the bare duration ("5h 23m") or null once the new daily is available.
let nextPuzzleTimer = null;
function nextDailyCountdown() {
  const now = new Date();
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
  if (ms <= 0) return null;
  const totalMin = Math.floor(ms / 60000), h = Math.floor(totalMin / 60), m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : "<1m";
}

export function render() {
  // meta
  const mt = document.getElementById("metaTitle");
  const ms = document.getElementById("metaSub");
  const diff = document.getElementById("diff");
  if (state.mode === "daily") {
    mt.textContent = `Daily #${state.dayNo}`;
    const d = new Date();
    // full date on desktop, a compact date on mobile (CSS picks which to show).
    // Shown in UTC so the date label matches the global (UTC) daily puzzle.
    const long = d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    const short = d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
    ms.innerHTML = `<span class="sub-long"></span><span class="sub-short"></span>`;
    ms.querySelector(".sub-long").textContent = long;
    ms.querySelector(".sub-short").textContent = short;
  } else {
    mt.textContent = "Practice";
    ms.textContent = state.difficulty === "custom" && state.base
      ? `from ${state.base.name}` : "random opening";
  }
  // difficulty selector is available in both modes; the Custom tier is practice-only.
  diff.querySelectorAll("button").forEach(x => x.classList.toggle("active", x.dataset.diff === state.difficulty));
  const customBtn = diff.querySelector('[data-diff="custom"]');
  if (customBtn) customBtn.style.display = state.mode === "practice" ? "" : "none";
  const gc = document.getElementById("gcount");
  const spent = guessBudgetUsed(state), left = guessBudgetLeft(state), hintN = hintsUsed(state);
  const limit = guessLimit(state);
  const gcLabel = spent
    ? `<b>${spent}</b>/${limit} guesses` + (hintN ? ` · ${hintWord(hintN)}` : "")
    : `<b>${limit}</b> guesses`;
  const gcPct = limit ? Math.min(100, Math.round(spent / limit * 100)) : 0;
  gc.innerHTML = `<span class="gcount-label">${gcLabel}</span>` +
    `<span class="gcount-bar"><span class="gcount-fill" style="width:${gcPct}%"></span></span>`;

  // input lock
  input.disabled = state.solved || state.gaveUp;
  if (nextPuzzleTimer) { clearInterval(nextPuzzleTimer); nextPuzzleTimer = null; }
  if (state.mode === "daily" && (state.solved || state.gaveUp)) {
    // Today's daily is done — show status + a live countdown to the next one.
    const status = state.solved ? "Puzzle complete" : "Puzzle failed";
    const tick = () => {
      const t = nextDailyCountdown();
      input.placeholder = t ? `${status}, next daily in ${t}` : "New daily available — refresh";
    };
    tick();
    nextPuzzleTimer = setInterval(tick, 30000);
  } else {
    input.placeholder = state.solved ? "Puzzle completed"
      : state.gaveUp ? "Puzzle failed"
      : "Search an opening to guess — e.g. Sicilian, Ruy Lopez…";
  }

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
