# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Re-pivot (Transform tab): change the anchor of a layer with animated position
  by re-baking position keyframes; refuses cases with animated scale/rotation.
  This is exactly the case Smart Anchor Point declines — that tool performs a
  single position write, which cannot compensate a value that changes over time.
  Both now sit in the Transform tab and the safe one is unchanged.

  **Why only static scale and rotation are exact.** Keeping `comp(p, t) =
  position(t) + R(t)·S(t)·(p − A)` identical while the anchor moves to `A'`
  requires `position'(t) = position(t) + R(t)·S(t)·(A' − A)`. With `R` and `S`
  constant that correction is one fixed vector, so adding it to every keyframe
  translates the motion path rigidly — and since the interpolation between two
  shifted keyframes is the shifted interpolation, the result is exact at every
  frame, not merely at the keyframes. If `R` or `S` are animated the correct
  offset varies with time, so writing one value per existing keyframe would be
  right at those instants and wrong between them: the layer drifts mid-tween
  while looking perfect wherever the user parks the playhead to check. That is
  refused, pointing at the manual technique that does work (parent to a null).

  Only keyframe *values* are written, via `setValueAtTime` at each keyframe's
  existing time, so times, interpolation and eases stay as the user set them;
  spatial tangents are relative to their keyframe, so the path translates with
  its handles intact. Every keyframe is read before any is written. Also refused:
  animated or expression-driven anchor, an expression on position (it would
  override the writes, so the tool would report success while changing nothing),
  separated position dimensions, rotated 3D, and layers with no usable bounds —
  each naming the layer and its `matchName`. Re-running against the same target
  computes a zero correction and is skipped rather than rewriting every keyframe
  with the value it already holds.

  The matrix maths is imported from `shared/anchor` unchanged — the offset is
  `computeAnchorMove` called with a zero current position, which makes its
  `newPosition` the bare correction term. Re-baking lives in the new pure,
  unit-tested `shared/repivot`, whose tests verify the layer stays pinned at
  several probe points across scale, rotation and negative-scale cases, not just
  at the anchor.

- Loop Creator (Motion tab): cycle/ping-pong/offset/continue loop expressions
  with direction and keyframe count; reuses expression Clear. The lowest-risk
  tool of the new batch — it mirrors Expression Effects exactly (pure tested
  generator, ES3 text, host guards, one undo group per run), and `loopOut` /
  `loopIn` calls are inherently ES3, so the syntax constraint costs nothing.

  `continue` never receives the keyframe-count argument. The other three modes
  replay a *segment* of the animation, so a count means something to them;
  `continue` extrapolates from the velocity at the last keyframe and has no
  segment to count. After Effects ignores a second argument there rather than
  erroring, which is precisely why it must not be emitted — `loopOut("continue",
  2)` would sit in the user's expression field looking like a setting that does
  something. The panel disables the field for the same reason.

  The count is clamped to 1000 rather than passed through: JavaScript switches to
  exponent notation at 1e21, and a stray `loopOut("cycle", 1e+21)` reads as a
  typo in the expression field the user is about to inspect. Same reasoning as
  `formatNumber` in `shared/expressions`. A unit test caught this.

  The guards match the existing expression tool: never overwrite an existing
  expression, refuse properties that reject expressions or whose value type the
  loop does not cover, and require 2+ keyframes — a loop replays the span between
  keyframes, so with one keyframe `loopOut` returns a constant and the property
  would look untouched while carrying an expression. Clear calls the existing
  `clearExpressions` host function; removing an expression does not depend on
  which tool wrote it, so `expressions.ts` is untouched on both sides.

- Shape Layer Magic (v1): remove empty groups, remove artboard rectangle, and a
  Clean all that runs both under one undo group. Cleanup for what an Illustrator
  or SVG import leaves in a shape layer. Both operations are pure deletion, so
  anything surviving a run is untouched rather than recreated, and both are
  idempotent. A group counts as empty only when its contents are exclusively
  other empty groups — defined by exclusion rather than by listing drawable match
  names, because such a list has to stay exhaustive forever or it starts deleting
  artwork the day Adobe adds an operator to it. The artboard match is deliberately
  narrow: a top-level group with an identity transform, exactly one drawable item
  which is a rectangle sized to the comp frame at position `[0,0]` within 1 px,
  no keyframes or expression on either, and nothing else but paint. The identity
  requirement is load-bearing rather than decorative — a 960x540 rectangle inside
  a group scaled 200% does cover a 1920x1080 comp, and a comp-sized rectangle in a
  group scaled 50% does not. Each operation collects its targets across the whole
  tree before deleting any of them, so no traversal reads a group whose siblings
  were renumbered underneath it. The predicates (`isIdentityTransform`,
  `isArtboardRect`) live in the pure, unit-tested `shared/shape` module.

  **Flatten is deliberately absent, on API grounds.** Collapsing
  identity-transform wrapper groups needs a shape group moved to a new parent, and
  ExtendScript has no such call: `parentProperty` is read-only, `moveTo` reorders
  within the existing parent, and `duplicate` copies in place. Rebuilding the
  contents instead cannot be faithful — gradient ramp data is neither readable nor
  writable from ExtendScript, so every gradient would return as a default, and
  keyframes and expressions on each descendant would each need their own
  reconstruction. Independently of the API, the premise is unsound: a group is a
  scope, not merely a transform, so hoisting the children of an identity-transform
  group into a parent holding other paths merges the scopes its fills and its
  Trim/Merge/Offset/Repeater operators rely on, changing the layer's appearance.
  The panel ships no Flatten button and says why in the section itself.

