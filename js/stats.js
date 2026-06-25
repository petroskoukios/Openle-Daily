/* Per-difficulty statistics, the win modal, and the stats modal. */
import { state, setState, LS, kStats, freshPractice } from "./state.js";
import { guessBudgetUsed, guessLimit } from "./domain.js";
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

// Small stroke icons for the win-modal stats card.
const WIN_ICONS = {
  target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>`,
  flame: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c.6 2.6 2.4 3.8 3.4 5.4A5 5 0 1 1 7 11c0-1 .4-1.9 1-2.6.3 1 1 1.6 1.8 1.6C11.2 10 11 6 12 3Z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.4 2.4 4.6-5.2"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5l2.3 4.7 5.2.8-3.7 3.6.9 5.1L12 16.9 7 19.3l.9-5.1L4.2 10l5.2-.8L12 4.5Z"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V11M12 20V4M19 20v-6"/></svg>`,
  games: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18"/></svg>`,
};

const STAT_ICON = { Played: "games", Solved: "check", Streak: "flame", "Max streak": "flame", "Avg guesses": "chart", Best: "star" };
function statCard(label, value) {
  return `<div class="stat"><span class="stat-ic" aria-hidden="true">${WIN_ICONS[STAT_ICON[label] || "target"]}</span>` +
    `<div class="n">${value}</div><div class="l">${label}</div></div>`;
}

function winStatItems() {
  const spent = guessBudgetUsed(state), limit = guessLimit(state);
  const items = [{ icon: "target", value: `${spent}/${limit}`, label: "Guesses used" }];
  if (state.mode === "daily") {
    const s = LS.get(kStats("daily", state.difficulty), { played: 0, won: 0, streak: 0 });
    const winRate = s.played ? Math.round(s.won / s.played * 100) + "%" : "—";
    items.push({ icon: "flame", value: s.streak, label: "Day streak" });
    items.push({ icon: "check", value: winRate, label: "Win rate" });
  } else {
    const s = LS.get(kStats("practice", state.difficulty), { played: 0, won: 0, totalGuesses: 0, best: null });
    const avg = s.won ? (s.totalGuesses / s.won).toFixed(1) : "—";
    items.push({ icon: "star", value: s.best ?? "—", label: "Best" });
    items.push({ icon: "chart", value: avg, label: "Avg guesses" });
  }
  return items;
}

function openWinModal() {
  const spent = guessBudgetUsed(state), limit = guessLimit(state);
  const where = state.mode === "daily" ? `<b>Daily #${state.dayNo}</b>` : "this puzzle";
  document.getElementById("winSub").innerHTML =
    `You solved ${where} in <b>${spent}/${limit}</b> ${spent === 1 ? "guess" : "guesses"}`;
  document.getElementById("winStats").innerHTML = winStatItems()
    .map(s => `<div class="win-stat"><span class="win-stat-ic" aria-hidden="true">${WIN_ICONS[s.icon]}</span>` +
      `<span class="n">${s.value}</span><span class="l">${s.label}</span></div>`)
    .join("");
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
    ].map(([l, n]) => statCard(l, n)).join("");
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
    ].map(([l, n]) => statCard(l, n)).join("");
    dist.innerHTML = "";
  }
}

export function openStats() {
  renderStatsView(state.mode, state.difficulty);
  modal("statsModal", true);
}
