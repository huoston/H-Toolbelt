/**
 * Pure expression-text generator for the One-Click Expression Effects tool.
 *
 * Builds the bounce and elastic expressions that get written onto a property.
 * Both are the classic velocity-at-the-last-keyframe formulation: sample the
 * property's velocity just before the most recent keyframe, then add a decaying
 * oscillation scaled by it, so the overshoot inherits the animation's own speed
 * instead of being a fixed nudge.
 *
 * ES3 ONLY, AND THIS IS NOT STYLISTIC. After Effects ships two expression
 * engines — JavaScript (default since CC 2019) and Legacy ExtendScript, which a
 * project can be switched to under File > Project Settings > Expressions. The
 * legacy engine predates ES5: `const`, `let`, arrow functions and template
 * literals are syntax errors there, and a syntax error disables the expression
 * with a yellow banner on the property. Since the generated text lands in the
 * *user's* project, whose engine we do not control, it is written in ES3 and
 * pinned there by tests.
 *
 * THE OSCILLATION FACTOR STAYS SCALAR. `value` and the sampled velocity may be
 * arrays (Position, Scale, 3D), and `array * scalar` is legal in AE expressions
 * while `Math.abs(array)` is not. So every `Math.*` call here wraps plain
 * numbers, and the array only ever appears on the left of the multiplication.
 *
 * This module is intentionally free of any After Effects API references (no
 * `app`, `comp`, `layer`) so it is unit-testable in plain Node and shared by the
 * panel UI and the ExtendScript host.
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

/** Which oscillation shape to generate. */
export type ExpressionKind = "bounce" | "elastic";

/** The three knobs, baked into the text rather than exposed as slider effects. */
export interface ExpressionParams {
  /** Overall strength of the overshoot, as a fraction of the sampled velocity. */
  amplitude: number;
  /** Oscillations per second. */
  frequency: number;
  /** How fast the oscillation dies out; higher settles sooner. */
  decay: number;
}

/** A selectable effect, for the UI to render without hardcoding ids. */
export interface ExpressionKindSpec {
  /** Stable identifier sent to the host; never localized. */
  id: ExpressionKind;
  /** Human label for the UI button. */
  label: string;
}

/** The effects, in the order the UI lists them. */
export const EXPRESSION_KINDS: ExpressionKindSpec[] = [
  { id: "bounce", label: "Bounce" },
  { id: "elastic", label: "Elastic" },
];

/**
 * Starting parameters per effect. Bounce settles faster and harder than elastic
 * because a bounce that lingers reads as a wobble rather than an impact.
 */
export const EXPRESSION_DEFAULTS: { bounce: ExpressionParams; elastic: ExpressionParams } = {
  bounce: { amplitude: 0.1, frequency: 2.5, decay: 6.0 },
  elastic: { amplitude: 0.12, frequency: 2.0, decay: 4.0 },
};

/** Resolve an arbitrary string to a known effect, or null when unrecognized. */
export const findExpressionKind = (id: string): ExpressionKind | null => {
  for (let i = 0; i < EXPRESSION_KINDS.length; i++) {
    if (EXPRESSION_KINDS[i].id === id) return EXPRESSION_KINDS[i].id;
  }
  return null;
};

/**
 * Render a number for embedding in expression text: always a plain decimal,
 * never exponent notation, and no trailing-zero noise.
 *
 * `toFixed` is used rather than `String(n)` because the latter emits `1e-7` for
 * small values, which is valid JavaScript but reads as a typo in the expression
 * field the user is about to inspect.
 */
const formatNumber = (n: number): string => {
  if (typeof n !== "number" || !isFinite(n)) return "0";

  // 10 decimals keeps small values (1e-9) legible; toFixed only reaches for
  // exponent notation above 1e21, which the guard below catches anyway.
  let s = n.toFixed(10);
  if (s.indexOf("e") !== -1 || s.indexOf("E") !== -1) return "0";

  // Trim zeros only after the decimal point: a bare /0+$/ would turn "10" into
  // "1".
  s = s.replace(/(\.\d*?)0+$/, "$1");
  s = s.replace(/\.$/, "");
  return s;
};

/**
 * The scalar oscillation factor, per effect.
 *
 * Bounce rectifies the sine with `Math.abs` so every lobe pushes the same way —
 * an object hitting a floor never passes through it. Elastic leaves the sine
 * signed, so it overshoots to both sides. The `Math.abs` wraps the sine alone,
 * never `value`, which may be an array.
 */
const oscillationFactor = (kind: ExpressionKind): string => {
  if (kind === "bounce") {
    return "amp * Math.abs(Math.sin(freq * t * Math.PI)) / Math.exp(decay * t)";
  }
  return "amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t)";
};

/**
 * Build the expression text for one effect.
 *
 * The generated program walks back to the keyframe at or before the current
 * time, measures the velocity going into it, and adds the decaying oscillation
 * from there. Before the first keyframe it falls through to plain `value`, so
 * the property behaves normally until the animation actually starts.
 */
export const buildExpression = (
  kind: ExpressionKind,
  p: ExpressionParams
): string => {
  const lines = [
    "// H-Toolbelt " + kind + " - ES3 syntax, runs on both AE expression engines.",
    "var amp = " + formatNumber(p.amplitude) + ";",
    "var freq = " + formatNumber(p.frequency) + ";",
    "var decay = " + formatNumber(p.decay) + ";",
    "var n = 0;",
    "if (numKeys > 0) {",
    "  n = nearestKey(time).index;",
    "  if (key(n).time > time) { n = n - 1; }",
    "}",
    "if (n > 0) {",
    "  var t = time - key(n).time;",
    // Sampled a hair before the keyframe: at the keyframe itself the velocity is
    // already the outgoing one, which is zero on an ease-out and would kill the
    // effect entirely.
    "  var v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);",
    "  value + v * (" + oscillationFactor(kind) + ");",
    "} else {",
    "  value;",
    "}",
  ];
  return lines.join("\n");
};
