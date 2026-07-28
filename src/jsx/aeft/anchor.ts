/**
 * Smart Anchor Point Control — After Effects host side.
 *
 * Relocates the anchor point of selected layers (or of a selected shape group)
 * to one of nine canonical points on its bounding box, compensating `position`
 * through the transform matrix so nothing moves on screen. The math lives in the
 * pure, unit-tested `shared/anchor` module; this file is the AE plumbing plus
 * the safety guards.
 *
 * GUARD PHILOSOPHY: this tool rewrites two transform properties, so every case
 * the math does not provably cover is refused with a reason rather than applied
 * hopefully. A skipped layer is a message; a wrongly-transformed layer is
 * destroyed work the user may not notice until much later.
 *
 * Parenting needs no special handling: the compensation keeps this layer's own
 * transform output identical for every point in layer space, so whatever the
 * parent chain does to that output is unchanged by construction.
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

import {
  anchorForRect,
  computeAnchorMove,
  findAnchorPoint,
  isZeroOffset,
  offsetPositionValue,
  shiftPositionKeys,
} from "../../shared/anchor";
import type {
  AnchorPointSpec,
  PositionKey,
  SourceRect,
  Vec2,
} from "../../shared/anchor";

export interface AnchorResult {
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
 * Layer-type match names. Layer type is read from `matchName` and nothing else:
 * `instanceof AVLayer` looks like the same question but is not — ExtendScript
 * gives shape and text layers their own constructors, so they fail that test
 * despite answering `sourceRectAtTime` perfectly well. Likewise `layer.source`
 * is null for shape and text layers, so it says nothing about bounds either.
 */
const MN_LAYER_VECTOR = "ADBE Vector Layer";
const MN_LAYER_TEXT = "ADBE Text Layer";
const MN_LAYER_AV = "ADBE AV Layer";
const MN_LAYER_CAMERA = "ADBE Camera Layer";
const MN_LAYER_LIGHT = "ADBE Light Layer";

/** Layer types documented to answer `sourceRectAtTime`. */
const BOUNDED_LAYER_TYPES = [MN_LAYER_VECTOR, MN_LAYER_TEXT, MN_LAYER_AV];

/** Shape-layer match names. */
const MN_ROOT_VECTORS = "ADBE Root Vectors Group";
const MN_VECTOR_GROUP = "ADBE Vector Group";
const MN_VECTOR_TRANSFORM = "ADBE Vector Transform Group";
const MN_VECTOR_ANCHOR = "ADBE Vector Anchor";
const MN_VECTOR_POSITION = "ADBE Vector Position";
const MN_VECTOR_SCALE = "ADBE Vector Scale";
const MN_VECTOR_ROTATION = "ADBE Vector Rotation";

const NO_SELECTION_MESSAGE = "Select one or more layers first.";

/**
 * Accumulates why layers were refused, so the UI can report a count plus the
 * predominant reason instead of a wall of text.
 */
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

/** The reason that accounts for the most skipped items. */
const predominantReason = (log: SkipLog): string => {
  let best = 0;
  for (let i = 1; i < log.counts.length; i++) {
    if (log.counts[i] > log.counts[best]) best = i;
  }
  return log.reasons.length > 0 ? log.reasons[best] : "";
};

/** Compose the final user-facing message for a run. */
const buildMessage = (applied: number, noun: string, log: SkipLog): string => {
  if (applied === 0 && log.total === 0) return NO_SELECTION_MESSAGE;
  if (applied === 0) {
    return "Skipped " + log.total + " " + noun + "(s): " + predominantReason(log);
  }
  let msg = "Applied to " + applied + " " + noun + "(s)";
  if (log.total > 0) {
    msg += "; skipped " + log.total + ": " + predominantReason(log);
  }
  return msg;
};

/** Layer type, or "unknown" when AE will not report it. */
const layerMatchName = (layer: Layer): string => {
  try {
    const mn = layer.matchName;
    return mn ? mn : "unknown";
  } catch (e) {
    return "unknown";
  }
};

/**
 * "(Name) [ADBE Text Layer]" — appended to every refusal. A refusal that names
 * the type it refused is a diagnosis; one that does not is a guessing game.
 */
