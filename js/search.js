/* Autocomplete. Searches the current tier's pool (minus already-guessed
   openings) by name, or by move order when notation search is enabled. */
import { state, LS } from "./state.js";
import { POOLS, DIFF_LABEL } from "./data.js";
import { esc } from "./format.js";
import { input, suggestEl } from "./dom.js";
import { submitGuess } from "./actions.js";

const moveSearchToggle = document.getElementById("moveSearchToggle");
const MOVE_SEARCH_KEY = "ot.moveSearch";
let moveSearchEnabled = LS.get(MOVE_SEARCH_KEY, false) === true;
moveSearchToggle.checked = moveSearchEnabled;
// The pill's checked styling keys off this class (with :has() as a backstop).
const syncMoveToggleClass = () =>
  moveSearchToggle.closest(".move-toggle")?.classList.toggle("is-on", moveSearchEnabled);
syncMoveToggleClass();
let activeIdx = -1, currentList = [];

export function isMoveSearchEnabled() { return moveSearchEnabled; }

export function scoreMatch(o, tokens, raw) {
  // Require every token to appear in the opening name.
  for (const tk of tokens) if (o.nameLower.indexOf(tk) === -1) return -1;
  let s = 0;
  if (o.nameLower === raw) s += 1000;
  if (o.nameLower.startsWith(raw)) s += 200;
  if (o.nameLower.startsWith(tokens[0])) s += 60;
  // word-boundary bonus
  if (new RegExp("\\b" + tokens[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(o.nameLower)) s += 30;
  s -= o.name.length * 0.05;       // prefer shorter / canonical names
  s -= o.segs * 2;
  return s;
}

// A token is "move-ish" if it begins like SAN (file a-h, piece NBRQK, or O) and
// continues only with SAN characters. Opening names contain other letters, so they
// naturally fall through to name search.
const SANISH = /^[a-hnbrqko][a-h1-8xo+#=-]*$/i;
export function looksLikeMoves(raw) {
  const toks = raw.replace(/\d+\.+/g, " ").trim().split(/\s+/).filter(Boolean);
  return toks.length > 0 && toks.every(t => SANISH.test(t));
}
export function moveTokens(raw) {
  return raw.replace(/\d+\.+/g, " ").trim().split(/\s+/).filter(Boolean);
}
// Search is limited to the current difficulty and excludes submitted openings,
// so previous guesses no longer remain in either autocomplete mode.
function activePool() {
  // Custom puzzles guess from the chosen opening's subtree; tiers use their pool.
  const pool = state.difficulty === "custom" ? state.pool : POOLS[state.difficulty];
  return pool.filter(o => !state.guessedIds.has(o.id));
}

function moveSearch(raw) {
  const q = moveTokens(raw).map(t => t.toLowerCase());
  const last = q.length - 1;
  const out = [];
  for (const o of activePool()) {
    const m = o.moves;
    if (m.length < q.length) continue;
    let ok = true;
    for (let i = 0; i < q.length; i++) {
      const mv = m[i].toLowerCase();
      if (i < last ? mv !== q[i] : !mv.startsWith(q[i])) { ok = false; break; }
    }
    if (ok) out.push(o);
  }
  out.sort((a, b) => (a.plies === q.length ? -1 : 0) - (b.plies === q.length ? -1 : 0)
    || a.plies - b.plies || a.name.localeCompare(b.name));
  return out.slice(0, 50);
}
function search(q) {
  const raw = q.trim().toLowerCase();
  if (!raw) return { mode: "name", list: [] };
  if (moveSearchEnabled && looksLikeMoves(raw)) return { mode: "move", list: moveSearch(raw) };
  const tokens = raw.split(/\s+/).filter(Boolean);
  const out = [];
  for (const o of activePool()) {
    const s = scoreMatch(o, tokens, raw);
    if (s > -1) out.push([s, o]);
  }
  out.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
  return { mode: "name", list: out.slice(0, 50).map(x => x[1]) };
}

function highlight(name, tokens) {
  let html = esc(name);
  for (const tk of tokens) {
    if (!tk) continue;
    const re = new RegExp("(" + tk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
    html = html.replace(re, "<em>$1</em>");
  }
  return html;
}

// Move preview with the matched prefix emphasised.
function movePreview(o, matchedPlies) {
  const show = Math.min(o.moves.length, Math.max(6, matchedPlies + 1));
  const parts = o.moves.slice(0, show).map((mv, i) =>
    i < matchedPlies ? `<em>${esc(mv)}</em>` : esc(mv));
  return parts.join(" ") + (o.moves.length > show ? "…" : "");
}

function renderSuggest(q) {
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const res = search(q);
  currentList = res.list;
  activeIdx = currentList.length ? 0 : -1;
  if (!q.trim()) { suggestEl.classList.remove("open"); return; }
  if (!currentList.length) {
    suggestEl.innerHTML = `<li class="empty">No <b>${DIFF_LABEL[state.difficulty]}</b> openings match “${esc(q)}”.</li>`;
    suggestEl.classList.add("open"); return;
  }
  const matchedPlies = res.mode === "move" ? moveTokens(q).length : 0;
  // Only surface the moves when notation search is on; in name mode they're noise.
  suggestEl.innerHTML = currentList.map((o, i) => {
    const nm = res.mode === "move" ? esc(o.name) : highlight(o.name, tokens);
    const mv = !moveSearchEnabled ? ""
      : res.mode === "move" ? movePreview(o, matchedPlies)
      : esc(o.moves.slice(0, 6).join(" ") + (o.moves.length > 6 ? "…" : ""));
    return `<li data-i="${i}" class="${i === activeIdx ? "active" : ""}">
      <span class="nm">${nm}</span>
      ${mv ? `<span class="mv">${mv}</span>` : ""}</li>`;
  }).join("");
  suggestEl.classList.add("open");
}

function setActive(i) {
  const items = suggestEl.querySelectorAll("li[data-i]");
  if (!items.length) return;
  activeIdx = (i + items.length) % items.length;
  items.forEach(li => li.classList.toggle("active", +li.dataset.i === activeIdx));
  items[activeIdx].scrollIntoView({ block: "nearest" });
}

input.addEventListener("input", () => renderSuggest(input.value));
input.addEventListener("focus", () => { if (input.value.trim()) renderSuggest(input.value); });
moveSearchToggle.addEventListener("change", () => {
  moveSearchEnabled = moveSearchToggle.checked;
  LS.set(MOVE_SEARCH_KEY, moveSearchEnabled);
  syncMoveToggleClass();
  if (input.value.trim()) renderSuggest(input.value);
  input.focus();
});
input.addEventListener("keydown", e => {
  if (!suggestEl.classList.contains("open")) {
    if (e.key === "ArrowDown" && input.value.trim()) renderSuggest(input.value);
    return;
  }
  if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIdx + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIdx - 1); }
  else if (e.key === "Enter") { e.preventDefault(); if (currentList[activeIdx]) submitGuess(currentList[activeIdx]); }
  else if (e.key === "Escape") { suggestEl.classList.remove("open"); }
});
suggestEl.addEventListener("mousedown", e => {
  const li = e.target.closest("li[data-i]");
  if (li) { e.preventDefault(); submitGuess(currentList[+li.dataset.i]); }
});
document.addEventListener("click", e => {
  if (!e.target.closest(".search")) suggestEl.classList.remove("open");
});

export { renderSuggest };
