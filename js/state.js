/* Game state singleton + localStorage persistence.
   `state` and `difficulty` are live module bindings: read them directly via the
   import, mutate object properties in place, and reassign only through the
   setters so every importer sees the change. */
import { TARGET_POOLS, OPENINGS, DIFFS, subtreeOf } from "./data.js";
import { dailyTarget, localDayNumber } from "./daily.js";
import { compare, hintsUsed } from "./domain.js";

export const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Daily progress is per (day, difficulty); stats are per (mode, difficulty).
// Version daily saves whenever opening IDs or pool assignments change.
const kDaily = (dayNo, diff) => `ot.daily.v11.${dayNo}.${diff}`;
export const kStats = (mode, diff) => `ot.stats.${mode}.${diff}`;
const K_DIFF = "ot.diff";           // last-used difficulty

function loadDiff() {
  const d = LS.get(K_DIFF, "easy");
  return DIFFS.includes(d) ? d : "easy";
}

export let difficulty = loadDiff();   // current difficulty, shared across modes
// "custom" is a per-game practice mode, not one of the four tiers — never persist
// it as the remembered difficulty (boot/daily would have no pool for it).
export function setDifficulty(d) { difficulty = d; if (DIFFS.includes(d)) LS.set(K_DIFF, d); }

// {mode, difficulty, target, dayNo, results:[cmp], guessedIds:Set, solved, gaveUp, hintPlies, hintCount}
export let state = null;
export function setState(s) { state = s; }

export function freshDaily(diff) {
  diff = diff || difficulty;
  const dayNo = localDayNumber();
  const target = dailyTarget(dayNo, diff);
  const st = { mode: "daily", difficulty: diff, target, dayNo, results: [], guessedIds: new Set(), solved: false, gaveUp: false, hintPlies: 0, hintCount: 0 };
  const saved = LS.get(kDaily(dayNo, diff), null);
  if (saved && saved.guesses) {
    for (const id of saved.guesses) {
      st.results.push(compare(OPENINGS[id], target));
      st.guessedIds.add(id);
    }
    st.solved = !!saved.solved;
    st.gaveUp = !!saved.gaveUp;
    st.hintPlies = Math.min(saved.hintPlies || 0, target.moves.length);
    st.hintCount = saved.hintCount || 0;
  }
  return st;
}

export function freshPractice(diff) {
  diff = diff || difficulty;
  const pool = TARGET_POOLS[diff];   // solution comes from this tier only
  const target = pool[Math.floor(Math.random() * pool.length)];
  return { mode: "practice", difficulty: diff, target, dayNo: null, results: [], guessedIds: new Set(), solved: false, gaveUp: false, hintPlies: 0, hintCount: 0 };
}

// Custom practice: tree rooted at `base`, answer randomly from its subtree.
// Seeding hintPlies with the base depth makes the board + confirmed trunk start
// at the base for free, without it counting as a used hint.
export function freshCustom(base) {
  const pool = subtreeOf(base);
  const target = pool[Math.floor(Math.random() * pool.length)];
  return {
    mode: "practice", difficulty: "custom", base, pool, target, dayNo: null,
    results: [], guessedIds: new Set(), solved: false, gaveUp: false,
    hintPlies: base.moves.length, hintCount: 0,
  };
}

export function saveDaily() {
  if (state.mode !== "daily") return;
  LS.set(kDaily(state.dayNo, state.difficulty), {
    guesses: state.results.map(r => r.guessId),
    solved: state.solved, gaveUp: state.gaveUp, hintPlies: state.hintPlies || 0, hintCount: hintsUsed(state),
  });
}
