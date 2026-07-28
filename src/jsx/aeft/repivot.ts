/**
 * Re-pivot — After Effects host side.
 *
 * Moves the anchor point of a layer whose *position is animated*, re-baking every
 * position keyframe so the animation stays visually identical. This is precisely
 * the case Smart Anchor Point refuses: that tool performs a single position
 * write, which cannot compensate a value that changes over time. This one is the
 * separate, advanced answer, and the two coexist deliberately — the safe tool
 * stays safe.
 *
 * WHY ONLY STATIC SCALE AND ROTATION ARE EXACT.
 * After Effects maps a layer-space point `p` to comp space at time `t` as
 *
 *     comp(p, t) = position(t) + R(t) * S(t) * (p - A)
 *
 * Holding that identical for every `p` while the anchor moves from `A` to `A'`
 * requires
 *
 *     position'(t) = position(t) + R(t) * S(t) * (A' - A)
 *
 * With `R` and `S` constant, the correction `R * S * (A' - A)` is one fixed
 * vector: adding it to every keyframe translates the whole motion path rigidly,
 * and the interpolation between two shifted keyframes is the shifted
 * interpolation — so the result is exact at every frame, not just at keyframes.
 *
 * If `R` or `S` are animated the correct offset varies with time, so there is no
 * single vector to add. That case takes the second route: **resampling**.
 *
 * THE TWO ROUTES.
 *
 *   - **Exact** (rotation and scale static). One constant vector shifts the
 *     existing position keyframes. Times, interpolation and eases survive
 *     untouched, because only values are written. Cheap, and preferred whenever
 *     it applies.
 *   - **Sampled** (rotation or scale animated). `position'(t)` is evaluated on
 *     the frame grid across the animated range and written back as dense linear
 *     keyframes. Exact at every sampled time — and After Effects renders at
 *     frame times, so every rendered frame is exact. Between samples the
 *     reconstruction is linear while the true correction curves, leaving a
 *     sub-frame deviation that shows up only where AE evaluates off-frame
 *     (motion blur, a time-stretched or time-remapped nested comp). The host
 *     measures that deviation at the midpoint of every interval and reports the
 *     worst one instead of claiming it is negligible.
 *
 * THE COST OF THE SAMPLED ROUTE, STATED PLAINLY: it replaces the user's position
 * keyframes with one per frame. The motion is reproduced, but the original eases
 * are gone — baked into the sampled values rather than surviving as curve
 * handles. That is the price of keeping a layer pinned while rotation varies,
 * and it is why the exact route is still taken whenever it can be.
 *
 * A LAYER WITH STATIC POSITION AND ANIMATED ROTATION IS THE HEADLINE CASE, and
 * it has no position keyframes at all. The "not animated" refusal therefore
 * tests position, scale and rotation together — testing position alone would
 * turn away exactly the layers this tool was extended for.
 *
 * Nothing here touches `inPoint`, `outPoint` or `startTime`.
 *
 * IDEMPOTENT. A second run against the same target computes a zero correction —
 * the anchor is already there — and is skipped rather than rewriting every
 * keyframe with an identical value.
 *
 * The matrix maths is imported from `shared/anchor` and the re-baking from
 * `shared/repivot`; neither is reimplemented here, and `shared/anchor` and
 * `aeft/anchor` are not modified by this tool.
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

import {
  anchorForRect,
  computeAnchorMove,
  findAnchorPoint,
} from "../../shared/anchor";
import type { AnchorPointSpec, SourceRect, Vec2 } from "../../shared/anchor";
import {
  buildResampledValues,
  buildSampleTimes,
  isZeroOffset,
  maxLinearDrift,
  rebakePositionKeys,
  requiredSampleCount,
} from "../../shared/repivot";
import type { PositionKey, TransformSample } from "../../shared/repivot";

export interface RepivotResult {
  applied: number;
  message: string;
}

/** Transform property match names (locale-independent). */
const MN_TRANSFORM = "ADBE Transform Group";
const MN_ANCHOR = "ADBE Anchor Point";
const MN_POSITION = "ADBE Position";
const MN_SCALE = "ADBE Scale";
const MN_ROTATE_Z = "ADBE Rotate Z";
const MN_ROTATE_X = "ADBE Rotate X";
const MN_ROTATE_Y = "ADBE Rotate Y";
const MN_ORIENTATION = "ADBE Orientation";

