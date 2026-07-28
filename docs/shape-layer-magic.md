# Shape Layer Magic

> **v1 — cleanup only.** This version deletes debris. It does not restructure or
> merge anything. See [What v1 does not do](#what-v1-does-not-do) for why
> flattening is absent.

## What it does

Cleans up the leftovers an Illustrator or SVG import leaves inside a shape layer.
After Effects' *Create Shapes from Vector Layer* (and the native SVG import in AE
2026) produces a tree full of empty wrapper groups and, usually, a full-frame
rectangle standing in for the Illustrator artboard. Both are invisible, both
inflate the layer's bounding box, and the artboard rectangle silently swallows
clicks in the comp viewer.

Every operation is a deletion. Nothing is moved, rebuilt or re-parented, so
nothing that survives the cleanup can come back changed.

## How to use

1. Select one or more **shape layers** in the timeline.
2. Click **Remove empty**, **Remove artboard**, or **Clean all**.

It applies immediately — there is no separate Apply button. Selecting a shape
*group* is not necessary; the tools always work on the whole layer.

## Options

| Button             | What it does                                                                     |
| ------------------ | -------------------------------------------------------------------------------- |
| **Remove empty**   | Deletes every group in the layer that contains nothing able to draw.             |
| **Remove artboard**| Deletes the comp-sized backdrop rectangle left by an Illustrator import.         |
| **Clean all**      | Runs both, in one undo step. Artboard first, then empty groups.                  |

There are no parameters. **Clean all** removes the artboard first on purpose:
taking the backdrop out can leave its ancestors with nothing in them, and the
empty sweep that follows collects those in the same pass.

### What counts as an empty group

A group is empty when its contents are made up *exclusively* of groups that are
themselves empty — including a group with no contents at all. Anything else makes
it non-empty: a path, a fill, a stroke, a repeater, a trim, or a match name this
build has never seen.

That definition is deliberately backwards. Defining empty as "contains none of
these drawable things" would need the list of drawable things to be exhaustive
forever, and would start deleting real artwork the day Adobe added an operator
missing from it.

### What counts as the artboard rectangle

A top-level group is treated as the artboard backdrop only when **all** of the
following hold:

- its group Transform is an identity — anchor and position `[0,0]`, scale
  `[100,100]`, rotation, skew `0`, opacity `100`;
- it contains exactly one drawable item, and that item is a **rectangle**;
- the rectangle's Size matches the composition frame and its Position is `[0,0]`,
  each within **1 px**;
- the rectangle's Size and Position carry no keyframes and no expression;
- the group contains nothing else except fills and strokes.

The identity-transform requirement is not decoration. Without it the size test is
meaningless in both directions: a 960×540 rectangle inside a group scaled to 200%
*does* cover a 1920×1080 comp, and a comp-sized rectangle inside a group scaled to
50% does not.

If no group satisfies every condition, **nothing is removed** and the panel says
so.

## When it refuses (and why)

| Message                                              | Why                                                     | What to do                                     |
| ---------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| `Open a composition first.`                          | No composition is active.                                | Open or select a comp.                           |
| `Select one or more shape layers first.`             | Nothing selected, or nothing selected was a shape layer. | Select at least one shape layer.                 |
| `Skipped Foo: not a shape layer [ADBE AV Layer]`     | A non-shape layer was in the selection. It names the layer and its `matchName`. | Nothing — the shape layers in the selection were still processed. |
| `No empty groups found.`                             | Not a refusal. The layer had nothing to clean.           | Nothing.                                         |
| `No artboard rectangle found.`                       | Not a refusal. No group met every condition above.       | Nothing. Delete the rectangle by hand if you are sure. |
| `Nothing to clean.`                                  | **Clean all** found neither an artboard nor empty groups. | Nothing.                                         |

On success:

- `Removed 12 empty group(s)`
- `Removed 1 artboard rectangle(s): Artwork / Group 1`
- `Removed 1 artboard rectangle(s) and 12 empty group(s)` — from **Clean all**

Any skipped non-shape layers are appended to whichever message you get, so a
partial run still tells you what it declined.

## What v1 does not do

### Flatten identity-transform groups — not possible from ExtendScript

The obvious companion operation is collapsing the nested wrapper groups an
AI conversion produces by the dozen: those whose Transform is an identity and
which therefore appear to do nothing. It is **not implemented**, and not because
it was left out of the schedule.

1. **There is no reparenting call.** `PropertyBase.parentProperty` is read-only.
   The only mutators After Effects exposes are `remove()`, `moveTo(index)` — which
   reorders a property *within its existing parent* — and `duplicate()`, which
   copies in place. `PropertyGroup.addProperty()` creates a new, default property.
   Nothing in the API moves an existing group to a different parent.

2. **Rebuilding instead would lose artwork.** Without a move, flattening means
   recreating each child in the parent and copying its state over. That copy
   cannot be faithful: gradient fill and stroke ramp data is not readable or
   writable from ExtendScript, so every gradient would return as a default.
   Keyframes, expressions and interpolation types on each descendant would need
   their own reconstruction, and anything unanticipated would be dropped silently.

3. **An identity transform does not mean the group is a no-op.** Even with a
   working move, the premise is wrong. A group is a *scope*, not just a transform:
   a fill inside it paints that group's paths, and Trim Paths, Merge Paths, Offset
   Paths and Repeater all operate on its contents. Hoisting children out of an
   identity-transform group into a parent holding other paths merges those scopes
   — the parent's fill starts painting the hoisted paths, and vice versa. The
   layer would change appearance, which is the one thing this tool promises never
   to do.

Points 1 and 2 are limits of the scripting API. Point 3 would still be true if
Adobe shipped a move call tomorrow. Flatten needs a different design — rebaking
transforms and hoisting scope-aware — and is deferred rather than approximated.

### Also not in v1

- **Merging several shape layers into one.** Needs the same rebaking, plus
  transform reconciliation between layers.
- **Removing an artboard rectangle that is not a top-level group.** Illustrator
  puts the backdrop at the root of the layer. A comp-sized rectangle nested deeper
  is far more likely to be deliberate artwork.
- **A bare artboard rectangle not wrapped in a group.** Only groups are examined,
  because only a group carries the transform that makes the size test meaningful.

## Notes and limitations

- **Deletion only, so appearance is preserved by construction.** Every group this
  tool removes is one that provably cannot draw, or the backdrop rectangle you
  asked it to remove. Nothing is rebuilt, so nothing can come back subtly
  different.
- **Safe to run twice.** The operations are idempotent — a second run finds
  nothing left and says `No empty groups found.` / `Nothing to clean.`
- **Collect, then delete.** Each operation walks the whole tree building a list of
  targets before removing anything, so no traversal reads a group whose siblings
  have been renumbered underneath it.
- **A group After Effects refuses to delete is left in place** and not counted.
  The number in the message is what actually happened, not what was attempted.
- **Layer type is decided by `matchName`** (`ADBE Vector Layer`), never by
  `layer.source`, which is null for shape layers and so says nothing at all.
- The whole operation is a single undo step — including **Clean all**, which runs
  both cleanups under one `Ctrl+Z`.
