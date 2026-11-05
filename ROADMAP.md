# Roadmap

Priority order, not a schedule. There are no dates here on purpose: this is a
side project, and a date would be a promise the project does not control.

Four states, and the differences matter:

- **Shipped** — released and in your hands.
- **Built** — merged and working, waiting on the next release.
- **Planned** — committed. Intended for the tab it sits under.
- **Considering** — not committed. Ideas being weighed, any of which may be
  dropped.

The panel is organized into tabs, so this document is too.

| Tab             | Shipped                                                         | Next up                                                       |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| **Motion**      | Easings, Layer Sequencer, Dynamics *(built)*, Loops *(built)*   | Expression composer, easings between keyframes, Timing suite  |
| **Transform**   | Anchor Point, Align *(built)*                                   | Align: 3-D, parent, key layer                                 |
| **Shapes**      | Shape Layer Magic v1 *(built, tab hidden)*                      | —                                                             |
| **Compositing** | — *(tab not shown until its first tool)*                        | Grounding, Atmosphere, Depth                                  |

---

## Motion

### Shipped — v0.1.0

- **Easings** — cubic-bezier keyframe easing from six presets or a draggable
  curve editor, converted to After Effects' native temporal ease.
- **Layer Sequencing** — `startTime` offsets with timeline, reverse, in-point and
  seeded-random ordering.
- **One-Click Expression Effects** — bounce and elastic in ES3 text compatible
  with both expression engines, plus Clear.

### Shipped — v0.2.0

- **Loop Creator**, shown as **Loops**. Loop expressions on the selected properties:
  **Cycle**, **Ping-Pong**, **Offset** and **Continue**, in either direction, with an
  optional keyframe count, plus **Clear**. Continue refuses an eased end keyframe.
- **Dynamics**, the new name of Expression Effects. Six baked presets (Bounce and
  Elastic, each Soft, Medium and Hard) as cards. Eased arrivals are refused instead
  of applying an invisible effect.
- **Easings library** — 23 curves as cards that draw their own shape.
- **Layer Sequencer**, the new name of Layer Sequencing.
- **In-panel help** — a card on every section with steps and notes.

### Planned

