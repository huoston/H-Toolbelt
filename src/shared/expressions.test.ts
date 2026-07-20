/**
 * Unit tests for the pure expression-text generator.
 *
 * The load-bearing test here is the ES3 syntax check. A `const` or an arrow
 * function in the generated text is a syntax error under After Effects' Legacy
 * ExtendScript engine, which disables the expression on the user's property —
 * and nothing in this repo's own build would ever catch it, because the text is
 * data to us and only becomes a program inside AE. So the forbidden constructs
 * are pinned explicitly.
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

import { describe, it, expect } from "vitest";
import {
  EXPRESSION_DEFAULTS,
  EXPRESSION_KINDS,
  buildExpression,
  findExpressionKind,
  type ExpressionKind,
  type ExpressionParams,
} from "./expressions";

const PARAMS: ExpressionParams = { amplitude: 0.15, frequency: 3.25, decay: 5.5 };
const KINDS: ExpressionKind[] = ["bounce", "elastic"];

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

describe("buildExpression — ES3 compatibility", () => {
  for (const kind of KINDS) {
    for (const { label, pattern } of FORBIDDEN) {
      it(`${kind} text contains no ${label}`, () => {
        expect(buildExpression(kind, PARAMS)).not.toMatch(pattern);
      });
    }
  }

  it("declares its variables with var", () => {
    for (const kind of KINDS) {
      const text = buildExpression(kind, PARAMS);
      expect(text).toContain("var amp =");
      expect(text).toContain("var freq =");
      expect(text).toContain("var decay =");
    }
  });

  it("stays ASCII, so no encoding surprises in the expression field", () => {
    for (const kind of KINDS) {
      // eslint-disable-next-line no-control-regex
      expect(buildExpression(kind, PARAMS)).toMatch(/^[\x00-\x7F]*$/);
    }
  });
});

describe("buildExpression — parameters", () => {
  it("embeds the given values", () => {
    for (const kind of KINDS) {
      const text = buildExpression(kind, PARAMS);
      expect(text).toContain("var amp = 0.15;");
      expect(text).toContain("var freq = 3.25;");
      expect(text).toContain("var decay = 5.5;");
    }
  });

  it("writes whole numbers without trailing-zero noise", () => {
    const text = buildExpression("bounce", {
      amplitude: 10,
      frequency: 2,
      decay: 4,
    });
    expect(text).toContain("var amp = 10;");
    expect(text).toContain("var freq = 2;");
    expect(text).toContain("var decay = 4;");
  });

  it("never emits exponent notation for small values", () => {
    const text = buildExpression("bounce", {
      amplitude: 0.000000001,
      frequency: 1,
      decay: 1,
    });
    expect(text).not.toMatch(/e-/i);
    expect(text).toContain("var amp = 0.000000001;");
  });

  it("falls back to 0 for non-finite parameters", () => {
    const text = buildExpression("bounce", {
      amplitude: NaN,
      frequency: Infinity,
      decay: 3,
    });
    expect(text).toContain("var amp = 0;");
    expect(text).toContain("var freq = 0;");
  });

  it("emits negative values intact", () => {
    const text = buildExpression("elastic", {
      amplitude: -0.5,
      frequency: 2,
      decay: 4,
    });
    expect(text).toContain("var amp = -0.5;");
  });
});

describe("buildExpression — oscillation shape", () => {
  it("bounce rectifies the sine, so every lobe pushes the same way", () => {
    expect(buildExpression("bounce", PARAMS)).toContain("Math.abs(");
  });

  it("elastic leaves the sine signed, overshooting both ways", () => {
    expect(buildExpression("elastic", PARAMS)).not.toContain("Math.abs(");
  });

  it("Math.abs wraps the scalar sine only, never the value vector", () => {
    // `value` and the sampled velocity may be arrays; Math.abs(array) throws in
    // an AE expression, so the abs must sit directly on Math.sin.
    const text = buildExpression("bounce", PARAMS);
    expect(text).toContain("Math.abs(Math.sin(");
    expect(text).not.toMatch(/Math\.abs\(\s*(value|v)\b/);
  });

  it("keeps the vector on the left of the scalar multiplication", () => {
    for (const kind of KINDS) {
      expect(buildExpression(kind, PARAMS)).toContain("value + v * (");
    }
  });
});

describe("buildExpression — structure", () => {
  it("samples velocity at the last keyframe", () => {
    for (const kind of KINDS) {
      const text = buildExpression(kind, PARAMS);
      expect(text).toContain("velocityAtTime");
      expect(text).toContain("nearestKey");
    }
  });

  it("falls back to plain value before the first keyframe", () => {
    for (const kind of KINDS) {
      const text = buildExpression(kind, PARAMS);
      expect(text).toContain("if (n > 0) {");
      expect(text).toContain("} else {");
      expect(text).toContain("  value;");
    }
  });

  it("bounce and elastic differ", () => {
    expect(buildExpression("bounce", PARAMS)).not.toBe(
      buildExpression("elastic", PARAMS)
    );
  });
});

/**
 * Run generated text the way After Effects does.
 *
 * AE evaluates the expression as a program and takes the completion value of the
 * last statement — which is exactly `eval`'s semantics, so a direct `eval` with
 * the AE globals bound as parameters reproduces it faithfully. This catches what
 * regexes cannot: a typo'd identifier, a branch that never yields a value, a
 * factor that is silently NaN.
 *
 * Scalar `value` only. With an array, `value + v * f` is legal AE arithmetic but
 * string concatenation in plain JavaScript, so the vector case is covered by the
 * textual assertions above instead.
 */
