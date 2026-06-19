/* Pure state model for the board's "how far you've gotten" view.

   Three viewing modes, decided by which fields are set:
     • playback — auto-animating progress along the target after a move
                  (playbackDepth set); takes precedence over everything.
     • manual   — pinned to a line/depth the player navigated to
                  (manualDepth / manualMoves set).
     • live     — the default: follows the deepest confirmed line.
   A transient slide overlay (slideFrom*) animates a single move; a queued
   destination (queued*) drives multi-step navigation one move at a time.

   This module is pure (no DOM, no timers) so the view logic is unit-testable;
   board.js owns the single live instance plus all rendering and scheduling. */

export function createBoardView() {
  return {
    playbackDepth: null,
    manualDepth: null,
    manualMoves: null,
    queuedDepth: null,
    queuedMoves: null,
    slideFromDepth: null,
    slideFromMoves: null,
    timers: [],      // playback step timers
    stepTimer: null, // queued-step timer
  };
}

// Decide what the board should show. `liveMax` is the deepest confirmed line
// (or the full target once the puzzle is finished); `targetMoves` is the
// target's move list. Returns the depth, the move list to replay, and whether
// an automatic progress animation is in flight.
export function resolveBoardView(view, liveMax, targetMoves) {
  const playing = view.playbackDepth != null;
  let depth;
  if (playing) depth = view.playbackDepth;
  else if (view.manualDepth != null) depth = Math.min(view.manualDepth, view.manualMoves?.length ?? liveMax);
  else depth = liveMax;
  const lineMoves = playing ? targetMoves : (view.manualMoves || targetMoves);
  return { playing, depth, lineMoves };
}

// Highest depth that prev/next navigation can reach in the current view.
export function navCeiling(view, liveMax) {
  return view.queuedMoves?.length ?? (view.manualMoves?.length ?? liveMax);
}
