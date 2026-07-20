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
2. Click a preset to load its curve into the editor, or drag the editor handles
   to shape your own. Clicking a preset does **not** apply it — it only loads it.
3. Press **Apply**.

The eased segments are the ones between consecutive selected keyframes. Segments
outside the selection are left alone, and the opposite side of each boundary
keyframe is preserved.

## Options

### Presets

| Preset                | Curve (x1, y1, x2, y2)  |
| --------------------- | ----------------------- |
| Easy Ease             | `0.333, 0, 0.667, 1`    |
| Ease Out              | `0, 0, 0.58, 1`         |
| Ease In               | `0.42, 0, 1, 1`         |
| Ease In-Out           | `0.42, 0, 0.58, 1`      |
| Ease Out Strong       | `0, 0, 0.2, 1`          |
| Ease In-Out Strong    | `0.7, 0, 0.3, 1`        |

The panel opens on **Easy Ease**.

### Curve editor

Two draggable control points, each clamped to the 0–1 box, with a live numeric
readout. A preset button highlights while the editor matches its curve exactly;
dragging away from a preset clears the highlight.

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
