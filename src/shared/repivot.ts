/**
 * Re-pivot — pure keyframe re-baking.
 *
 * Moving the anchor of a layer whose position is animated cannot be fixed by a
 * single position write, because there is no single position to write: every
 * keyframe holds one. This module applies the compensating offset to a whole
 * keyframe list, leaving times untouched.
 *
 * WHY A CONSTANT OFFSET IS EXACTLY RIGHT — AND ONLY SOMETIMES.
 * After Effects maps a layer-space point `p` to comp space at time `t` as
 *
 *     comp(p, t) = position(t) + R(t) * S(t) * (p - A)
 *
 * Keeping that identical for every `p` while the anchor moves from `A` to `A'`
 * requires
 *
 *     position'(t) = position(t) + R(t) * S(t) * (A' - A)
 *
 * When `R` and `S` are constant, the correction term `R * S * (A' - A)` is a
 * constant vector: adding it to each keyframe's value translates the entire
 * motion path rigidly, and because interpolation between two shifted keyframes
 * is the shifted interpolation, the result is exact at every frame, not merely
 * at the keyframes.
 *
 * If `R` or `S` are themselves animated, the correction varies with time. Adding
 * a value only at the existing keyframes would then be right at those instants
 * and wrong between them — the layer would drift mid-tween, which is far worse
 * than refusing, because it looks correct wherever the user scrubs to check. The
 * host refuses that case; this module never sees it.
 *
 * The offset itself is not computed here: it comes from `computeAnchorMove` in
 * `shared/anchor`, called with a zero current position so its `newPosition` is
 * the bare correction term. That keeps one implementation of the matrix maths.
 *
 * ES3 CONSTRAINT: bundled into the ExtendScript host, so ES3 built-ins only.
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

import type { Vec2 } from "./anchor";

/** One position keyframe, as read from and written back to After Effects. */
export interface PositionKey {
  /** Composition time, in seconds. Never modified by this module. */
  time: number;
  /** The position value: 2 components for a 2-D layer, 3 for a 3-D one. */
  value: number[];
}

/** Below this, an offset is not worth writing keyframes for. */
export const OFFSET_EPSILON = 1e-9;

/**
 * Add a 2-D offset to a position value of any dimensionality.
 *
 * Only x and y move. A 3-D layer's z is carried through untouched, because the
 * anchor is retargeted within the 2-D bounding box that `sourceRectAtTime`
 * reports — there is no z component to the move, and inventing one would push
 * the layer through its own depth.
 */
export const offsetPositionValue = (
  value: number[],
  offset: Vec2
): number[] => {
  if (!value || !(value instanceof Array)) return [];

  const out: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const component = value[i];
    if (i === 0) {
      out.push(component + offset[0]);
    } else if (i === 1) {
      out.push(component + offset[1]);
    } else {
      out.push(component);
    }
  }
  return out;
};

/**
 * Apply the offset to every keyframe, preserving times and count.
 *
 * Returns a new list rather than mutating: the host reads every keyframe before
 * writing any of them, so the original values must survive the whole pass.
 */
export const rebakePositionKeys = (
  keys: PositionKey[],
  offset: Vec2
): PositionKey[] => {
  const out: PositionKey[] = [];
  if (!keys) return out;

  for (let i = 0; i < keys.length; i++) {
    out.push({
      time: keys[i].time,
      value: offsetPositionValue(keys[i].value, offset),
    });
  }
  return out;
};

/**
 * Is this offset small enough that applying it would be a no-op?
 *
 * Used to make a second run a genuine no-op: once the anchor sits on the
 * requested point the correction term is zero, so re-running the tool with the
 * same target must not rewrite every keyframe with an identical value and dirty
 * the project for nothing.
 */
export const isZeroOffset = (offset: Vec2, eps?: number): boolean => {
  const limit =
    typeof eps === "number" && isFinite(eps) && eps >= 0 ? eps : OFFSET_EPSILON;
  if (!offset) return true;

  const x = offset[0];
  const y = offset[1];
  if (typeof x !== "number" || typeof y !== "number") return true;
  if (!isFinite(x) || !isFinite(y)) return true;

  return Math.abs(x) <= limit && Math.abs(y) <= limit;
};
