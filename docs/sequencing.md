# Sequencing

## What it does

Staggers the selected layers in time: the first layer in the resolved order stays
where it is, and each following layer starts a fixed offset later. It moves whole
layers by rewriting `startTime`, so keyframes travel with their layer and nothing
is trimmed.

## How to use

1. Select **two or more layers**.
2. Set **Offset** (in frames) and choose an **Order**.
3. Press **Apply**.

## Options

| Control    | Default    | What it does                                                                                        |
| ---------- | ---------- | --------------------------------------------------------------------------------------------------- |
| **Offset** | `2` frames | Time between consecutive layers. Negative values are valid and cascade backwards in time.            |
| **Order**  | `Timeline (top→bottom)` | How the cascade order is derived. See below.                                            |
| **Seed**   | `1`        | Only shown when Order is `Random`. Same seed + same selection = same shuffle, every time.            |
| **⟳**      | —          | Next seed. Increments rather than randomising, so you can step back to the arrangement you just saw. |

### Order modes

| Mode                       | Cascade order                                                                     |
| -------------------------- | --------------------------------------------------------------------------------- |
| `Timeline (top→bottom)`    | Timeline stacking order, topmost layer first.                                      |
| `Reverse (bottom→top)`     | Timeline stacking order, bottom layer first.                                       |
| `By in-point`              | Earliest in-point first. Ties break by timeline index, so the result is stable.    |
| `Random`                   | Seeded shuffle — reproducible, not arbitrary.                                      |

## When it refuses (and why)

| Message                                                          | Why                                                                | What to do                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| `Open a composition first.`                                       | No composition is active.                                           | Open or select a comp.                                      |
| `Select 2+ layers to sequence.`                                   | Fewer than two layers selected — one layer has nothing to stagger against. | Select at least two layers.                          |
| `Select 2+ unlocked layers to sequence; skipped locked layer(s): A, B.` | Locked layers reject writes, and fewer than two remained. | Unlock the layers you want sequenced.                       |
| `Offset must be a number.`                                        | The offset field was empty or not a number.                         | Enter a whole number of frames.                             |
| `Unknown order: X`                                                | An unrecognised order id reached the host.                          | Should not happen from the panel; please open an issue.     |

On success: `Sequenced N layer(s)`, plus `; skipped locked layer(s): A, B` when
some layers in the selection were locked but at least two were not.

## Notes and limitations

- **The first layer does not move.** The cascade grows from wherever the resolved
  first layer already sits, so applying the tool never relocates your selection
  as a block. Which layer that is depends on the Order you chose — under
  `Reverse` it is the bottom layer, under `Random` it is whichever the shuffle
  put first.
- **Order is never click order.** After Effects does not preserve the order in
  which you selected layers, so a cascade derived from it would look arbitrary
  and change between runs on the same selection. That is why the Order control
  exists.
- **`startTime`, never `inPoint`.** Moving `inPoint` would trim the layer — it
  would look right in the timeline while silently cutting the head off your
  animation. This tool only slides layers whole.
- **Locked layers are dropped before the order is resolved**, not after, so a
  layer that cannot be written never becomes the anchor that everything else
  staggers against.
- **`Random` is reproducible.** The same seed and the same selection always
  produce the same arrangement, on any machine. Note the seed if you like a
  result.
- Offsets are entered in frames and converted using the composition's own frame
  duration, so the same offset behaves consistently across comps at different
  frame rates.
- The whole operation is a single undo step.
