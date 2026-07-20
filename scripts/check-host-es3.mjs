/**
 * ES3 guard for the ExtendScript host bundle.
 *
 * After Effects' ExtendScript engine is ES3. Modern *syntax* is caught early: it
 * fails to parse and the panel breaks loudly the first time a tool runs. Modern
 * *builtins* are the dangerous half — `Math.imul(a, b)` parses fine and then
 * throws "Math.imul is not a function" at runtime, inside AE, on the user's
 * machine, in a path no Node unit test exercises because Node has `Math.imul`.
 * That near-miss is real: the seeded PRNG in `shared/sequence` was written
 * against mulberry32 first, which needs exactly that function.
 *
 * WHY THIS PARSES INSTEAD OF GREPPING
 * A textual scan produces false alarms and, worse, false confidence. Three
 * concrete cases in this repo defeat it:
 *   - `shared/expressions` emits After Effects expression *text* containing
 *     `Math.abs(...)` and `Math.sin(...)`. That is data here; it becomes a
 *     program only inside AE's expression engine. Flagging it would be wrong.
 *   - Doc comments discuss `Math.imul` and `instanceof AVLayer` by name. Prose
 *     is not code.
 *   - The `json2.js` polyfill the host `@include`s carries regex literals that
 *     no quote-tracking heuristic survives; distinguishing `/` as division from
 *     `/` as a regex is exactly the problem that makes hand-rolled scanners
 *     wrong.
 * So the bundle is parsed and walked. A string's contents are a `Literal` node
 * and can never be mistaken for a member expression.
 *
 * Run after any build that produced the host bundle:
 *   node scripts/check-host-es3.mjs
 *
 * Author: Dr. Huoston Rodrigues
 * Website: https://huoston.art/
 * Email: hello@huoston.art
 * Version: 0.1.0
 * Created: 2026-07-20
 * Modified: 2026-07-20
 * License: GPL-3.0-or-later
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as acorn from "acorn";
import * as walk from "acorn-walk";

const HOST_BUNDLE = join("dist", "cep", "jsx", "index.js");

/**
 * `obj.prop` statics that ExtendScript's ES3 engine does not provide.
 * Converted to a Map below, for the same inherited-property reason as
 * AMBIGUOUS_METHODS.
 */
const FORBIDDEN_STATICS_SPEC = {
  Object: [
    "keys",
    "assign",
    "create",
    "values",
    "entries",
    "freeze",
    "getPrototypeOf",
    "defineProperty",
  ],
  Array: ["isArray", "from", "of"],
  Math: ["imul", "trunc", "sign", "log2", "log10", "cbrt", "hypot", "fround"],
  Number: ["isFinite", "isInteger", "isNaN", "parseFloat", "parseInt"],
  String: ["fromCodePoint", "raw"],
  Reflect: ["get", "set", "has", "ownKeys"],
};
const FORBIDDEN_STATICS = new Map(Object.entries(FORBIDDEN_STATICS_SPEC));

/** Prototype methods introduced in ES5 or later. */
const FORBIDDEN_METHODS = [
  // Array.prototype (ES5)
  "forEach",
  "map",
  "filter",
  "reduce",
  "reduceRight",
  "some",
  "every",
  // Array.prototype (ES2015+)
  "includes",
  "find",
  "findIndex",
  "fill",
  "copyWithin",
  // String.prototype
  "trim",
  "trimStart",
  "trimEnd",
  "startsWith",
  "endsWith",
  "repeat",
  "padStart",
  "padEnd",
  // Function.prototype (ES5)
  "bind",
];

/** Constructors that do not exist in ES3. */
const FORBIDDEN_CONSTRUCTORS = [
  "Promise",
  "Set",
  "Map",
  "WeakMap",
  "WeakSet",
  "Proxy",
  "Symbol",
];

/**
 * Calls that cannot be judged without type information, reported but not failed.
 *
 * `.indexOf()` is the whole category: `String.prototype.indexOf` is ES3 and
 * legal here — `getAppNameSafely` in `src/jsx/index.ts` relies on it — while
 * `Array.prototype.indexOf` is ES5 and would throw. The two are
 * indistinguishable from the syntax alone, so the occurrences are printed for a
 * human to confirm rather than silently allowed or silently blocked.
 *
 * `JSON` is listed for a different reason: the host `@include`s `lib/json2.js`,
 * an ES3 polyfill, so `JSON.stringify` is genuinely available despite not being
 * an ES3 builtin.
 */
// Maps, not object literals: a plain-object lookup keyed on a parsed identifier
// answers truthily for `toString`, `valueOf` and `hasOwnProperty`, which are
// inherited from Object.prototype. The first run of this script duly reported
// ".valueOf() — function valueOf() { [native code] }".
const AMBIGUOUS_METHODS = new Map([
  ["indexOf", "String.indexOf is ES3 (fine); Array.indexOf is ES5 (would throw)."],
  ["lastIndexOf", "Same split as indexOf: String is ES3, Array is ES5."],
]);
const AMBIGUOUS_OBJECTS = new Map([
  ["JSON", "Provided by the json2.js polyfill the host @includes."],
]);

const fail = (msg) => {
  console.error(`es3: ${msg}`);
  process.exit(1);
};

