# H-Toolbelt

[![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](./LICENSE)
[![Platform: After Effects](https://img.shields.io/badge/host-After%20Effects-9999FF.svg)](https://www.adobe.com/products/aftereffects.html)
[![Status: work in progress](https://img.shields.io/badge/status-work%20in%20progress-orange.svg)](#status)

A motion-design toolbelt for Adobe After Effects — a single CEP panel that bundles
several everyday automation tools behind one dockable interface.

> ## Status
>
> **Work in progress.** This repository currently contains only the project
> scaffold: a functional, rebranded bolt-cep placeholder panel that proves the
> build/package/install toolchain end-to-end. **None of the tools below are
> implemented yet** — they are planned and will land in subsequent releases.

## Planned tools

| Tool                   | What it will do                                             |
| ---------------------- | ---------------------------------------------------------- |
| **Easings**            | Apply and manage keyframe easing presets.                  |
| **Anchor Point**       | Reposition layer anchor points without shifting the layer. |
| **Expression Effects** | Insert and manage reusable expression-driven effects.      |
| **Sequencing**         | Sequence, stagger, and offset layers in time.              |
| **Shape Layer Magic**  | Shape-layer creation and manipulation helpers.             |

**Anchor Point — text layers:** the bounding box covers the glyphs actually drawn
at the current frame, so with animated Source Text or text animators the box (and
therefore the resulting anchor) differs frame to frame.

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

## Build from source

Requires [Node.js](https://nodejs.org/) 20 LTS (or newer) and
[Yarn](https://classic.yarnpkg.com/) (classic).

```bash
yarn install     # install dependencies
yarn build       # build the panel and symlink it into the CEP extensions folder
yarn zxp         # build and package a signed .zxp into dist/zxp/
yarn dev         # run the panel with hot-module reload for development
```

To load an unsigned development build, enable CEP `PlayerDebugMode` for your
After Effects CSXS version, then open **Window → Extensions → H-Toolbelt**.

## License

Distributed under the **GNU General Public License v3.0 or later**
(`GPL-3.0-or-later`). See [LICENSE](./LICENSE) for the full text.

## Author

Dr. Huoston Rodrigues — <https://huoston.art/>
