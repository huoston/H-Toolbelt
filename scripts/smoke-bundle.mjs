/**
 * Bundle smoke test for H-Toolbelt.
 *
 * Guards the panel against TypeScript's import elision at BUILD time instead of
 * discovering it in the panel: svelte-preprocess transpiles each <script> block
 * in isolation (ts.transpileModule), so a symbol referenced only in a
 * component's template — never in its <script> — looks unused and is dropped,
 * throwing `ReferenceError: <symbol> is not defined` on mount. That is P02a
 * (EASING_PRESETS) and P02b (CurveEditor). The structural fix is
 * `verbatimModuleSyntax: true` in the UI tsconfig; this script is the net that
 * proves it stayed on.
 *
 * WHY THIS SCRIPT WAS GENERALIZED
 * The first version only checked a fixed list of preset label tokens. It passed
 * green on the P02b build in which `CurveEditor` had been elided and the panel
 * crashed on mount — the tokens it checked lived in a different module that
 * happened to survive. Any new component or symbol reintroduced the bug with a
 * green smoke test. It now derives what to check from the UI sources themselves.
 *
 * WHY IT CHECKS DEFINITIONS, NOT MERE PRESENCE
 * Searching the bundle for the bare string "CurveEditor" does NOT catch the bug:
 * the compiled template still contains the call site `CurveEditor(node, {...})`
 * even when the import — and therefore the component's definition — was elided.
 * Verified against a deliberately broken build: the string is present, the
 * `function CurveEditor(` binding is not. So every imported value must resolve
 * to a real binding (`function|const|let|var|class NAME`) in the bundle.
 *
 * Run after `yarn build` (the debug, non-minified bundle). Usage:
 *   node scripts/smoke-bundle.mjs
 *
 * Author: Dr. Huoston Rodrigues
 * Website: https://huoston.art/
 * Email: hello@huoston.art
 * Version: 0.2.0
 * Created: 2026-07-10
 * Modified: 2026-07-20
 * License: GPL-3.0-or-later
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ASSETS_DIR = join("dist", "cep", "assets");
// UI sources whose imports must survive into the panel bundle. The ExtendScript
// host (src/jsx) is a separate target and is deliberately out of scope.
const UI_SRC_DIRS = [join("src", "js", "main")];

// Runtime values that reach the bundle only through a shared module. Any one
// missing means the symbol carrying it was elided.
//
// These complement the imported-symbol scan below rather than duplicating it:
// that scan proves a binding named LOOP_TYPES exists, while these prove the
// array still has its contents. P02a was a values-vanished bug, not a
// names-vanished one.
const REQUIRED_TOKENS = [
  // shared/easing — EASING_PRESETS
  '"Easy Ease"',
  '"Ease Out"',
  '"Ease In"',
  '"Ease In-Out"',
  '"Ease Out Strong"',
  '"Ease In-Out Strong"',
  "0.333",
  // shared/loop — LOOP_TYPES / LOOP_DIRECTIONS ids, which are also the strings
  // baked into the generated expression text.
  '"pingpong"',
  '"continue"',
  '"Ping-Pong"',
];

const fail = (msg) => {
  console.error(`smoke: ${msg}`);
  process.exit(1);
};

/** Recursively collect .svelte/.ts sources under a directory. */
const collectSources = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSources(full));
    } else if (/\.(svelte|ts)$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
};

/** `./CurveEditor.svelte` -> `CurveEditor`, `./main.svelte` -> `Main`. */
const componentName = (specifier) => {
  const base = specifier.split("/").pop().replace(/\.svelte$/, "");
  return base.charAt(0).toUpperCase() + base.slice(1);
};