/**
 * Layer types. Read from `matchName` and nothing else: `instanceof AVLayer` is
 * not satisfied by shape or text layers in ExtendScript even though both answer
 * `sourceRectAtTime`, and `layer.source` is null for them, so it says nothing
 * about bounds either. Detection is reimplemented locally rather than imported,
 * so that the shipped Anchor Point host stays untouched.
 */
const MN_LAYER_VECTOR = "ADBE Vector Layer";
const MN_LAYER_TEXT = "ADBE Text Layer";
const MN_LAYER_AV = "ADBE AV Layer";
const MN_LAYER_CAMERA = "ADBE Camera Layer";
const MN_LAYER_LIGHT = "ADBE Light Layer";

/** Layer types documented to answer `sourceRectAtTime`. */
const BOUNDED_LAYER_TYPES = [MN_LAYER_VECTOR, MN_LAYER_TEXT, MN_LAYER_AV];

const NO_COMP_MESSAGE = "Open a composition first.";
const NO_SELECTION_MESSAGE = "Select an animated layer first.";

/**
 * Ceiling on how many position keyframes a resample may write.
 *
 * Not an arithmetic limit — a limit on what is reasonable to do to someone's
 * project. Ten seconds at 24fps is 241 keyframes, which is already a dense but
 * workable track; a two-minute range at 60fps would be 7200 and would make the
 * property unusable in the timeline. Past this the tool refuses and says so,
 * rather than quietly sampling coarser, which would inflate the deviation this
 * tool exists to keep small.
 */
const MAX_RESAMPLE_KEYS = 3000;

/* -------------------------------------------------------------------------- */
/* Refusal accumulation                                                        */
/* -------------------------------------------------------------------------- */

interface SkipLog {
  reasons: string[];
  counts: number[];
  total: number;
}

const newSkipLog = (): SkipLog => {
  return { reasons: [], counts: [], total: 0 };
};

const addSkip = (log: SkipLog, reason: string): void => {
  log.total++;
  for (let i = 0; i < log.reasons.length; i++) {
    if (log.reasons[i] === reason) {
      log.counts[i]++;
      return;
    }
  }
  log.reasons.push(reason);
  log.counts.push(1);
};

/** The reason that accounts for the most skipped layers. */
const predominantReason = (log: SkipLog): string => {
  let best = 0;
  for (let i = 1; i < log.counts.length; i++) {
    if (log.counts[i] > log.counts[best]) best = i;
  }
  return log.reasons.length > 0 ? log.reasons[best] : "";
};

const buildMessage = (
  applied: number,
  resampled: number,
  worstDrift: number,
  log: SkipLog
): string => {
  if (applied === 0 && log.total === 0) return NO_SELECTION_MESSAGE;
  if (applied === 0) {
    return "Skipped " + log.total + " layer(s): " + predominantReason(log);
  }
  let msg = "Re-pivoted " + applied + " layer(s)";
  if (resampled > 0) {
    // Naming the measured deviation rather than claiming it is negligible: the
    // number is what the user needs to judge whether the trade was worth it.
    msg += " (resampled, max drift " + formatDrift(worstDrift) + "px)";
  }
  if (log.total > 0) {
    msg += "; skipped " + log.total + ": " + predominantReason(log);
  }
  return msg;
};

/* -------------------------------------------------------------------------- */
/* Small AE readers                                                           */
/* -------------------------------------------------------------------------- */

const layerMatchName = (layer: Layer): string => {
  try {
    const mn = layer.matchName;
    return mn ? mn : "unknown";
  } catch (e) {
    return "unknown";
  }
};

/** "(Name) [ADBE Text Layer]" — a refusal that names the type it refused. */
const describeLayer = (layer: Layer): string => {
  return "(" + layer.name + ") [" + layerMatchName(layer) + "]";
};

