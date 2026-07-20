# H-Toolbelt

[![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](./LICENSE)
[![Platform: After Effects](https://img.shields.io/badge/host-After%20Effects-9999FF.svg)](https://www.adobe.com/products/aftereffects.html)
[![Version: 0.1.0](https://img.shields.io/badge/version-0.1.0-brightgreen.svg)](../../releases)

A motion-design toolbelt for Adobe After Effects — a single CEP panel that bundles
several everyday automation tools behind one dockable interface.

## Tools

Four tools ship in **v0.1.0**:

| Tool                   | What it does                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| **Easings**            | Apply cubic-bezier keyframe easing from presets or a draggable curve editor.                          |
| **Anchor Point**       | Move a layer's anchor to any of nine bounding-box points, compensating `position` so nothing shifts.   |
| **Sequencing**         | Stagger selected layers in time by a frame offset, ordered by timeline, in-point, or a seeded shuffle. |
| **Expression Effects** | One-click bounce and elastic expressions on the selected properties, plus Clear.                       |

Planned for a later release:

| Tool                  | What it will do                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shape Layer Magic** | Clean up and merge imported shape layers — After Effects 2026 imports SVG natively, and what it produces usually needs flattening, regrouping and tidying. |

### Notes on behaviour

- **Anchor Point — text layers:** the bounding box covers the glyphs actually
  drawn at the current frame, so with animated Source Text or text animators the
  box (and therefore the resulting anchor) differs frame to frame.
- **Anchor Point / Sequencing / Expressions refuse rather than guess.** A layer
  or property the tool cannot safely handle — animated transforms, separated
  position dimensions, rotated 3D, an existing expression, fewer than two
  keyframes — is skipped with a reason in the feedback line, and the rest of the
  selection still gets processed.
- **Sequencing moves `startTime`,** never `inPoint`, so keyframes travel with
  their layer and nothing is trimmed.
- **Expression text is ES3,** so it runs under both of After Effects' expression
  engines, including Legacy ExtendScript.

## Compatibility

- **Host:** Adobe After Effects, **CC 2019 (16.0) through 2026 (26.x)**.
- **OS:** Windows and macOS.
- **Runtime:** offline — the panel never requires a network connection at runtime.

## Install (end users)

1. Download the latest signed `.zxp` from the [Releases](../../releases) page.
2. Install it with a ZXP installer such as
   [ZXP/UXP Installer](https://aescripts.com/learn/zxp-installer/) or
   [Anastasiy's Extension Manager](https://install.anastasiy.com/).
3. Restart After Effects and open the panel from
   **Window → Extensions → H-Toolbelt**.

> **The `.zxp` is self-signed.** It carries a certificate generated for this
> project rather than one from a commercial authority, so the installer may warn
> that the publisher cannot be verified. That is expected; the signature proves
> the package has not been altered since it was built, not who built it.

## Build from source

Requires [Node.js](https://nodejs.org/) 20 LTS (or newer) and
[Yarn](https://classic.yarnpkg.com/) (classic).

```bash
yarn install       # install dependencies
yarn build         # release build (minified), symlinked into the CEP extensions folder
yarn build:debug   # unminified build with sourcemaps, for development
yarn zxp           # build and package a signed .zxp into dist/zxp/
yarn dev           # run the panel with hot-module reload for development
```

Checks:

```bash
yarn test          # unit tests for the pure shared modules
yarn typecheck     # type-check the ExtendScript host and the Svelte UI
yarn smoke         # debug build + bundle symbol check + host ES3 check
```

To load an unsigned development build, enable CEP `PlayerDebugMode` for your
After Effects CSXS version, then open **Window → Extensions → H-Toolbelt**.

## License

Distributed under the **GNU General Public License v3.0 or later**
(`GPL-3.0-or-later`). See [LICENSE](./LICENSE) for the full text.

## Author

Dr. Huoston Rodrigues — <https://huoston.art/>
