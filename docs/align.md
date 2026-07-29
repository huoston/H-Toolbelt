# Align & Distribute

## What it does

Aligns and distributes the selected layers by their bounding box **in
composition space** — the box you can actually see. After Effects' own Align
panel measures the layer's untransformed rectangle, which is why aligning a
rotated layer to the left edge leaves a visible gap. This tool projects the
layer's four corners through its position, anchor, scale and rotation first, so a
rotated or scaled layer lands where you expect.

Animated layers are moved, not refused: alignment is computed at the current
frame and the whole motion path shifts with it.

## How to use

1. Select two or more layers (three or more to distribute).
2. Pick what to align against — **Comp** or **Selection**.
3. Click one of the six align buttons, or one of the two distribute buttons.

It applies immediately — there is no separate Apply button.

## Options

### Align to

| Setting        | What the six buttons align against                                    |
| -------------- | ----------------------------------------------------------------------- |
| **Comp**       | The composition frame. Default.                                         |
| **Selection**  | The combined bounding box of the selected layers, measured before any move. |

This is a mode, not an action: it changes what the buttons below it mean.

### Align

| Button | Mode      | What it does                          |
| ------ | --------- | --------------------------------------- |
| ⇤      | `left`    | Left edges meet the target's left.      |
| ↔      | `hcenter` | Horizontal centres line up.             |
| ⇥      | `right`   | Right edges meet the target's right.    |
| ⇡      | `top`     | Top edges meet the target's top.        |
| ↕      | `vcenter` | Vertical centres line up.               |
| ⇣      | `bottom`  | Bottom edges meet the target's bottom.  |

Each button moves one axis only, so a horizontal align never nudges a layer
vertically. That is what makes them composable — **left** then **top** puts a
layer in the corner.

### Distribute

| Button         | What it does                                                       |
| -------------- | -------------------------------------------------------------------- |
| **Horizontal** | Spaces box centres evenly left to right.                            |
| **Vertical**   | Spaces box centres evenly top to bottom.                            |

The two outermost layers stay exactly where they are; everything between them is
spread evenly. Order is taken from the layers' positions on screen, not from
their timeline order. Needs **three or more** layers — with only two there is
nothing between them to space out.

## When it refuses (and why)

Refusals name the layer and its `matchName`, and the rest of the selection is
still processed.

| Message                                          | Why                                                                                          | What to do                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `Open a composition first.`                       | No composition is active.                                                                     | Open or select a comp.                            |
| `Select one or more layers first.`                | Nothing eligible was selected.                                                                | Select at least one layer.                        |
| `Select 3+ layers to distribute.`                 | Fewer than three eligible layers.                                                             | Select at least three.                            |
| `3D layers not supported yet`                     | A 3-D layer's on-screen box depends on the camera, which this version does not compute.       | Make the layer 2-D, or align it by hand for now.  |
| `Parented layers not supported yet`               | `position` is measured in the parent's space, so a comp-space move would land somewhere else. | Unparent, align, then re-parent.                  |
| `Separated position dimensions: skipped`          | X and Y are distinct properties a combined write cannot reach.                                | Re-join dimensions, align, separate again.        |
| `Position has an expression (not moved)`          | An expression would override the write, so the tool would report success while nothing moved. | Disable or bake the expression first.             |
| `Camera/Light has no bounds`                      | Cameras and lights have no source rectangle.                                                  | Nothing — they have no box to align.              |
| `No bounding box available`                       | After Effects returned no usable rectangle.                                                   | Check the layer has visible content at this time. |

On success: `Aligned 4 layer(s)` or `Distributed 5 layer(s)`, plus a
`; skipped N: <reason>` note when part of the selection was declined.

## Notes and limitations

- **A rotated layer has a bigger box than its artwork, on purpose.** The
  axis-aligned box of a square turned 45° is its diagonal wide. Aligning to the
  visual extent is the entire reason for measuring in comp space.
- **Everything is measured before anything moves.** "Align to selection" targets
  the union of the boxes as they are when you click, and distribution needs every
  centre up front; reading them while layers were already moving would chase a
  target that keeps shifting.
- **Animated layers keep their motion path.** The whole position track shifts by
  the alignment delta — one constant vector — so the path keeps its shape, its
  keyframe count and its eases. Same behaviour as [Anchor Point](./anchor-point.md);
  a layer that survives one survives the other.
- **Text and shape boxes are per-frame.** The box covers what is drawn at the
  current time, so alignment reflects that frame.
- **Re-running is safe.** A layer already at the target gets a zero delta and is
  left untouched rather than rewritten.
- The whole operation is a single undo step.

## Not in this version

Deferred to a later release, tracked on the [roadmap](../ROADMAP.md):

- **3-D layers and alignment in Z.** The geometry is written on 3-component
  points so depth is an added axis rather than a rewrite, but a 3-D layer's
  screen box depends on the active camera and that is not computed yet.
- **Align via Parent** — aligning a parented layer in its parent's space.
- **Align to a key layer** — picking one layer as the target instead of the comp
  or the whole selection.
- **Distribute by edge spacing** — equal gaps between boxes rather than equal
  spacing between centres.
