/* Submitting guesses, hints, and giving up. */
import { state, saveDaily } from "./state.js";
import { compare, confirmedDepth, guessBudgetLeft, hintsUsed } from "./domain.js";
import { HINT_COST } from "./data.js";
import {
  clearBoardPlayback, resetBoardNav, animateBoardProgress,
  primeBoardAnimation, BOARD_PLAYBACK_STEP_MS,
} from "./board.js";
import { recordDaily, recordPractice, onSolve } from "./stats.js";
import { render } from "./render.js";
import { input, suggestEl, toast } from "./dom.js";
import { play } from "./sound.js";

function finishOutOfGuesses() {
  clearBoardPlayback();
  resetBoardNav();
  state.gaveUp = true;
  if (state.mode === "daily") { saveDaily(); recordDaily(false); }
  else recordPractice(false);
  play("miss");
  toast("Out of guesses.");
}

export function submitGuess(opening) {
  if (!opening || state.solved || state.gaveUp) return;
  if (guessBudgetLeft(state) < 1) { finishOutOfGuesses(); render(); return; }
  if (state.guessedIds.has(opening.id)) { toast("Already guessed that one."); input.select(); return; }
  const beforeDepth = confirmedDepth(state);
  const cmp = compare(opening, state.target);
  state.results.push(cmp);
  state.guessedIds.add(opening.id);
  if (cmp.isWin) state.solved = true;
  else if (guessBudgetLeft(state) === 0) finishOutOfGuesses();
  if (!cmp.isWin && !state.gaveUp) play("guess");   // win/miss have their own sounds
  const afterDepth = (state.solved || state.gaveUp) ? state.target.moves.length : confirmedDepth(state);
  const shouldAnimateBoard = afterDepth > beforeDepth;
  if (shouldAnimateBoard) primeBoardAnimation(beforeDepth);
  else { clearBoardPlayback(); resetBoardNav(); }

  input.value = "";
  suggestEl.classList.remove("open");
  if (state.mode === "daily") saveDaily();
  if (cmp.isWin) {
    const modalDelay = shouldAnimateBoard
      ? (afterDepth - beforeDepth + 1) * BOARD_PLAYBACK_STEP_MS + 250
      : 700;
    onSolve(modalDelay);
  }
  render();
  if (shouldAnimateBoard) animateBoardProgress(beforeDepth, afterDepth);
  if (!state.solved && !state.gaveUp) input.focus();
}

export function giveUp() {
  if (state.solved || state.gaveUp) return;
  if (!confirm("Reveal the target opening and end this puzzle?")) return;
  clearBoardPlayback();
  resetBoardNav();
  const beforeDepth = confirmedDepth(state);
  state.gaveUp = true;
  if (state.mode === "daily") { saveDaily(); recordDaily(false); }
  else recordPractice(false);
  play("miss");
  const afterDepth = state.target.moves.length;
  if (afterDepth > beforeDepth) primeBoardAnimation(beforeDepth);
  render();
  if (afterDepth > beforeDepth) animateBoardProgress(beforeDepth, afterDepth);
}

export function requestHint() {
  if (state.solved || state.gaveUp) return;
  clearBoardPlayback();
  resetBoardNav();
  if (guessBudgetLeft(state) < HINT_COST) {
    toast(`Hints cost ${HINT_COST} guesses.`);
    return;
  }
  const depth = confirmedDepth(state);
  if (depth >= state.target.moves.length) { toast("The full line is already revealed."); return; }
  state.hintPlies = depth + 1;
  state.hintCount = hintsUsed(state) + 1;
  if (guessBudgetLeft(state) === 0) finishOutOfGuesses();
  const afterDepth = state.gaveUp ? state.target.moves.length : confirmedDepth(state);
  if (afterDepth > depth) primeBoardAnimation(depth);
  if (state.mode === "daily") saveDaily();
  render();
  if (afterDepth > depth) animateBoardProgress(depth, afterDepth);
}
