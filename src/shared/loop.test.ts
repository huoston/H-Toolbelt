/**
 * Unit tests for the pure loop-expression generator.
 *
 * Two things matter here and neither is arithmetic. First, the argument rules:
 * `continue` must never carry a keyframe count, because After Effects silently
 * ignores one rather than erroring — so the mistake would ship as a setting in
 * the user's expression field that quietly does nothing. Second, the ES3 syntax
 * check, kept for the same reason as in the expression-effects tests: the text
 * is inert data to this repo's build and only becomes a program inside AE, so
 * nothing else would ever catch a regression.
 *
 * Author: Dr. Huoston Rodrigues
 * Website: https://huoston.art/
 * Email: hello@huoston.art
 * Version: 0.2.0
 * Created: 2026-07-28
 * Modified: 2026-07-28
 * License: GPL-3.0-or-later
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_LOOP_DIR,
  DEFAULT_LOOP_KEYFRAMES,
  DEFAULT_LOOP_TYPE,
  LOOP_DIRECTIONS,
  LOOP_TYPES,
  buildLoopExpression,
  findLoopDir,
  findLoopType,
  loopTypeLabel,
  usesKeyframeCount,
  type LoopDir,
  type LoopType,
} from "./loop";

const ALL_TYPES: LoopType[] = ["cycle", "pingpong", "offset", "continue"];
const ALL_DIRS: LoopDir[] = ["out", "in"];

/** The generated call, without the leading marker comment. */
const callOf = (text: string): string => {
  const lines = text.split("\n");
  return lines[lines.length - 1];
};

/**
 * The keyframe-count argument on its own, or "" when the call has none.
 *
 * Needed because the loop type is itself a string full of letters — scanning the
 * whole call for an "e" to rule out exponent notation matches `"cycle"` and
 * proves nothing.
 */
const countArgOf = (text: string): string => {
  const match = callOf(text).match(/,\s*([^)]*)\)$/);
  return match ? match[1] : "";
};

describe("buildLoopExpression — the emitted call", () => {
  it("uses loopOut for the out direction", () => {
    expect(callOf(buildLoopExpression("cycle", "out", 0))).toBe(
      'loopOut("cycle", 0)'
    );
  });

  it("uses loopIn for the in direction", () => {
    expect(callOf(buildLoopExpression("cycle", "in", 2))).toBe(
      'loopIn("cycle", 2)'
    );
  });

  it("emits each loop type's own id", () => {
    expect(callOf(buildLoopExpression("pingpong", "out", 0))).toBe(
      'loopOut("pingpong", 0)'
    );
    expect(callOf(buildLoopExpression("offset", "out", 3))).toBe(
      'loopOut("offset", 3)'
    );
  });

  it("covers every type/direction pair with a well-formed call", () => {
    for (const type of ALL_TYPES) {
      for (const dir of ALL_DIRS) {
        const call = callOf(buildLoopExpression(type, dir, 0));
        const fn = dir === "in" ? "loopIn" : "loopOut";
        expect(call.indexOf(fn + '("' + type + '"')).toBe(0);
        expect(call.charAt(call.length - 1)).toBe(")");
      }
    }
  });

  it("marks the expression as this panel's work", () => {
    expect(buildLoopExpression("cycle", "out", 0)).toContain("// H-Toolbelt");
  });
});

describe("buildLoopExpression — continue takes no keyframe count", () => {
  // The load-bearing case: AE ignores a second argument to continue rather than
  // erroring, so emitting one would ship a dead setting into the user's project.
  for (const dir of ALL_DIRS) {
    it(`omits the count for continue (${dir})`, () => {
      const fn = dir === "in" ? "loopIn" : "loopOut";
      expect(callOf(buildLoopExpression("continue", dir, 5))).toBe(
        fn + '("continue")'
      );
    });
  }

  it("omits the count for continue whatever the number given", () => {
    for (const n of [0, 1, 2, 99, -3, 2.7, NaN]) {
      expect(callOf(buildLoopExpression("continue", "out", n))).toBe(
        'loopOut("continue")'
      );
    }
  });

  it("agrees with usesKeyframeCount", () => {
    expect(usesKeyframeCount("cycle")).toBe(true);
    expect(usesKeyframeCount("pingpong")).toBe(true);
    expect(usesKeyframeCount("offset")).toBe(true);
    expect(usesKeyframeCount("continue")).toBe(false);
  });
});

