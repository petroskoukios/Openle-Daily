/* Shareable result — a clean, spoiler-free one-liner (no emoji grid). */
import { state } from "./state.js";
import { guessBudgetUsed, hintsUsed, guessLimit, hintWord } from "./domain.js";
import { DIFF_LABEL } from "./data.js";
import { toast } from "./dom.js";

function shareText() {
  const n = guessBudgetUsed(state);
  const h = hintsUsed(state);
  const limit = guessLimit(state);
  const label = DIFF_LABEL[state.difficulty];
  const head = state.mode === "daily"
    ? `♟ Openle #${state.dayNo} · ${label}`
    : `♟ Openle · ${label} practice`;
  const hints = h ? ` · ${hintWord(h)}` : "";
  const result = state.solved ? `Solved in ${n}/${limit}${hints}` : `Didn't solve it${hints}`;
  return `${head}\n${result}\nhttps://openledaily.com`;
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
