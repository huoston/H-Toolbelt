/**
 * Build check: fails when `dist/` came out incomplete.
 *
 * `vite build` can exit 0 after a compile error in the panel, so the exit code
 * of a build says nothing about what it produced. This looks at the output
 * itself, and is chained after `build`, `build:debug` and `zxp`. Paths resolve
 * from the current directory, which is the repository root under yarn.
 *
 * Usage: node scripts/check-dist.mjs [--zxp]
 *   --zxp  also require a packaged .zxp in dist/zxp/
 *
 * Author: Dr. Huoston Rodrigues
 * Website: https://huoston.art/
 * Email: hello@huoston.art
 * Version: 0.2.0
 * Created: 2026-11-05
 * Modified: 2026-11-05
 * License: GPL-3.0-or-later
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const isNonEmptyFile = (path) => {
  try {
    const stat = statSync(path);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
};

/** True when `dir` directly holds a non-empty file with this extension. */
const hasNonEmptyFileWithExt = (dir, ext) => {
  try {
    return readdirSync(dir).some(
      (name) => name.endsWith(ext) && isNonEmptyFile(join(dir, name))
    );
  } catch {
    return false;
  }
};

const requiredFiles = [
  "dist/cep/CSXS/manifest.xml",
  "dist/cep/main/index.html",
  "dist/cep/jsx/index.js",
];

const requiredGlobs = [{ dir: "dist/cep/assets", ext: ".cjs" }];
if (process.argv.includes("--zxp")) {
  requiredGlobs.push({ dir: "dist/zxp", ext: ".zxp" });
}

const missing = [
  ...requiredFiles.filter((file) => !isNonEmptyFile(file)),
  ...requiredGlobs
    .filter(({ dir, ext }) => !hasNonEmptyFileWithExt(dir, ext))
    .map(({ dir, ext }) => `${dir}/*${ext}`),
];

if (missing.length > 0) {
  console.error("check-dist: dist/ is incomplete. Missing or empty:");
  for (const item of missing) console.error(`  - ${item}`);
  process.exit(1);
}

console.log("check-dist: ok");
