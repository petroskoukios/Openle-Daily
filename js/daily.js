/* Deterministic daily puzzle selection — the same puzzle for everyone worldwide,
   per tier. The day rolls over at UTC midnight (global time) rather than each
   player's local midnight, so everyone is on the same puzzle at the same moment.
   Using UTC also avoids the daylight-saving off-by-one that local midnights can
   introduce. */
import { TARGET_POOLS, DIFFS } from "./data.js";

export function utcDayNumber(d = new Date()) {
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((today - Date.UTC(2024, 0, 1)) / 86400000);
}

// xmur3 + mulberry32 for a stable seeded shuffle of the pool.
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One fixed permutation per difficulty, so consecutive days don't repeat for a
// long time and each tier walks its own independent order.
const PERMS = {};
for (const diff of DIFFS) {
  const idx = TARGET_POOLS[diff].map((_, i) => i);
  const rnd = mulberry32(xmur3("opening-tree-v1:" + diff)());
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  PERMS[diff] = idx;
}

// Each (day, difficulty) is a distinct deterministic puzzle, identical for everyone.
export function dailyTarget(dayNo, diff) {
  const perm = PERMS[diff], pool = TARGET_POOLS[diff];
  return pool[perm[((dayNo % perm.length) + perm.length) % perm.length]];
}
