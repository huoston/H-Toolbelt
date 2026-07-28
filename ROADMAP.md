# Roadmap

Priority order, not a schedule. There are no dates here on purpose: this is a
side project, and a date would be a promise the project does not control.

Four states, and the differences matter:

- **Shipped** — released and in your hands.
- **Built** — merged and working, waiting on the next release.
- **Planned** — committed. Intended for the tab it sits under.
- **Considering** — not committed. Ideas being weighed, any of which may be
  dropped.

The panel is organised into tabs, so this document is too.

| Tab             | Shipped                                 | Next up                          |
| --------------- | --------------------------------------- | -------------------------------- |
| **Motion**      | Easings, Sequencing, Expression Effects | Loop Creator, then Timing suite  |
| **Transform**   | Anchor Point                            | —                                |
| **Shapes**      | Shape Layer Magic v1 *(built)*          | —                                |
| **Compositing** | — *(tab not shown until its first tool)*| Grounding, Atmosphere, Depth     |

---

## Motion

### Shipped — v0.1.0

- **Easings** — cubic-bezier keyframe easing from six presets or a draggable
  curve editor, converted to After Effects' native temporal ease.
- **Layer Sequencing** — `startTime` offsets with timeline, reverse, in-point and
  seeded-random ordering.
- **One-Click Expression Effects** — bounce and elastic in ES3 text compatible
  with both expression engines, plus Clear.

### Planned

- **Loop Creator.** Loop expressions on the selected properties: **Cycle**,
  **Ping-Pong**, **Offset** and **Continue**, with an optional keyframe count so
  a loop can cover the last N keyframes instead of the whole property, plus
  **Clear**. Reuses the Expression Effects infrastructure — the same ES3 text
  generation, the same refusal rules (never overwrite an existing expression,
  require enough keyframes to be meaningful), the same one-undo-group-per-run.
  First up because the machinery already exists and is tested.

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

### Changed — lands in v0.2.0

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

---

## Shapes

### Built — lands in v0.2.0

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
- **Depth colour grade** — Lumetri per depth band: warm foreground, cool
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
- **Calibrated bounce/elastic presets** — Soft / Medium / Hard, so the effects
  are usable without understanding what amplitude, frequency and decay do.
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
- **CEP → UXP migration.** Adobe's newer extensibility platform. CEP works today
  and is what After Effects CC 2019–2026 supports, but it is expected to be
  retired eventually. This is a rewrite of the panel layer, not of the tools'
  logic — the maths lives in framework-agnostic modules, which is partly why it
  was written that way.

---

## Implementation order, by risk

Lowest-risk first, so each step stands on something already proven. Every
technique is its own change.

1. **Tab shell** — done. Everything below needs somewhere to live that is not one
   long scroll.
2. **Loop Creator** — reuses tested expression machinery; almost no new risk.
3. **Frame-Rate Match** — one effect, one parameter; the smallest possible probe
   of "apply an effect and verify it exists first".
4. **The rest of the Timing suite** — keyframe arithmetic, no new AE surface.
5. **Compositing: Grounding → Atmosphere → Depth** — in that order. Grounding
   pays off most and uses the fewest effects; Depth needs camera data and is the
   most fragile.

---

## Explicitly not planned

- **Hosts other than After Effects.** The tools are built around AE's layer and
  property model.
- **Any network feature.** No telemetry, no update checks, no licence server. The
  panel works offline and will stay that way.

## Suggesting something

[Open a feature request](../../issues/new?template=feature_request.md) describing
the problem you are hitting, not only the feature you have in mind — the problem
is usually the more useful half.