let source;
try {
  source = readFileSync(HOST_BUNDLE, "utf8");
} catch (e) {
  fail(
    `cannot read ${HOST_BUNDLE} (${e.message}). Run \`yarn build\` or ` +
      `\`yarn build:debug\` first.`
  );
}

let ast;
try {
  // Parsed permissively on purpose: the goal is to *report* modern constructs,
  // not to have the parser reject them. Parsing as ES5 would abort on the first
  // arrow function instead of telling us where all of them are.
  ast = acorn.parse(source, {
    ecmaVersion: "latest",
    sourceType: "script",
    locations: true,
    allowReturnOutsideFunction: true,
    allowHashBang: true,
  });
} catch (e) {
  fail(`cannot parse ${HOST_BUNDLE}: ${e.message}`);
}

const violations = [];
const notices = new Map();

const flag = (node, label, detail) => {
  violations.push({
    label,
    line: node.loc.start.line,
    detail: detail || "",
  });
};

const note = (label, reason) => {
  const entry = notices.get(label) || { count: 0, reason };
  entry.count++;
  notices.set(label, entry);
};

walk.simple(ast, {
  // --- Syntax Babel should have downleveled --------------------------------
  ArrowFunctionExpression(node) {
    flag(node, "arrow function");
  },
  TemplateLiteral(node) {
    flag(node, "template literal");
  },
  SpreadElement(node) {
    flag(node, "spread element");
  },
  RestElement(node) {
    flag(node, "rest element");
  },
  ClassDeclaration(node) {
    flag(node, "class declaration");
  },
  ClassExpression(node) {
    flag(node, "class expression");
  },
  VariableDeclaration(node) {
    if (node.kind === "const" || node.kind === "let") {
      flag(node, `${node.kind} declaration`);
    }
  },
  ForOfStatement(node) {
    flag(node, "for...of");
  },
  Property(node) {
    if (node.shorthand) flag(node, "shorthand property");
    if (node.computed && node.key.type !== "Literal") {
      // Computed keys are ES5-legal in object literals only from ES2015.
      flag(node, "computed property key");
    }
  },

  // --- Builtins -------------------------------------------------------------
  MemberExpression(node) {
    if (node.computed || node.property.type !== "Identifier") return;
    const prop = node.property.name;

    // `Obj.static`
    if (node.object.type === "Identifier") {
      const objName = node.object.name;

      if (AMBIGUOUS_OBJECTS.has(objName)) {
        note(`${objName}.${prop}`, AMBIGUOUS_OBJECTS.get(objName));
        return;
      }

      const statics = FORBIDDEN_STATICS.get(objName);
      if (statics && statics.indexOf(prop) !== -1) {
        flag(node, `${objName}.${prop}`);
        return;
      }
    }

    // `anything.method` — only meaningful when actually called, but flagging the
    // access is right too: `var f = arr.map` is equally broken in ES3.
    if (AMBIGUOUS_METHODS.has(prop)) {
      note(`.${prop}()`, AMBIGUOUS_METHODS.get(prop));
      return;
    }
    if (FORBIDDEN_METHODS.indexOf(prop) !== -1) {
      flag(node, `.${prop}()`);
    }
  },

  NewExpression(node) {
    if (
      node.callee.type === "Identifier" &&
      FORBIDDEN_CONSTRUCTORS.indexOf(node.callee.name) !== -1
    ) {
      flag(node, `new ${node.callee.name}()`);
    }
  },

  CallExpression(node) {
    if (
      node.callee.type === "Identifier" &&
      FORBIDDEN_CONSTRUCTORS.indexOf(node.callee.name) !== -1
    ) {
      flag(node, `${node.callee.name}()`);
    }
  },
});

// --- Report ----------------------------------------------------------------
if (violations.length > 0) {
  console.error(
    `es3: FAILED — ${HOST_BUNDLE} uses ${violations.length} construct(s) that ` +
      `ExtendScript's ES3 engine does not provide:`
  );
  // Group so one repeated mistake does not scroll the real list away.
  const byLabel = new Map();
  for (const v of violations) {
    const lines = byLabel.get(v.label) || [];
    lines.push(v.line);
    byLabel.set(v.label, lines);
  }
  for (const [label, lines] of byLabel) {
    const shown = lines.slice(0, 8).join(", ");
    const more = lines.length > 8 ? `, +${lines.length - 8} more` : "";
    console.error(`  - ${label} — line(s) ${shown}${more}`);
  }
  fail(
    "these parse fine and then throw at runtime inside After Effects. Rewrite " +
      "them in ES3, or fix the host build's downleveling if it is syntax."
  );
}

for (const [label, { count, reason }] of notices) {
  console.log(`es3: note — ${count}x ${label}: ${reason}`);
}

const checkedCount =
  Object.values(FORBIDDEN_STATICS_SPEC).reduce((n, list) => n + list.length, 0) +
  FORBIDDEN_METHODS.length +
  FORBIDDEN_CONSTRUCTORS.length;

console.log(
  `es3: OK — ${HOST_BUNDLE} parsed and walked; clean against ${checkedCount} ` +
    `forbidden builtin(s) plus modern syntax`
);
