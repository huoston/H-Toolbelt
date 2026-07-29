# Easings

## What it does

Applies cubic-bezier temporal easing to the keyframes you have selected. Pick one
of six presets or drag the curve editor's two handles to shape your own, then
press **Apply**. The curve is converted into After Effects' native
influence/speed ease values, so the result is an ordinary eased keyframe you can
keep editing by hand afterwards.

## How to use

1. Select **two or more keyframes** on an animated property in the timeline.
   Easing describes the segment *between* keyframes, so a single keyframe has
   nothing to ease.
2. Click a card to load its curve into the editor, or drag the editor handles to
   shape your own. Clicking a card does **not** apply it — it only loads it.
3. Press **Apply**.

The eased segments are the ones between consecutive selected keyframes. Segments
outside the selection are left alone, and the opposite side of each boundary
keyframe is preserved.

## Options

### The library

Fourteen curves, shown as a grid of cards. Each card draws **its own curve** over
a dashed linear reference, so you can pick a shape by looking rather than by
decoding a name. Hovering a card shows what the motion does.

Clicking a card **loads** its curve into the editor — it does not apply. Apply
stays a separate button, so browsing the library never touches your keyframes.

| Preset       | Curve (x1, y1, x2, y2) | What it does                                    |
| ------------ | ---------------------- | ------------------------------------------------- |
| Easy Ease    | `0.333, 0, 0.667, 1`   | Gentle acceleration then deceleration.           |
| Linear       | `0, 0, 1, 1`           | Constant speed from start to end.                |
| Sine In      | `0.12, 0, 0.39, 0`     | Gradual acceleration from zero velocity.         |
| Sine Out     | `0.61, 1, 0.88, 1`     | Gradual deceleration to zero velocity.           |
| Sine In-Out  | `0.37, 0, 0.63, 1`     | Gentle acceleration then deceleration.           |
| Quad In      | `0.11, 0, 0.5, 0`      | Accelerates from zero velocity.                  |
| Quad Out     | `0.5, 1, 0.89, 1`      | Decelerates to zero velocity.                    |
| Quad In-Out  | `0.45, 0, 0.55, 1`     | Acceleration until halfway, then deceleration.   |
| Cubic In     | `0.32, 0, 0.67, 0`     | Starts slow, then accelerates quickly.           |
| Cubic Out    | `0.33, 1, 0.68, 1`     | Starts fast, then decelerates slowly.            |
| Cubic In-Out | `0.65, 0, 0.35, 1`     | Slow start and end, fast in the middle.          |
| Expo In      | `0.7, 0, 0.84, 0`      | Slow start, then rapid acceleration.             |
| Expo Out     | `0.16, 1, 0.3, 1`      | Rapid deceleration to a slow end.                |
| Expo In-Out  | `0.87, 0, 0.13, 1`     | Rapid acceleration and deceleration.             |

The families are ordered by how sharply they bend: **Sine** barely, then
**Quad**, **Cubic**, and **Expo** hardest. Within each, **In** eases the start,
**Out** eases the end, and **In-Out** does both.

The panel opens on **Easy Ease**.

> **Why there is no Back, Elastic or Bounce here.** Those overshoot — they leave
> the 0–1 box and come back. A keyframe's influence and speed cannot describe
> that shape, so they cannot be preset curves; they need generated expressions
> instead, which is a different tool. Every curve in this list stays inside the
> box, which is exactly why it can run through the keyframe engine.

### Curve editor

Two draggable control points, each clamped to the 0–1 box, with a live numeric
readout. A card highlights while the editor matches its curve exactly; dragging
away from it clears the highlight, so you can always see whether you are on a
named curve or a hand-tuned one.

## When it refuses (and why)

| Message                                              | Why                                                          | What to do                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `Open a composition first.`                          | No composition is active.                                    | Open or select a comp, then retry.                                 |
| `Select 2+ keyframes on an animated property first.` | Nothing eligible was selected, or nothing could be eased.    | Select at least two keyframes on a numeric, keyframable property. |

On success the panel reports `Applied to N keyframes`.

## Notes and limitations

- **Temporal ease only.** This sets keyframe influence and speed. It does not
  touch spatial tangents, so the *path* a position keyframe travels along is
  unchanged — only its timing along that path.
- **One ease for all dimensions.** Every dimension of a multidimensional property
  receives the same influence and speed. After Effects' own Easy Ease behaves the
  same way; if you need per-dimension timing, separate the dimensions and ease
  them individually.
- **Silent skips.** Unlike the other three tools, Easings does not report *which*
  properties it skipped. A property that cannot vary over time, has fewer than
  two selected keyframes, or holds a non-numeric value (a mask path, a text
  document, a colour) is passed over without a per-property reason; if nothing at
  all could be eased you get the "Select 2+ keyframes" message. This is a known
  rough edge — see [LIMITATIONS](../LIMITATIONS.md).
- **Zero-length segments are skipped.** Two keyframes at the same time have no
  duration to distribute the ease over.
- The whole operation is a single undo step.
