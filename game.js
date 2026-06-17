/* ===================================================================
   Opening Tree — daily chess opening puzzle
   Pure client-side. Data: window.OPENINGS = [{n,e,m}, ...]
   =================================================================== */
(function () {
"use strict";

/* ---------- 1. Build the opening database ---------- */
const OPENINGS = window.OPENINGS.map((o, i) => {
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
  };
});

/* ---------- 1b. Difficulty tiers ----------
   The dataset has no popularity signal, so we estimate how obscure an opening
   is from structural proxies and bucket the result into four tiers:
     • family prominence  (iconic / famous / semi-known / obscure)
     • move depth         (how many plies you must reproduce exactly)
     • name nesting       (how deep the variation name is)                       */

// The most universally-known opening families.
const ICONIC = new Set([
  "Italian Game", "Ruy Lopez", "Sicilian Defense", "French Defense",
  "Caro-Kann Defense", "Queen's Gambit Declined", "Queen's Gambit Accepted",
  "King's Indian Defense", "Nimzo-Indian Defense", "English Opening",
  "Scandinavian Defense", "Slav Defense", "Scotch Game", "Vienna Game",
  "London System", "Pirc Defense", "Grünfeld Defense", "Dutch Defense",
  "Alekhine Defense",
]);
// Broader set of household-name families.
const FAMOUS = new Set([
  "Sicilian Defense", "Ruy Lopez", "French Defense", "Italian Game",
  "Queen's Gambit Declined", "Queen's Gambit Accepted", "English Opening",
  "King's Indian Defense", "Caro-Kann Defense", "Nimzo-Indian Defense",
  "Dutch Defense", "Alekhine Defense", "Grünfeld Defense", "Queen's Indian Defense",
  "Scotch Game", "Semi-Slav Defense", "Benoni Defense", "Petrov's Defense",
  "Slav Defense", "Scandinavian Defense", "Vienna Game", "Four Knights Game",
  "Philidor Defense", "Modern Defense", "Pirc Defense", "Tarrasch Defense",
  "Bishop's Opening", "King's Gambit Accepted", "King's Gambit Declined",
  "Réti Opening", "London System", "Catalan Opening", "Bogo-Indian Defense",
  "Trompowsky Attack", "Giuoco Piano", "Two Knights Defense", "Ponziani Opening",
  "Center Game", "Danish Gambit", "Evans Gambit", "Nimzowitsch Defense",
  "Old Indian Defense", "Benko Gambit", "Budapest Defense",
  // recognizable base systems, kept famous so their plain names land in Easy
  "King's Pawn Game", "Queen's Pawn Game", "Indian Defense", "Zukertort Opening",
  "Bird Opening", "Nimzo-Larsen Attack", "Hungarian Opening",
]);

const FAM_COUNT = {};
for (const o of OPENINGS) FAM_COUNT[o.family] = (FAM_COUNT[o.family] || 0) + 1;

function obscurityScore(o) {
  const f = ICONIC.has(o.family) ? 0 : FAMOUS.has(o.family) ? 1 : FAM_COUNT[o.family] >= 20 ? 3 : 6;
  const d = o.plies <= 4 ? 0 : o.plies <= 6 ? 1 : o.plies <= 8 ? 2 : o.plies <= 10 ? 3 : o.plies <= 14 ? 4 : 5;
  const s = o.segs === 0 ? 0 : o.segs === 1 ? 1 : o.segs === 2 ? 3 : 4;
  return f + d + s;
}
// Easy is reserved for the recognizable *base* openings (no variation clause);
// everything else skews upward, with the big obscure/deep tail landing in Expert.
function tierOf(o) {
  if (o.segs === 0 && FAMOUS.has(o.family)) return "easy";
  const v = obscurityScore(o);
  return v <= 3 ? "medium" : v <= 5 ? "hard" : "expert";
}

const DIFFS = ["easy", "medium", "hard", "expert"];
const DIFF_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert" };
const DIFF_LIMITS = { easy: 32, medium: 64, hard: 128, expert: 512 };
const GUESS_LIMITS = { easy: 10, medium: 15, hard: 20, expert: 25 };
const HINT_COST = 3;
const TIER_ORDER = { easy: 0, medium: 1, hard: 2, expert: 3 };
function rankOpening(a, b) {
  return TIER_ORDER[tierOf(a)] - TIER_ORDER[tierOf(b)]
    || obscurityScore(a) - obscurityScore(b)
    || a.segs - b.segs
    || a.plies - b.plies
    || a.name.localeCompare(b.name);
}
const RANKED_OPENINGS = OPENINGS.filter(o => o.plies >= 2).sort(rankOpening);
const POOLS = {
  easy: RANKED_OPENINGS.slice(0, DIFF_LIMITS.easy),
  medium: RANKED_OPENINGS.slice(0, DIFF_LIMITS.medium),
  hard: RANKED_OPENINGS.slice(0, DIFF_LIMITS.hard),
  expert: RANKED_OPENINGS.slice(0, DIFF_LIMITS.expert),
};

/* ---------- 2. Deterministic daily selection ---------- */
const EPOCH = Date.UTC(2024, 0, 1);          // puzzle #1 = 2024-01-01 (local date)
function localDayNumber(d = new Date()) {
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
function dailyTarget(dayNo, diff) {
  const perm = PERMS[diff], pool = POOLS[diff];
  return pool[perm[((dayNo % perm.length) + perm.length) % perm.length]];
}

/* ---------- 3. Comparison engine ---------- */
function compare(guess, target) {
  const g = guess.moves, t = target.moves;
  let k = 0;
  const max = Math.min(g.length, t.length);
  while (k < max && g[k] === t[k]) k++;

  return {
    guessId: guess.id,
    sharedPlies: k,
    isWin: guess.movesStr === target.movesStr,
  };
}

function confirmedDepth(state) {
  let best = state.hintPlies || 0;
  for (const cmp of state.results) best = Math.max(best, cmp.sharedPlies);
  return Math.min(best, state.target.moves.length);
}

function hintsUsed(state) {
  return state.hintCount || 0;
}

function guessBudgetUsed(state) {
  return state.results.length + hintsUsed(state) * HINT_COST;
}

function guessLimit(stateOrDiff = state) {
  const diff = typeof stateOrDiff === "string" ? stateOrDiff : stateOrDiff?.difficulty;
  return GUESS_LIMITS[diff] || GUESS_LIMITS.medium;
}

function guessBudgetLeft(state) {
  return Math.max(0, guessLimit(state) - guessBudgetUsed(state));
}

function guessWord(n) {
  return n + (n === 1 ? " guess" : " guesses");
}

function hintWord(n) {
  return n + (n === 1 ? " hint" : " hints");
}

/* ---------- 4. Move-notation formatting ---------- */
function esc(s) { return s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

// Render an array of plies as "1.e4 e5 2.Nf3" with numbered spans.
function fmtMoves(moves, cls) {
  if (!moves.length) return "";
  let out = "", n = 1;
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) out += `<span class="num">${n}.</span>`;
    else if (i === 0) {} // never (first ply is white)
    out += `<span class="${cls || ""}">${esc(moves[i])}</span> `;
    if (i % 2 === 1) n++;
  }
  return out.trim();
}

// History line: shared (green) + first diverging move (red) + rest (dim).
function fmtGuessLine(guess, cmp) {
  const m = guess.moves, k = cmp.sharedPlies;
  let out = "", n = 1;
  for (let i = 0; i < m.length; i++) {
    if (i % 2 === 0) out += `<span class="num">${n}.</span>`;
    let cls = "rest";
    if (i < k) cls = "sh";
    else if (i === k) cls = "dv";
    out += `<span class="${cls}">${esc(m[i])}</span> `;
    if (i % 2 === 1) n++;
  }
  return out.trim();
}


/* ---------- 5. Tree builder & renderer ---------- */
function buildTree(state) {
  const target = state.target;
  const root = { move: null, children: new Map(), onTarget: false, guesses: [] };
  const get = (node, mv) => {
    if (!node.children.has(mv))
      node.children.set(mv, { move: mv, children: new Map(), onTarget: false, guesses: [] });
    return node.children.get(mv);
  };
  const insert = (moves, upTo, onTargetUpTo) => {
    let node = root;
    for (let i = 0; i < upTo; i++) {
      node = get(node, moves[i]);
      if (i < onTargetUpTo) node.onTarget = true;
    }
    return node;
  };

  // Deepest confirmed-shared depth across all guesses.
  let best = confirmedDepth(state);

  let tip = root;
  if (state.solved || state.gaveUp) {
    // Reveal the full target line (on a win, or when the player gives up).
    const leaf = insert(target.moves, target.moves.length, target.moves.length);
    leaf.isTargetEnd = true;
  } else {
    // Only the confirmed trunk is shown.
    tip = best > 0 ? insert(target.moves, best, best) : root;
    tip.isTip = true;
  }

  // Each guess: show up to its first diverging move, labelled with its name.
  for (const cmp of state.results) {
    const g = OPENINGS[cmp.guessId];
    const show = Math.min(g.moves.length, cmp.sharedPlies + 1);
    const leaf = insert(g.moves, show, cmp.sharedPlies);
    leaf.guesses.push(g);
  }

  return { root, tip, best };
}

function renderTree(state) {
  const el = document.getElementById("tree");
  if (!state.results.length && !state.solved && !state.gaveUp && confirmedDepth(state) === 0) {
    el.innerHTML = `<span class="root">Root (starting position)</span>\n` +
      `<span class="conn">└── </span><span class="hint">？ make a guess to grow the tree</span>`;
    return;
  }
  const { root, tip } = buildTree(state);
  const lines = [];
  lines.push(`<span class="root">Root</span>`);
  const label = node => {
    const cls = node.onTarget
      ? (state.solved ? "mv-target" : "mv-on")
      : "mv-off";
    let s = `<span class="${cls}">${esc(node.move)}</span>`;
    if (node.isTargetEnd)
      s += `<span class="tag tag-tgt">★ ${esc(state.target.name)} (${esc(state.target.eco)})</span>`;
    else for (const g of node.guesses) {
      // a guess sitting on the confirmed trunk is a correct sub-line ("you've been here").
      const onPath = node.onTarget;
      s += `<span class="tag ${onPath ? "tag-here" : "tag-guess"}" title="${esc(g.name)} (${esc(g.eco)})">${onPath ? "✓ " : ""}${esc(trunc(g.name, 30))}</span>`;
    }
    if (node === tip && !state.solved && !state.gaveUp && node !== root) {
      const more = state.target.moves.length - node.depth;
      s += more > 0
        ? `<span class="tag tag-tip">target continues ↓ (+${more})</span>`
        : `<span class="tag tag-tip">full line found - guess the name</span>`;
    }
    return s;
  };

  const walk = (node, prefix, depth) => {
    const kids = [...node.children.values()];
    // trunk (on-target) child first, so the confirmed spine reads straight down.
    kids.sort((a, b) => (b.onTarget - a.onTarget) || a.move.localeCompare(b.move));
    kids.forEach((c, i) => {
      c.depth = depth + 1;
      const last = i === kids.length - 1;
      lines.push(`<span class="conn">${prefix}${last ? "└── " : "├── "}</span>${label(c)}`);
      walk(c, prefix + (last ? "    " : "│   "), depth + 1);
    });
  };
  // record depths for the tip hint
  root.depth = 0;
  walk(root, "", 0);

  // If the tip is the root (no shared first move yet), add an inline note.
  if (tip === root && !state.solved && !state.gaveUp) {
    lines.splice(1, 0, `<span class="conn">└── </span><span class="hint">？ target's first move not found yet</span>`);
  }
  el.innerHTML = lines.join("\n");
}

/* ---------- 6. Guess log ---------- */
// A simple, most-recent-first list of guesses. Each shows the line with shared
// moves plus the first diverging move — the tree carries the rest.
function renderHistory(state) {
  const panel = document.getElementById("historyPanel");
  if (!state.results.length) { panel.style.display = "none"; return; }
  panel.style.display = "";

  let bestPlies = -1;
  for (const c of state.results) bestPlies = Math.max(bestPlies, c.sharedPlies);

  const items = state.results.slice().reverse().map(cmp => {
    const g = OPENINGS[cmp.guessId];
    const cls = cmp.isWin ? "win" : (cmp.sharedPlies === bestPlies && !state.solved ? "best" : "");
    return `<div class="ghist-item ${cls}">
      <div class="gn">${cmp.isWin ? "★ " : ""}${esc(g.name)}<span class="eco">${esc(g.eco)}</span></div>
      <div class="line">${fmtGuessLine(g, cmp)}</div>
    </div>`;
  });
  document.getElementById("historyBody").innerHTML = items.join("");
}

/* ---------- 6b. Board: how far you've gotten ---------- */
const GLYPH = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" };
const pieceColor = p => (p === p.toUpperCase() ? "w" : "b");
let boardPlaybackDepth = null;
let boardSlideFromDepth = null;
let boardPlaybackTimers = [];
const BOARD_PLAYBACK_STEP_MS = 420;

function movingPieces(fromBoard, toBoard) {
  const removed = [], added = [];
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const from = fromBoard[r][f], to = toBoard[r][f];
    if (from !== to) {
      if (from) removed.push({ f, r, p: from });
      if (to) added.push({ f, r, p: to });
    }
  }
  const moves = [];
  for (const a of added) {
    let idx = removed.findIndex(x => x.p === a.p);
    if (idx < 0) idx = removed.findIndex(x => pieceColor(x.p) === pieceColor(a.p));
    if (idx < 0) continue;
    const src = removed.splice(idx, 1)[0];
    moves.push({ fromF: src.f, fromR: src.r, toF: a.f, toR: a.r, p: a.p });
  }
  return moves;
}

