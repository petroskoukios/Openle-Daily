/* Move-notation formatting helpers. Pure string builders — no DOM, no state. */

export function esc(s) { return s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

// Render an array of plies as "1.e4 e5 2.Nf3" with numbered spans.
export function fmtMoves(moves, cls) {
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

export function commonMoveDepth(a, aDepth, b, bDepth) {
  const limit = Math.min(aDepth, bDepth, a.length, b.length);
  let depth = 0;
  while (depth < limit && a[depth] === b[depth]) depth++;
  return depth;
}

export function fmtBoardMoves(moves, depth, targetMoves) {
  let out = "";
  const shared = commonMoveDepth(moves, depth, targetMoves, targetMoves.length);
  for (let i = 0; i < depth; i++) {
    if (i % 2 === 0) out += `<span class="num">${Math.floor(i / 2) + 1}.</span>`;
    out += `<span class="${i < shared ? "sh" : "branch"}">${esc(moves[i])}</span> `;
  }
  return out.trim();
}

// History line: shared path + first diverging move + rest.
export function fmtGuessLine(guess, cmp) {
  const m = guess.moves, k = cmp.sharedPlies;
  let out = "", n = 1;
  for (let i = 0; i < m.length; i++) {
    if (i % 2 === 0) out += `<span class="num">${n}.</span>`;
    let cls = "rest";
    if (i < k) cls = "sh";
    else if (i === k) cls = "dv";
    out += `<span class="${cls} ghist-move" data-history-depth="${i + 1}" role="button" tabindex="0" title="Show this position on the board">${esc(m[i])}</span> `;
    if (i % 2 === 1) n++;
  }
  return out.trim();
}
