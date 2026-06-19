/* Comparison engine + guess/hint budget math. Pure given a state object. */
import { GUESS_LIMITS, HINT_COST } from "./data.js";

export function compare(guess, target) {
  const g = guess.moves, t = target.moves;
  let k = 0;
  const max = Math.min(g.length, t.length);
  while (k < max && g[k] === t[k]) k++;

  return {
    guessId: guess.id,
    sharedPlies: k,
    isWin: guess.movesStr === target.movesStr,
  };
}

export function confirmedDepth(state) {
  let best = state.hintPlies || 0;
  for (const cmp of state.results) best = Math.max(best, cmp.sharedPlies);
  return Math.min(best, state.target.moves.length);
}

export function hintsUsed(state) {
  return state.hintCount || 0;
}

export function guessBudgetUsed(state) {
  return state.results.length + hintsUsed(state) * HINT_COST;
}

export function guessLimit(stateOrDiff) {
  const diff = typeof stateOrDiff === "string" ? stateOrDiff : stateOrDiff?.difficulty;
  return GUESS_LIMITS[diff] || GUESS_LIMITS.medium;
}

export function guessBudgetLeft(state) {
  return Math.max(0, guessLimit(state) - guessBudgetUsed(state));
}

export function guessWord(n) {
  return n + (n === 1 ? " guess" : " guesses");
}

export function hintWord(n) {
  return n + (n === 1 ? " hint" : " hints");
}
