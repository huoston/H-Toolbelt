# H-Toolbelt documentation

Usage guides for each tool in the panel. Every guide lists the exact messages the
tool can show you and what they mean — the panel refuses work it cannot do
safely, and the message tells you why.

| Guide                                    | What it covers                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| [Easings](./easings.md)                   | Cubic-bezier keyframe easing from presets or the draggable curve editor.  |
| [Anchor Point](./anchor-point.md)         | Moving a layer's anchor without the layer moving on screen.               |
| [Align & Distribute](./align.md)          | Aligning and spacing layers by their on-screen bounding box.              |
| [Sequencing](./sequencing.md)             | Staggering selected layers in time.                                       |
| [Expression Effects](./expressions.md)    | One-click bounce and elastic expressions, and clearing expressions.       |
| [Shape Layer Magic](./shape-layer-magic.md) | Cleaning up empty groups and artboard rectangles left by AI/SVG imports. |

See also:

- [Known limitations](../LIMITATIONS.md) — what the tools deliberately will not do.
- [Roadmap](../ROADMAP.md) — what is next, and what is only being considered.

## Finding your way around the panel

- **Tabs** carry an icon *and* a label — Motion, Transform, Shapes. On a very
  narrow docked panel the labels drop out and the icons remain; the tooltip still
  names each one.
- **Align and Distribute are icon-only**, because those six alignments are
  spatial and the glyph reads faster than the word. Hover any of them for a
  tooltip naming exactly what it does.
- **Named controls stay as text** — easing presets, loop types, Bounce/Elastic,
  Apply/Clear. An icon for "Ease Out Strong" would be a riddle, so those keep
  their names and gain tooltips.
- **Every button has a tooltip.** Nothing in the panel is a glyph you are
  expected to guess.

### Help / About

The **?** button in the panel header opens an About card with the version, the
author, links to [huoston.art](https://huoston.art/) and the
[GitHub repository](https://github.com/huoston/H-Toolbelt), and the licence.
Links open in your normal browser rather than inside the panel. Close it with the
× or with `Esc`.

## A note on refusals

Three of the five tools rewrite properties that already hold your work, and one
deletes. Where the maths cannot provably cover a case, the tool skips it and tells
you, rather than applying something approximate that looks fine now and reveals
itself as wrong much later.

So a message like `Animated scale/rotation: skipped Ball [ADBE AV Layer]` is not
an error. It is the tool declining a layer it cannot handle correctly, and naming
both the layer and its type so you can see exactly which one and why. The rest of
your selection is still processed.