function renderBoard(state) {
  const tgt = state.target;
  const done = state.solved || state.gaveUp;
  const playing = boardPlaybackDepth != null;
  // depth shown = deepest confirmed-shared line, or the whole target once finished.
  let depth = 0;
  if (playing) depth = boardPlaybackDepth;
  else if (done) depth = tgt.moves.length;
  else depth = confirmedDepth(state);

  const board = OTChess.positionAfter(tgt.moves, depth);
  const slideFrom = playing && boardSlideFromDepth != null ? OTChess.positionAfter(tgt.moves, boardSlideFromDepth) : null;
  const shownBoard = slideFrom || board;
  const prev = OTChess.positionAfter(tgt.moves, Math.max(0, depth - 1));
  const changed = new Set();
  if (depth > 0) for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++)
    if (board[r][f] !== prev[r][f]) changed.add(r * 8 + f);
  const slides = slideFrom ? movingPieces(slideFrom, board) : [];
  const hide = new Set();
  for (const m of slides) {
    hide.add(m.fromR * 8 + m.fromF);
    hide.add(m.toR * 8 + m.toF);
  }

  let html = "";
  for (let r = 7; r >= 0; r--) {
    for (let f = 0; f < 8; f++) {
      const p = shownBoard[r][f];
      const hidden = hide.has(r * 8 + f) ? " hide" : "";
      const glyph = p ? `<span class="pc ${pieceColor(p)}${hidden}">${GLYPH[p.toLowerCase()]}</span>` : "";
      const cls = ((r + f) % 2 === 0 ? "d" : "l") + (changed.has(r * 8 + f) ? " hl" : "");
      const coord = (f === 0 ? `<span class="rk">${r + 1}</span>` : "") +
                    (r === 0 ? `<span class="fl">${OTChess.FILES[f]}</span>` : "");
      html += `<div class="sq ${cls}">${coord}${glyph}</div>`;
    }
  }
  for (const m of slides) {
    html += `<div class="move-ghost" style="--from-f:${m.fromF};--from-r:${m.fromR};--to-f:${m.toF};--to-r:${m.toR}">` +
      `<span class="pc ${pieceColor(m.p)}">${GLYPH[m.p.toLowerCase()]}</span></div>`;
  }
  document.getElementById("board").innerHTML = html;

  const title = document.getElementById("boardTitle");
  const cap = document.getElementById("boardCap");
  if (playing) {
    title.textContent = "How far you've gotten";
    cap.innerHTML = depth === 0
      ? `<span class="muted">starting position</span>`
      : `<span class="ln">${fmtMoves(tgt.moves.slice(0, depth), "")}</span>` +
        `<span class="muted"> · ${depth} ${depth === 1 ? "ply" : "plies"} into the target</span>`;
  } else if (done) {
    title.textContent = state.solved ? "Solved — target position" : "Revealed — target position";
    cap.innerHTML = `<span class="ln">${fmtMoves(tgt.moves, "")}</span>`;
  } else if (depth === 0) {
    title.textContent = "How far you've gotten";
    cap.innerHTML = `<span class="muted">starting position — no shared moves yet</span>`;
  } else {
    title.textContent = "How far you've gotten";
    cap.innerHTML = `<span class="ln">${fmtMoves(tgt.moves.slice(0, depth), "")}</span>` +
      `<span class="muted"> · ${depth} ${depth === 1 ? "ply" : "plies"} into the target</span>`;
  }
}

