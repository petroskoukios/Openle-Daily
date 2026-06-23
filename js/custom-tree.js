/* Custom tree: a free-exploration tree shown only in the fullscreen view,
   separate from the puzzle. It has no target and no solution — you just add
   any openings you like and they render as plain branches. It resets every
   time the fullscreen view is opened (nothing is persisted). */
import { difficulty } from "./state.js";

let active = false;        // is the fullscreen currently showing the custom tree?
let customState = null;

export function isCustomActive() { return active; }
export function setCustomActive(v) { active = v; }

// A state object shaped like the puzzle state so renderTreeInto can consume it,
// but flagged `custom` so the tree builder skips the target spine / tip / answer.
export function resetCustomTree() {
  customState = {
    mode: "practice", custom: true, difficulty,
    target: { id: -1, name: "", moves: [], plies: 0 },  // unused placeholder
    dayNo: null, results: [], guessedIds: new Set(),
    solved: false, gaveUp: false, hintPlies: 0, hintCount: 0,
  };
}

export function customTreeState() {
  if (!customState) resetCustomTree();
  return customState;
}

// Add an opening to the custom tree. Each added opening is recorded like a guess
// with no shared plies, so the builder draws its whole line as an off-path branch.
export function addCustomOpening(o) {
  const st = customTreeState();
  if (st.guessedIds.has(o.id)) return false;
  st.guessedIds.add(o.id);
  st.results.push({ guessId: o.id, sharedPlies: 0 });
  return true;
}
