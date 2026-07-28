/**
 * Re-pivot — pure position-track shifting.
 *
 * Moving the anchor of a layer whose position is animated cannot be fixed by a
 * single position write, because there is no single position to write: every
 * keyframe holds one. This module applies one offset to the whole track,
 * leaving times untouched.
 *
 * THE OFFSET, AND WHY IT IS CONSTANT.
 * After Effects maps a layer-space point `p` to comp space at time `t` as
 *
 *     comp(p, t) = position(t) + R(t) * S(t) * (p - A)
 *
 * so the correction that would hold the pixels still while the anchor moves from
 * `A` to `A'` is `R(t) * S(t) * (A' - A)` — time-varying whenever rotation or
 * scale animate. The host does **not** track it over time. It evaluates the
 * correction once, at the composition's current time, and shifts every keyframe
 * by that one vector.
 *
 * That choice is the whole design, so it is worth being blunt about what it
 * buys and what it costs:
 *
 *   - **Kept: the motion path.** One vector added to every keyframe moves the
 *     track rigidly. Distances and directions between keyframes are unchanged,
 *     so a straight path stays straight, and times, interpolation and eases all
 *     survive because only values are written.
 *   - **Kept: the current frame.** The offset is exact at `t_now`, so the layer
 *     does not jump at the frame the user is looking at when they click.
 *   - **Given up: the pixels elsewhere.** A layer with animated rotation now
 *     turns about the new anchor, so frames away from `t_now` render
 *     differently. That is what moving a pivot *means*.
 *
 * An earlier version chased the pixels instead, resampling `position(t)` onto
 * the frame grid so every rendered frame matched the old one. It worked, and it
 * was wrong: preserving the picture of a rotating layer forces its position
 * track into an arc that needs one keyframe per frame to describe, destroying
 * the path and the eases in order to preserve an image the user had just asked
 * to change. The sampling machinery has been removed.
 *
 * The matrix is never reimplemented here: the host obtains the offset from
 * `computeAnchorMove` in `shared/anchor`, called with a zero current position so
 * its `newPosition` is the bare correction term.
 *
 * ES3 CONSTRAINT: bundled into the ExtendScript host, so ES3 built-ins only.
 *
 * Author: Dr. Huoston Rodrigues
 * Website: https://huoston.art/
 * Email: hello@huoston.art
 * Version: 0.2.0
 * Created: 2026-07-28
 * Modified: 2026-07-29
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