const isBoundedLayerType = (mn: string): boolean => {
  for (let i = 0; i < BOUNDED_LAYER_TYPES.length; i++) {
    if (BOUNDED_LAYER_TYPES[i] === mn) return true;
  }
  return false;
};

/** Read a property by match name, or null when absent. */
const prop = (group: PropertyGroup, matchName: string): Property | null => {
  try {
    const p = group.property(matchName);
    return p ? (p as Property) : null;
  } catch (e) {
    return null;
  }
};

/** Keyframe count, treating an unreadable count as none. */
const keyCount = (p: Property | null): number => {
  if (!p) return 0;
  try {
    return p.numKeys;
  } catch (e) {
    return 0;
  }
};

/** An active expression overrides anything written, so it disqualifies. */
const hasExpression = (p: Property | null): boolean => {
  if (!p) return false;
  try {
    return p.expressionEnabled === true;
  } catch (e) {
    return false;
  }
};

/** Keyframed or expression-driven: either way, not a static value. */
const isAnimated = (p: Property | null): boolean => {
  return keyCount(p) > 0 || hasExpression(p);
};

const numValue = (p: Property | null, fallback: number): number => {
  if (!p) return fallback;
  try {
    const v = p.value as unknown as number;
    return typeof v === "number" && isFinite(v) ? v : fallback;
  } catch (e) {
    return fallback;
  }
};

const vecValue = (p: Property | null): number[] | null => {
  if (!p) return null;
  try {
    const v = p.value as unknown as number[];
    if (v instanceof Array) return v;
    return null;
  } catch (e) {
    return null;
  }
};

/** Outcome of actually asking AE for a bounding box. */
interface RectProbe {
  rect: SourceRect | null;
  empty: boolean;
}

/**
 * Ask for the bounding box and judge the answer rather than predicting whether
 * asking would work. A zero-size rect is a real box that happens to be
 * degenerate, so it is reported apart from "no box at all".
 */
const probeRect = (layer: Layer, time: number): RectProbe => {
  let rect: SourceRect | null = null;
  try {
    rect = (layer as AVLayer).sourceRectAtTime(time, false);
  } catch (e) {
    rect = null;
  }
  if (!rect) return { rect: null, empty: false };

  const w = rect.width;
  const h = rect.height;
  if (
    typeof w !== "number" ||
    typeof h !== "number" ||
    !isFinite(w) ||
    !isFinite(h)
  ) {
    return { rect: null, empty: false };
  }
  if (w <= 0 || h <= 0) return { rect: null, empty: true };
  return { rect: rect, empty: false };
};

const probeRefusal = (probe: RectProbe, mn: string): string | null => {
  if (probe.rect) return null;
  if (probe.empty) return "Empty layer (zero-size bounds)";
  return isBoundedLayerType(mn)
    ? "No bounding box available"
    : "No bounding box available for unrecognised layer type";
};

/* -------------------------------------------------------------------------- */
/* Sampling and keyframe surgery                                              */
/* -------------------------------------------------------------------------- */

/** The time span a property's keyframes cover, or null when it has none. */
interface KeyRange {
  t0: number;
  t1: number;
}

const keyRange = (p: Property | null): KeyRange | null => {
  const n = keyCount(p);
  if (!p || n < 1) return null;
  try {
    return { t0: p.keyTime(1), t1: p.keyTime(n) };
  } catch (e) {
    return null;
  }
};

/** Widen `range` to also cover `other`. Either may be null. */
const unionRange = (
  range: KeyRange | null,
  other: KeyRange | null
): KeyRange | null => {
  if (!other) return range;
  if (!range) return { t0: other.t0, t1: other.t1 };
  return {
    t0: range.t0 < other.t0 ? range.t0 : other.t0,
    t1: range.t1 > other.t1 ? range.t1 : other.t1,
  };
};

/**
 * Value at a time, post-expression.
 *
 * Post-expression is deliberate for scale and rotation: what has to be
 * compensated is the transform After Effects actually renders, not the
 * keyframed value an expression may be overriding. Position carries no
 * expression here — that is refused — so the distinction does not arise for it.
 */
