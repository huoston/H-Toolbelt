# Known limitations

What H-Toolbelt deliberately will not do, and why. Most entries here are design
decisions rather than missing features: the tools rewrite properties that already
hold your work, so where the maths cannot provably cover a case they refuse and
say so instead of applying something approximate.

A refusal message is not an error. It names the layer or property and, for Anchor
Point, its `matchName`, so you can see exactly what was skipped and why. The rest
of the selection is still processed.

Per-tool usage details are in [docs/](./docs/README.md).

## Project-wide

- **The `.zxp` is self-signed.** It carries a certificate generated for this
  project, not one from a commercial authority, so ZXP installers may warn that
  the publisher cannot be verified. The signature proves the package has not been
  altered since it was built — not who built it. A producer certificate is on the
  [roadmap](./ROADMAP.md) under *considering*.
- **After Effects only.** The panel targets AEFT `[16.0,99.9]` — CC 2019 through
  2026. There is no Premiere, Photoshop or Illustrator build, and the tools are
  built around After Effects' layer and property model.
- **CEP, not UXP.** H-Toolbelt is a CEP extension. Adobe's newer extensibility
  platform is UXP, and CEP is expected to be retired eventually. Nothing breaks
  today, but a migration will be needed at some point; it is tracked on the
  roadmap under *considering*.
- **Offline by design.** The panel never makes network requests. No telemetry, no
  update checks, no licence server.
- **Undo.** Every tool wraps its work in a single undo group, so one `Ctrl+Z` /
  `Cmd+Z` reverses a whole operation regardless of how many layers it touched.

## Easings

- **Temporal ease only.** Sets keyframe influence and speed; spatial tangents are
  untouched, so a position keyframe's *path* does not change — only its timing
  along that path.
- **One ease across all dimensions.** Every dimension of a multidimensional
  property gets the same influence and speed, as with After Effects' own Easy
  Ease. Separate the dimensions if you need per-axis timing.
- **Skips are silent.** This is the one tool without per-property refusal
  messages. Properties that cannot vary over time, have fewer than two selected
  keyframes, or hold non-numeric values (mask paths, text documents, colours) are
  passed over without saying which; if nothing at all could be eased you get
  `Select 2+ keyframes on an animated property first.` Bringing this in line with
  the other three tools is a known gap.
- **Zero-length segments are skipped** — two keyframes at the same time have no
  duration to distribute an ease over.

## Anchor Point

Refuses, with a reason naming the layer and its `matchName`:

- **Animated anchor or position** — the compensation is a one-off write, correct
  only at the current frame.
- **Animated scale or rotation** — same reason: the correction is computed
  through the transform matrix at one instant, so the layer would drift on every
  other frame.
- **Separated position dimensions** — X and Y become distinct properties that a
  combined write cannot reach.
- **3D layers with X/Y rotation or orientation** — the compensation covers 2-D
  transforms and Z rotation. Z-only rotation works. Full 3D is on the roadmap
  under *considering*.
- **Cameras and lights** — no source rectangle exists to anchor to.
- **Zero-size layers** — an empty shape layer, or text with no glyphs at the
  current frame.

Shape group mode additionally requires:

- **Exactly one top-level group in the layer.** After Effects exposes no
  per-group bounding box; a group's box can only be derived when the layer's own
  rectangle provably describes that group alone.
- **No rotation on the group transform** — un-rotating the layer's axis-aligned
  rectangle yields a box larger than the real content, which would place the
  anchor wrongly.

Behaviour worth knowing:

- **Text bounding boxes are per-frame.** The box covers the glyphs actually drawn
  at the current time, so with animated Source Text or text animators the
  resulting anchor is the one for that frame. Park the playhead where you want it
  before applying.

## Sequencing

- **Moves `startTime`, never `inPoint`.** Layers slide whole and keyframes travel
  with them. Trimming via `inPoint` would look correct in the timeline while
  silently cutting the head off your animation.
- **Order is never click order.** After Effects does not preserve selection
  order, so the cascade is derived from an explicit criterion — timeline,
  reverse, in-point, or a seeded shuffle — instead of something that would change
  between runs on the same selection.
- **Locked layers are skipped**, and are removed *before* the order is resolved,
  so a layer that cannot be written never becomes the anchor everything else
  staggers against. If fewer than two writable layers remain, nothing is applied.
- **The first layer in the resolved order does not move.** Which layer that is
  depends on the chosen order.
- **No sequencing by marker or audio track.** Not implemented.

## Expression Effects

- **Requires 2+ keyframes.** Both effects scale the velocity going into the last
  keyframe; with nothing to measure the expression would evaluate to a no-op that
  looks like the tool silently failed.
- **Existing expressions are never overwritten.** Hand-written expression work is
  not something a later undo recovers.
- **`Clear` removes any expression in the selection**, including hand-written
  ones — not just those written by this tool. Expressions from H-Toolbelt carry a
  `// H-Toolbelt` first line if you want to check before clearing.
- **Numeric properties only** — 1D, 2D and 3D values. Colours, masks, shape paths
  and text documents are refused.
- **Parameters are baked in at apply time.** Changing Amp/Freq/Decay afterwards
  does not update expressions already applied; Clear and re-apply, or edit the
  `amp` / `freq` / `decay` variables at the top of the generated expression.
- **No Expression Controls are created.** The layer stays clean; the trade-off is
  that retuning means re-applying or editing the text.
- **Generated text is ES3** so it runs under both the JavaScript and Legacy
  ExtendScript expression engines. That constrains the text to older syntax, but
  costs nothing in behaviour.

## Shape Layer Magic

The v1 tool is **cleanup only** — it deletes, and never restructures. Full detail
in [docs/shape-layer-magic.md](./docs/shape-layer-magic.md).

- **No flatten, and it is not a scheduling gap.** Collapsing identity-transform
  wrapper groups is impossible to do safely from ExtendScript: `parentProperty` is
  read-only and no API call moves a property group to a new parent, so flattening
  would mean rebuilding the contents — which cannot carry gradient ramps (not
  readable or writable from ExtendScript), keyframes or expressions across.
  Separately, an identity transform does not make a group a no-op: a group scopes
  its fills and its Trim/Merge/Offset/Repeater operators, so hoisting its children
  into a parent that holds other paths changes what those operators affect. The
  appearance would change, which the tool must never do.
- **No merging of several shape layers into one.** Needs the same rebaking, plus
  transform reconciliation between layers.
- **The artboard match is deliberately narrow.** A top-level group qualifies only
  with an identity transform, exactly one drawable item which is a rectangle,
  Size matching the comp frame and Position `[0,0]` within 1 px, no keyframes or
  expression on either, and nothing else but fills and strokes. No match means
  nothing is removed — a cleanup tool that guesses is worse than one that misses.
- **Only top-level groups are examined for the artboard.** Illustrator puts the
  backdrop at the root; a comp-sized rectangle nested deeper is more likely to be
  deliberate artwork. A bare rectangle not wrapped in a group is also skipped,
  since only the group carries the transform that makes the size test meaningful.
- **Empty is defined by exclusion.** A group counts as empty only when its
  contents are exclusively other empty groups. Anything else — path, paint,
  operator, or a match name this build does not recognise — makes it non-empty.
  That errs towards leaving debris behind rather than deleting artwork.
- **A group After Effects refuses to delete is left in place** and not counted, so
  the number reported is what happened rather than what was attempted.

## Reporting something not listed here

If a tool refuses in a way you believe is wrong, please
[open an issue](../../issues) and include **the exact message the panel showed**.
The messages are written to be diagnostic — for Anchor Point they include the
layer's `matchName`, which usually identifies the cause immediately.
