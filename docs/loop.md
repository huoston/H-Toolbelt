# Loops

## What it does

Repeats the keyframed animation of a property beyond its keyframes, with a loop
expression. It writes After Effects' own `loopOut()` or `loopIn()` onto the
properties you have selected, from the **Loops** section of the Motion tab. The
keyframes themselves are not changed. **Clear** removes expressions again.

## How to use

1. In the timeline, select an animated property by its name, with two or more
   keyframes.
2. Pick a loop type and a direction: Out repeats after the last keyframe, In before
   the first.
3. Optional: Keys limits how much of the animation loops, counted from the end for
   Out or from the start for In (1 = two keyframes). 0 loops everything. Continue
   does not use it.
4. Click **Apply**, then play past the last keyframe (Out) or before the first (In).
   The layer must extend beyond the animation, or there is nothing to see.

To remove expressions, select the properties and click **Clear**.

## Options

### Type

The default is **Cycle**.

| Type      | What it does |
| --------- | ------------ |
| Cycle     | Plays the animation again from the start. For a seamless loop, give the first and last keyframes the same value. |
| Ping-Pong | Plays it forwards, then backwards, and repeats. |
| Offset    | Repeats it, each time starting where the previous one ended. Good for walks, steps and rotation that keeps adding up. |
| Continue  | Keeps moving forever at the speed of the last keyframe (Out) or the first (In). That keyframe must not be eased; otherwise there is no speed to continue and the property is skipped with a message. |

### Direction

The default is **Out**.

| Direction | What it does                     | What it leaves alone                 |
| --------- | -------------------------------- | ------------------------------------ |
| Out       | Loops after the last keyframe.   | Everything before the last keyframe. |
| In        | Loops before the first keyframe. | Everything after the first keyframe. |

### Keys

How much of the animation loops, counted from the end for Out or from the start for
In. `1` means two keyframes. The default, `0`, loops everything. The field is
disabled for Continue, which replays nothing and has no segment to count.

## When it refuses (and why)

Skipped properties are grouped by reason and named, e.g.
`Skipped 2: Needs 2+ keyframes to loop (Rotation, Opacity)`. On partial success:
`Looped 3 properties (Cycle out); skipped 1: Already has an expression (not overwritten) (Scale)`.

| Message | Why | What to do |
| ------- | --- | ---------- |
| `Open a composition first.` | No composition is active. | Open or select a comp. |
| `Select one or more animated properties first.` | No property is selected — selecting a *group* such as `Transform` does not count as choosing a target. | Click the property name itself in the timeline. |
| `Property does not accept expressions` | After Effects reports the property cannot take one. | Nothing to do for that property. |
| `Already has an expression (not overwritten)` | The property already carries an expression, which is never replaced. After Effects allows one per property. | Clear it first if you really want to replace it. |
| `Needs 2+ keyframes to loop` | A loop replays the span between keyframes. With one keyframe it would return a constant, and the property would look untouched. | Add a second keyframe. |
| `Unsupported property type` | Not a 1D, 2D or 3D numeric property — colors, masks, shape paths and text documents are excluded. | Apply to a numeric property such as Position or Rotation. |
| `Last keyframe is eased — Continue needs speed (make it Linear)` | Continue Out keeps the speed of the last keyframe. After an eased arrival that speed is close to zero, so nothing would move. | Make that keyframe Linear, then apply again. |
| `First keyframe is eased — Continue needs speed (make it Linear)` | Continue In keeps the speed of the first keyframe. An eased departure has almost none, so nothing would move. | Make that keyframe Linear, then apply again. |
| `Could not read keyframe values` | Continue measures that keyframe before applying, and After Effects would not hand over the values. | Unusual; please open an issue. |
| `Unknown loop type: X` | An unrecognized loop type reached the host. | Should not happen from the panel; please open an issue. |
| `Unknown loop direction: X` | An unrecognized direction reached the host. | Should not happen from the panel; please open an issue. |

For **Clear**:

| Message                                     | Why                                                    |
| ------------------------------------------- | ------------------------------------------------------ |
| `Select one or more properties first.`      | No property selected.                                  |
| `No expressions to clear in the selection.` | None of the selected properties carried an expression. |
| `Cleared N expressions`                     | Success.                                               |

## Notes and limitations

- **The effect only exists beyond the keyframes.** Out changes nothing before the
  last keyframe; In changes nothing after the first. The layer must extend beyond
  the animation, or there is nothing to see.
- **One expression per property.** A property with a Dynamics preset is refused
  until you Clear it, and the same happens the other way round. Combining them is in
  development: [issue #1](https://github.com/huoston/H-Toolbelt/issues/1).
- **Clear removes *any* expression in the selection**, not only the ones this tool
  wrote — including hand-written ones and Dynamics presets. Expressions written by
  H-Toolbelt are identifiable by their `// H-Toolbelt` first line if you want to
  check before clearing.
- **How Continue decides a keyframe is eased.** It samples the speed just inside the
  segment and compares it with that segment's average speed, with the threshold
  Dynamics uses: below 10% counts as eased. A very short eased segment (for Easy
  Ease, under about 9 frames) still measures above that, so it is not refused. Play
  past the keyframe to check the result.
- **The expression text is ES3,** so it runs under both of After Effects' expression
  engines.
- The whole operation is a single undo step.
