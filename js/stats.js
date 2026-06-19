/* Per-difficulty statistics, the win modal, and the stats modal. */
import { state, setState, LS, kStats, freshPractice } from "./state.js";
import { guessBudgetUsed } from "./domain.js";
import { esc, fmtMoves } from "./format.js";
import { modal, input } from "./dom.js";
import { render } from "./render.js";
import { clearBoardPlayback, resetBoardNav } from "./board.js";

export function recordDaily(won) {
  const key = kStats("daily", state.difficulty);
  const s = LS.get(key, { played: 0, won: 0, streak: 0, maxStreak: 0, dist: {}, lastDay: null });
  if (s.lastDay === state.dayNo) return;        // already recorded today at this difficulty
  s.played++;
  if (won) {
    s.won++;
    s.streak = (s.lastDay === state.dayNo - 1) ? s.streak + 1 : 1;
    s.maxStreak = Math.max(s.maxStreak, s.streak);
    const g = guessBudgetUsed(state);
    s.dist[g] = (s.dist[g] || 0) + 1;
  } else {
    s.streak = 0;
  }
  s.lastDay = state.dayNo;
  LS.set(key, s);
}

export function recordPractice(won) {
  const key = kStats("practice", state.difficulty);
  const s = LS.get(key, { played: 0, won: 0, totalGuesses: 0, best: null });
  s.played++;
  if (won) {
    s.won++;
    const spent = guessBudgetUsed(state);
    s.totalGuesses += spent;
    s.best = s.best == null ? spent : Math.min(s.best, spent);
  }
  LS.set(key, s);
}

export function onSolve(delayMs = 700) {
  if (state.mode === "daily") recordDaily(true);
  else recordPractice(true);
  clearTimeout(openWinModal._timer);
  openWinModal._timer = setTimeout(() => {
    if (state.solved && !state.gaveUp) openWinModal();
  }, delayMs);
}

function winStatsForCurrentState() {
  if (state.mode === "daily") {
    const s = LS.get(kStats("daily", state.difficulty), { played: 0, won: 0, streak: 0, maxStreak: 0, dist: {} });
    return [
      ["Played", s.played],
      ["Won", s.won],
      ["Current", s.streak],
      ["Max", s.maxStreak],
    ];
  }
  const s = LS.get(kStats("practice", state.difficulty), { played: 0, won: 0, totalGuesses: 0, best: null });
  const avg = s.won ? (s.totalGuesses / s.won).toFixed(1) : "—";
  return [
    ["Played", s.played],
    ["Solved", s.won],
    ["Avg", avg],
    ["Best", s.best ?? "—"],
  ];
}

function openWinModal() {
  document.getElementById("winAnswer").innerHTML =
    `${esc(state.target.name)} <span class="eco">${esc(state.target.eco)}</span>` +
    `<span class="moves">${fmtMoves(state.target.moves, "")}</span>`;
  document.getElementById("winStats").innerHTML = winStatsForCurrentState()
    .map(([label, value]) => `<div class="win-stat"><div class="n">${value}</div><div class="l">${label}</div></div>`)
    .join("");
  document.getElementById("winPrompt").textContent =
    state.mode === "daily" ? "Share your score or play a practice game." : "Share your score or try another practice puzzle.";
  modal("winModal", true);
}

export function startPracticeFromWin() {
  clearBoardPlayback();
  resetBoardNav();
  document.querySelectorAll("#modes button").forEach(x => x.classList.toggle("active", x.dataset.mode === "practice"));
  setState(freshPractice());
  input.value = "";
  modal("winModal", false);
  render();
  input.focus();
}

let statsMode = "daily";
let statsDiff = "easy";

export function renderStatsView(mode = statsMode, diff = statsDiff) {
  statsMode = mode;
  statsDiff = diff;
  const isDaily = mode === "daily";
  document.querySelectorAll("#statsMode button").forEach(x => x.classList.toggle("active", x.dataset.statsMode === mode));
  document.querySelectorAll("#statsDiff button").forEach(x => x.classList.toggle("active", x.dataset.statsDiff === diff));
  const grid = document.getElementById("statsGrid");
  const dist = document.getElementById("statsDist");
  if (isDaily) {
    const s = LS.get(kStats("daily", diff), { played: 0, won: 0, streak: 0, maxStreak: 0, dist: {} });
    grid.innerHTML = [
      ["Played", s.played], ["Solved", s.won], ["Streak", s.streak], ["Max streak", s.maxStreak],
    ].map(([l, n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
    const keys = Object.keys(s.dist).map(Number).sort((a, b) => a - b);
    const maxC = Math.max(1, ...keys.map(k => s.dist[k]));
    const curG = state.solved && state.mode === mode && state.difficulty === diff ? guessBudgetUsed(state) : -1;
    dist.innerHTML = `<div class="l" style="color:var(--muted);font-size:11px;letter-spacing:.04em;text-transform:uppercase">Guess distribution</div>` +
      (keys.length ? keys.map(k =>
        `<div class="dist-row"><span class="k">${k}</span>
         <span class="bar ${k === curG ? "cur" : ""}" style="width:${Math.round((s.dist[k] / maxC) * 100)}%">${s.dist[k]}</span></div>`).join("")
        : `<div class="hint" style="margin-top:6px">No solves yet.</div>`);
  } else {
    const s = LS.get(kStats("practice", diff), { played: 0, won: 0, totalGuesses: 0, best: null });
    const avg = s.won ? (s.totalGuesses / s.won).toFixed(1) : "—";
    grid.innerHTML = [
      ["Played", s.played], ["Solved", s.won], ["Avg guesses", avg], ["Best", s.best ?? "—"],
    ].map(([l, n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
    dist.innerHTML = "";
  }
}

export function openStats() {
  renderStatsView(state.mode, state.difficulty);
  modal("statsModal", true);
}