const describeLayer = (layer: Layer): string => {
  return "(" + layer.name + ") [" + layerMatchName(layer) + "]";
};

/** True for the layer types documented to have a source rectangle. */
const isBoundedLayerType = (mn: string): boolean => {
  for (let i = 0; i < BOUNDED_LAYER_TYPES.length; i++) {
    if (BOUNDED_LAYER_TYPES[i] === mn) return true;
  }
  return false;
};

/**
 * Refuse on type alone only where bounds are intrinsically absent. Cameras and
 * lights have no source rectangle at all; everything else — including layer
 * types this build has never heard of — falls through to the empirical probe,
 * which answers the question by asking AE rather than by inference.
 */
const typeRefusal = (mn: string): string | null => {
  if (mn === MN_LAYER_CAMERA || mn === MN_LAYER_LIGHT) {
    return "Camera/Light has no bounds";
  }
  return null;
};

/** Outcome of actually asking AE for a bounding box. */
interface RectProbe {
  rect: SourceRect | null;
  empty: boolean;
}

/**
 * Ask for the bounding box and judge the answer, rather than predicting whether
 * asking would work. A zero-size rect (empty shape, text with no glyphs) is a
 * real box that happens to be degenerate, so it is reported apart from "no box".
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

/** Refusal text for a failed probe, or null when the probe produced a box. */
const probeRefusal = (probe: RectProbe, mn: string): string | null => {
  if (probe.rect) return null;
  if (probe.empty) return "Empty layer (zero-size bounds)";
  return isBoundedLayerType(mn)
    ? "No bounding box available"
    : "No bounding box available for unrecognised layer type";
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
    const n = p.numKeys;
    return typeof n === "number" && isFinite(n) ? n : 0;
  } catch (e) {
    return 0;
  }
};

/**
 * An active expression overrides anything written, so the tool would report
 * success while nothing moved. Expressions are the Expression Effects tool's
 * territory; here they mean "refuse".
 */
const hasExpression = (p: Property | null): boolean => {
  if (!p) return false;
  try {
    return p.expressionEnabled === true;
  } catch (e) {
    // Property does not expose expressions.
    return false;
  }
};

/** A property is unsafe to rewrite if it is keyframed or expression-driven. */
const isAnimated = (p: Property | null): boolean => {
  return keyCount(p) > 0 || hasExpression(p);
};

/** Vector value at a given time, post-expression. Null when unreadable. */
const vecAtTime = (p: Property | null, t: number): number[] | null => {
  if (!p) return null;
  try {
    const v = p.valueAtTime(t, false) as unknown as number[];
    return v instanceof Array ? v : null;
  } catch (e) {
    return null;
  }
};

/** Numeric value at a given time, post-expression. */
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

/** Numeric value of a property, defaulting when unreadable. */
const numValue = (p: Property | null, fallback: number): number => {
  if (!p) return fallback;
  try {
    return p.value as number;
  } catch (e) {
    return fallback;
  }
};

/** Vector value of a property, or null when unreadable. */
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

/**
 * Write a 2-D result back into a property that may be 2-D or 3-D, preserving
 * any third component. The z anchor is never retargeted, so z needs no
 * compensation.
 */
const setVec = (p: Property, next: Vec2, original: number[]): void => {
  if (original.length > 2) {
    p.setValue([next[0], next[1], original[2]]);
  } else {
    p.setValue([next[0], next[1]]);
  }
};

/**
 * Entry point used by the panel. Shape groups take priority over their layer:
 * if the user has a group selected, that is what they mean.
 */
export const setAnchorPoint = (pointId: string): AnchorResult => {
  const spec = findAnchorPoint(pointId);
  if (!spec) {
    return { applied: 0, message: "Unknown anchor point: " + pointId };
  }

  const comp = app.project.activeItem;
  if (!(comp instanceof CompItem)) {
    return { applied: 0, message: "Open a composition first." };
  }

  if (countSelectedShapeGroups(comp) > 0) {
    return setShapeGroupAnchor(pointId);
  }
  return setLayerAnchor(pointId);
};

