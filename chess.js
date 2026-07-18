/* ===================================================================
   Minimal SAN engine — just enough to reconstruct the board position
   after a sequence of opening moves. Handles piece moves with
   disambiguation, captures, pawn pushes, en passant, castling and
   promotion, using king-safety to resolve ambiguous sources.

   window.OTChess.positionAfter(movesArray, n) -> 8x8 board.
   Board is board[rank][file], rank 0 = rank 1 (White's side), file 0 = a.
   Pieces: white = "PNBRQK", black = lowercase, "" = empty.
   =================================================================== */
(function () {
"use strict";

const FILES = "abcdefgh";
const colorOf = p => (p ? (p === p.toUpperCase() ? "w" : "b") : null);

function initialBoard() {
  const b = Array.from({ length: 8 }, () => Array(8).fill(""));
  const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let f = 0; f < 8; f++) {
    b[0][f] = back[f]; b[1][f] = "P";
    b[6][f] = "p"; b[7][f] = back[f].toLowerCase();
  }
  return b;
}

function clearPath(b, f, r, tf, tr) {
  const sf = Math.sign(tf - f), sr = Math.sign(tr - r);
  let cf = f + sf, cr = r + sr;
  while (cf !== tf || cr !== tr) { if (b[cr][cf] !== "") return false; cf += sf; cr += sr; }
  return true;
}

// Can a piece of `type` at (f,r) geometrically reach (tf,tr)? (ignores king safety)
function canReach(b, type, f, r, tf, tr) {
  const df = tf - f, dr = tr - r, adf = Math.abs(df), adr = Math.abs(dr);
  switch (type) {
    case "N": return (adf === 1 && adr === 2) || (adf === 2 && adr === 1);
    case "K": return adf <= 1 && adr <= 1;
    case "B": return adf === adr && adf > 0 && clearPath(b, f, r, tf, tr);
    case "R": return (df === 0) !== (dr === 0) && clearPath(b, f, r, tf, tr);
    case "Q": return ((adf === adr && adf > 0) || ((df === 0) !== (dr === 0))) && clearPath(b, f, r, tf, tr);
  }
  return false;
}

function kingSq(b, side) {
  const k = side === "w" ? "K" : "k";
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) if (b[r][f] === k) return [f, r];
  return null;
}

// Is (tf,tr) attacked by `bySide`?
function attacked(b, tf, tr, bySide) {
  const dir = bySide === "w" ? 1 : -1;            // direction white pawns move
  for (const df of [-1, 1]) {
    const f = tf + df, r = tr - dir;
    if (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const p = b[r][f];
      if (p && colorOf(p) === bySide && p.toLowerCase() === "p") return true;
    }
  }
  const knight = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  for (const [df, dr] of knight) {
    const f = tf + df, r = tr + dr;
    if (f >= 0 && f < 8 && r >= 0 && r < 8) { const p = b[r][f]; if (p && colorOf(p) === bySide && p.toLowerCase() === "n") return true; }
  }
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
    if (!df && !dr) continue;
    const f = tf + df, r = tr + dr;
    if (f >= 0 && f < 8 && r >= 0 && r < 8) { const p = b[r][f]; if (p && colorOf(p) === bySide && p.toLowerCase() === "k") return true; }
  }
  const rays = (dirs, types) => {
    for (const [df, dr] of dirs) {
      let f = tf + df, r = tr + dr;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const p = b[r][f];
        if (p) { if (colorOf(p) === bySide && types.includes(p.toLowerCase())) return true; break; }
        f += df; r += dr;
      }
    }
    return false;
  };
  if (rays([[1, 1], [1, -1], [-1, 1], [-1, -1]], ["b", "q"])) return true;
  if (rays([[1, 0], [-1, 0], [0, 1], [0, -1]], ["r", "q"])) return true;
  return false;
}

