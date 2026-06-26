/* Detect when a guessed opening transposes into the target — it reaches the
   target's position by a different move order, so the move tree shows the two
   splitting early even though the guess is really on the way there (a Queen's
   Gambit Declined guess, 1.d4 d5, transposes into a Ragozin stored in Indian
   order, 1.d4 Nf6 …).

   Uses only the SAN engine (window.OTChess.positionAfter) — no external data.
   The match is confirmed by replaying the reconstructed board, so a coincidental
   move-letter overlap (an opening that merely shares some moves) won't register. */

const side = (moves, parity) => moves.filter((_, i) => i % 2 === parity);

// Is every move of `sub` present in `seq` with at least the same multiplicity?
function subMultiset(sub, seq) {
  const pool = seq.slice();
  return sub.every(m => {
    const i = pool.indexOf(m);
    if (i < 0) return false;
    pool.splice(i, 1);
    return true;
  });
}

// `seq` with the first occurrence of each move in `remove` taken out (order kept).
function without(seq, remove) {
  const out = seq.slice();
  for (const m of remove) { const i = out.indexOf(m); if (i >= 0) out.splice(i, 1); }
  return out;
}

function boardEqual(a, b) {
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) if (a[r][f] !== b[r][f]) return false;
  return true;
}

/* Can the guess's line be continued — using the target's own leftover moves, in
   the target's order — to reach one of the target's positions? Returns true only
   for a genuine transposition the move tree doesn't already show (a literal
   prefix is skipped: it already sits on the trunk). */
export function canTranspose(guessMoves, targetMoves) {
  if (guessMoves.length >= targetMoves.length) return false;
  if (guessMoves.every((m, i) => targetMoves[i] === m)) return false; // already on the trunk
  const C = window.OTChess;
  const Wg = side(guessMoves, 0), Bg = side(guessMoves, 1);
  for (let d = guessMoves.length; d <= targetMoves.length; d++) {
    const head = targetMoves.slice(0, d), Wt = side(head, 0), Bt = side(head, 1);
    if (!subMultiset(Wg, Wt) || !subMultiset(Bg, Bt)) continue;
    const dW = without(Wt, Wg), dB = without(Bt, Bg);
    const moves = guessMoves.slice();
    let wi = 0, bi = 0, ok = true;
    for (let ply = guessMoves.length; ply < d; ply++) {
      const pick = ply % 2 === 0 ? dW[wi++] : dB[bi++];
      if (pick == null) { ok = false; break; }
      moves.push(pick);
    }
    if (ok && boardEqual(C.positionAfter(moves, d), C.positionAfter(targetMoves, d))) return true;
  }
  return false;
}