const vecAtTime = (p: Property | null, t: number): number[] | null => {
  if (!p) return null;
  try {
    const v = p.valueAtTime(t, false) as unknown as number[];
    return v instanceof Array ? v : null;
  } catch (e) {
    return null;
  }
};

const numAtTime = (
  p: Property | null,
  t: number,
  fallback: number
): number => {
  if (!p) return fallback;
  try {
    const v = p.valueAtTime(t, false) as unknown as number;
    return typeof v === "number" && isFinite(v) ? v : fallback;
  } catch (e) {
    return fallback;
  }
};

/** Read the whole transform at one instant. Null when position is unreadable. */
const sampleTransform = (
  positionProp: Property,
  scaleProp: Property | null,
  rotationProp: Property | null,
  t: number
): TransformSample | null => {
  const position = vecAtTime(positionProp, t);
  if (!position) return null;

  const scaleVec = vecAtTime(scaleProp, t);
  return {
    time: t,
    position: position,
    scale: scaleVec ? [scaleVec[0], scaleVec[1]] : [100, 100],
    rotation: numAtTime(rotationProp, t, 0),
  };
};

/** Delete every keyframe, last first so indices stay valid as we go. */
const clearKeys = (p: Property): void => {
  for (let i = keyCount(p); i >= 1; i--) {
    try {
      p.removeKey(i);
    } catch (e) {
      // Not removable; leave it rather than abort the whole run.
    }
  }
};

/**
 * Make every keyframe linear, temporally and spatially.
 *
 * Temporal linearity is what makes the reconstruction match what was measured:
 * the deviation figure reported to the user assumes straight interpolation
 * between samples, so bezier keyframes would overshoot and quietly invalidate
 * it. Spatial tangents are zeroed for the same reason — auto-bezier would bow
 * the path between samples that are already one frame apart.
 *
 * Best-effort per key: a property that rejects spatial tangents (a non-spatial
 * position) still gets its temporal interpolation set.
 */
const linearizeKeys = (p: Property, dimensions: number): void => {
  const n = keyCount(p);
  for (let i = 1; i <= n; i++) {
    try {
      p.setInterpolationTypeAtKey(
        i,
        KeyframeInterpolationType.LINEAR,
        KeyframeInterpolationType.LINEAR
      );
    } catch (e) {
      // Interpolation type rejected; the sampled values are still correct.
    }
    try {
      // The tangent arity has to match the property's dimensionality, so the
      // two cases are written out rather than built from a variable-length
      // array the typings cannot check.
      if (dimensions > 2) {
        p.setSpatialTangentsAtKey(i, [0, 0, 0], [0, 0, 0]);
      } else {
        p.setSpatialTangentsAtKey(i, [0, 0], [0, 0]);
      }
    } catch (e) {
      // Not a spatial property, or tangents rejected.
    }
  }
};

/** "0.44" / "<0.01" — never exponent notation in a user-facing message. */
const formatDrift = (d: number): string => {
  if (typeof d !== "number" || !isFinite(d) || d <= 0) return "0";
  if (d < 0.01) return "<0.01";
  return String(Math.round(d * 100) / 100);
};

/* -------------------------------------------------------------------------- */
/* Apply                                                                       */
/* -------------------------------------------------------------------------- */

/** What happened to one layer. */
interface LayerOutcome {
  /** Null on success, or the refusal reason. */
  reason: string | null;
  /** Whether the sampled route was taken rather than the exact one. */
  resampled: boolean;
  /** Worst measured sub-frame deviation, in pixels. Zero on the exact route. */
  drift: number;
}

const refuse = (reason: string): LayerOutcome => {
  return { reason: reason, resampled: false, drift: 0 };
};

/**
 * Re-pivot one selected layer.
 *
 * Two routes. When rotation and scale are static the correction is a constant
 * vector and the existing position keyframes are simply shifted — exact, cheap,
 * and it preserves the user's eases. When either is animated the correction
 * varies with time, so position is resampled onto the frame grid instead. The
 * route is chosen here; the guards above it apply to both.
 */
