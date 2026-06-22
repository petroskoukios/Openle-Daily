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
export const DIFFS = ["easy", "medium", "hard", "expert"];
export const DIFF_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert" };
export const GUESS_LIMITS = { easy: 10, medium: 15, hard: 20, expert: 25 };
export const HINT_COST = 3;
export const TIER_ORDER = { easy: 0, medium: 1, hard: 2, expert: 3 };

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
