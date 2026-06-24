/* Shareable result — a no-spoiler grid of closeness squares, Wordle-style. */
import { state } from "./state.js";
import { guessBudgetUsed, hintsUsed, guessLimit, guessWord, hintWord } from "./domain.js";
import { DIFF_LABEL } from "./data.js";
import { toast } from "./dom.js";

function closenessSquare(cmp) {
  if (cmp.isWin) return "★";
  const r = cmp.sharedPlies / state.target.plies;
  if (cmp.sharedPlies === 0) return "⬛";
  if (r < 0.34) return "🟥";
  if (r < 0.5) return "🟧";
  if (r < 0.75) return "🟨";
  return "🟩";
}
function shareText() {
  const n = guessBudgetUsed(state);
  const h = hintsUsed(state);
  const limit = guessLimit(state);
  const head = state.mode === "daily"
    ? `Openle #${state.dayNo} · ${DIFF_LABEL[state.difficulty]} — ${state.solved ? `${guessWord(n)}/${limit}` : "X"}${h ? ` · ${hintWord(h)}` : ""}`
    : `Openle · ${DIFF_LABEL[state.difficulty]} practice — ${guessWord(n)}/${limit}${h ? ` · ${hintWord(h)}` : ""}`;
  const squares = state.results.map(closenessSquare);
  // group into rows of 5 for a tidy grid
  let grid = "";
  for (let i = 0; i < squares.length; i += 5) grid += squares.slice(i, i + 5).join("") + "\n";
  return `${head}\n${grid}♟ openledaily.com`;
}
export async function doShare() {
  const text = shareText();
  try {
    await navigator.clipboard.writeText(text);
    toast("Result copied to clipboard!");
  } catch {
    prompt("Copy your result:", text);
  }
}