const applyToLayer = (
  layer: Layer,
  comp: CompItem,
  spec: AnchorPointSpec
): LayerOutcome => {
  const time = comp.time;
  const mn = layerMatchName(layer);
  const name = describeLayer(layer);

  if (mn === MN_LAYER_CAMERA || mn === MN_LAYER_LIGHT) {
    return refuse("Camera/Light has no bounds " + name);
  }

  const transform = layer.property(MN_TRANSFORM) as PropertyGroup;
  if (!transform) return refuse("No transform group " + name);

  const anchorProp = prop(transform, MN_ANCHOR);
  const positionProp = prop(transform, MN_POSITION);
  const scaleProp = prop(transform, MN_SCALE);
  const rotationProp = prop(transform, MN_ROTATE_Z);

  if (!anchorProp || !positionProp) {
    return refuse("No anchor/position properties " + name);
  }

  // Separated dimensions split position into two scalar properties, so neither
  // the combined read nor the combined write below would reach the real values.
  let separated = false;
  try {
    separated = positionProp.dimensionsSeparated === true;
  } catch (e) {
    separated = false;
  }
  if (separated) {
    return refuse("Separated position dimensions: skipped " + name);
  }

  // An expression on position would override every keyframe written here, so
  // the tool would report success while changing nothing on screen.
  if (hasExpression(positionProp)) {
    return refuse("Expression on position: skipped " + name);
  }

  if (isAnimated(anchorProp)) {
    return refuse("Animated anchor: skipped " + name);
  }

  /**
   * An expression on scale or rotation makes the correction vary across the
   * whole timeline rather than across a keyframe range, so there is no bounded
   * span to resample: honouring it would mean rewriting position for the entire
   * composition, which is far more than the user asked for. Baking the
   * expression to keyframes first gives the tool the range it needs.
   */
  if (hasExpression(scaleProp) || hasExpression(rotationProp)) {
    return refuse("Expression on scale/rotation: bake it to keyframes " + name);
  }

  const positionAnimated = keyCount(positionProp) > 0;
  const transformAnimated =
    keyCount(scaleProp) > 0 || keyCount(rotationProp) > 0;

  // Nothing moves at all: Anchor Point does this in one write, with no
  // keyframes involved. Note this is checked against *all three* properties —
  // a layer with a static position but animated rotation is precisely the case
  // this tool exists for, and must not be turned away here.
  if (!positionAnimated && !transformAnimated) {
    return refuse("Not animated - use Anchor Point instead " + name);
  }

  // Cast, not narrow: the typings hang `threeDLayer` off AVLayer, but the
  // runtime `instanceof AVLayer` that would narrow to it is false for the shape
  // and text layers this tool accepts.
  if ((layer as AVLayer).threeDLayer) {
    const rx = numValue(prop(transform, MN_ROTATE_X), 0);
    const ry = numValue(prop(transform, MN_ROTATE_Y), 0);
    const orient = vecValue(prop(transform, MN_ORIENTATION));
    const oriented =
      orient !== null &&
      (orient[0] !== 0 || orient[1] !== 0 || orient[2] !== 0);
    if (rx !== 0 || ry !== 0 || oriented) {
      return refuse("3D rotation not supported yet " + name);
    }
  }

  const probe = probeRect(layer, time);
  const probeSkip = probeRefusal(probe, mn);
  if (probeSkip !== null) return refuse(probeSkip + " " + name);
  const rect = probe.rect as SourceRect;

  const anchorVec = vecValue(anchorProp);
  if (!anchorVec) return refuse("Unreadable transform values: skipped " + name);

  const targetAnchor = anchorForRect(rect, spec);
  const currentAnchor: Vec2 = [anchorVec[0], anchorVec[1]];

  if (transformAnimated) {
    return resampleLayer(
      comp,
      name,
      anchorProp,
      positionProp,
      scaleProp,
      rotationProp,
      anchorVec,
      currentAnchor,
      targetAnchor
    );
  }

  return shiftLayerKeys(
    name,
    anchorProp,
    positionProp,
    scaleProp,
    rotationProp,
    anchorVec,
    currentAnchor,
    targetAnchor
  );
};