/** How many shape groups are selected across the comp's selected layers. */
const countSelectedShapeGroups = (comp: CompItem): number => {
  let n = 0;
  const layers = comp.selectedLayers;
  for (let li = 0; li < layers.length; li++) {
    const sel = layers[li].selectedProperties;
    for (let pi = 0; pi < sel.length; pi++) {
      if (sel[pi].matchName === MN_VECTOR_GROUP) n++;
    }
  }
  return n;
};

/* -------------------------------------------------------------------------- */
/* Layer mode                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Move the anchor point of every selected layer to the given canonical point.
 * Layers whose transform the math cannot safely cover are skipped with a reason.
 */
export const setLayerAnchor = (pointId: string): AnchorResult => {
  const spec = findAnchorPoint(pointId);
  if (!spec) {
    return { applied: 0, message: "Unknown anchor point: " + pointId };
  }

  const comp = app.project.activeItem;
  if (!(comp instanceof CompItem)) {
    return { applied: 0, message: "Open a composition first." };
  }

  const layers = comp.selectedLayers;
  if (layers.length === 0) {
    return { applied: 0, message: NO_SELECTION_MESSAGE };
  }

  let applied = 0;
  const skips = newSkipLog();

  app.beginUndoGroup("H-Toolbelt: Set Anchor Point");
  try {
    for (let li = 0; li < layers.length; li++) {
      const reason = applyToLayer(layers[li], comp.time, spec);
      if (reason === null) {
        applied++;
      } else {
        addSkip(skips, reason);
      }
    }
  } finally {
    app.endUndoGroup();
  }

  return { applied: applied, message: buildMessage(applied, "layer", skips) };
};

/**
 * Apply to one layer. Returns null on success, or the refusal reason.
 * Every guard here protects a case the compensation cannot express.
 */
const applyToLayer = (
  layer: Layer,
  time: number,
  spec: AnchorPointSpec
): string | null => {
  const mn = layerMatchName(layer);
  const name = describeLayer(layer);

  // Cameras and lights have no source rectangle to hang a bounding box on.
  const typeSkip = typeRefusal(mn);
  if (typeSkip !== null) return typeSkip + " " + name;

  const transform = layer.property(MN_TRANSFORM) as PropertyGroup;
  if (!transform) return "No transform group " + name;

  const anchorProp = prop(transform, MN_ANCHOR);
  const positionProp = prop(transform, MN_POSITION);
  const scaleProp = prop(transform, MN_SCALE);
  const rotationProp = prop(transform, MN_ROTATE_Z);

  if (!anchorProp || !positionProp) {
    return "No anchor/position properties " + name;
  }

  // A keyframed anchor is a different problem entirely: the layer-space origin
  // itself is moving, so there is no single `A` to retarget.
  if (isAnimated(anchorProp)) {
    return "Animated anchor: skipped " + name;
  }

  // Keyframes on position are fine — they get shifted below. An *expression* is
  // not: it would override every write, so the tool would report success while
  // nothing moved on screen.
  if (hasExpression(positionProp)) {
    return "Expression on position: skipped " + name;
  }

  // Separated X/Y position are distinct 1-D properties; setValue on the
  // combined property does not reach them.
  try {
    if (positionProp.dimensionsSeparated) {
      return "Separated position dimensions: skipped " + name;
    }
  } catch (e) {
    // Property does not expose the flag; treat as not separated.
  }

  // Cast, not narrow: the typings hang `threeDLayer` off AVLayer, but the
  // runtime `instanceof AVLayer` that would narrow to it is the very test this
  // fix removed — it is false for the shape and text layers we now accept.
  if ((layer as AVLayer).threeDLayer) {
    const rx = numValue(prop(transform, MN_ROTATE_X), 0);
    const ry = numValue(prop(transform, MN_ROTATE_Y), 0);
    const orient = vecValue(prop(transform, MN_ORIENTATION));
    const oriented =
      orient !== null &&
      (orient[0] !== 0 || orient[1] !== 0 || orient[2] !== 0);
    if (rx !== 0 || ry !== 0 || oriented) {
      return "3D rotation not supported yet: skipped " + name;
    }
  }

  const probe = probeRect(layer, time);
  const probeSkip = probeRefusal(probe, mn);
  if (probeSkip !== null) return probeSkip + " " + name;
  const rect = probe.rect as SourceRect;

  const anchorVec = vecValue(anchorProp);
  if (!anchorVec) {
    return "Unreadable transform values: skipped " + name;
  }

  // Read the transform at the current time explicitly rather than via `.value`:
  // the two agree today, but naming the time is what makes "no jump at the frame
  // the user is looking at" a property of the code rather than a coincidence.
  // Post-expression, so an expression-driven rotation is honoured as rendered.
  const scaleVec = vecAtTime(scaleProp, time);
  const scale: Vec2 = scaleVec ? [scaleVec[0], scaleVec[1]] : [100, 100];
  const rotation = numAtTime(rotationProp, time, 0);

  const target = anchorForRect(rect, spec);

  // The bare correction term R * S * (A' - A): passing a zero current position
  // makes `newPosition` the offset itself rather than a compensated position.
  const offset = computeAnchorMove(
    [anchorVec[0], anchorVec[1]],
    [0, 0],
    target,
    scale,
    rotation
  ).newPosition;

  // Already on the requested point: do not dirty the project rewriting values
  // with what they already hold.
  if (isZeroOffset(offset)) {
    return "Anchor already at this point: skipped " + name;
  }

  // Read everything before writing anything: the first write to position would
  // change what any later read returned.
  const total = keyCount(positionProp);
  const keys: PositionKey[] = [];
  let staticValue: number[] | null = null;

  if (total > 0) {
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
  } else {
    staticValue = vecAtTime(positionProp, time);
    if (!staticValue) {
      return "Unreadable transform values: skipped " + name;
    }
  }

  const shifted = shiftPositionKeys(keys, offset);

  // Anchor first, then position. Both are inside the caller's single undo group,
  // so a failure between them reverts as one step rather than leaving the layer
  // displaced.
  setVec(anchorProp, [target[0], target[1]], anchorVec);

  if (staticValue) {
    positionProp.setValue(offsetPositionValue(staticValue, offset));
  } else {
    for (let i = 0; i < shifted.length; i++) {
      positionProp.setValueAtTime(shifted[i].time, shifted[i].value);
    }
  }

  return null;
};