- **Expression composer.** After Effects allows one expression per property, so
  Loops and Dynamics cannot share one today. The plan is a single H-Toolbelt
  expression per property, built from stages that each tool turns on, changes or
  off. [Issue #1](https://github.com/huoston/H-Toolbelt/issues/1)

- **Penner easings between keyframes.** Back, Elastic and Bounce (In, Out and
  In-Out), so an eased arrival can still overshoot. They will appear as cards in the
  Dynamics section. [Issue #2](https://github.com/huoston/H-Toolbelt/issues/2)

- **Timing suite.** Five small tools that share one idea — putting keyframes and
  layers back on the frame grid:
  - **Frame-Rate Match** — Posterize Time at the puppet's own frame rate, so live
    footage and stop-motion sit at the same cadence. The stop-motion golden rule
    is 12 fps.
  - **Snap-to-Frame** — round sub-frame keyframes onto whole frames.
  - **Time Reverse** — reverse a layer or a keyframe selection.
  - **Retime %** — time-stretch by a percentage.
  - **Hold Frames** — stepped interpolation on the selection.

---

## Transform

### Shipped — v0.1.0

- **Smart Anchor Point** — nine bounding-box anchor positions with `position`
  compensated through the transform matrix, so nothing moves on screen at any
  scale or rotation.

### Shipped — v0.2.0

- **Anchor Point now handles animated layers**, in the same grid. It detects
  animation itself and branches internally, so the user never has to know in
  advance which case they have. A static layer does not move at all; an animated
  one has its whole position track shifted by one vector, evaluated at the
  current time, so the **motion path keeps its shape, its keyframe count and its
  eases** and a rotating layer starts turning about the new anchor — which is the
  point of moving a pivot.

  This absorbed the separate Re-pivot tool, which briefly existed as its own
  section. No null parenting and no resampling: the anchor of the layer itself
  moves. Still refused: an expression on position, a keyframed anchor, separated
  position dimensions, and rotated 3D.

### Built — lands in v0.2.0

- **Align & Distribute** — six alignments plus horizontal and vertical
  distribution, both governed by one **Align to** toggle. Unlike After Effects'
  own Align, it measures the layer's bounding box **in composition space**, so a
  rotated or scaled layer aligns by what is on screen rather than by its
  untransformed rectangle. Animated layers keep their motion path, exactly as
  Anchor Point does.

  Against the **comp**, distribution pushes the outermost layers until their
  edges touch the frame and spreads the rest between; against the **selection**,
  the extremes stay put and only the middle moves.

### Planned — Align v2

Deliberately out of v1, in rough order of usefulness:

- **3-D layers and alignment in Z.** The geometry already works on 3-component
  points so depth is an added axis rather than a rewrite, but a 3-D layer's
  screen box depends on the active camera — a different computation, not a flag.
  3-D layers are refused by name today rather than silently mishandled.
- **Align via Parent.** A parented layer's `position` is in its parent's space,
  so a comp-space delta would misplace it; these are refused for now. Handling
  them means transforming the delta back through the parent chain.
- **Align to a key layer** — one selected layer as the target, instead of the
  comp or the whole selection.
- **Distribute by equal edge gaps** — equal *space between* boxes rather than
  equal spacing between centers. Both distribute modes place interior layers by
  center today, which is right for uniformly sized layers and looks uneven when
  sizes differ.
- **Aligning shapes within a single layer.** Refused today with a message saying
  so. After Effects exposes no per-group bounding box to scripting —
  `sourceRectAtTime` reports the whole layer — the same wall that stopped shape
  flattening in Shape Layer Magic. Supporting it means deriving each group's
  bounds from its own path data, so it is one investigation serving both tools.

---

## Shapes

### Shipped hidden — in the code since v0.2.0

The Shapes tab is hidden, because one cleanup tool does not justify a tab. The code
and its page stay in the repository, and the tool returns when the tab has more to
offer.

- **Shape Layer Magic (v1)** — cleanup for Illustrator/SVG imports: **remove
  empty groups** and **remove the artboard rectangle**, plus **Clean all** which
  runs both under one undo group. Both operations are pure deletion.

  Flattening wrapper groups and merging layers are deliberately **not** in v1:
  ExtendScript exposes no call that moves a shape group to a new parent, and
  rebuilding the contents instead cannot carry gradients, keyframes or
  expressions across. Full reasoning in
  [docs/shape-layer-magic.md](./docs/shape-layer-magic.md).

---

## Compositing

A **planned tab**. It is not rendered in the panel yet — an empty tab is a
promise the panel cannot keep — and appears with its first tool.

These are the techniques the tab is being built around, grouped by what they do
to a shot. Each becomes its own tool.

### Grounding — first, because the payoff is largest

Making a subject belong to the plate it was placed on.

- **Fake Shadow** — duplicate the layer, CC Power Pin to skew it onto the ground
  plane, Tint to black, Gaussian Blur, Multiply, opacity 40–70%.
- **Reflection** — duplicate, Scale Y −100%, position beneath the subject,
  opacity 20–40%, blur, and a gradient mask so it falls off with distance.
- **Water Reflection** — an add-on to Reflection: Displacement Map driven by
  animated Fractal Noise.

### Atmosphere

- **Atmospheric Haze** — a solid with Fractal Noise, blended Screen or Add.
- **Atmospheric Particles** — either footage blended Screen/Add with Tint and
  Time Stretch, or CC Particle World. Presets for dust, fog, snow, rain, embers
  and sparkle, placeable above or below the subject.
- **Godrays** — CC Light Rays with a wiggle on the intensity so the beam
  breathes; CC Radial Blur (Zoom) as the alternative route.

### Depth

- **DOF Blur** — Camera Lens Blur driven by distance from camera.
- **Depth color grade** — Lumetri per depth band: warm foreground, cool
  background, desaturated far distance.

### Sync

- **Frame-Rate Match** — the same Posterize Time tool listed under Timing. It
  belongs to both and will be built once.

### Dependency note

Cycore (**CC Power Pin**, **CC Particle World**, **CC Light Rays**, **CC Radial
Blur**) and **Lumetri** ship with After Effects, so in practice they are present.
"In practice" is not a guarantee, and an effect that silently fails to apply is
worse than one that refuses: every tool here must **check that the effect exists
before applying it** and refuse with a message naming what is missing, in line
with how the rest of the panel behaves.

---

## Considering

Not commitments. Roughly in order of how likely they are to happen.

- **Per-property refusal messages for Easings.** The other tools name what they
  skipped and why; Easings skips silently. Closing that gap is the most obvious
  inconsistency in the panel today. See [LIMITATIONS](./LIMITATIONS.md#easings).
- **Usage GIFs in the README.** A motion-design tool that shows no motion is a
  poor advertisement for itself.
- **Producer signing certificate.** The `.zxp` is self-signed today, so
  installers warn that the publisher cannot be verified. A commercial certificate
  removes the warning; it costs money annually, hence "considering".
- **Shape flatten and layer merge, done properly.** Both need transforms rebaked
  into path data rather than groups collapsed, since a group scopes its fills and
  its Trim/Merge/Offset/Repeater operators — an identity transform does not make
  it a no-op. Real geometry work, not a follow-up patch.
- **3D rotation support in Anchor Point.** Currently refused for 3D layers with
  X/Y rotation or orientation, because the compensation covers 2-D transforms and
  Z rotation. Extending it to the full 3-D transform is tractable, just not done.
- **Listing on aescripts + aeplugins.** Wider reach than GitHub Releases for the
  audience this is built for. The panel would stay free and GPL.
- **CEP → UXP migration.** Adobe's newer extensibility platform. CEP works today,
  but it is expected to be retired eventually. This is a rewrite of the panel layer, not of the tools'
  logic — the math lives in framework-agnostic modules, which is partly why it
  was written that way.

---

## Implementation order, by risk

Lowest-risk first, so each step stands on something already proven. Every
technique is its own change.

1. **Tab shell** — done. Everything below needs somewhere to live that is not one
   long scroll.
2. **Loop Creator** — done. It reused tested expression machinery.
3. **Expression composer** ([issue #1](https://github.com/huoston/H-Toolbelt/issues/1)) — one expression per
   property, so the tools that write expressions can work together.
4. **Penner easings between keyframes** ([issue #2](https://github.com/huoston/H-Toolbelt/issues/2)) — they
   become a stage of that same expression.
5. **Frame-Rate Match** — one effect, one parameter; the smallest possible probe
   of "apply an effect and verify it exists first".
6. **The rest of the Timing suite** — keyframe arithmetic, no new AE surface.
7. **Compositing: Grounding → Atmosphere → Depth** — in that order. Grounding
   pays off most and uses the fewest effects; Depth needs camera data and is the
   most fragile.

---

## Explicitly not planned

- **Hosts other than After Effects.** The tools are built around AE's layer and
  property model.
- **Any network feature.** No telemetry, no update checks, no license server. The
  panel works offline and will stay that way.

## Suggesting something

[Open a feature request](https://github.com/huoston/H-Toolbelt/issues/new?template=feature_request.md) describing
the problem you are hitting, not only the feature you have in mind — the problem
is usually the more useful half.