/**
 * Exact route — rotation and scale are static, so one constant vector shifts
 * every existing keyframe. Times, interpolation and eases are all preserved,
 * because only values are written. Unchanged from the original implementation.
 */
const shiftLayerKeys = (
  name: string,
  anchorProp: Property,
  positionProp: Property,
  scaleProp: Property | null,
  rotationProp: Property | null,
  anchorVec: number[],
  currentAnchor: Vec2,
  targetAnchor: Vec2
): LayerOutcome => {
  const scaleVec = vecValue(scaleProp);
  const scale: Vec2 = scaleVec ? [scaleVec[0], scaleVec[1]] : [100, 100];
  const rotation = numValue(rotationProp, 0);

  // The bare correction term R * S * (A' - A): passing a zero current position
  // makes `newPosition` the offset itself rather than a compensated position.
  // One implementation of the matrix maths, shared with Anchor Point.
  const offset = computeAnchorMove(
    currentAnchor,
    [0, 0],
    targetAnchor,
    scale,
    rotation
  ).newPosition;

  // Already on the requested point: do not dirty the project rewriting every
  // keyframe with the value it already holds.
  if (isZeroOffset(offset)) {
    return refuse("Anchor already at this point: skipped " + name);
  }

  // Read every keyframe before writing any of them, so the values used are all
  // pre-edit ones regardless of how AE handles a write mid-iteration.
  const keys: PositionKey[] = [];
  const total = keyCount(positionProp);
  for (let i = 1; i <= total; i++) {
    try {
      keys.push({
        time: positionProp.keyTime(i),
        value: positionProp.keyValue(i) as unknown as number[],
      });
    } catch (e) {
      return refuse("Unreadable position keyframes: skipped " + name);
    }
  }

  const rebaked = rebakePositionKeys(keys, offset);

  // Anchor first, then the keyframes. Both happen inside the caller's single
  // undo group, so a failure between them reverts as one step rather than
  // leaving the layer displaced.
  setAnchorValue(anchorProp, targetAnchor, anchorVec);

  for (let i = 0; i < rebaked.length; i++) {
    positionProp.setValueAtTime(rebaked[i].time, rebaked[i].value);
  }

  return { reason: null, resampled: false, drift: 0 };
};

/** Write the new anchor, preserving a 3-D layer's z component. */
const setAnchorValue = (
  anchorProp: Property,
  targetAnchor: Vec2,
  anchorVec: number[]
): void => {
  if (anchorVec.length > 2) {
    anchorProp.setValue([targetAnchor[0], targetAnchor[1], anchorVec[2]]);
  } else {
    anchorProp.setValue([targetAnchor[0], targetAnchor[1]]);
  }
};

/**
 * Sampled route — rotation or scale is animated, so the correction varies with
 * time and cannot be a single vector.
 *
 * Position is evaluated on the frame grid across the animated range, compensated
 * in closed form at each sample, and written back as dense linear keyframes.
 * Every sample is read before anything is written, because the first write to
 * position would change what the later reads returned.
 *
 * THE COST, STATED PLAINLY: this replaces the user's position keyframes with one
 * per frame. The motion is reproduced, but the original eases are gone — they
 * are baked into the sampled values instead of surviving as curve handles. That
 * is the price of keeping the layer pinned while rotation varies, and it is why
 * the exact route above is still preferred whenever it applies.
 */