describe("buildLoopExpression — keyframe count normalization", () => {
  it("passes a positive integer through", () => {
    expect(callOf(buildLoopExpression("cycle", "out", 4))).toBe(
      'loopOut("cycle", 4)'
    );
  });

  it("treats a negative count as all keyframes", () => {
    expect(callOf(buildLoopExpression("cycle", "out", -2))).toBe(
      'loopOut("cycle", 0)'
    );
  });

  it("floors a fractional count rather than emitting it", () => {
    expect(callOf(buildLoopExpression("cycle", "out", 2.7))).toBe(
      'loopOut("cycle", 2)'
    );
  });

  it("falls back to all keyframes for unusable input", () => {
    for (const n of [NaN, Infinity, -Infinity]) {
      expect(callOf(buildLoopExpression("cycle", "out", n))).toBe(
        'loopOut("cycle", 0)'
      );
    }
    expect(
      callOf(buildLoopExpression("cycle", "out", undefined as unknown as number))
    ).toBe('loopOut("cycle", 0)');
  });

  // A count of 1e21 floors to itself and stringifies as "1e+21", which is legal
  // JavaScript but reads as a typo in the expression field the user is about to
  // inspect. The generator clamps instead.
  it("never emits a fractional or exponent-notation count", () => {
    for (const n of [1e21, 1e300, 0.5, 1 / 3, 2.7, 999999]) {
      expect(countArgOf(buildLoopExpression("cycle", "out", n))).toMatch(
        /^\d+$/
      );
    }
  });

  it("clamps an absurd count to a plain decimal", () => {
    expect(countArgOf(buildLoopExpression("cycle", "out", 1e21))).toBe("1000");
  });
});

/**
 * Constructs that are valid modern JavaScript but syntax errors — or missing
 * built-ins — under the Legacy ExtendScript expression engine.
 */
const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  { label: "arrow function", pattern: /=>/ },
  { label: "template literal", pattern: /`/ },
  { label: "const declaration", pattern: /\bconst\s/ },
  { label: "let declaration", pattern: /\blet\s/ },
  { label: "Math.imul", pattern: /Math\.imul/ },
  { label: "Object.assign", pattern: /Object\.assign/ },
  { label: "String.trim", pattern: /\.trim\(/ },
  { label: "Array.isArray", pattern: /Array\.isArray/ },
  { label: "JSON", pattern: /JSON\./ },
];

describe("buildLoopExpression — ES3 compatibility", () => {
  for (const type of ALL_TYPES) {
    for (const { label, pattern } of FORBIDDEN) {
      it(`${type} text contains no ${label}`, () => {
        expect(buildLoopExpression(type, "out", 2)).not.toMatch(pattern);
      });
    }
  }

  it("stays ASCII, so no encoding surprises in the expression field", () => {
    for (const type of ALL_TYPES) {
      for (const dir of ALL_DIRS) {
        // eslint-disable-next-line no-control-regex
        expect(buildLoopExpression(type, dir, 2)).toMatch(/^[\x00-\x7F]*$/);
      }
    }
  });
});

describe("loop metadata", () => {
  it("resolves known type ids and rejects unknown ones", () => {
    for (const type of ALL_TYPES) {
      expect(findLoopType(type)).toBe(type);
    }
    expect(findLoopType("bounce")).toBeNull();
    expect(findLoopType("")).toBeNull();
  });

  it("resolves known direction ids and rejects unknown ones", () => {
    expect(findLoopDir("out")).toBe("out");
    expect(findLoopDir("in")).toBe("in");
    expect(findLoopDir("both")).toBeNull();
  });

  it("labels every type for the undo group", () => {
    expect(loopTypeLabel("pingpong")).toBe("Ping-Pong");
    for (const type of ALL_TYPES) {
      expect(loopTypeLabel(type).length).toBeGreaterThan(0);
    }
  });

  it("lists every type and direction exactly once", () => {
    expect(LOOP_TYPES.length).toBe(ALL_TYPES.length);
    expect(LOOP_DIRECTIONS.length).toBe(ALL_DIRS.length);
    for (const type of ALL_TYPES) {
      expect(LOOP_TYPES.filter((t) => t.id === type).length).toBe(1);
    }
  });

  it("has defaults that are themselves valid", () => {
    expect(findLoopType(DEFAULT_LOOP_TYPE)).toBe(DEFAULT_LOOP_TYPE);
    expect(findLoopDir(DEFAULT_LOOP_DIR)).toBe(DEFAULT_LOOP_DIR);
    expect(DEFAULT_LOOP_KEYFRAMES).toBe(0);
  });
});
