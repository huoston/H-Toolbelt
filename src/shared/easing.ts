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

/**
 * How a preset produces its motion.
 *
 * Only `"bezier"` exists today: a timing curve the keyframe engine converts into
 * After Effects' native influence/speed. The field is here rather than assumed
 * because overshoot easings — Back, Elastic, Bounce — cannot be expressed as a
 * monotonic cubic bezier at all and will arrive as generated expressions. When
 * they do, they join this same list with a different `kind`, and the UI can mark
 * them without the list's shape having to change underneath it.
 */
export type EasingKind = "bezier";

/** A named, reusable easing curve. */
export interface EasingPreset {
  /** Stable identifier; never localized, safe to persist. */
  id: string;
  /** Human label shown on the card. */
  label: string;
  /** How the motion is produced. See `EasingKind`. */
  kind: EasingKind;
  /** Control points; endpoints are fixed at (0,0) and (1,1). */
  bezier: Bezier;
  /** One line describing the motion, shown on hover. */
  hint: string;
}

/** After Effects clamps keyframe influence to this inclusive range. */
export const INFLUENCE_MIN = 0.1;
export const INFLUENCE_MAX = 100;

/**
 * The bezier easing library. Values are exact and must not drift.
 *
 * The families are the standard cubic-bezier approximations of the classic
 * easing functions, in the order a motion designer reaches for them: the AE
 * default first, then no easing at all, then the families ordered by how sharply
 * they bend — Sine barely, Expo hard.
 *
 * Every curve here is monotonic within [0,1], which is precisely why they can
 * all run through the keyframe engine. Overshoot easings are not in this list
 * for that reason, not by oversight: a Back or Bounce curve leaves the unit
 * square, and no pair of keyframe influence/speed values can describe it.
 */
export const EASING_PRESETS: EasingPreset[] = [
  {
    id: "easy-ease",
    label: "Easy Ease",
    kind: "bezier",
    bezier: [0.333, 0, 0.667, 1],
    hint: "Gentle acceleration then deceleration.",
  },
  {
    id: "linear",
    label: "Linear",
    kind: "bezier",
    bezier: [0, 0, 1, 1],
    hint: "Constant speed from start to end.",
  },
  {
    id: "sine-in",
    label: "Sine In",
    kind: "bezier",
    bezier: [0.12, 0, 0.39, 0],
    hint: "Gradual acceleration from zero velocity.",
  },
  {
    id: "sine-out",
    label: "Sine Out",
    kind: "bezier",
    bezier: [0.61, 1, 0.88, 1],
    hint: "Gradual deceleration to zero velocity.",
  },
  {
    id: "sine-in-out",
    label: "Sine In-Out",
    kind: "bezier",
    bezier: [0.37, 0, 0.63, 1],
    hint: "Gentle acceleration then deceleration.",
  },
  {
    id: "quad-in",
    label: "Quad In",
    kind: "bezier",
    bezier: [0.11, 0, 0.5, 0],
    hint: "Accelerates from zero velocity.",
  },
  {
    id: "quad-out",
    label: "Quad Out",
    kind: "bezier",
    bezier: [0.5, 1, 0.89, 1],
    hint: "Decelerates to zero velocity.",
  },
  {
    id: "quad-in-out",
    label: "Quad In-Out",
    kind: "bezier",
    bezier: [0.45, 0, 0.55, 1],
    hint: "Acceleration until halfway, then deceleration.",
  },
  {
    id: "cubic-in",
    label: "Cubic In",
    kind: "bezier",
    bezier: [0.32, 0, 0.67, 0],
    hint: "Starts slow, then accelerates quickly.",
  },
  {
    id: "cubic-out",
    label: "Cubic Out",
    kind: "bezier",
    bezier: [0.33, 1, 0.68, 1],
    hint: "Starts fast, then decelerates slowly.",
  },
  {
    id: "cubic-in-out",
    label: "Cubic In-Out",
    kind: "bezier",
    bezier: [0.65, 0, 0.35, 1],
    hint: "Slow start and end, fast in the middle.",
  },
  {
    id: "expo-in",
    label: "Expo In",
    kind: "bezier",
    bezier: [0.7, 0, 0.84, 0],
    hint: "Slow start, then rapid acceleration.",
  },
  {
    id: "expo-out",
    label: "Expo Out",
    kind: "bezier",
    bezier: [0.16, 1, 0.3, 1],
    hint: "Rapid deceleration to a slow end.",
  },
  {
    id: "expo-in-out",
    label: "Expo In-Out",
    kind: "bezier",
    bezier: [0.87, 0, 0.13, 1],
    hint: "Rapid acceleration and deceleration.",
  },
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
