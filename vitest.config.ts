/**
 * Vitest configuration for H-Toolbelt.
 *
 * Kept separate from `vite.config.ts` on purpose: the main Vite config loads the
 * `vite-cep-plugin` and runs CEP build side effects (manifest, symlink) at import
 * time. Tests only exercise pure engine code, so they use this minimal config.
 *
 * Author: Dr. Huoston Rodrigues
 * Website: https://huoston.art/
 * Email: hello@huoston.art
 * Version: 0.1.0
 * Created: 2026-07-09
 * Modified: 2026-07-09
 * License: GPL-3.0-or-later
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    environment: "node",
  },
});
