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
 * than a visible failure, because it looks correct wherever the user scrubs to
 * check. That case is handled by the second half of this module instead:
 * resampling.
 *
 * THE SAMPLED VARIANT, AND WHAT IT ACTUALLY GUARANTEES.
 * With `R` and `S` animated, `position'(t)` is evaluated on a grid — one sample
 * per frame — and written back as dense linear keyframes. The honest statement of
 * the guarantee has two halves:
 *
 *   - **At every sampled time the compensation is exact**, because it is the same
 *     closed-form expression, evaluated there. After Effects renders at frame
 *     times, so with a per-frame grid every rendered frame is exact.
 *   - **Between samples the reconstruction is linear** while the true correction
 *     curves, so a sub-frame deviation exists. It matters only where After
 *     Effects evaluates between frames — motion blur, a nested comp that is time
 *     stretched or time remapped.
 *
 * That residual is second-order in the step size: halving the sampling interval
 * quarters it. At one sample per frame it is far below a pixel for any plausible
 * rotation rate, but "far below a pixel" is a claim, so the host measures the
 * deviation at the midpoint of every interval and reports the worst one rather
 * than asserting it.
 *
 * The deviation also absorbs a second approximation: the original `position(t)`
 * may itself have been curved by eases, and the resampled track linearizes it
 * between frames. Measuring at midpoints therefore captures both sources at once,
 * which is why the measurement is done against the true expression rather than
 * against the offset term alone.
 *
 * The matrix is never reimplemented here: every variant routes through
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
 * Modified: 2026-07-28
 * License: GPL-3.0-or-later
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { computeAnchorMove } from "./anchor";
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

/* -------------------------------------------------------------------------- */
/* Sampled variant — for animated rotation and scale                          */
/* -------------------------------------------------------------------------- */

/**
 * The layer's transform read at one instant, as the host samples it from After
 * Effects via `valueAtTime`.
 */
export interface TransformSample {
  /** Composition time, in seconds. */
  time: number;
  /** Position value at `time`: 2 components, or 3 on a 3-D layer. */
  position: number[];
  /** Scale percentages at `time`. */
  scale: Vec2;
  /** Z rotation at `time`, in degrees. */
  rotation: number;
}

/**
 * Absolute ceiling on grid size, so a nonsensical time range cannot allocate an
 * unbounded array. The host applies its own, much lower, limit first and refuses
 * with an explanation; this is only a backstop.
 */
const ABSOLUTE_MAX_SAMPLES = 100000;

/**
 * `position'(t) = position(t) + R(t) * S(t) * (A' - A)` at a single instant.
 *
 * The correction is obtained from `computeAnchorMove` with a zero current
 * position, so its `newPosition` is the bare `R * S * (A' - A)` term. One
 * implementation of the matrix, shared with Anchor Point and the exact path.
 */
export const compensatedPositionAt = (
  originalPosition: number[],
  currentAnchor: Vec2,
  targetAnchor: Vec2,
  scale: Vec2,
  rotationDegrees: number
): number[] => {
  const offset = computeAnchorMove(
    currentAnchor,
    [0, 0],
    targetAnchor,
    scale,
    rotationDegrees
  ).newPosition;
  return offsetPositionValue(originalPosition, offset);
};

/**
 * The sampling grid: one time per frame from `t0` to `t1`, inclusive at both
 * ends.
 *
 * Times are computed as `t0 + i * step` rather than accumulated, so rounding
 * error cannot creep along the grid, and the final entry is set to `t1` exactly
 * so the last sample lands on the real end of the animated range instead of a
 * float-error neighbour of it.
 */
export const buildSampleTimes = (
  t0: number,
  t1: number,
  frameDuration: number
): number[] => {
  const times: number[] = [];
  if (typeof t0 !== "number" || typeof t1 !== "number") return times;
  if (!isFinite(t0) || !isFinite(t1)) return times;
  if (!isFinite(frameDuration) || frameDuration <= 0) return times;
  if (t1 < t0) return times;

  if (t1 === t0) {
    times.push(t0);
    return times;
  }

  let count = Math.floor((t1 - t0) / frameDuration + 0.5) + 1;
  if (count < 2) count = 2;
  if (count > ABSOLUTE_MAX_SAMPLES) count = ABSOLUTE_MAX_SAMPLES;

  const step = (t1 - t0) / (count - 1);
  for (let i = 0; i < count; i++) {
    times.push(i === count - 1 ? t1 : t0 + i * step);
  }
  return times;
};

/**
 * How many samples a range would need. The host checks this against its own cap
 * *before* building anything, so an over-long range is refused rather than
 * silently under-sampled — a coarser grid would quietly increase the deviation,
 * which is exactly the failure this tool is supposed to make visible.
 */
export const requiredSampleCount = (
  t0: number,
  t1: number,
  frameDuration: number
): number => {
  if (!isFinite(t0) || !isFinite(t1) || !isFinite(frameDuration)) return 0;
  if (frameDuration <= 0 || t1 < t0) return 0;
  if (t1 === t0) return 1;
  return Math.floor((t1 - t0) / frameDuration + 0.5) + 1;
};

/**
 * Compensated position at every sample. Returns one value per sample, in order.
 */
export const buildResampledValues = (
  samples: TransformSample[],
  currentAnchor: Vec2,
  targetAnchor: Vec2
): number[][] => {
  const out: number[][] = [];
  if (!samples) return out;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    out.push(
      compensatedPositionAt(
        s.position,
        currentAnchor,
        targetAnchor,
        s.scale,
        s.rotation
      )
    );
  }
  return out;
};

/**
 * Worst-case sub-frame deviation of the resampled track, in pixels.
 *
 * For each interval, compares where the dense linear keyframes put the layer at
 * the interval's midpoint — the average of its two endpoint values — against
 * where the closed-form compensation says it should be there. `midSamples[i]`
 * must be the transform sampled at the midpoint of interval `i`, so there is one
 * fewer of them than there are grid samples.
 *
 * Measuring against the true expression rather than against the offset term
 * alone is deliberate: it also captures the linearization of any curve the
 * original position had between frames, which is a real part of what the user
 * would see.
 */
export const maxLinearDrift = (
  values: number[][],
  midSamples: TransformSample[],
  currentAnchor: Vec2,
  targetAnchor: Vec2
): number => {
  if (!values || !midSamples) return 0;

  let worst = 0;
  const intervals = values.length - 1;
  for (let i = 0; i < intervals && i < midSamples.length; i++) {
    const a = values[i];
    const b = values[i + 1];
    if (!a || !b) continue;

    const s = midSamples[i];
    const desired = compensatedPositionAt(
      s.position,
      currentAnchor,
      targetAnchor,
      s.scale,
      s.rotation
    );

    const dx = (a[0] + b[0]) / 2 - desired[0];
    const dy = (a[1] + b[1]) / 2 - desired[1];
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (isFinite(distance) && distance > worst) worst = distance;
  }
  return worst;
};
