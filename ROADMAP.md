# Roadmap

Priority order, not a schedule. There are no dates here on purpose: this is a
side project, and a date would be a promise the project does not control.

Two categories, and the difference matters:

- **Next** — committed. Intended for the release named.
- **Considering** — not committed. Ideas being weighed, any of which may be
  dropped.

## Shipped — v0.1.0

- **Easings** — cubic-bezier keyframe easing from six presets or a draggable
  curve editor, converted to After Effects' native temporal ease.
- **Smart Anchor Point** — nine bounding-box anchor positions with `position`
  compensated through the transform matrix, so nothing moves on screen at any
  scale or rotation.
- **Layer Sequencing** — `startTime` offsets with timeline, reverse, in-point and
  seeded-random ordering.
- **One-Click Expression Effects** — bounce and elastic in ES3 text compatible
  with both expression engines, plus Clear.

See the [changelog](./CHANGELOG.md) for detail.

## Next — v0.2.0

- **Shape Layer Magic.** Cleanup and merge for imported shape layers: flattening
  redundant group nesting, merging layers, and stripping the artboard rectangles
  Illustrator imports bring along.

  Rescoped from the original idea. The tool was first conceived as an SVG
  importer, but After Effects 2026 imports SVG as native shape layers on its own.
  What it produces still needs tidying, so the useful work moved downstream of
  the import rather than replacing it.

- **Calibrated bounce/elastic presets** — Soft / Medium / Hard, so the effects
  are usable without understanding what amplitude, frequency and decay do.

## Considering

Not commitments. Roughly in order of how likely they are to happen.

- **Per-property refusal messages for Easings.** The other three tools name what
  they skipped and why; Easings skips silently. Closing that gap is the most
  obvious inconsistency in the panel today. See
  [LIMITATIONS](./LIMITATIONS.md#easings).
- **Usage GIFs in the README.** A motion-design tool that shows no motion is a
  poor advertisement for itself.
- **Producer signing certificate.** The `.zxp` is self-signed today, so
  installers warn that the publisher cannot be verified. A commercial certificate
  removes the warning; it costs money annually, hence "considering".
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

## Explicitly not planned

- **Hosts other than After Effects.** The tools are built around AE's layer and
  property model.
- **Any network feature.** No telemetry, no update checks, no licence server. The
  panel works offline and will stay that way.

## Suggesting something

[Open a feature request](../../issues/new?template=feature_request.md) describing
the problem you are hitting, not only the feature you have in mind — the problem
is usually the more useful half.
