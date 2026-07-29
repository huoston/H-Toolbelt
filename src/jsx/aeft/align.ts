/**
 * Align & Distribute — After Effects host side.
 *
 * Aligns and distributes selected layers by their **composition-space** bounding
 * box. After Effects' own Align panel uses the layer's untransformed box, which
 * is why aligning a rotated layer to the left edge leaves a visible gap: the box
 * it measured is not the box on screen. This tool projects the four corners
 * through `position + R * S * (corner - anchor)` and takes the axis-aligned box
 * of the result, so a rotated or scaled layer aligns by what you can see.
 *
 * ANIMATED LAYERS ARE MOVED, NOT REFUSED. A layer with a keyframed position has
 * its whole track shifted by the alignment delta, exactly as the Anchor Point
 * tool does: one constant vector, so the motion path keeps its shape, its
 * keyframe count and its eases. The alignment is computed at the current frame,
 * which is the frame the user is looking at when they click. Behaviour is
 * deliberately identical between the two tools — a layer that survives one
 * survives the other.
 *
 * EVERY BOX IS MEASURED BEFORE ANY LAYER MOVES. "Align to selection" targets the
 * union of the selection's boxes, and distribution needs every centre; both
 * would be wrong if earlier layers had already shifted while later ones were
 * still being read. The passes are strictly measure-then-write.
 *
 * WHAT v1 REFUSES, AND WHY EACH IS A DECISION:
 *
 *   - **3-D layers.** The geometry here is 2-D; a 3-D layer's screen box depends
 *     on the camera, which is a different computation. The maths is written on
 *     3-component points so adding depth is adding an axis, not a rewrite.
 *   - **Parented layers.** `position` is expressed in the parent's space, so a
 *     comp-space delta written to it lands the layer somewhere else entirely
 *     whenever the parent is transformed. Refusing beats misplacing.
 *   - **Separated position dimensions**, which a combined write cannot reach.
 *   - **An expression on position**, which would override the write and let the
 *     tool report success while nothing moved.
 *
 * Author: Dr. Huoston Rodrigues
 * Website: https://huoston.art/
 * Email: hello@huoston.art
 * Version: 0.2.0
 * Created: 2026-07-29
 * Modified: 2026-07-29
 * License: GPL-3.0-or-later
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
  MIN_DISTRIBUTE_LAYERS,
  alignDelta,
  compAabb,
  distributeCenters,
  findAlignMode,
  findAlignTo,
  findDistributeAxis,
  layerAabb,
  unionAabb,
} from "../../shared/align";
import type { Aabb, AlignMode, DistributeAxis } from "../../shared/align";
import {
  isZeroOffset,
  offsetPositionValue,
  shiftPositionKeys,
} from "../../shared/anchor";
import type { PositionKey, SourceRect, Vec2 } from "../../shared/anchor";

export interface AlignResult {
  applied: number;
  message: string;
}

/** Transform property match names (locale-independent). */
const MN_TRANSFORM = "ADBE Transform Group";
const MN_ANCHOR = "ADBE Anchor Point";
const MN_POSITION = "ADBE Position";
const MN_SCALE = "ADBE Scale";
const MN_ROTATE_Z = "ADBE Rotate Z";

/** Layer types. Read from `matchName`, never inferred from `layer.source`. */
const MN_LAYER_VECTOR = "ADBE Vector Layer";
const MN_LAYER_TEXT = "ADBE Text Layer";
const MN_LAYER_AV = "ADBE AV Layer";
const MN_LAYER_CAMERA = "ADBE Camera Layer";
const MN_LAYER_LIGHT = "ADBE Light Layer";

/** Layer types documented to answer `sourceRectAtTime`. */
const BOUNDED_LAYER_TYPES = [MN_LAYER_VECTOR, MN_LAYER_TEXT, MN_LAYER_AV];

const NO_COMP_MESSAGE = "Open a composition first.";
const NO_SELECTION_MESSAGE = "Select one or more layers first.";

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

const predominantReason = (log: SkipLog): string => {
  let best = 0;
  for (let i = 1; i < log.counts.length; i++) {
    if (log.counts[i] > log.counts[best]) best = i;
  }
  return log.reasons.length > 0 ? log.reasons[best] : "";
};

