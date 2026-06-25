/* Opening database + difficulty tiers.
   Reads the raw dataset from window.OPENINGS (set by the classic openings.js
   script, which loads before any module). */

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
    nameLower: o.n.toLowerCase(),
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
// "starter" is the easiest tier — a handful of super-fundamental openings
// (1.e4, 1.d4, Queen's Gambit, Indian Defense…). Cumulative POOLS make them
// guessable in every tier; exclusive TARGET_POOLS keep them as answers only in
// Starter, never in Easy or above.
export const DIFFS = ["starter", "easy", "medium", "hard", "expert"];
export const DIFF_LABEL = { starter: "Starter", easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert", custom: "Custom" };
export const GUESS_LIMITS = { starter: 6, easy: 10, medium: 15, hard: 20, expert: 25, custom: 15 };
export const HINT_COST = 3;
export const TIER_ORDER = { starter: 0, easy: 1, medium: 2, hard: 3, expert: 4 };

export function tierOf(o) {
  return o.curatedTier;
}

export const POOLS = Object.fromEntries(DIFFS.map(diff => [
  diff,
  OPENINGS.filter(o => DIFFS.includes(tierOf(o)) && TIER_ORDER[tierOf(o)] <= TIER_ORDER[diff]),
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
