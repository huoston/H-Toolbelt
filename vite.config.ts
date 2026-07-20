import { defineConfig } from "vite";

import { svelte } from "@sveltejs/vite-plugin-svelte"; 
import {sveltePreprocess} from "svelte-preprocess"; 

import { cep, CepOptions, runAction } from "vite-cep-plugin";
import cepConfig from "./cep.config";
import path from "path";
import { extendscriptConfig } from "./vite.es.config";

const extensions = [".js", ".ts", ".tsx"];

const devDist = "dist";
const cepDist = "cep";

const src = path.resolve(__dirname, "src");
const root = path.resolve(src, "js");
const outDir = path.resolve(__dirname, "dist", cepDist);

const debugReact = process.env.DEBUG_REACT === "true";
const isProduction = process.env.NODE_ENV === "production";
const isMetaPackage = process.env.ZIP_PACKAGE === "true";
const isPackage = process.env.ZXP_PACKAGE === "true" || isMetaPackage;
const isServe = process.env.SERVE_PANEL === "true";
const action = process.env.BOLT_ACTION;

// Debug builds keep readable identifiers and sourcemaps. They exist for two
// consumers: developers reading a stack trace in the CEP DevTools, and
// `scripts/smoke-bundle.mjs`, which proves that every symbol the UI imports
// survived into the bundle by looking for its *binding* — a check minification
// would defeat by renaming `CurveEditor` to `t`. Release builds minify; the
// smoke test runs against the debug build instead of being weakened.
const isDebugBuild = process.env.BOLT_DEBUG_BUILD === "true";

let input: { [key: string]: string } = {};
cepConfig.panels.map((panel) => {
  input[panel.name] = path.resolve(root, panel.mainPath);
});

const config: CepOptions = {
  cepConfig,
  isProduction,
  isPackage,
  isMetaPackage,
  isServe,
  debugReact,
  dir: `${__dirname}/${devDist}`,
  cepDist: cepDist,
  zxpOutput: `${__dirname}/${devDist}/zxp/${cepConfig.id}`,
  zipOutput: `${__dirname}/${devDist}/zip/${cepConfig.displayName}_${cepConfig.version}`,
  packages: cepConfig.installModules || [],
};

if (action) runAction(config, action);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    svelte({ preprocess: sveltePreprocess({ typescript: true }) }), 
    // svelte(), 
    cep(config),
  ],
  resolve: {
    alias: [{ find: "@esTypes", replacement: path.resolve(__dirname, "src") }],
  },
  root,
  clearScreen: false,
  server: {
    port: cepConfig.port,
  },
  preview: {
    port: cepConfig.servePort,
  },

  build: {
    // Release ships minified and, per cep.config, without sourcemaps in the
    // packaged ZXP — the source is public under GPL-3.0, so the maps buy no
    // secrecy, but they do add ~570 kB to every install. Plain (non-package)
    // builds keep them, which is where day-to-day debugging happens.
    sourcemap: isDebugBuild
      ? true
      : isPackage
        ? cepConfig.zxp.sourceMap
        : cepConfig.build?.sourceMap,
    minify: !isDebugBuild,
    watch: {
      include: "src/jsx/**",
    },
    // commonjsOptions: {
    //   transformMixedEsModules: true,
    // },
    rollupOptions: {
      input,
      output: {
        manualChunks: {},
        // esModule: false,
        preserveModules: false,
        format: "cjs",
        entryFileNames: "assets/[name]-[hash].cjs",
        chunkFileNames: "assets/[name]-[hash].cjs",
      },
    },
    target: "chrome74",
    outDir,
  },
});

// rollup es3 build
const outPathExtendscript = path.join("dist", cepDist, "jsx", "index.js");
extendscriptConfig(
  `src/jsx/index.ts`,
  outPathExtendscript,
  cepConfig,
  extensions,
  isProduction,
  isPackage,
);