/**
 * Extract the bundle-visible names of every *value* import in a source file.
 *
 * Named imports keep their local name through the bundle, so they are checked
 * as written. Default imports do NOT: rollup renames the binding to the source
 * module's own name (`import App from "./main.svelte"` becomes `function
 * Main(...)`, and `App` appears nowhere). For a default import of a .svelte
 * file we therefore check the compiled component name, which the Svelte
 * compiler derives from the filename. `CurveEditor` matched its alias only by
 * coincidence — relying on that would make this check silently wrong.
 *
 * Skipped, by design:
 *   - `import type { ... }` / `import { type Foo }` — erased on purpose; these
 *     are exactly what verbatimModuleSyntax forces authors to mark.
 *   - side-effect imports (`import "./main.scss"`) — no binding to check.
 *   - namespace imports (`import * as ns`) — bundlers inline these, so there is
 *     no stable binding to assert against.
 *   - default imports of non-.svelte modules — the bundler is free to rename
 *     them to anything, so there is no reliable name to assert.
 */
const valueImports = (code) => {
  const names = [];
  const re = /import\s+([^;'"]+?)\s+from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const clause = m[1].trim();
    const specifier = m[2];
    if (clause.startsWith("type ")) continue; // whole-clause type import

    // Split the default binding from the named/namespace braces.
    const braceStart = clause.indexOf("{");
    const defaultPart =
      braceStart === -1 ? clause : clause.slice(0, braceStart).replace(/,\s*$/, "");
    const namedPart =
      braceStart === -1 ? "" : clause.slice(braceStart + 1, clause.lastIndexOf("}"));

    const def = defaultPart.trim();
    if (def && !def.startsWith("*") && specifier.endsWith(".svelte")) {
      names.push(componentName(specifier));
    }

    for (const raw of namedPart.split(",")) {
      const spec = raw.trim();
      if (!spec || spec.startsWith("type ")) continue; // inline type specifier
      // `a as b` binds the local name `b`.
      const local = spec.includes(" as ") ? spec.split(" as ")[1] : spec;
      names.push(local.trim());
    }
  }
  return names.filter(Boolean);
};

/**
 * A binding for `name` in the bundle. Rollup may suffix on collision
 * (`mount$1`), so an optional `$N` is allowed — but a bare call site like
 * `CurveEditor(node, {...})` must NOT satisfy this.
 */
const definitionRe = (name) =>
  new RegExp(`(?:function|const|let|var|class)\\s+${name}(?:\\$\\d+)?\\b`);

let files;
try {
  files = readdirSync(ASSETS_DIR).filter((f) => f.endsWith(".cjs"));
} catch (e) {
  fail(`cannot read ${ASSETS_DIR} (${e.message}). Run \`yarn build\` first.`);
}

if (files.length === 0) {
  fail(`no .cjs bundle found in ${ASSETS_DIR}. Run \`yarn build\` first.`);
}

const haystack = files
  .map((f) => readFileSync(join(ASSETS_DIR, f), "utf8"))
  .join("\n");

// --- 1. Required runtime tokens ------------------------------------------
const missingTokens = REQUIRED_TOKENS.filter((t) => !haystack.includes(t));

// --- 2. Every value imported by the UI must be defined in the bundle ------
const sources = UI_SRC_DIRS.flatMap(collectSources);
if (sources.length === 0) {
  fail(`no UI sources found under ${UI_SRC_DIRS.join(", ")}.`);
}

const symbols = new Set();
for (const file of sources) {
  for (const name of valueImports(readFileSync(file, "utf8"))) {
    symbols.add(name);
  }
}

const missingSymbols = [...symbols].filter((n) => !definitionRe(n).test(haystack));

// --- Report ---------------------------------------------------------------
if (missingTokens.length > 0 || missingSymbols.length > 0) {
  console.error("smoke: FAILED — the panel bundle is missing required code:");
  for (const t of missingTokens) console.error(`  - token: ${t}`);
  for (const s of missingSymbols) {
    console.error(`  - no definition for imported symbol: ${s}`);
  }
  fail(
    "a symbol imported by the UI was elided by svelte-preprocess (used only in " +
      "a template, not referenced in <script>). Check that " +
      "`verbatimModuleSyntax: true` is still set in the UI tsconfig. See P02a/P02b."
  );
}

console.log(
  `smoke: OK — ${REQUIRED_TOKENS.length} token(s) and ${symbols.size} imported ` +
    `symbol(s) from ${sources.length} UI source(s) defined in ${files.join(", ")}`
);