/* -------------------------------------------------------------------------- */
/* Shape group mode                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Move the anchor point of selected shape groups.
 *
 * HONEST LIMITATION: After Effects exposes no bounding box for an individual
 * shape group — `sourceRectAtTime` only reports the whole layer. So a group's
 * box can only be derived when the layer's rect provably describes that group
 * alone, and when the group's own transform can be inverted without distorting
 * an axis-aligned box. That means exactly one top-level group in the layer, and
 * zero group rotation. Anything else is refused rather than estimated, because a
 * guessed box silently puts the anchor in the wrong place.
 */
export const setShapeGroupAnchor = (pointId: string): AnchorResult => {
  const spec = findAnchorPoint(pointId);
  if (!spec) {
    return { applied: 0, message: "Unknown anchor point: " + pointId };
  }

  const comp = app.project.activeItem;
  if (!(comp instanceof CompItem)) {
    return { applied: 0, message: "Open a composition first." };
  }

  let applied = 0;
  const skips = newSkipLog();

  app.beginUndoGroup("H-Toolbelt: Set Anchor Point");
  try {
    const layers = comp.selectedLayers;
    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li];
      const sel = layer.selectedProperties;
      for (let pi = 0; pi < sel.length; pi++) {
        if (sel[pi].matchName !== MN_VECTOR_GROUP) continue;
        const reason = applyToShapeGroup(
          layer,
          sel[pi] as PropertyGroup,
          comp.time,
          spec
        );
        if (reason === null) {
          applied++;
        } else {
          addSkip(skips, reason);
        }
      }
    }
  } finally {
    app.endUndoGroup();
  }

  return {
    applied: applied,
    message: buildMessage(applied, "shape group", skips),
  };
};

