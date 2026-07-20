# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Remove `<svelte:boundary>` (masks mount-time errors in CEP's CEF); error
  handling now via window handlers + mount try/catch + plain-DOM renderer. The
  boundary itself crashed while handling the original mount error, hiding the root
  cause behind a second failure; the panel now relies solely on the global
  `error`/`unhandledrejection` handlers, the `mount()` try/catch, and the
  non-Svelte error renderer in `boot-guard.ts`.
- Debug build: sourcemaps on, minify off (temporary, until release). The panel
  bundle ships unminified with sourcemaps so runtime stack traces point to real
  file:line locations while the boot regression is diagnosed. See the
  `TODO(release)` in `vite.config.ts`.

### Fixed

- `CurveEditor` elided by TS import elision (svelte-preprocess); enable
  `verbatimModuleSyntax` on UI tsconfig; generalize bundle smoke test to cover
  imported component symbols. The component was used only in `main.svelte`'s
  template, so the per-block transpile dropped its import and the panel threw
  `CurveEditor is not defined` on mount — the same class of failure as the
  `EASING_PRESETS` fix below, which had only been patched per-symbol.
  `verbatimModuleSyntax: true` on the UI tsconfig (not the ExtendScript host)
  emits imports exactly as written, killing the whole class; type-only imports
  are now marked `import type`. The smoke test previously passed on the broken
  bundle because it checked only preset label tokens; it now derives the checked
  symbols from the UI sources and asserts each has a real *definition* in the
  bundle — a bare presence check would not catch this, since the compiled
  template still contains the `CurveEditor(...)` call site after the definition
  is elided.
- `main.svelte`: import `EASING_PRESETS` from `shared/easing` (ReferenceError on
  mount). The preset list was used only in the `{#each}` template, so
  svelte-preprocess's isolated per-block TypeScript transpile elided the import as
  unused and it never reached the bundle — `EASING_PRESETS is not defined` on
  mount. Binding the constant into component scope (`const presets =
  EASING_PRESETS`) keeps the import alive through the transpile; the array now
  inlines into the panel bundle.
- Defensive `appSkinInfo` parsing with dark fallback (guards every level). The
  theming reader validates `hostEnvironment`, `appSkinInfo`, each color node and
  its numeric components before use, warning and keeping the dark fallback on any
  unexpected shape instead of throwing.
- Panel blank screen on boot: guard `appSkinInfo` theming with dark fallback; add
  visible runtime error boundary. Theming is now lazy and fully guarded (no CEP
  access at module top level), the UI renders from fixed dark CSS variables
  before any host call, and global `error`/`unhandledrejection` handlers plus a
  Svelte boundary render any failure as visible text instead of a black panel.

### Added

- Draggable cubic-bezier curve editor (presets load into editor; Apply uses
  validated engine). The Easings section now hosts an SVG `CurveEditor` with two
  pointer-draggable handles (clamped to x,y ∈ [0,1]) and a live numeric readout;
  preset buttons load their curve into the editor instead of applying directly,
  and a single Apply button sends the current curve — preset or hand-tuned — to
  the unchanged `applyEasing` engine.
- Bundle smoke test guarding against symbol elision. `scripts/smoke-bundle.mjs`
  (run via `yarn smoke`, and in the release CI) asserts the six preset labels and
  the `0.333` control-point value survive into the production bundle, failing the
  build on the P02a-style `sveltePreprocess` template-only import elision.
- Non-zero-speed unit test: exercises `bezierToTemporalEase` with a steep,
  hand-tuned curve so the velocity path (zeroed by all six presets) is covered.
- Easings tool (engine + presets): applies native temporal ease
  (influence/speed) to selected keyframes via six cubic-bezier preset buttons.
  Includes a pure, unit-tested bezier→temporal-ease conversion engine reused by
  the upcoming curve editor, and an AE-themed panel driven by `appSkinInfo`.
- Project scaffold: bolt-cep (Svelte + TypeScript) CEP extension targeting Adobe
  After Effects (`AEFT`, host range `[16.0,99.9]`), bundle id
  `com.huoston.htoolbelt`.
- Rebranded placeholder panel confirming the panel loads in After Effects.
- GPL-3.0-or-later license, project documentation, `.gitignore`, and a
  GitHub Actions release workflow that packages the signed `.zxp` on tags.