- Documentation: per-tool usage docs, known limitations, roadmap, issue
  templates. `docs/` carries one page per tool — steps, options with their actual
  defaults, and a table of every refusal message with its cause and remedy, taken
  from the host sources rather than from memory. `LIMITATIONS.md` consolidates
  what the tools deliberately will not do, including project-wide constraints
  (self-signed `.zxp`, After Effects only, CEP rather than UXP, offline by
  design). `ROADMAP.md` separates what is committed for v0.2.0 from what is
  merely under consideration, with no dates. The bug template leads with the
  message shown in the panel, since the refusals are written to be diagnostic.

### Changed

- Re-pivot now preserves the motion path: it shifts position keyframes by a
  constant offset (evaluated at the current time) and moves the anchor, so eases
  and path shape are kept and rotation/scale re-pivot around the new point.
  Removed per-frame resampling.

  The previous implementation optimised for the wrong invariant. It preserved
  the rendered *pixels* at every frame, which for a layer with animated rotation
  forces `position(t)` into an arc — describable only as one keyframe per frame,
  with the original eases baked away. It was arithmetically sound and it was the
  wrong thing: preserving the picture of a rotating layer means preserving the
  old pivot, which is exactly what the user asked to change.

  What a motion designer means by "move the anchor" is: the star keeps travelling
  the same path, and now spins about a different point. That is what this does.
  The offset `d = R(t_now)·S(t_now)·(A' − A)` is evaluated once, at the
  composition's current time, and added to every position keyframe. Because it is
  a single vector, distances and directions between keyframes are untouched — a
  straight path stays straight — times and eases survive since only values are
  written, and there is no jump at the frame the user is looking at when they
  click. Away from that frame the render does change, and that is the feature.

  One route now serves every layer, animated rotation or not, so `resampleLayer`,
  the sampling grid, the drift measurement and the 3000-keyframe ceiling are all
  gone, along with the refusal for expression-driven scale/rotation — that
  existed only because resampling needed a bounded time range, and evaluating at
  a single instant does not. A layer whose position has no keyframes has its
  static value shifted instead. All safety guards are unchanged (expression on
  position, animated anchor, separated dimensions, rotated 3D, camera/light), as
  is idempotency. The keyframe count no longer changes at all, which is now
  pinned by a regression test.

  Two routes, chosen by the host. With rotation and scale static the correction
  `R·S·(A' − A)` is one constant vector, so the existing keyframes are shifted
  and times, interpolation and eases all survive — unchanged from before, and
  still preferred whenever it applies. With rotation or scale animated the
  correction varies with time, so `position'(t)` is evaluated on the frame grid
  across the animated range and written back as dense linear keyframes.

  What that guarantees, precisely: **exact at every sampled time**, and since
  After Effects renders at frame times, exact at every rendered frame. Between
  samples the reconstruction is linear while the true correction curves, leaving
  a sub-frame deviation that only shows up where AE evaluates off-frame — motion
  blur, or a time-stretched or time-remapped nested comp. That residual is
  second-order in the step, so halving the interval quarters it; measured on a
  deliberately harsh synthetic case (180°/s rotation, scale swinging 40–160%, a
  curved position path) it runs 1.74px at 12fps, 0.44px at 24fps, 0.07px at
  60fps. The host measures it at the midpoint of every interval and reports the
  worst one in the feedback line rather than asserting it is negligible.

  **The cost is real and is stated in the panel:** the sampled route replaces
  position keyframes with one per frame, so the original eases are baked into
  the values instead of surviving as curve handles. New keyframes are forced to
  linear, temporally and spatially — bezier or auto-bezier between one-frame
  samples would overshoot and invalidate the very number being reported.

  A layer with **static position and animated rotation** — a spinning star — has
  no position keyframes at all, and was being turned away by the "not animated"
  guard. That check now tests position, scale and rotation together, since
  testing position alone rejected exactly the layers this change is for.

  Every sample is read before anything is written, since the first write to
  position would change what later reads returned. New refusal: an expression on
  scale or rotation, which would make the correction vary across the whole
  timeline rather than a bounded keyframe range — resampling the entire comp is
  far more than was asked for, so it says to bake the expression first. A range
  needing more than 3000 keyframes is refused by frame count rather than sampled
  coarser, which would silently inflate the deviation. The existing guards
  (expression on position, animated anchor, separated dimensions, rotated 3D,
  camera/light) are unchanged, as is idempotency: a second run against the same
  target computes a zero correction and is skipped.

