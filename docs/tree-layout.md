# Laying out the opening tree

The branching diagram is the game. The only feedback you get for a guess is how
far it travels down the tree before splitting off from the answer, so the tree
has to stay readable no matter what shape it ends up in. That turned out to be
one of the trickier parts of the project, and it's all hand-rolled. There's no
graph or layout library involved.

The code is in [`js/tree.js`](../js/tree.js). The layout itself is `layoutTree`.

## Why it's harder than it looks

A finished tree looks tidy enough that you'd assume a library does it. Three
things get in the way of that:

The boxes are different sizes. One might be a short move token like `1.e4`, the
next a full opening name that wraps onto two lines. Most of the standard
tree-drawing algorithms (Reingold–Tilford and its descendants) assume every node
is the same width, and none of them are here. The width depends on the text and
isn't known until render time.

The tree grows while you play, in shapes you can't predict. Every guess adds a
line. Wrong guesses that share some opening moves grow their own little
sub-branches off the shared part. A node might have one child or ten, and it has
to look deliberate either way.

And it has to be legible at a glance. Boxes can't overlap, lines can't run
through boxes, the blue path to the answer should sit somewhere near the middle,
and the whole thing can't sprawl so wide it runs off the screen.

I ruled out the two easy options early. A plain grid with one column per leaf
never overlaps, but it's absurdly wide and flat, and a ten-guess tree scrolls
off the side. A stock tidy-tree layout packs well when nodes are uniform width;
feed it real opening names and boxes either collide or leave ragged holes.

## How rendering is split up

There are four passes:

```
buildDisplayTree → layoutTree → paintTree → focusTree
```

`buildDisplayTree` turns the game state into the boxes you actually see. It
collapses a straight run of moves into one box, folds a guessed opening's name
and its moves together into a single labelled box, and sorts siblings so branches
come before leaves. `layoutTree` gives every box an x and y. `paintTree` writes
it all out as SVG. `focusTree` pans the view to whatever move you just confirmed.

The layout pass is the part worth explaining.

## Inside layoutTree

**Rows come from depth.** A walk down the tree sets each node's row to its depth
and records the tallest box on each row, which matters later because rows aren't
all the same height.

**Siblings stagger into two lanes.** A row of boxes all at the same height reads
as a flat wall. So siblings alternate between two lanes, one sitting a bit lower
than the other (`LANE_OFFSET`), and leaves in the same run overlap slightly
side to side (`PITCH_FACTOR = 0.94`). The extra vertical room from the lower lane
is what lets them overlap horizontally without actually touching, which turns a
long flat row into a compact zig-zag. This is the look I borrowed from Metazooa,
which is what gave me the idea for the whole game.

The branch leading to the answer is kept near the centre rather than left where
it falls. It alternates between the two middle slots depending on the row, so it
drifts gently down the middle instead of snapping to one side.

**Wide fans get pushed down.** When a node has four or more children, all their
connectors leave from the same point and bunch up right under it. `fanGap` drops
that whole row of children further down so the lines have room to spread before
they reach the boxes. How far it drops scales with the number of children, but it
subtracts whatever vertical room a taller sibling on the parent's row is already
adding, so the tree doesn't pile on height twice for the same reason. This one
came out of a bug report: a six-way split off `1.e4` looked like a tangle.

**Reserve a column, then compact.** This is the answer to the variable-width
problem and it runs in two passes.

The first pass (`place`) hands every subtree its own column, as wide as the
widest row anywhere inside it. Nothing can overlap, because each subtree owns at
least as much width as it needs. The cost is wasted space: a narrow branch
sitting under a wide neighbour leaves a tall empty gap above wherever its real
content ends up.

The second pass (`compact`) claws that space back. For each parent it takes the
children left to right and slides each one as far left as it'll go without
bumping into anything already placed. The collision check runs against a skyline:
a map from vertical position to the furthest-right edge seen so far at that
height. So a short branch can slide up into the gap beside a taller one, because
the check only looks at the rows it actually occupies. A staggered run of leaves
moves as one rigid block so its diagonal overlap doesn't get pulled apart, and
each parent recentres over its children once they've settled.

Doing it this way skips the contour bookkeeping the classic algorithm needs. The
first pass makes overlap impossible without any reasoning, and the second buys
the density back by checking against a coarse skyline instead of exact per-node
outlines.

**Edges are drawn to be covered.** Each edge is a cubic Bézier from the centre of
the parent box to the centre of the child, with the control points pushed down by
40% of the vertical gap. The boxes are painted after the edges, so the stub of
each line that runs inside a box gets hidden. What's left is a clean curve from
one box edge to the next, and every line clearly leaves from the parent's centre
even when the children are staggered.

**Then normalise.** Trim the empty margin on the left, size the canvas to the
compacted content, and centre it if it's narrower than the panel.

## Cost

Each pass is a fixed number of walks over the tree, so the whole layout is O(n)
in the box count. The skyline buckets its collision checks into fixed-height
bins, so those stay roughly constant per node. The trees are never more than a
few dozen boxes, so laying the whole thing out again from scratch on every guess
isn't something I had to worry about.

## Notes on the approach

The decision I'd point to is reserve-then-compact instead of contour merging. A
proper Reingold–Tilford deals with variable widths by threading a left and right
outline through each subtree and merging them in pairs. It packs tighter, but the
bookkeeping is easy to get subtly wrong. Splitting it into "give everything a
safe column, then greedily slide it left against a skyline" left me with two
pieces I could each reason about on their own, and that's what let the layout
take a dozen later changes (the fan spacing, the lane staggering, the centred
answer path) without breaking.

I did try the contour version partway through. It packed tighter but looked
worse: the tightness fought with the staggering and the other spacing rules, and
I reverted it. For this tree, readable beats dense.