// Apply one SAN move to state {b, side, ep}. Mutates b; updates side/ep.
function applySan(state, sanRaw) {
  const b = state.b, side = state.side, opp = side === "w" ? "b" : "w";
  let san = sanRaw.replace(/[+#!?]/g, "");
  state.ep = null;

  if (san === "O-O" || san === "0-0") {
    const r = side === "w" ? 0 : 7;
    b[r][6] = side === "w" ? "K" : "k"; b[r][5] = side === "w" ? "R" : "r"; b[r][4] = ""; b[r][7] = "";
    state.side = opp; return;
  }
  if (san === "O-O-O" || san === "0-0-0") {
    const r = side === "w" ? 0 : 7;
    b[r][2] = side === "w" ? "K" : "k"; b[r][3] = side === "w" ? "R" : "r"; b[r][4] = ""; b[r][0] = "";
    state.side = opp; return;
  }

  let promo = null;
  const pm = san.match(/=([NBRQ])$/);
  if (pm) { promo = pm[1]; san = san.slice(0, -2); }

  let type = "P", body = san;
  if (/^[NBRQK]/.test(san)) { type = san[0]; body = san.slice(1); }

  const tf = FILES.indexOf(body[body.length - 2]);
  const tr = parseInt(body[body.length - 1], 10) - 1;
  const middle = body.slice(0, body.length - 2).replace("x", "");
  let hintF = -1, hintR = -1;
  for (const ch of middle) {
    const fi = FILES.indexOf(ch);
    if (fi >= 0) hintF = fi; else if (/[1-8]/.test(ch)) hintR = parseInt(ch, 10) - 1;
  }
  const isCapture = san.includes("x");
  const mine = side === "w" ? type : type.toLowerCase();
  let candidates = [];

  if (type === "P") {
    const dir = side === "w" ? 1 : -1;
    if (isCapture) {
      candidates.push([hintF, tr - dir]);
    } else {
      const s1 = tr - dir;
      if (s1 >= 0 && s1 < 8 && b[s1][tf] === mine) candidates.push([tf, s1]);
      else {
        const s2 = tr - 2 * dir;
        if (s2 >= 0 && s2 < 8 && b[s1] && b[s1][tf] === "" && b[s2][tf] === mine) candidates.push([tf, s2]);
      }
    }
  } else {
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++)
      if (b[r][f] === mine && canReach(b, type, f, r, tf, tr)) candidates.push([f, r]);
  }

  if (hintF >= 0) candidates = candidates.filter(c => c[0] === hintF);
  if (hintR >= 0) candidates = candidates.filter(c => c[1] === hintR);
  if (candidates.length > 1) {
    candidates = candidates.filter(([sf, sr]) => {
      const sb = b.map(row => row.slice());
      sb[tr][tf] = mine; sb[sr][sf] = "";
      const k = kingSq(sb, side);
      return k && !attacked(sb, k[0], k[1], opp);
    });
  }
  const src = candidates[0];
  // Bail out on an unresolved/illegal move rather than inventing a piece.
  if (!src || b[src[1]][src[0]] !== mine) { state.side = opp; return; }

  // en passant: pawn capture onto an empty square removes the passed pawn
  if (type === "P" && isCapture && b[tr][tf] === "") b[tr - (side === "w" ? 1 : -1)][tf] = "";

  b[tr][tf] = promo ? (side === "w" ? promo : promo.toLowerCase()) : mine;
  if (src) {
    b[src[1]][src[0]] = "";
    if (type === "P" && Math.abs(tr - src[1]) === 2) state.ep = [tf, (tr + src[1]) / 2];
  }
  state.side = opp;
}

function positionAfter(moves, n) {
  const state = { b: initialBoard(), side: "w", ep: null };
  const count = Math.min(n, moves.length);
  for (let i = 0; i < count; i++) {
    try { applySan(state, moves[i]); }
    catch { break; }              // be forgiving; show as far as we got
  }
  return state.b;
}

window.OTChess = { positionAfter, initialBoard, FILES };

})();