const evaluate = (
  text: string,
  opts: { time: number; value: number; velocity: number }
): number => {
  const KEY_TIMES: { [index: number]: number } = { 1: 0, 2: 1 };
  const env = {
    numKeys: 2,
    time: opts.time,
    value: opts.value,
    nearestKey: (t: number) => ({ index: t >= 1 ? 2 : 1 }),
    key: (n: number) => ({ time: KEY_TIMES[n] }),
    velocityAtTime: () => opts.velocity,
    thisComp: { frameDuration: 1 / 24 },
  };

  const fn = new Function(
    "numKeys",
    "time",
    "value",
    "nearestKey",
    "key",
    "velocityAtTime",
    "thisComp",
    "return eval(" + JSON.stringify(text) + ");"
  );
  return fn(
    env.numKeys,
    env.time,
    env.value,
    env.nearestKey,
    env.key,
    env.velocityAtTime,
    env.thisComp
  ) as number;
};

describe("buildExpression — evaluated behaviour", () => {
  const params: ExpressionParams = { amplitude: 0.2, frequency: 2, decay: 3 };

  it("yields a finite number after the last keyframe", () => {
    for (const kind of KINDS) {
      const out = evaluate(buildExpression(kind, params), {
        time: 1.25,
        value: 50,
        velocity: 100,
      });
      expect(Number.isFinite(out)).toBe(true);
    }
  });

  it("returns value untouched before the first keyframe", () => {
    for (const kind of KINDS) {
      const out = evaluate(buildExpression(kind, params), {
        time: 0.5,
        value: 50,
        velocity: 100,
      });
      expect(out).toBe(50);
    }
  });

  it("bounce only ever overshoots one way", () => {
    const text = buildExpression("bounce", params);
    let sawOvershoot = false;
    for (let i = 0; i <= 60; i++) {
      const out = evaluate(text, { time: 1 + i / 60, value: 50, velocity: 100 });
      // Positive incoming velocity: a bounce must never dip below the value, or
      // the object has passed through what it bounced off.
      expect(out).toBeGreaterThanOrEqual(50 - 1e-9);
      if (out > 50 + 1e-6) sawOvershoot = true;
    }
    expect(sawOvershoot).toBe(true);
  });

  it("elastic oscillates to both sides", () => {
    const text = buildExpression("elastic", params);
    let above = false;
    let below = false;
    for (let i = 0; i <= 60; i++) {
      const out = evaluate(text, { time: 1 + i / 60, value: 50, velocity: 100 });
      if (out > 50 + 1e-6) above = true;
      if (out < 50 - 1e-6) below = true;
    }
    expect(above).toBe(true);
    expect(below).toBe(true);
  });

  it("decays: late oscillation is smaller than early", () => {
    for (const kind of KINDS) {
      const text = buildExpression(kind, params);
      const early = Math.abs(
        evaluate(text, { time: 1.15, value: 50, velocity: 100 }) - 50
      );
      const late = Math.abs(
        evaluate(text, { time: 2.15, value: 50, velocity: 100 }) - 50
      );
      expect(late).toBeLessThan(early);
    }
  });

  it("scales with amplitude and with the sampled velocity", () => {
    const weak = buildExpression("bounce", { ...params, amplitude: 0.1 });
    const strong = buildExpression("bounce", { ...params, amplitude: 0.4 });
    const at = { time: 1.12, value: 50, velocity: 100 };
    expect(Math.abs(evaluate(strong, at) - 50)).toBeGreaterThan(
      Math.abs(evaluate(weak, at) - 50)
    );

    const fast = { time: 1.12, value: 50, velocity: 400 };
    expect(Math.abs(evaluate(weak, fast) - 50)).toBeGreaterThan(
      Math.abs(evaluate(weak, at) - 50)
    );
  });
});

describe("findExpressionKind", () => {
  it("resolves every advertised kind", () => {
    for (const spec of EXPRESSION_KINDS) {
      expect(findExpressionKind(spec.id)).toBe(spec.id);
    }
  });

  it("returns null for an unknown id", () => {
    expect(findExpressionKind("wiggle")).toBeNull();
  });
});

describe("EXPRESSION_DEFAULTS", () => {
  it("provides usable defaults for both kinds", () => {
    for (const kind of KINDS) {
      const p = EXPRESSION_DEFAULTS[kind];
      expect(p.amplitude).toBeGreaterThan(0);
      expect(p.frequency).toBeGreaterThan(0);
      expect(p.decay).toBeGreaterThan(0);
    }
  });

  it("bounce settles faster than elastic", () => {
    expect(EXPRESSION_DEFAULTS.bounce.decay).toBeGreaterThan(
      EXPRESSION_DEFAULTS.elastic.decay
    );
  });
});
