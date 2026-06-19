/* Guess log — a most-recent-first list of guesses. Cards play the complete
   opening on the board; individual move tokens navigate to that exact position. */
import { OPENINGS } from "./data.js";
import { esc, fmtGuessLine } from "./format.js";
import { goBoardLine } from "./board.js";

export function renderHistory(state) {
  const panel = document.getElementById("historyPanel");
  if (!state.results.length) { panel.style.display = "none"; return; }
  panel.style.display = "";

  let bestPlies = -1;
  for (const c of state.results) bestPlies = Math.max(bestPlies, c.sharedPlies);

  const items = state.results.slice().reverse().map(cmp => {
    const g = OPENINGS[cmp.guessId];
    const cls = cmp.isWin ? "win" : (cmp.sharedPlies === bestPlies && !state.solved ? "best" : "");
    return `<div class="ghist-item ${cls}" data-history-guess="${g.id}" role="button" tabindex="0" title="Play this opening on the board">
      <div class="gn">${cmp.isWin ? "★ " : ""}${esc(g.name)}<span class="eco">${esc(g.eco)}</span></div>
      <div class="line">${fmtGuessLine(g, cmp)}</div>
    </div>`;
  });
  document.getElementById("historyBody").innerHTML = items.join("");
}

const historyBody = document.getElementById("historyBody");
function activateHistoryTarget(target) {
  const card = target.closest?.("[data-history-guess]");
  if (!card) return;
  const opening = OPENINGS[Number(card.dataset.historyGuess)];
  if (!opening) return;
  const move = target.closest?.("[data-history-depth]");
  const depth = move ? Number(move.dataset.historyDepth) : opening.moves.length;
  goBoardLine(opening.moves, depth);
}
historyBody.addEventListener("click", e => activateHistoryTarget(e.target));
historyBody.addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  if (!e.target.closest?.("[data-history-guess]")) return;
  e.preventDefault();
  activateHistoryTarget(e.target);
});
