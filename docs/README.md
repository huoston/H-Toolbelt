# H-Toolbelt documentation

Usage guides for each tool in the panel. Every guide lists the exact messages the
tool can show you and what they mean — the panel refuses work it cannot do
safely, and the message tells you why.

| Guide                                    | What it covers                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| [Easings](./easings.md)                   | Cubic-bezier keyframe easing from presets or the draggable curve editor.  |
| [Anchor Point](./anchor-point.md)         | Moving a layer's anchor without the layer moving on screen.               |
| [Sequencing](./sequencing.md)             | Staggering selected layers in time.                                       |
| [Expression Effects](./expressions.md)    | One-click bounce and elastic expressions, and clearing expressions.       |

See also:

- [Known limitations](../LIMITATIONS.md) — what the tools deliberately will not do.
- [Roadmap](../ROADMAP.md) — what is next, and what is only being considered.

## A note on refusals

Three of the four tools rewrite properties that already hold your work. Where the
maths cannot provably cover a case, the tool skips it and tells you, rather than
applying something approximate that looks fine now and reveals itself as wrong
much later.

So a message like `Animated scale/rotation: skipped Ball [ADBE AV Layer]` is not
an error. It is the tool declining a layer it cannot handle correctly, and naming
both the layer and its type so you can see exactly which one and why. The rest of
your selection is still processed.
