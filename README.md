# 🌳 Opening Tree

A daily puzzle game in the spirit of Wordle and Metazooa, but for **chess openings**.

Each day a hidden **target opening** is chosen. You guess other openings, and the
only feedback is how far you travel down the **same branches of the opening tree**
before your line splits away from the target's. The goal is to feel like you're
*navigating the opening tree*, gradually learning how openings relate to one another.

## How it plays

- **Four daily puzzles every day** — one per difficulty (Easy / Medium / Hard /
  Expert). Each is chosen deterministically from the calendar date, so it's the same
  for everyone playing that tier. Switch tiers freely; each keeps its own progress.
- **Unlimited guesses**, selected through an autocomplete search. You don't need to
  type exact names — search by name (`najdorf`), ECO code (`B90`), or even by
  **moves** (`1. e4 e5 Nf3`).
- For every guess the game finds the **deepest common prefix of moves** with the
  target — the point where your line splits away from the target's.
- The feedback is the **opening tree itself** — that's the whole game. Confirmed-shared
  moves form a green trunk; each guess's wrong turn branches off in red; the tip of the
  trunk shows how deep you've confirmed; the target line is revealed in gold ★ only when
  you win, so the tree never spoils the answer.
- A minimal **guess log** under the tree shows each guess's line with shared moves in
  green and the diverging move in red — nothing else to read.
- A **chess board** beside the tree shows *how far you've gotten* — the position at the
  end of the deepest line you've confirmed shared with the target (the full target
  position once you win). The position is rebuilt from the moves by a small built-in
  SAN engine.
- **Shareable results** — a no-spoiler grid of closeness squares, Wordle-style, tagged
  with the puzzle number and difficulty.
- **Practice mode** — endless random openings at any difficulty, with its own
  per-tier statistics.

## Running it

It's a fully static site — no build step, no dependencies.

**Option A — local server (recommended):**

```bash
python -m http.server 8765
# then open http://127.0.0.1:8765
```

**Option B — open directly:** double-click `index.html`. Everything works from
`file://` except that the *copy-to-clipboard* on share may be blocked by the browser;
the shareable text is still shown in the Stats panel so you can copy it manually.

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` | Markup and modals. |
| `styles.css` | All styling (chess.com-inspired dark theme, blue board, green accents). |
| `game.js` | Game logic: comparison engine, tree builder, board rendering, autocomplete, difficulty/daily selection, stats, sharing. |
| `chess.js` | Tiny SAN engine — replays a move list to reconstruct the board position. |
| `openings.js` | The opening database (`window.OPENINGS`), generated. |
| `tools/` | The source ECO data (`*.tsv`) and `generate.js` that builds `openings.js`. |

## The data

The database holds **3,167 uniquely-named openings and variations** with their ECO
codes and full main-line move sequences, derived from the open
[lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) dataset
(CC0). Each opening stores its name, ECO code, SAN move sequence, and an opening
family derived from the name.

### Difficulty

The dataset has no popularity/frequency signal, so each opening's "obscurity" is
estimated from three structural proxies and bucketed into four tiers:

- **family prominence** — iconic (Sicilian, Ruy Lopez, …) vs. famous vs. semi-known
  vs. obscure, judged partly by how many catalogued variations a family has;
- **move depth** — how many plies you must reproduce exactly;
- **name nesting** — how deep the variation name runs.

The distribution is deliberately skewed toward the hard end. Target counts are
**Easy 39 · Medium 663 · Hard 653 · Expert 1,792**. **Easy** is reserved for the
recognizable *base* openings only (no variation clause — "Sicilian Defense", "Ruy
Lopez", "Queen's Gambit Declined", …); named variations move up to Medium/Hard; and
the large **Expert** pool is the deep / obscure tail. Every one of the 3,167 openings
stays **guessable** in all tiers — difficulty only controls which opening is the
hidden *target*.

> Note: with no popularity data, a *single*-variation name of a famous family can't be
> told apart structurally from a famous one (e.g. "Caro-Kann: Classical" vs. an obscure
> sideline), so Medium can still surface the occasional offbeat line. Easy avoids this
> entirely by only ever using base opening names.

To rebuild the database:

```bash
node tools/generate.js
```