function clearBoardPlayback() {
  for (const t of boardPlaybackTimers) clearTimeout(t);
  boardPlaybackTimers = [];
  boardPlaybackDepth = null;
  boardSlideFromDepth = null;
}

function animateBoardProgress(fromDepth, toDepth) {
  clearBoardPlayback();
  if (toDepth <= fromDepth) return;
  boardPlaybackDepth = fromDepth;
  for (let d = fromDepth + 1; d <= toDepth; d++) {
    boardPlaybackTimers.push(setTimeout(() => {
      boardPlaybackDepth = d;
      boardSlideFromDepth = d - 1;
      renderBoard(state);
      if (d === toDepth) {
        boardPlaybackTimers.push(setTimeout(() => {
          boardPlaybackDepth = null;
          boardSlideFromDepth = null;
          renderBoard(state);
        }, BOARD_PLAYBACK_STEP_MS));
      }
    }, (d - fromDepth) * BOARD_PLAYBACK_STEP_MS));
  }
}

/* ---------- 7. Autocomplete ---------- */
const input = document.getElementById("guessInput");
const suggestEl = document.getElementById("suggest");
let activeIdx = -1, currentList = [];

function scoreMatch(o, tokens, raw) {
  // require every token to appear somewhere
  for (const tk of tokens) if (o.nameLower.indexOf(tk) === -1 && o.eco.toLowerCase().indexOf(tk) === -1) return -1;
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
function looksLikeMoves(raw) {
  const toks = raw.replace(/\d+\.+/g, " ").trim().split(/\s+/).filter(Boolean);
  return toks.length > 0 && toks.every(t => SANISH.test(t));
}
function moveTokens(raw) {
  return raw.replace(/\d+\.+/g, " ").trim().split(/\s+/).filter(Boolean);
}
// Search is limited to the current difficulty's pool — on Easy you only see
// (and can only guess) Easy openings, and so on for each tier.
function activePool() { return POOLS[state.difficulty]; }

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
  if (looksLikeMoves(raw)) return { mode: "move", list: moveSearch(raw) };
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
  suggestEl.innerHTML = currentList.map((o, i) => {
    const nm = res.mode === "move" ? esc(o.name) : highlight(o.name, tokens);
    const mv = res.mode === "move" ? movePreview(o, matchedPlies)
      : esc(o.moves.slice(0, 6).join(" ") + (o.moves.length > 6 ? "…" : ""));
    return `<li data-i="${i}" class="${i === activeIdx ? "active" : ""}">
      <span class="nm">${nm}</span>
      <span class="eco">${esc(o.eco)}</span>
      <span class="mv">${mv}</span></li>`;
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

/* ---------- 8. Game state & persistence ---------- */
const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
// Daily progress is per (day, difficulty); stats are per (mode, difficulty).
const kDaily = (dayNo, diff) => `ot.daily.${dayNo}.${diff}`;
const kStats = (mode, diff) => `ot.stats.${mode}.${diff}`;
const K_DIFF = "ot.diff";           // last-used difficulty

function loadDiff() {
  const d = LS.get(K_DIFF, "medium");
  return DIFFS.includes(d) ? d : "medium";
}
let difficulty = loadDiff();        // current difficulty, shared across modes

let state = null; // {mode, difficulty, target, dayNo, results:[cmp], guessedIds:Set, solved, gaveUp, hintPlies, hintCount}

function freshDaily(diff) {
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
function freshPractice(diff) {
  diff = diff || difficulty;
  const pool = POOLS[diff];
  const target = pool[Math.floor(Math.random() * pool.length)];
  return { mode: "practice", difficulty: diff, target, dayNo: null, results: [], guessedIds: new Set(), solved: false, gaveUp: false, hintPlies: 0, hintCount: 0 };
}

function saveDaily() {
  if (state.mode !== "daily") return;
  LS.set(kDaily(state.dayNo, state.difficulty), {
    guesses: state.results.map(r => r.guessId),
    solved: state.solved, gaveUp: state.gaveUp, hintPlies: state.hintPlies || 0, hintCount: hintsUsed(state),
  });
}

/* ---------- 9. Submitting guesses ---------- */
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1900);
}

function finishOutOfGuesses() {
  clearBoardPlayback();
  state.gaveUp = true;
  if (state.mode === "daily") { saveDaily(); recordDaily(false); }
  else recordPractice(false);
  toast("Out of guesses.");
}

function submitGuess(opening) {
  if (!opening || state.solved || state.gaveUp) return;
  if (guessBudgetLeft(state) < 1) { finishOutOfGuesses(); render(); return; }
  if (state.guessedIds.has(opening.id)) { toast("Already guessed that one."); input.select(); return; }
  const beforeDepth = confirmedDepth(state);
  const cmp = compare(opening, state.target);
  state.results.push(cmp);
  state.guessedIds.add(opening.id);
  if (cmp.isWin) state.solved = true;
  else if (guessBudgetLeft(state) === 0) finishOutOfGuesses();
  const afterDepth = (state.solved || state.gaveUp) ? state.target.moves.length : confirmedDepth(state);
  const shouldAnimateBoard = afterDepth > beforeDepth;
  if (shouldAnimateBoard) boardPlaybackDepth = beforeDepth;
  else clearBoardPlayback();

  input.value = "";
  suggestEl.classList.remove("open");
  if (state.mode === "daily") saveDaily();
  if (cmp.isWin) {
    const modalDelay = shouldAnimateBoard
      ? (afterDepth - beforeDepth + 1) * BOARD_PLAYBACK_STEP_MS + 250
      : 700;
    onSolve(modalDelay);
  }
  render();
  if (shouldAnimateBoard) animateBoardProgress(beforeDepth, afterDepth);
  if (!state.solved && !state.gaveUp) input.focus();
}

function giveUp() {
  if (state.solved || state.gaveUp) return;
  if (!confirm("Reveal the target opening and end this puzzle?")) return;
  clearBoardPlayback();
  state.gaveUp = true;
  if (state.mode === "daily") { saveDaily(); recordDaily(false); }
  render();
}

function requestHint() {
  if (state.solved || state.gaveUp) return;
  clearBoardPlayback();
  if (guessBudgetLeft(state) < HINT_COST) {
    toast(`Hints cost ${HINT_COST} guesses.`);
    return;
  }
  const depth = confirmedDepth(state);
  if (depth >= state.target.moves.length) { toast("The full line is already revealed."); return; }
  state.hintPlies = depth + 1;
  state.hintCount = hintsUsed(state) + 1;
  if (guessBudgetLeft(state) === 0) finishOutOfGuesses();
  if (state.mode === "daily") saveDaily();
  render();
}

/* ---------- 10. Stats (kept per difficulty) ---------- */
function recordDaily(won) {
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
function recordPractice(won) {
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

function onSolve(delayMs = 700) {
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

function startPracticeFromWin() {
  clearBoardPlayback();
  document.querySelectorAll("#modes button").forEach(x => x.classList.toggle("active", x.dataset.mode === "practice"));
  state = freshPractice();
  input.value = "";
  modal("winModal", false);
  render();
  input.focus();
}

/* ---------- 11. Sharing ---------- */
function closenessSquare(cmp) {
  if (cmp.isWin) return "★";
  const r = cmp.sharedPlies / state.target.plies;
  if (cmp.sharedPlies === 0) return "⬛";
  if (r < 0.34) return "🟥";
  if (r < 0.5) return "🟧";
  if (r < 0.75) return "🟨";
  return "🟩";
}
function shareText() {
  const n = guessBudgetUsed(state);
  const h = hintsUsed(state);
  const limit = guessLimit(state);
  const head = state.mode === "daily"
    ? `Opening Tree #${state.dayNo} · ${DIFF_LABEL[state.difficulty]} — ${state.solved ? `${guessWord(n)}/${limit}` : "X"}${h ? ` · ${hintWord(h)}` : ""}`
    : `Opening Tree · ${DIFF_LABEL[state.difficulty]} practice — ${guessWord(n)}/${limit}${h ? ` · ${hintWord(h)}` : ""}`;
  const squares = state.results.map(closenessSquare);
  // group into rows of 5 for a tidy grid
  let grid = "";
  for (let i = 0; i < squares.length; i += 5) grid += squares.slice(i, i + 5).join("") + "\n";
  return `${head}\n${grid}🌳 openings as a tree`;
}
async function doShare() {
  const text = shareText();
  try {
    await navigator.clipboard.writeText(text);
    toast("Result copied to clipboard!");
  } catch {
    toast("Copy the result from the Stats panel.");
  }
  // also surface in stats modal
  document.getElementById("shareArea").innerHTML = `<div class="shareout">${esc(text)}</div>`;
}

/* ---------- 12. Master render ---------- */
function render() {
  // meta
  const mt = document.getElementById("metaTitle");
  const ms = document.getElementById("metaSub");
  const diff = document.getElementById("diff");
  if (state.mode === "daily") {
    mt.textContent = `Daily #${state.dayNo}`;
    ms.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  } else {
    mt.textContent = "Practice";
    ms.textContent = "random opening";
  }
  // difficulty selector is available in both modes
  diff.querySelectorAll("button").forEach(x => x.classList.toggle("active", x.dataset.diff === state.difficulty));
  const gc = document.getElementById("gcount");
  const spent = guessBudgetUsed(state), left = guessBudgetLeft(state), hintN = hintsUsed(state);
  const limit = guessLimit(state);
  gc.innerHTML = spent
    ? `<b>${spent}</b>/${limit} guesses` + (hintN ? ` · ${hintWord(hintN)}` : "")
    : `<b>${limit}</b> guesses`;

  // banner
  const banner = document.getElementById("banner");
  if (state.solved || state.gaveUp) {
    banner.classList.add("show");
    const win = state.solved;
    banner.classList.toggle("win", win);
    document.getElementById("bannerTitle").textContent = win ? "★ Solved!" : "Revealed";
    document.getElementById("bannerTitle").style.color = "";
    document.getElementById("bannerName").innerHTML =
      `${esc(state.target.name)} <span class="eco">${esc(state.target.eco)}</span>`;
    document.getElementById("bannerSub").innerHTML =
      `<span style="font-family:var(--mono)">${fmtMoves(state.target.moves, "")}</span>` +
      (win ? ` &nbsp;·&nbsp; in ${guessWord(guessBudgetUsed(state))}` : "");
  } else {
    banner.classList.remove("show");
    banner.classList.remove("win");
  }

  // input lock
  input.disabled = state.solved || state.gaveUp;
  input.placeholder = state.solved || state.gaveUp
    ? "Puzzle complete"
    : "Search an opening to guess — e.g. Sicilian, Ruy Lopez, 1. e4…";

  // panels
  renderTree(state);
  renderHistory(state);
  renderBoard(state);

  // actions
  const done = state.solved || state.gaveUp;
  document.getElementById("shareBtn").style.display = (done && state.solved) ? "" : "none";
  document.getElementById("hintBtn").style.display = (!done && confirmedDepth(state) < state.target.moves.length && left >= HINT_COST) ? "" : "none";
  document.getElementById("newBtn").style.display = (state.mode === "practice") ? "" : "none";
  document.getElementById("giveUpBtn").style.display = (!done && spent >= 5) ? "" : "none";
}

/* ---------- 13. Stats modal ---------- */
function openStats() {
  const isDaily = state.mode === "daily";
  document.getElementById("statsTitle").textContent =
    `${DIFF_LABEL[state.difficulty]} · ${isDaily ? "Daily" : "Practice"} statistics`;
  const grid = document.getElementById("statsGrid");
  const dist = document.getElementById("statsDist");
  if (isDaily) {
    const s = LS.get(kStats("daily", state.difficulty), { played: 0, won: 0, streak: 0, maxStreak: 0, dist: {} });
    const pct = s.played ? Math.round((s.won / s.played) * 100) : 0;
    grid.innerHTML = [
      ["Played", s.played], ["Win %", pct], ["Streak", s.streak], ["Max streak", s.maxStreak],
    ].map(([l, n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
    const keys = Object.keys(s.dist).map(Number).sort((a, b) => a - b);
    const maxC = Math.max(1, ...keys.map(k => s.dist[k]));
    const curG = state.solved ? guessBudgetUsed(state) : -1;
    dist.innerHTML = `<div class="l" style="color:var(--muted);font-size:11px;letter-spacing:.04em;text-transform:uppercase">Guess distribution</div>` +
      (keys.length ? keys.map(k =>
        `<div class="dist-row"><span class="k">${k}</span>
         <span class="bar ${k === curG ? "cur" : ""}" style="width:${Math.round((s.dist[k] / maxC) * 100)}%">${s.dist[k]}</span></div>`).join("")
        : `<div class="hint" style="margin-top:6px">No solves yet.</div>`);
  } else {
    const s = LS.get(kStats("practice", state.difficulty), { played: 0, won: 0, totalGuesses: 0, best: null });
    const avg = s.won ? (s.totalGuesses / s.won).toFixed(1) : "—";
    grid.innerHTML = [
      ["Played", s.played], ["Solved", s.won], ["Avg guesses", avg], ["Best", s.best ?? "—"],
    ].map(([l, n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
    dist.innerHTML = "";
  }
  // share area
  const sa = document.getElementById("shareArea");
  sa.innerHTML = (state.solved && isDaily) ? `<div class="shareout">${esc(shareText())}</div>` : "";
  modal("statsModal", true);
}

/* ---------- 14. Modal helpers ---------- */
function modal(id, open) { document.getElementById(id).classList.toggle("open", open); }
document.querySelectorAll("[data-close]").forEach(b =>
  b.addEventListener("click", () => b.closest(".modal-bg").classList.remove("open")));
document.querySelectorAll(".modal-bg").forEach(bg =>
  bg.addEventListener("click", e => { if (e.target === bg) bg.classList.remove("open"); }));
document.addEventListener("keydown", e => { if (e.key === "Escape") document.querySelectorAll(".modal-bg.open").forEach(m => m.classList.remove("open")); });

/* ---------- 15. Wiring ---------- */
document.getElementById("howBtn").addEventListener("click", () => modal("howModal", true));
document.getElementById("statsBtn").addEventListener("click", openStats);
document.getElementById("shareBtn").addEventListener("click", doShare);
document.getElementById("winShareBtn").addEventListener("click", doShare);
document.getElementById("winPracticeBtn").addEventListener("click", startPracticeFromWin);
document.getElementById("hintBtn").addEventListener("click", requestHint);
document.getElementById("giveUpBtn").addEventListener("click", giveUp);
document.getElementById("newBtn").addEventListener("click", () => {
  if (guessBudgetUsed(state) && !state.solved && !state.gaveUp) recordPractice(false);
  clearBoardPlayback();
  state = freshPractice(); input.value = ""; render(); input.focus();
});
document.getElementById("diff").addEventListener("click", e => {
  const b = e.target.closest("button[data-diff]"); if (!b) return;
  const d = b.dataset.diff; if (d === state.difficulty) return;
  // abandoning an in-progress practice game counts as a loss; daily just switches.
  if (state.mode === "practice" && guessBudgetUsed(state) && !state.solved && !state.gaveUp) recordPractice(false);
  clearBoardPlayback();
  difficulty = d; LS.set(K_DIFF, d);
  state = state.mode === "daily" ? freshDaily(d) : freshPractice(d);
  input.value = ""; render(); if (!input.disabled) input.focus();
});
document.getElementById("modes").addEventListener("click", e => {
  const b = e.target.closest("button[data-mode]"); if (!b) return;
  const mode = b.dataset.mode; if (mode === state.mode) return;
  document.querySelectorAll("#modes button").forEach(x => x.classList.toggle("active", x === b));
  if (state.mode === "practice" && guessBudgetUsed(state) && !state.solved && !state.gaveUp) recordPractice(false);
  clearBoardPlayback();
  state = (mode === "daily") ? freshDaily() : freshPractice();
  input.value = ""; render(); if (!input.disabled) input.focus();
});

/* ---------- 16. Boot ---------- */
function boot() {
  state = freshDaily();
  render();
  // First-time visitors get the how-to.
  if (!LS.get("ot.seen", false)) { modal("howModal", true); LS.set("ot.seen", true); }
}
boot();

// expose a little debug hook
window.__OT = {
  OPENINGS, POOLS, DIFFS, DIFF_LIMITS, GUESS_LIMITS, HINT_COST, guessLimit, tierOf, obscurityScore, dailyTarget, compare, submitGuess, requestHint,
  byName: n => OPENINGS.find(o => o.name === n),
  byMoves: m => OPENINGS.find(o => o.movesStr === m),
  get state() { return state; },
};

})();
