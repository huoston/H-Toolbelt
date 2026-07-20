# Expression Effects

## What it does

Writes a bounce or elastic expression onto the properties you have selected, in
one click. Both effects measure the property's velocity going into its last
keyframe and add a decaying oscillation scaled by it, so the overshoot inherits
the speed of your animation instead of being a fixed nudge. **Clear** removes
expressions again.

Parameters are baked into the generated expression text — no Expression Controls
are added to your layer.

## How to use

1. Select one or more **animated properties** in the timeline (click the property
   name, e.g. `Position`, not the layer).
2. Adjust **Amp**, **Freq** and **Decay** if you want.
3. Click **Bounce** or **Elastic**. It applies immediately.

To remove expressions, select the properties and click **Clear**.

## Options

Each effect keeps its own parameter set, so switching between Bounce and Elastic
restores that effect's values rather than carrying the other one's tuning over.
The highlighted button shows which effect's parameters the fields are editing.

| Control    | Bounce default | Elastic default | What it does                                                        |
| ---------- | -------------- | --------------- | -------------------------------------------------------------------- |
| **Amp**    | `0.1`          | `0.12`          | Strength of the overshoot, as a fraction of the sampled velocity.    |
| **Freq**   | `2.5`          | `2`             | Oscillations per second.                                             |
| **Decay**  | `6`            | `4`             | How fast the oscillation dies out. Higher settles sooner.            |

**Bounce** rectifies the oscillation so every lobe pushes the same way — an
object hitting a floor never passes through it. **Elastic** leaves it signed, so
it overshoots to both sides. Bounce defaults to a higher decay because a bounce
that lingers reads as a wobble rather than an impact.

## When it refuses (and why)

Skipped properties are grouped by reason and named, e.g.
`Skipped 2: Needs 2+ keyframes (Rotation, Opacity)`. On partial success:
`Applied bounce to 3 properties; skipped 1: Already has an expression (not overwritten) (Scale)`.

| Message                                          | Why                                                                                                    | What to do                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `Open a composition first.`                       | No composition is active.                                                                               | Open or select a comp.                                                   |
| `Select one or more animated properties first.`   | No property is selected — selecting a *group* such as `Transform` does not count as choosing a target.  | Click the property name itself in the timeline.                          |
| `Needs 2+ keyframes`                              | The effect scales the velocity into the last keyframe. With fewer than two there is nothing to measure, so the expression would be inert. | Add a second keyframe.        |
| `Already has an expression (not overwritten)`     | The property already carries an expression, which is never replaced.                                    | Clear it first if you really want to replace it.                         |
| `Property does not accept expressions`            | After Effects reports the property cannot take one.                                                     | Nothing to do for that property.                                         |
| `Unsupported property type`                       | Not a 1D/2D/3D numeric property — colours, masks, shape paths and text documents are excluded.           | Apply to a numeric property such as Position, Scale, Rotation, Opacity.  |
| `Unknown effect: X`                               | An unrecognised effect id reached the host.                                                             | Should not happen from the panel; please open an issue.                  |

For **Clear**:

| Message                                     | Why                                                    |
| ------------------------------------------- | ------------------------------------------------------- |
| `Select one or more properties first.`      | No property selected.                                   |
| `No expressions to clear in the selection.` | None of the selected properties carried an expression.  |
| `Cleared N expressions`                     | Success.                                                |

## Notes and limitations

- **The expression text is ES3.** After Effects ships two expression engines, and
  a project switched to *Legacy ExtendScript* (File → Project Settings →
  Expressions) treats modern JavaScript syntax as a parse error, which would
  disable the expression with a yellow banner. The generated text avoids it, so
  the effects work under both engines.
- **Clear removes *any* expression in the selection**, not only the ones this
  tool wrote — including hand-written ones. "Clear" on a selection you made is
  unambiguous, and a filter that silently spared some expressions would be more
  surprising. Expressions written by this tool are identifiable by their
  `// H-Toolbelt` first line if you want to check before clearing.
- **Existing expressions are never overwritten.** Hand-written expression work is
  not something an undo you reach for a day later will bring back.
- **The effect starts after the last keyframe reached.** Before the first
  keyframe the expression falls through to the property's plain value, so the
  property behaves normally until the animation actually starts.
- **Editing the parameters does not update already-applied expressions.** The
  values are baked into the text at the moment you click. To retune, Clear and
  re-apply — or edit the `amp` / `freq` / `decay` variables directly at the top
  of the expression, which is plain readable code.
- The whole operation is a single undo step.
