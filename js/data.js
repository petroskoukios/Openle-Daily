/* Opening database + difficulty tiers.
   Reads the raw dataset from window.OPENINGS (set by the classic openings.js
   script, which loads before any module). */
import { fold } from "./format.js";

const RAW = window.OPENINGS;

export const OPENINGS = RAW.map((o, i) => {
  const moves = o.m.split(" ");
  const colon = o.n.indexOf(":");
  // segs = number of comma-separated qualifiers after the family name; the
  // search ranker uses it to prefer shorter / more canonical opening names.
  const segs = colon === -1 ? 0 : o.n.slice(colon + 1).split(",").length;
  return {
    id: i,
    name: o.n,
    eco: o.e,
    moves,
    movesStr: o.m,
    plies: moves.length,
    nameLower: fold(o.n.toLowerCase()),   // accent-folded so "reti" matches "Réti"
    segs,
    curatedTier: o.tier || "reserve",
  };
});

/* Every playable opening has a manually reviewed tier in openings.js.
   Two pools per difficulty:
     • POOLS (cumulative) — what you can GUESS: this tier plus all easier ones,
       so lower-difficulty openings still show up as guesses.
     • TARGET_POOLS (exclusive) — what the SOLUTION can be: only this tier, so a
       medium puzzle's answer is a medium opening, never an easier one. */
// "starter" is a guess-only tier — super-fundamental openings (1.e4, 1.d4,
// Queen's Gambit, Indian Defense…) that can be GUESSED in every difficulty but
// are not a playable mode and are never the answer.
export const DIFFS = ["easy", "medium", "hard", "expert"];
export const DIFF_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert", custom: "Custom" };
export const GUESS_LIMITS = { easy: 10, medium: 15, hard: 20, expert: 25, custom: 15 };
export const HINT_COST = 3;
export const TIER_ORDER = { starter: 0, easy: 1, medium: 2, hard: 3, expert: 4 };
// Tiers whose openings are guessable: starter (guess-only) plus the playable
// difficulties. Excludes "reserve" openings, which are neither guess nor target.
const GUESS_TIERS = new Set(["starter", ...DIFFS]);

export function tierOf(o) {
  return o.curatedTier;
}

export const POOLS = Object.fromEntries(DIFFS.map(diff => [
  diff,
  OPENINGS.filter(o => GUESS_TIERS.has(tierOf(o)) && TIER_ORDER[tierOf(o)] <= TIER_ORDER[diff]),
]));
export const DIFF_LIMITS = Object.fromEntries(DIFFS.map(diff => [diff, POOLS[diff].length]));

// Exclusive per-tier pools used for picking the puzzle's solution.
export const TARGET_POOLS = Object.fromEntries(DIFFS.map(diff => [diff, OPENINGS.filter(o => tierOf(o) === diff)]));

/* Custom practice: pick a base opening, and the puzzle's tree is rooted there
   with the answer drawn from its subtree — every opening whose moves extend the
   base's moves. A base needs at least this many deeper variations to be a real
   puzzle. */
export const CUSTOM_MIN_SUBTREE = 4;

export function subtreeOf(base) {
  if (!base) return [];
  const b = base.moves;
  return OPENINGS.filter(o =>
    o.id !== base.id && o.plies > b.length && b.every((m, i) => o.moves[i] === m));
}

let _customBases = null;
// Openings eligible to be a custom base: those with enough deeper variations.
export function customBaseOptions() {
  if (!_customBases) _customBases = OPENINGS.filter(o => subtreeOf(o).length >= CUSTOM_MIN_SUBTREE);
  return _customBases;
}
