/**
 * Pure temporal-ease engine for the Easings tool.
 *
 * Converts a cubic-bezier timing curve (fixed endpoints (0,0) and (1,1)) into
 * After Effects' temporal influence/speed model. This module is intentionally
 * free of any After Effects API references (no `app`, `comp`, `layer`) so it can
 * be unit-tested in plain Node and reused by the draggable curve editor (P02b).
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

/** Cubic-bezier control points; endpoints are fixed at (0,0) and (1,1). */
export type Bezier = [x1: number, y1: number, x2: number, y2: number];

/** One side of a keyframe's temporal ease. */
export interface EaseSide {
  /** Influence percentage, clamped to After Effects' valid range. */
  influence: number;
  /** Speed in value-units per second. */
  speed: number;
}

/** Temporal ease for an adjacent pair of keyframes. */
export interface EasePair {
  /** Ease leaving the initial keyframe (its out side). */
  out: EaseSide;
  /** Ease entering the final keyframe (its in side). */
  in: EaseSide;
}

/** A named, reusable easing curve. */
export interface EasingPreset {
  label: string;
  bezier: Bezier;
}

/** After Effects clamps keyframe influence to this inclusive range. */
export const INFLUENCE_MIN = 0.1;
export const INFLUENCE_MAX = 100;

/** Named preset curves. Values are exact and must not drift. */
export const EASING_PRESETS: EasingPreset[] = [
  { label: "Easy Ease", bezier: [0.333, 0, 0.667, 1] },
  { label: "Ease Out", bezier: [0, 0, 0.58, 1] },
  { label: "Ease In", bezier: [0.42, 0, 1, 1] },
  { label: "Ease In-Out", bezier: [0.42, 0, 0.58, 1] },
  { label: "Ease Out Strong", bezier: [0, 0, 0.2, 1] },
  { label: "Ease In-Out Strong", bezier: [0.7, 0, 0.3, 1] },
];

/** Clamp `value` into the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Convert a cubic-bezier curve into an After Effects temporal ease pair.
 *
 * @param b          Bezier control points (x1,y1,x2,y2), endpoints (0,0)/(1,1).
 * @param timeDelta  Seconds between the two keyframes; must be > 0.
 * @param valueDelta Value change between the keyframes (already a scalar
 *                   magnitude for multidimensional properties).
 * @throws Error when `timeDelta <= 0` (a caller-catchable error, not a crash).
 */
export function bezierToTemporalEase(
  b: Bezier,
  timeDelta: number,
  valueDelta: number
): EasePair {
  if (!(timeDelta > 0)) {
    throw new Error("timeDelta must be greater than 0.");
  }

  const x1 = b[0];
  const y1 = b[1];
  const x2 = b[2];
  const y2 = b[3];

  // Average rate of change across the segment, used to scale endpoint slopes
  // into a concrete speed in value-units per second.
  const averageSpeed = valueDelta / timeDelta;

  const out: EaseSide = {
    influence: clamp(x1 * 100, INFLUENCE_MIN, INFLUENCE_MAX),
    speed: x1 === 0 ? 0 : (y1 / x1) * averageSpeed,
  };

  const inSide: EaseSide = {
    influence: clamp((1 - x2) * 100, INFLUENCE_MIN, INFLUENCE_MAX),
    speed: x2 === 1 ? 0 : ((1 - y2) / (1 - x2)) * averageSpeed,
  };

  return { out, in: inSide };
}