const buildMessage = (
  applied: number,
  verb: string,
  emptyMessage: string,
  log: SkipLog
): string => {
  if (applied === 0 && log.total === 0) return emptyMessage;
  if (applied === 0) {
    return "Skipped " + log.total + " layer(s): " + predominantReason(log);
  }
  let msg = verb + " " + applied + " layer(s)";
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

const prop = (group: PropertyGroup, matchName: string): Property | null => {
  try {
    const p = group.property(matchName);
    return p ? (p as Property) : null;
  } catch (e) {
    return null;
  }
};

const keyCount = (p: Property | null): number => {
  if (!p) return 0;
  try {
    const n = p.numKeys;
    return typeof n === "number" && isFinite(n) ? n : 0;
  } catch (e) {
    return 0;
  }
};

const hasExpression = (p: Property | null): boolean => {
  if (!p) return false;
  try {
    return p.expressionEnabled === true;
  } catch (e) {
    return false;
  }
};

const vecAtTime = (p: Property | null, t: number): number[] | null => {
  if (!p) return null;
  try {
    const v = p.valueAtTime(t, false) as unknown as number[];
    return v instanceof Array ? v : null;
  } catch (e) {
    return null;
  }
};

const numAtTime = (p: Property | null, t: number, fallback: number): number => {
  if (!p) return fallback;
  try {
    const v = p.valueAtTime(t, false) as unknown as number;
    return typeof v === "number" && isFinite(v) ? v : fallback;
  } catch (e) {
    return fallback;
  }
};

/** Ask AE for the bounding box and judge the answer rather than predicting it. */
const probeRect = (layer: Layer, time: number): SourceRect | null => {
  let rect: SourceRect | null = null;
  try {
    rect = (layer as AVLayer).sourceRectAtTime(time, false);
  } catch (e) {
    return null;
  }
  if (!rect) return null;

  const w = rect.width;
  const h = rect.height;
  if (
    typeof w !== "number" ||
    typeof h !== "number" ||
    !isFinite(w) ||
    !isFinite(h)
  ) {
    return null;
  }
  if (w <= 0 || h <= 0) return null;
  return rect;
};

/* -------------------------------------------------------------------------- */
/* Measuring                                                                  */
/* -------------------------------------------------------------------------- */

/** A layer that passed every guard, with everything needed to move it. */
interface Measured {
  layer: Layer;
  positionProp: Property;
  box: Aabb;
}

/**
 * Measure one layer, or return the refusal reason.
 *
 * Nothing here writes; the caller measures every layer before moving any.
 */
const measureLayer = (
  layer: Layer,
  time: number,
  out: Measured[]
): string | null => {
  const mn = layerMatchName(layer);
  const name = describeLayer(layer);

  if (mn === MN_LAYER_CAMERA || mn === MN_LAYER_LIGHT) {
    return "Camera/Light has no bounds " + name;
  }

  // Cast, not narrow: the typings hang `threeDLayer` off AVLayer, but the
  // runtime `instanceof AVLayer` that would narrow to it is false for the shape
  // and text layers this tool accepts.
  if ((layer as AVLayer).threeDLayer) {
    return "3D layers not supported yet " + name;
  }

  // `position` lives in the parent's coordinate space, so a comp-space delta
  // written to it lands the layer somewhere else entirely once the parent is
  // transformed. Refusing beats misplacing.
  try {
    if (layer.parent) {
      return "Parented layers not supported yet " + name;
    }
  } catch (e) {
    // Property not exposed; treat as unparented.
  }

  const transform = layer.property(MN_TRANSFORM) as PropertyGroup;
  if (!transform) return "No transform group " + name;

  const anchorProp = prop(transform, MN_ANCHOR);
  const positionProp = prop(transform, MN_POSITION);
  if (!anchorProp || !positionProp) {
    return "No anchor/position properties " + name;
  }

  let separated = false;
  try {
    separated = positionProp.dimensionsSeparated === true;
  } catch (e) {
    separated = false;
  }
  if (separated) {
    return "Separated position dimensions: skipped " + name;
  }

  if (hasExpression(positionProp)) {
    return "Position has an expression (not moved) " + name;
  }

  const rect = probeRect(layer, time);
  if (!rect) {
    return isBoundedLayerType(mn)
      ? "No bounding box available " + name
      : "No bounding box available for unrecognised layer type " + name;
  }

  const anchorVec = vecAtTime(anchorProp, time);
  const positionVec = vecAtTime(positionProp, time);
  if (!anchorVec || !positionVec) {
    return "Unreadable transform values: skipped " + name;
  }

  const scaleVec = vecAtTime(prop(transform, MN_SCALE), time);
  const scale: Vec2 = scaleVec ? [scaleVec[0], scaleVec[1]] : [100, 100];
  const rotation = numAtTime(prop(transform, MN_ROTATE_Z), time, 0);

  const box = layerAabb(
    rect,
    [anchorVec[0], anchorVec[1]],
    [positionVec[0], positionVec[1]],
    scale,
    rotation
  );

  out.push({ layer: layer, positionProp: positionProp, box: box });
  return null;
};

/** Measure the whole selection, collecting refusals as it goes. */
const measureSelection = (
  comp: CompItem,
  skips: SkipLog
): Measured[] => {
  const measured: Measured[] = [];
  const layers = comp.selectedLayers;
  for (let i = 0; i < layers.length; i++) {
    const reason = measureLayer(layers[i], comp.time, measured);
    if (reason !== null) addSkip(skips, reason);
  }
  return measured;
};

/* -------------------------------------------------------------------------- */
/* Moving                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Shift a layer's position by a constant delta.
 *
 * Keyframed position has its whole track shifted — one vector, so the path keeps
 * its shape, its count and its eases, exactly as the Anchor Point tool does.
 * A static position is a track of length one. Returns false when the values
 * could not be read, so the caller can count honestly.
 */
const shiftPosition = (
  positionProp: Property,
  delta: Vec2,
  time: number
): boolean => {
  // Already where it belongs: do not dirty the project rewriting values with
  // what they already hold. Counted as applied by the caller, since the layer
  // *is* aligned — it just needed nothing done to it.
  if (isZeroOffset(delta)) return true;

  const total = keyCount(positionProp);

  if (total > 0) {
    const keys: PositionKey[] = [];
    for (let i = 1; i <= total; i++) {
      try {
        keys.push({
          time: positionProp.keyTime(i),
          value: positionProp.keyValue(i) as unknown as number[],
        });
      } catch (e) {
        return false;
      }
    }
    const shifted = shiftPositionKeys(keys, delta);
    for (let i = 0; i < shifted.length; i++) {
      positionProp.setValueAtTime(shifted[i].time, shifted[i].value);
    }
    return true;
  }

  const value = vecAtTime(positionProp, time);
  if (!value) return false;
  positionProp.setValue(offsetPositionValue(value, delta));
  return true;
};

/* -------------------------------------------------------------------------- */
/* Entry points                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Align the selected layers to the composition frame or to their own combined
 * bounds.
 */
export const alignLayers = (mode: string, alignTo: string): AlignResult => {
  const resolvedMode = findAlignMode(mode);
  if (!resolvedMode) {
    return { applied: 0, message: "Unknown align mode: " + mode };
  }

  const resolvedTarget = findAlignTo(alignTo);
  if (!resolvedTarget) {
    return { applied: 0, message: "Unknown align target: " + alignTo };
  }

  const comp = app.project.activeItem;
  if (!(comp instanceof CompItem)) {
    return { applied: 0, message: NO_COMP_MESSAGE };
  }

  const skips = newSkipLog();
  let applied = 0;

  app.beginUndoGroup("H-Toolbelt: Align (" + resolvedMode + ")");
  try {
    // Measure everything first: the selection target is the union of the boxes
    // as they are now, and reading it after moving the first layer would chase
    // a target that keeps moving.
    const measured = measureSelection(comp, skips);

    if (measured.length > 0) {
      const boxes: Aabb[] = [];
      for (let i = 0; i < measured.length; i++) boxes.push(measured[i].box);

      const target: Aabb =
        resolvedTarget === "comp"
          ? compAabb(comp.width, comp.height)
          : unionAabb(boxes);

      for (let i = 0; i < measured.length; i++) {
        const m = measured[i];
        const delta = alignDelta(m.box, target, resolvedMode as AlignMode);
        if (shiftPosition(m.positionProp, delta, comp.time)) {
          applied++;
        } else {
          addSkip(skips, "Unreadable position values: skipped " + describeLayer(m.layer));
        }
      }
    }
  } finally {
    app.endUndoGroup();
  }

  return {
    applied: applied,
    message: buildMessage(applied, "Aligned", NO_SELECTION_MESSAGE, skips),
  };
};

/**
 * Space the selected layers evenly along an axis, by their box centres.
 *
 * The two extremes stay put and everything between them is spread evenly, which
 * is what makes the operation feel like tidying rather than rearranging.
 */
export const distributeLayers = (axis: string): AlignResult => {
  const resolvedAxis = findDistributeAxis(axis);
  if (!resolvedAxis) {
    return { applied: 0, message: "Unknown distribute axis: " + axis };
  }

  const comp = app.project.activeItem;
  if (!(comp instanceof CompItem)) {
    return { applied: 0, message: NO_COMP_MESSAGE };
  }

  const tooFew = "Select " + MIN_DISTRIBUTE_LAYERS + "+ layers to distribute.";
  const skips = newSkipLog();
  let applied = 0;

  app.beginUndoGroup("H-Toolbelt: Distribute (" + resolvedAxis + ")");
  try {
    const measured = measureSelection(comp, skips);

    if (measured.length < MIN_DISTRIBUTE_LAYERS) {
      // Not an error worth a skip log entry: the user simply picked too few.
      return {
        applied: 0,
        message:
          skips.total > 0
            ? tooFew + " Skipped " + skips.total + ": " + predominantReason(skips)
            : tooFew,
      };
    }

    const horizontal = (resolvedAxis as DistributeAxis) === "x";

    const centers: number[] = [];
    for (let i = 0; i < measured.length; i++) {
      const b = measured[i].box;
      centers.push(
        horizontal ? (b.minX + b.maxX) / 2 : (b.minY + b.maxY) / 2
      );
    }

    // Positional results: `targets[i]` belongs to `measured[i]`.
    const targets = distributeCenters(centers);

    for (let i = 0; i < measured.length; i++) {
      const shift = targets[i] - centers[i];
      const delta: Vec2 = horizontal ? [shift, 0] : [0, shift];
      if (shiftPosition(measured[i].positionProp, delta, comp.time)) {
        applied++;
      } else {
        addSkip(
          skips,
          "Unreadable position values: skipped " + describeLayer(measured[i].layer)
        );
      }
    }
  } finally {
    app.endUndoGroup();
  }

  return {
    applied: applied,
    message: buildMessage(applied, "Distributed", tooFew, skips),
  };
};
