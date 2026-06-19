/* Opening database + difficulty tiers.
   Reads the raw dataset from window.OPENINGS (set by the classic openings.js
   script, which loads before any module). */

const RAW = window.OPENINGS;

export const OPENINGS = RAW.map((o, i) => {
  const moves = o.m.split(" ");
  const colon = o.n.indexOf(":");
  const family = (colon === -1 ? o.n : o.n.slice(0, colon)).trim();
  const segs = colon === -1 ? 0 : o.n.slice(colon + 1).split(",").length;
  return {
    id: i,
    name: o.n,
    eco: o.e,
    moves,
    movesStr: o.m,
    family,
    firstMove: moves[0],
    section: o.e[0],
    plies: moves.length,
    nameLower: o.n.toLowerCase(),
    segs,
    curatedTier: o.tier || "reserve",
  };
});

/* Every playable opening has a manually reviewed tier in openings.js. Pools are
   cumulative: each difficulty includes all openings from the tiers below it. */
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
