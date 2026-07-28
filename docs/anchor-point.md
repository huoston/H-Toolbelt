# Anchor Point

## What it does

Moves a layer's anchor point to one of nine positions on its bounding box —
corners, edge midpoints, or centre — and compensates `position` so your work is
preserved. Moving an anchor normally shifts the layer, because `position` is
measured from the anchor; this tool cancels that shift, including at non-100%
scale and non-zero rotation, where a naive correction visibly slips.

**One grid handles both static and animated layers.** The tool detects animation
itself, so you never have to know in advance which case you have:

- **Static layer** — the layer does not move on screen at all.
- **Animated layer** — the whole position track shifts by one vector, so the
  **motion path keeps its shape, its keyframe count and its eases**. A layer with
  animated rotation or scale then pivots around the new point, which is normally
  the reason you moved the anchor.

This was two separate sections until v0.2.0 (Anchor Point and Re-pivot). They are
one tool now.

## How to use

1. Select one or more layers.
2. Click one of the nine cells in the 3×3 grid.

It applies immediately — there is no separate Apply button.

To retarget a **shape group** instead of the whole layer, select the group (for
example `Rectangle 1`) inside a shape layer before clicking. If any shape group
is selected, the tool operates on groups rather than layers.

## Options

The 3×3 grid, in reading order:

| Cell | Position       | Cell | Position        | Cell | Position        |
| ---- | -------------- | ---- | --------------- | ---- | --------------- |
| ↖    | `top-left`     | ↑    | `top-center`    | ↗    | `top-right`     |
| ←    | `middle-left`  | •    | `center`        | →    | `middle-right`  |
| ↙    | `bottom-left`  | ↓    | `bottom-center` | ↘    | `bottom-right`  |

There are no parameters. The centre cell is highlighted as the most common
target.

## When it refuses (and why)

Refusal messages name the layer and its `matchName`, so an unexpected refusal
identifies itself — for example
`Animated scale/rotation: skipped Ball [ADBE AV Layer]`.

When several layers are skipped, the panel reports the count plus the most common
reason: `Skipped 3 layer(s): <reason>`, or
`Applied to 2 layer(s); skipped 1: <reason>`.

### Layer mode

| Message                                          | Why                                                                                            | What to do                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `Open a composition first.`                       | No composition is active.                                                                       | Open or select a comp.                                                      |
| `Select one or more layers first.`                | Nothing is selected.                                                                            | Select at least one layer.                                                  |
| `Camera/Light has no bounds`                      | Cameras and lights have no source rectangle at all.                                             | Nothing to do — these layers have no bounding box to anchor to.             |
| `Animated anchor: skipped`                        | The anchor itself is keyframed, so there is no single anchor to retarget.                       | Remove the anchor keyframes, apply, then re-animate if you need to.         |
| `Expression on position: skipped`                 | An expression would override the write, so the tool would report success while nothing moved.   | Disable or bake the expression, apply, then restore it.                     |
| `Anchor already at this point: skipped`           | Not a failure — the anchor is already there, so there is nothing to change.                      | Nothing.                                                                    |
| `Separated position dimensions: skipped`          | Position is split into separate X/Y properties, which a combined write cannot reach.            | Re-join dimensions, apply, then separate again if you need to.              |
| `Unreadable position keyframes: skipped`          | After Effects would not hand over the keyframe values.                                          | Unusual; please open an issue with the `matchName` shown.                   |
| `3D rotation not supported yet: skipped`          | A 3D layer with X/Y rotation or orientation. The 2-D compensation does not cover it.            | Zero the X/Y rotation, apply, then restore. Z-only rotation works fine.     |
| `Empty layer (zero-size bounds)`                  | The layer measures zero by zero — an empty shape layer, or text with no glyphs at this frame.   | Add content, then apply.                                                    |
| `No bounding box available`                       | After Effects returned no usable rectangle for this layer.                                      | Check the layer has visible content at the current time.                    |
| `No bounding box available for unrecognised layer type` | Same, on a layer type this build does not know.                                          | Please [open an issue](../../../issues) with the `matchName` shown.         |
| `No transform group` / `No anchor/position properties` / `Unreadable transform values: skipped` | The expected transform properties were missing or unreadable. | Unusual; please open an issue with the `matchName` shown.                   |

### Shape group mode

Group mode is reported with the noun "shape group", e.g.
`Skipped 1 shape group(s): <reason>`.

| Message                                                            | Why                                                                                                     | What to do                                                        |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `No reliable bounding box for a group in a multi-group layer: skipped` | After Effects exposes no per-group bounding box. It can only be derived when the layer holds exactly one top-level group. | Split the groups into separate shape layers, or anchor the layer itself. |
| `Rotated group has no reliable bounding box: skipped`               | Un-rotating the layer's axis-aligned rectangle yields a box larger than the real content.                 | Zero the group's rotation, apply, then restore it.                 |
| `Not a shape layer: skipped`                                        | The selected group's owning layer is not a shape layer.                                                   | Select a group inside an actual shape layer.                       |
| `Animated anchor/position: skipped` / `Animated scale/rotation: skipped` | The group transform is keyframed.                                                                    | Remove keyframes, apply, re-animate.                               |
| `Zero group scale: skipped`                                         | A zero scale cannot be inverted.                                                                          | Give the group a non-zero scale.                                   |
| `No group transform` / `No group anchor/position` / `No shape contents` / `Unreadable group transform` | Expected shape properties were missing or unreadable.                  | Unusual; please open an issue.                                     |

## Notes and limitations

- **Text layers measure the glyphs drawn at the current frame.** With animated
  Source Text or text animators, the bounding box — and therefore the resulting
  anchor — is the one for *that* frame. Move the playhead to the frame you care
  about before applying.
- **The refusals are deliberate, not missing features.** Each one marks a case
  where the compensation would be wrong rather than merely unsupported. A layer
  that silently ends up in the wrong place is worse than one that says no.
- **On an animated layer the path is preserved, not the pixels.** The offset is
  evaluated at the current time, so the layer does not jump at the frame you are
  looking at — but a layer with animated rotation renders differently on other
  frames, because it now turns about the new anchor. Preserving the old picture
  would mean preserving the old pivot, which is the thing you asked to change.
- **The keyframe count never changes.** The tool shifts values; it does not add,
  remove or resample keyframes, and it never touches their times.
- **Parenting needs no special handling.** The compensation keeps the layer's own
  transform output identical for every point in layer space, so whatever the
  parent chain does to that output is unchanged.
- The whole operation is a single undo step, however many layers were affected.
