/**
 * Bundle smoke test for H-Toolbelt.
 *
 * Reads the built production panel bundle and asserts that required runtime
 * tokens are present. It exists to catch the exact failure mode from P02a at
 * BUILD time instead of in the panel: svelte-preprocess transpiles each
 * <script> block in isolation, so a shared symbol referenced only in a
 * component's template (never in its <script>) is elided by TypeScript's import
 * elision and never reaches the bundle — throwing
 * `ReferenceError: <symbol> is not defined` on mount. If any preset label or the
 * Easy Ease control-point value below is missing, a symbol was dropped and we
 * fail the build rather than ship a panel that crashes on load.
 *
 * Run after `yarn build` (the debug, non-minified bundle). Usage:
 *   node scripts/smoke-bundle.mjs
 *
 * Author: Dr. Huoston Rodrigues
 * Website: https://huoston.art/
 * Email: hello@huoston.art
 * Version: 0.1.0
 * Created: 2026-07-10
 * Modified: 2026-07-10
 * License: GPL-3.0-or-later
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ASSETS_DIR = join("dist", "cep", "assets");

// These reach the bundle only through the shared easing module. Any one missing
// means the symbol carrying it was elided. Quoted labels match how they appear
// in the emitted object literals (e.g. `label: "Easy Ease"`).
const REQUIRED_TOKENS = [
  '"Easy Ease"',
  '"Ease Out"',
  '"Ease In"',
  '"Ease In-Out"',
  '"Ease Out Strong"',
  '"Ease In-Out Strong"',
  "0.333",
];

const fail = (msg) => {
  console.error(`smoke: ${msg}`);
  process.exit(1);
};

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

const missing = REQUIRED_TOKENS.filter((t) => !haystack.includes(t));

if (missing.length > 0) {
  console.error("smoke: FAILED — required tokens missing from the panel bundle:");
  for (const t of missing) console.error(`  - ${t}`);
  fail(
    "a shared symbol was likely elided by svelte-preprocess (used only in a " +
      "template, not referenced in <script>). See P02a."
  );
}

console.log(
  `smoke: OK — ${REQUIRED_TOKENS.length} token(s) present in ${files.join(", ")}`
);