- Panel reorganized into tabs (Motion, Transform, Shapes); tools migrated without
  behavior change. The single scrolling column had stopped scaling at five tools
  and would not have survived the Timing and Compositing work. Each tool is now a
  self-contained component under `src/js/main/tools/`, reached only through its
  tab; Easings was the last one still inline in `main.svelte` and moved out
  verbatim, styles included — Svelte scopes styles per component, so left behind
  they would simply have stopped applying. `src/jsx/**` and `src/shared/**` are
  byte-identical: no host or shared logic was touched.

  **Tab switching toggles CSS `display`; it never uses `{#if}`.** Two reasons,
  neither cosmetic. State: the curve editor's hand-tuned bezier, the per-effect
  expression parameters and the sequencing order all live in component state, and
  a conditional block would reset them every time the user glanced at another
  tab. Mounting: this panel has already been broken twice by mount-time failures
  in CEP's CEF, and mounting every tool once on boot makes such a failure surface
  immediately and identically for everyone rather than hiding behind a tab nobody
  clicked. The bundle smoke test confirms all five tool components plus the tab
  shell survive into the build, since componentizing moves symbols into templates
  — exactly the elision pattern that caused P02a and P02b.

  The tab list is data-driven from `src/js/main/tabs.ts`, so a new tab is one
  entry. Compositing is deliberately absent until it has a tool: an empty tab
  reads as a bug, not as a roadmap.

- Roadmap rewritten around the tab structure, with the full plan: Loop Creator
  and the Timing suite under Motion, and a Compositing tab grouped into
  Grounding, Atmosphere, Depth and Sync. Records that every compositing tool must
  verify its effect (Cycore, Lumetri) is present before applying and refuse by
  name if not, and gives an implementation order by risk.

- Repository history normalized to a single author. Commit messages carry no
  co-authorship trailers, and `CONTRIBUTING.md` states the rule for future
  commits. File contents are untouched: every commit's tree hash is identical to
  what it was before, so only the messages and the commit identifiers changed.

## [0.1.0] - 2026-07-20

First release. Four tools, each with its math in a pure, unit-tested module
shared by the panel and the ExtendScript host, and each refusing the cases it
cannot handle safely rather than applying something hopeful.

### Added

- Release hardening. `yarn build` minifies again (the debug settings were a
  leftover from diagnosing the P02a blank-panel regression); `yarn build:debug`
  keeps the unminified build with sourcemaps, and the smoke test runs against
  *that*, because it proves symbols survived by looking for their bindings and
  minification renames those. The packaged ZXP ships without sourcemaps — the
  source is public under GPL-3.0, so they buy no secrecy and cost ~570 kB per
  install.
- `scripts/check-host-es3.mjs`: a guard against ES5+ *builtins* reaching the
  ExtendScript host. Modern syntax already fails loudly, but `Math.imul(a, b)`
  parses fine and throws only at runtime inside After Effects, in a path no Node
  test exercises — the seeded PRNG in `shared/sequence` was nearly written that
  way. The check parses the bundle and walks the AST rather than grepping it,
  because the host legitimately contains the string `Math.abs(...)` as After
  Effects expression *text*, and doc comments name these functions in prose;
  a textual scan flags both and inspires false confidence. Ambiguous cases
  (`.indexOf`, which is ES3 on String and ES5 on Array; `JSON`, provided by the
  bundled json2 polyfill) are reported as notes rather than silently allowed.
- `yarn typecheck:host` and `yarn typecheck:ui`. The host had never been
  type-checked: its tsconfig declares `target: "es3"`, removed in TypeScript 5.8,
  so `tsc` aborted with TS5108 before checking anything — and even had it run, the
  config loaded no After Effects typings at all, leaving `app`, `CompItem` and
  `Layer` as unresolved names. Both are fixed: a check-only tsconfig with a
  target TypeScript still accepts, and a triple-slash reference to the AE
  declarations in `global.d.ts` so every program including these sources picks
  them up.
