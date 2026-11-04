/**
 * Baked-intensity presets for the Dynamics section.
 *
 * Each preset is a fixed amplitude/frequency/decay triple for one of the
 * expression kinds, sent to the host's `applyExpression` as is. The two Medium
 * presets equal `EXPRESSION_DEFAULTS`, which is what v0.1.0 applied out of the
 * box; tests pin that, so they double as the regression control.
 *
 * `oscillation` is the numeric twin of the text `oscillationFactor` writes into
 * the generated expression. It exists so a card can draw what the expression
 * does, and it is kept beside the presets instead of being derived from
 * `expressions.ts` because that module only ever produces text.
 *
 * Free of any After Effects API references, so it runs in plain Node.
 *
 * Author: Dr. Huoston Rodrigues
 * Website: https://huoston.art/
 * Email: hello@huoston.art
 * Version: 0.2.0
 * Created: 2026-11-04
 * Modified: 2026-11-04
 * License: GPL-3.0-or-later
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ExpressionKind } from "./expressions";

/** One card in the Dynamics grid. */
export interface DynamicsPreset {
  /** Stable identifier; never localized, safe to persist. */
  id: string;
  /** Human label shown on the card. */
  label: string;
  /** Which oscillation shape the host generates. */
  kind: ExpressionKind;
  /** Strength of the overshoot, as a fraction of the sampled velocity. */
  amplitude: number;
  /** Oscillations per second. */
  frequency: number;
  /** How fast the oscillation dies out; higher settles sooner. */
  decay: number;
  /** One line describing the motion, shown on hover. */
  hint: string;
}

/** The presets, in render order. Values are exact and must not drift. */
export const DYNAMICS_PRESETS: DynamicsPreset[] = [
  {
    id: "bounce-soft",
    label: "Bounce Soft",
    kind: "bounce",
    amplitude: 0.05,
    frequency: 2.0,
    decay: 8,
    hint: "Light rebound that settles quickly.",
  },
  {
    id: "bounce-medium",
    label: "Bounce Medium",
    kind: "bounce",
    amplitude: 0.1,
    frequency: 2.5,
    decay: 6,
    hint: "Moderate rebound off the last keyframe.",
  },
  {
    id: "bounce-hard",
    label: "Bounce Hard",
    kind: "bounce",
    amplitude: 0.18,
    frequency: 3.0,
    decay: 4,
    hint: "Strong rebound that takes longer to settle.",
  },
  {
    id: "elastic-soft",
    label: "Elastic Soft",
    kind: "elastic",
    amplitude: 0.05,
    frequency: 1.5,
    decay: 7,
    hint: "Slight overshoot that settles quickly.",
  },
  {
    id: "elastic-medium",
    label: "Elastic Medium",
    kind: "elastic",
    amplitude: 0.12,
    frequency: 2.0,
    decay: 4,
    hint: "Moderate overshoot to both sides of the last keyframe.",
  },
  {
    id: "elastic-hard",
    label: "Elastic Hard",
    kind: "elastic",
    amplitude: 0.18,
    frequency: 2.5,
    decay: 3.5,
    hint: "Strong overshoot that keeps ringing.",
  },
];

/**
 * The decaying oscillation a preset produces, `t` seconds after the keyframe.
 *
 * Bounce rectifies the sine, so it never goes negative; elastic leaves it signed.
 */
export const oscillation = (p: DynamicsPreset, t: number): number => {
  const amp = p.amplitude;
  const freq = p.frequency;
  const decay = p.decay;
  if (p.kind === "bounce") {
    return amp * Math.abs(Math.sin(freq * t * Math.PI)) / Math.exp(decay * t);
  }
  return amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t);
};
