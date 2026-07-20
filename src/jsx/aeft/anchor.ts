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
  AnchorPointSpec,
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

/** Read a property by match name, or null when absent. */
const prop = (group: PropertyGroup, matchName: string): Property | null => {
  try {
    const p = group.property(matchName);
    return p ? (p as Property) : null;
  } catch (e) {
    return null;
  }
};

/** A property is unsafe to rewrite if it is keyframed or expression-driven. */
const isAnimated = (p: Property | null): boolean => {
  if (!p) return false;
  if (p.numKeys > 0) return true;
  // An active expression would override anything we write, so the compensation
  // would silently not happen. Expressions are the Expression Effects tool's
  // territory; here they mean "refuse".
  try {
    if (p.expressionEnabled) return true;
  } catch (e) {
    // Property does not expose expressions; not animated by that route.
  }
  return false;
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
  const name = layer.name;

  // Cameras and lights have no source rectangle to hang a bounding box on.
  if (!(layer instanceof AVLayer)) {
    return "No bounding box available (" + name + ")";
  }

  const transform = layer.property(MN_TRANSFORM) as PropertyGroup;
  if (!transform) return "No transform group (" + name + ")";

  const anchorProp = prop(transform, MN_ANCHOR);
  const positionProp = prop(transform, MN_POSITION);
  const scaleProp = prop(transform, MN_SCALE);
  const rotationProp = prop(transform, MN_ROTATE_Z);

  if (!anchorProp || !positionProp) {
    return "No anchor/position properties (" + name + ")";
  }

  if (isAnimated(anchorProp) || isAnimated(positionProp)) {
    return "Animated anchor/position: skipped " + name;
  }

  // A one-off position write cannot compensate a transform that changes over
  // time: the offset we compute is only correct at the current frame, so the
  // layer would drift on every other frame.
  if (isAnimated(scaleProp) || isAnimated(rotationProp)) {
    return "Animated scale/rotation: skipped " + name;
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

  if (layer.threeDLayer) {
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

  let rect: SourceRect;
  try {
    rect = (layer as AVLayer).sourceRectAtTime(time, false);
  } catch (e) {
    return "No bounding box available (" + name + ")";
  }
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    return "Empty bounding box: skipped " + name;
  }

  const anchorVec = vecValue(anchorProp);
  const positionVec = vecValue(positionProp);
  if (!anchorVec || !positionVec) {
    return "Unreadable transform values: skipped " + name;
  }

  const scaleVec = vecValue(scaleProp);
  const scale: Vec2 = scaleVec
    ? [scaleVec[0], scaleVec[1]]
    : [100, 100];
  const rotation = numValue(rotationProp, 0);

  const target = anchorForRect(rect, spec);
  const move = computeAnchorMove(
    [anchorVec[0], anchorVec[1]],
    [positionVec[0], positionVec[1]],
    target,
    scale,
    rotation
  );

  setVec(anchorProp, move.newAnchor, anchorVec);
  setVec(positionProp, move.newPosition, positionVec);
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
  const gname = group.name;

  if (!(layer instanceof ShapeLayer) || !(layer instanceof AVLayer)) {
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

  let layerRect: SourceRect;
  try {
    layerRect = (layer as AVLayer).sourceRectAtTime(time, false);
  } catch (e) {
    return "No bounding box available: skipped " + gname;
  }
  if (!layerRect || (layerRect.width === 0 && layerRect.height === 0)) {
    return "Empty bounding box: skipped " + gname;
  }

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