/** Apply to one shape group. Returns null on success, or the refusal reason. */
const applyToShapeGroup = (
  layer: Layer,
  group: PropertyGroup,
  time: number,
  spec: AnchorPointSpec
): string | null => {
  // `layer` is the group's owner by construction: the caller reached this group
  // through that layer's own `selectedProperties`, so no walk up the property
  // chain is needed to find it.
  const mn = layerMatchName(layer);
  const gname = group.name + " " + describeLayer(layer);

  if (mn !== MN_LAYER_VECTOR) {
    return "Not a shape layer: skipped " + gname;
  }

  const transform = group.property(MN_VECTOR_TRANSFORM) as PropertyGroup;
  if (!transform) return "No group transform: skipped " + gname;

  const anchorProp = prop(transform, MN_VECTOR_ANCHOR);
  const positionProp = prop(transform, MN_VECTOR_POSITION);
  const scaleProp = prop(transform, MN_VECTOR_SCALE);
  const rotationProp = prop(transform, MN_VECTOR_ROTATION);

  if (!anchorProp || !positionProp) {
    return "No group anchor/position: skipped " + gname;
  }
  if (isAnimated(anchorProp) || isAnimated(positionProp)) {
    return "Animated anchor/position: skipped " + gname;
  }
  if (isAnimated(scaleProp) || isAnimated(rotationProp)) {
    return "Animated scale/rotation: skipped " + gname;
  }

  // The layer rect describes this group only if it is the layer's sole group.
  const contents = layer.property(MN_ROOT_VECTORS) as PropertyGroup;
  if (!contents) return "No shape contents: skipped " + gname;
  let groupCount = 0;
  for (let i = 1; i <= contents.numProperties; i++) {
    if (contents.property(i).matchName === MN_VECTOR_GROUP) groupCount++;
  }
  if (groupCount !== 1) {
    return (
      "No reliable bounding box for a group in a multi-group layer: skipped " +
      gname
    );
  }

  const rotation = numValue(rotationProp, 0);
  if (rotation !== 0) {
    // Un-rotating an axis-aligned layer rect yields the rotated box's own
    // bounding box, not the group's — larger than the real content.
    return "Rotated group has no reliable bounding box: skipped " + gname;
  }

  const anchorVec = vecValue(anchorProp);
  const positionVec = vecValue(positionProp);
  const scaleVec = vecValue(scaleProp);
  if (!anchorVec || !positionVec) {
    return "Unreadable group transform: skipped " + gname;
  }
  const sx = scaleVec ? scaleVec[0] / 100 : 1;
  const sy = scaleVec ? scaleVec[1] / 100 : 1;
  if (sx === 0 || sy === 0) {
    return "Zero group scale: skipped " + gname;
  }

  const probe = probeRect(layer, time);
  const probeSkip = probeRefusal(probe, mn);
  if (probeSkip !== null) return probeSkip + ": skipped " + gname;
  const layerRect = probe.rect as SourceRect;

  // Map the layer-space rect back into the group's content space by inverting
  // the group transform (translate + scale only, rotation is 0 here). Negative
  // scale flips the corners, so take min/max rather than assuming order.
  const cx1 = anchorVec[0] + (layerRect.left - positionVec[0]) / sx;
  const cx2 =
    anchorVec[0] + (layerRect.left + layerRect.width - positionVec[0]) / sx;
  const cy1 = anchorVec[1] + (layerRect.top - positionVec[1]) / sy;
  const cy2 =
    anchorVec[1] + (layerRect.top + layerRect.height - positionVec[1]) / sy;

  const contentRect: SourceRect = {
    left: Math.min(cx1, cx2),
    top: Math.min(cy1, cy2),
    width: Math.abs(cx2 - cx1),
    height: Math.abs(cy2 - cy1),
  };

  const target = anchorForRect(contentRect, spec);
  const move = computeAnchorMove(
    [anchorVec[0], anchorVec[1]],
    [positionVec[0], positionVec[1]],
    target,
    scaleVec ? [scaleVec[0], scaleVec[1]] : [100, 100],
    rotation
  );

  setVec(anchorProp, move.newAnchor, anchorVec);
  setVec(positionProp, move.newPosition, positionVec);
  return null;
};
