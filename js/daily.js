/* Deterministic daily puzzle selection — same puzzle for everyone, per tier. */
import { POOLS, DIFFS } from "./data.js";

export function localDayNumber(d = new Date()) {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((local - new Date(2024, 0, 1)) / 86400000);
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
  const idx = POOLS[diff].map((_, i) => i);
  const rnd = mulberry32(xmur3("opening-tree-v1:" + diff)());
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  PERMS[diff] = idx;
}

// Each (day, difficulty) is a distinct deterministic puzzle, identical for everyone.
export function dailyTarget(dayNo, diff) {
  const perm = PERMS[diff], pool = POOLS[diff];
  return pool[perm[((dayNo % perm.length) + perm.length) % perm.length]];
}
