# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Debug build: sourcemaps on, minify off (temporary, until release). The panel
  bundle ships unminified with sourcemaps so runtime stack traces point to real
  file:line locations while the boot regression is diagnosed. See the
  `TODO(release)` in `vite.config.ts`.

### Fixed

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