- One-Click Expression Effects: bounce and elastic (ES3 text, compatible with
  both expression engines), plus Clear. The generated text is written in ES3 —
  `var`, no arrows, no template literals — because After Effects ships two
  expression engines and a project switched to Legacy ExtendScript treats modern
  syntax as a parse error, disabling the expression on the user's property; the
  forbidden constructs are pinned by tests, since the text is inert data to this
  repo's own build and only becomes a program inside AE. Both effects scale a
  decaying oscillation by the velocity going into the last keyframe, so the
  overshoot inherits the animation's own speed. Bounce rectifies the sine
  (`Math.abs(Math.sin(...))`) so every lobe pushes the same way; elastic leaves
  it signed. The oscillation factor stays scalar because `value` may be an array
  and `Math.abs(array)` is not legal in an expression. Parameters are baked into
  the text rather than created as Expression Controls. The host refuses
  properties that already carry an expression (never overwritten), that have
  fewer than two keyframes (nothing to measure, so the effect would be inert),
  that reject expressions, or whose value type the math does not cover — each
  refusal naming the properties. `Clear` removes expressions from the selection.
  One undo group per operation. Text generation lives in the pure, unit-tested
  `shared/expressions` module, whose tests also execute the generated program to
  confirm its dynamics.
- Layer Sequencing: startTime-based offsets with
  timeline/reverse/in-point/seeded-random ordering. Sequencing writes
  `startTime` and nothing else, so each layer slides whole — keyframes travel
  with it; writing `inPoint` instead would trim the layer and silently destroy
  the head of the user's animation while looking correct in the timeline. Order
  is never the click order, because `comp.selectedLayers` does not preserve it;
  the user picks an explicit criterion instead, and Random is driven by a seeded
  Park-Miller PRNG (not mulberry32, which needs `Math.imul` — absent from
  ExtendScript) so the same seed reproduces the same cascade. The resolved first
  layer keeps its start time and the rest stagger from it, so applying the tool
  never relocates the selection; negative offsets cascade backwards. Locked
  layers are dropped before ordering — not after — so a layer that cannot be
  written never becomes the anchor. Offsets are entered in frames and converted
  against `comp.frameDuration`. One undo group per operation. The ordering and
  time math live in the pure, unit-tested `shared/sequence` module.
- Smart Anchor Point Control: 9-point grid, transform-aware position
  compensation, guards against animated anchor/position. Moving a layer's anchor
  moves the layer, because `position` is measured from the anchor; the
  compensation sends the anchor delta through the scale and rotation matrix
  (`position' = position + R * S * (A' - A)`), so the object stays visually
  pinned at any scale or rotation — a naive delta sum is only correct at 100% /
  0°. The math lives in the pure, unit-tested `shared/anchor` module. The host
  refuses rather than guesses on: keyframed or expression-driven
  anchor/position, keyframed scale/rotation (a one-off position write cannot
  compensate a transform that changes over time), separated position dimensions,
  3D layers with X/Y rotation or orientation, and layers with no usable source
  rectangle. Shape groups are supported only where a group's bounding box is
  actually derivable — one top-level group, unrotated — and refused with an
  explicit reason otherwise, since After Effects exposes no per-group bounding
  box. One undo group per operation.

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

- `@esTypes` resolved to a stub (`{ [key: string]: (...args: any) => any }`),
  which made every `evalTS("name", ...)` call accept any name, any arguments and
  return `any` — the one place where UI and host must agree was the one place
  nothing checked that they did. It now points at `src/jsx`, whose `index.ts`
  exports the host's real signatures, and `svelte-check` (installed but never
  wired up) runs over the components that make those calls.
- Release CI ordering: `yarn smoke` ran after `yarn zxp`, and both `build:debug`
  and `zxp` begin with `rimraf dist/*` — so the checks would have deleted the
  packaged `.zxp` before the upload step could attach it.
- Anchor Point rejected shape and text layers: replace indirect `source`-based
  checks with matchName detection and empirical `sourceRectAtTime` validation;
  refusal messages now include matchName. Both symptoms came from one proxy —
  `instanceof AVLayer` — which ExtendScript does not satisfy for `ShapeLayer` or
  `TextLayer` even though both answer `sourceRectAtTime` (their `source` is null
  because they derive from no project item). Layer type is now read from
  `matchName`, and only `ADBE Camera Layer` / `ADBE Light Layer` are refused on
  type; every other layer, known type or not, has its bounding box probed for
  real (`try`/`catch` plus finite, positive `width`/`height`) instead of
  inferred. A zero-size box is reported separately as `Empty layer (zero-size
  bounds)`. The shape-group gate now tests the owning layer's `matchName` against
  `ADBE Vector Layer` rather than `instanceof`, so a group selected inside a
  shape layer proceeds. Safety guards are unchanged — animated
  anchor/position/scale/rotation, separated dimensions, rotated 3D and active
  expressions still refuse — and the compensation math in `shared/anchor` is
  untouched.
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
