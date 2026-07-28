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
 * WHAT IS PRESERVED IS THE PATH, NOT THE PIXELS.
 * The offset is evaluated once, at the composition's current time:
 *
 *     d = R(t_now) * S(t_now) * (A' - A)
 *
 * Every position keyframe moves by that same `d`. Because it is one vector:
 * the shape of the motion path is unchanged (a straight path stays straight),
 * times and eases survive because only values are written, and at `t_now` the
 * layer does not jump.
 *
 * For a layer with animated rotation or scale this means the render *does*
 * change away from `t_now` — the layer now turns about the new anchor. That is
 * the entire purpose of moving a pivot, not a defect to be compensated away.
 *
 * AN EARLIER VERSION GOT THIS BACKWARDS. It preserved the rendered pixels at
 * every frame, which for animated rotation forces `position(t)` into an arc and
 * requires one keyframe per frame to describe it — destroying the user's path
 * and their eases in order to keep a picture they had asked to change. Path
 * preservation is what a motion designer means by "move the anchor"; pixel
 * preservation is what they mean by "don't move it at all". The resampling
 * machinery is gone.
 *
 * A LAYER WITH STATIC POSITION AND ANIMATED ROTATION IS THE HEADLINE CASE, and
 * it has no position keyframes at all. The "not animated" refusal therefore
 * tests position, scale and rotation together — testing position alone would
 * turn away exactly the layers this tool exists for — and such a layer has its
 * single static position value shifted instead of a keyframe track.
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
  isZeroOffset,
  offsetPositionValue,
  rebakePositionKeys,
} from "../../shared/repivot";
import type { PositionKey } from "../../shared/repivot";

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

const buildMessage = (applied: number, log: SkipLog): string => {
  if (applied === 0 && log.total === 0) return NO_SELECTION_MESSAGE;
  if (applied === 0) {
    return "Skipped " + log.total + " layer(s): " + predominantReason(log);
  }
  let msg = "Re-pivoted " + applied + " layer(s)";
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
/* Time-resolved reads                                                        */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Apply                                                                       */
/* -------------------------------------------------------------------------- */

/** Refusal reason for one layer, or null when it was re-pivoted. */
const refuse = (reason: string): string => {
  return reason;
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
): string | null => {
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

  const positionAnimated = keyCount(positionProp) > 0;
  const transformAnimated =
    isAnimated(scaleProp) || isAnimated(rotationProp);

  // Nothing moves at all: Anchor Point does this in one write. Checked against
  // all three properties — a layer with a static position but animated rotation
  // is precisely the case this tool exists for, and must not be turned away.
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

  return shiftLayerKeys(
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
};

/**
 * Shift the whole position track by one constant vector and move the anchor.
 *
 * The offset is `R(t_now) * S(t_now) * (A' - A)`, evaluated at the composition's
 * current time. Because it is a single vector:
 *
 *   - the **shape** of the motion path is unchanged — every keyframe moves by
 *     the same amount, so the distances and directions between them are
 *     identical and a straight path stays straight;
 *   - **times, interpolation and eases survive**, because only values are
 *     written, at the keyframes' existing times;
 *   - at `t_now` there is **no jump**, since the offset is exactly right there.
 *
 * Away from `t_now`, a layer with animated rotation or scale now renders
 * differently — it rotates about the new anchor. That is the entire point of
 * moving a pivot, not a defect. Chasing the old pixels instead would force the
 * position track into an arc of per-frame keyframes and throw away the user's
 * eases, which is worse in every way the user actually cares about.
 *
 * A layer with no position keyframes has its single value shifted instead, which
 * is the same arithmetic with a track of length one.
 */
const shiftLayerKeys = (
  comp: CompItem,
  name: string,
  anchorProp: Property,
  positionProp: Property,
  scaleProp: Property | null,
  rotationProp: Property | null,
  anchorVec: number[],
  currentAnchor: Vec2,
  targetAnchor: Vec2
): string | null => {
  // Read the transform at the current time explicitly rather than via `.value`:
  // the two agree today, but naming the time is what makes "no jump at the frame
  // the user is looking at" a property of the code rather than a coincidence.
  // Post-expression, so an expression-driven rotation is honoured as rendered.
  const now = comp.time;
  const scaleVec = vecAtTime(scaleProp, now);
  const scale: Vec2 = scaleVec ? [scaleVec[0], scaleVec[1]] : [100, 100];
  const rotation = numAtTime(rotationProp, now, 0);

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
    return "Anchor already at this point: skipped " + name;
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
      return "Unreadable position keyframes: skipped " + name;
    }
  }

  // No keyframes: the layer sits still while something else animates. Shift the
  // one static value, read before the anchor write.
  let staticValue: number[] | null = null;
  if (total === 0) {
    staticValue = vecAtTime(positionProp, now);
    if (!staticValue) {
      return "Unreadable position values: skipped " + name;
    }
  }

  const rebaked = rebakePositionKeys(keys, offset);

  // Anchor first, then the position. Both happen inside the caller's single
  // undo group, so a failure between them reverts as one step rather than
  // leaving the layer displaced.
  setAnchorValue(anchorProp, targetAnchor, anchorVec);

  if (staticValue) {
    positionProp.setValue(offsetPositionValue(staticValue, offset));
  } else {
    for (let i = 0; i < rebaked.length; i++) {
      positionProp.setValueAtTime(rebaked[i].time, rebaked[i].value);
    }
  }

  return null;
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
 * Move the anchor of every selected animated layer to one of the nine canonical
 * bounding-box points, shifting the position track so the motion path is kept.
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
  const skips = newSkipLog();

  app.beginUndoGroup("H-Toolbelt: Re-pivot");
  try {
    const layers = comp.selectedLayers;
    for (let i = 0; i < layers.length; i++) {
      const reason = applyToLayer(layers[i], comp, spec);
      if (reason === null) {
        applied++;
      } else {
        addSkip(skips, reason);
      }
    }
  } finally {
    app.endUndoGroup();
  }

  return { applied: applied, message: buildMessage(applied, skips) };
};
