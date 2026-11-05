/**
 * Pure arrival-speed classification for the Dynamics expressions.
 *
 * The expressions from `shared/expressions` add, from each keyframe reached, an
 * oscillation scaled by the velocity going into that keyframe. That velocity is
 * sampled `frameDuration / 10` before the keyframe. After Easy Ease or any Out or
 * In-Out curve it is close to zero, so the expression applies cleanly and nothing
 * moves. The host measures the same instant before applying and uses this module
 * to decide whether the effect would be visible.
 *
 * THE RULE IS A DESIGN CHOICE, NOT A MEASURED FACT. An arrival counts as eased when
 * its speed is below `EASED_ARRIVAL_RATIO` of the average speed of the segment
 * ending at that keyframe, or when either speed cannot be used:
 *   - a segment that is not finite or has no movement has no energy to overshoot;
 *   - an arrival speed that is not finite cannot scale anything.
 * For reference, a linear arrival has a ratio near 1, an In curve above 1, and Easy
 * Ease or an Out curve near 0.
 *
 * ES3 ONLY: this module is bundled into the ExtendScript host. `instanceof Array`
 * rather than `Array.isArray`, which ExtendScript does not have.
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

/** Magnitude of a value or a difference: |x| for 1D, Euclidean norm for 2D/3D. */
export const magnitude = (v: number | number[]): number => {
  if (!(v instanceof Array)) return Math.abs(v);
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
};

/**
 * `a - b`, component by component for 2D/3D values. Mismatched shapes produce NaN,
 * which `classifyArrivals` counts as eased.
 */
export const subtractValues = (
  a: number | number[],
  b: number | number[]
): number | number[] => {
  if (a instanceof Array && b instanceof Array) {
    const out: number[] = [];
    for (let i = 0; i < a.length; i++) {
      out.push(a[i] - b[i]);
    }
    return out;
  }
  return (a as number) - (b as number);
};

/** Fraction of the segment's average speed below which an arrival counts as eased. */
export const EASED_ARRIVAL_RATIO = 0.1;

export interface ArrivalSample {
  /** Speed going into the keyframe, |Δvalue| / Δt, sampled as the expression does. */
  arrivalSpeed: number;
  /** Average speed of the segment ending at that keyframe, |v(k) − v(k−1)| / Δt. */
  segmentSpeed: number;
}

export interface ArrivalReport {
  /** Keyframes 2..N. */
  total: number;
  /** Arrivals classified as eased. */
  eased: number;
}

const isEasedArrival = (s: ArrivalSample): boolean => {
  if (!isFinite(s.segmentSpeed) || s.segmentSpeed === 0) return true;
  if (!isFinite(s.arrivalSpeed)) return true;
  return s.arrivalSpeed < EASED_ARRIVAL_RATIO * s.segmentSpeed;
};

/** Count how many of a property's arrivals would produce no visible overshoot. */
export const classifyArrivals = (samples: ArrivalSample[]): ArrivalReport => {
  let eased = 0;
  for (let i = 0; i < samples.length; i++) {
    if (isEasedArrival(samples[i])) eased++;
  }
  return { total: samples.length, eased: eased };
};