const resampleLayer = (
  comp: CompItem,
  name: string,
  anchorProp: Property,
  positionProp: Property,
  scaleProp: Property | null,
  rotationProp: Property | null,
  anchorVec: number[],
  currentAnchor: Vec2,
  targetAnchor: Vec2
): LayerOutcome => {
  // Nothing to do: the anchor is already there, so the correction is zero at
  // every time, not just at one. Keeps a second run a genuine no-op.
  const probeOffset = computeAnchorMove(
    currentAnchor,
    [0, 0],
    targetAnchor,
    [100, 100],
    0
  ).newPosition;
  if (isZeroOffset(probeOffset)) {
    return refuse("Anchor already at this point: skipped " + name);
  }

  // The span over which the transform actually varies. Position's own range is
  // included so its keyframes are covered too; when position is static the span
  // comes entirely from scale and rotation, which is the headline case.
  let range = unionRange(null, keyRange(positionProp));
  range = unionRange(range, keyRange(scaleProp));
  range = unionRange(range, keyRange(rotationProp));
  if (!range) {
    return refuse("No keyframe range to resample: skipped " + name);
  }

  const frameDuration = comp.frameDuration;
  const required = requiredSampleCount(range.t0, range.t1, frameDuration);
  if (required < 1) {
    return refuse("Unreadable keyframe range: skipped " + name);
  }
  if (required > MAX_RESAMPLE_KEYS) {
    return refuse(
      "Animated range too long to resample (" +
        required +
        " frames): skipped " +
        name
    );
  }

  const times = buildSampleTimes(range.t0, range.t1, frameDuration);
  if (times.length < 1) {
    return refuse("Unreadable keyframe range: skipped " + name);
  }

  // --- Read phase: nothing below this point may write until it is done. -----
  const samples: TransformSample[] = [];
  for (let i = 0; i < times.length; i++) {
    const s = sampleTransform(positionProp, scaleProp, rotationProp, times[i]);
    if (!s) return refuse("Unreadable position values: skipped " + name);
    samples.push(s);
  }

  // Midpoints, for measuring what the linear reconstruction costs between
  // frames rather than assuming it is negligible.
  const midSamples: TransformSample[] = [];
  for (let i = 0; i < times.length - 1; i++) {
    const mid = (times[i] + times[i + 1]) / 2;
    const s = sampleTransform(positionProp, scaleProp, rotationProp, mid);
    if (s) midSamples.push(s);
  }

  const values = buildResampledValues(samples, currentAnchor, targetAnchor);
  const drift = maxLinearDrift(
    values,
    midSamples,
    currentAnchor,
    targetAnchor
  );

  // --- Write phase ----------------------------------------------------------
  setAnchorValue(anchorProp, targetAnchor, anchorVec);

  // Old keyframes go first. Leaving them would mix the user's original eases
  // between the new dense samples, which is neither the old motion nor the
  // measured one.
  clearKeys(positionProp);

  for (let i = 0; i < times.length && i < values.length; i++) {
    positionProp.setValueAtTime(times[i], values[i]);
  }

  const dimensions = samples[0].position.length;
  linearizeKeys(positionProp, dimensions);

  return { reason: null, resampled: true, drift: drift };
};

/**
 * Move the anchor of every selected animated layer to one of the nine canonical
 * bounding-box points, re-baking position keyframes to keep the animation.
 */
export const repivotAnimated = (pointId: string): RepivotResult => {
  const spec = findAnchorPoint(pointId);
  if (!spec) {
    return { applied: 0, message: "Unknown anchor point: " + pointId };
  }

  const comp = app.project.activeItem;
  if (!(comp instanceof CompItem)) {
    return { applied: 0, message: NO_COMP_MESSAGE };
  }

  let applied = 0;
  let resampled = 0;
  let worstDrift = 0;
  const skips = newSkipLog();

  app.beginUndoGroup("H-Toolbelt: Re-pivot");
  try {
    const layers = comp.selectedLayers;
    for (let i = 0; i < layers.length; i++) {
      const outcome = applyToLayer(layers[i], comp, spec);
      if (outcome.reason === null) {
        applied++;
        if (outcome.resampled) {
          resampled++;
          if (outcome.drift > worstDrift) worstDrift = outcome.drift;
        }
      } else {
        addSkip(skips, outcome.reason);
      }
    }
  } finally {
    app.endUndoGroup();
  }

  return {
    applied: applied,
    message: buildMessage(applied, resampled, worstDrift, skips),
  };
};
