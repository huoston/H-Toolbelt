/**
 * Align & Distribute — pure geometry.
 *
 * After Effects' own Align panel works on the layer's *untransformed* bounding
 * box, which is why aligning a rotated layer to the left edge leaves a visible
 * gap: the box it used is not the box you can see. This module works on the
 * axis-aligned bounding box of the layer **in composition space**, so a rotated
 * or scaled layer aligns by what is actually on screen.
 *
 * THE PROJECTION IS NOT REIMPLEMENTED HERE. A layer maps a local point `p` to
 * comp space as `position + R * S * (p - anchor)`, which is exactly what
 * `computeAnchorMove` computes when asked to move an anchor to `p`. Feeding each
 * corner through it reuses the matrix that the anchor tool's tests already pin,
 * rather than writing a second cos/sin by hand that could drift from the first.
 *
 * A ROTATED LAYER HAS A LARGER BOX THAN ITS ARTWORK, and that is correct: the
 * axis-aligned box of a 45-degree square is its diagonal wide. Aligning to the
 * visual extent is the whole point of doing this in comp space.
 *
 * WHY POINTS CARRY A Z THEY DO NOT USE. Corners are `Vec3` and the AABB ignores
 * the third component. 3-D layers are refused in v1, so z is always 0 today; the
 * shape is chosen so that adding depth later is adding an axis to the min/max
 * scan, not rewriting every signature between here and the host.
 *
 * ES3 CONSTRAINT: bundled into the ExtendScript host, so ES3 built-ins only —
 * classic loops, no `map`/`filter`/`reduce`. `Array.prototype.sort` is ES3 and is
 * used.
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

import { computeAnchorMove } from "./anchor";
import type { SourceRect, Vec2 } from "./anchor";

/** A point in comp space. `z` is reserved for 3-D support and ignored in v1. */
export type Vec3 = [x: number, y: number, z: number];

/** An axis-aligned bounding box in composition space. */
export interface Aabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Which edge or centre line the layer is aligned to. */
export type AlignMode =
  | "left"
  | "hcenter"
  | "right"
  | "top"
  | "vcenter"
  | "bottom";

/** What the alignment is measured against. */
export type AlignTo = "comp" | "selection";

/** Which axis layers are spread along. */
export type DistributeAxis = "x" | "y";

export interface AlignModeSpec {
  /** Stable identifier sent to the host; never localized. */
  id: AlignMode;
  /** Short glyph for the UI button. */
  label: string;
  /** Tooltip. */
  title: string;
}

/** The six alignments, in the order the UI lists them. */
export const ALIGN_MODES: AlignModeSpec[] = [
  { id: "left", label: "⇤", title: "Align left edges." },
  { id: "hcenter", label: "↔", title: "Align horizontal centres." },
  { id: "right", label: "⇥", title: "Align right edges." },
  { id: "top", label: "⇡", title: "Align top edges." },
  { id: "vcenter", label: "↕", title: "Align vertical centres." },
  { id: "bottom", label: "⇣", title: "Align bottom edges." },
];

export interface AlignToSpec {
  id: AlignTo;
  label: string;
  title: string;
}

export const ALIGN_TARGETS: AlignToSpec[] = [
  { id: "comp", label: "Comp", title: "Align to the composition frame." },
  {
    id: "selection",
    label: "Selection",
    title: "Align to the combined bounds of the selected layers.",
  },
];

export interface DistributeAxisSpec {
  id: DistributeAxis;
  label: string;
  title: string;
}

export const DISTRIBUTE_AXES: DistributeAxisSpec[] = [
  {
    id: "x",
    label: "Horizontal",
    title: "Space layer centres evenly left to right.",
  },
  {
    id: "y",
    label: "Vertical",
    title: "Space layer centres evenly top to bottom.",
  },
];

export const DEFAULT_ALIGN_TO: AlignTo = "comp";

/** Minimum layers a distribution needs: two ends plus something between them. */
export const MIN_DISTRIBUTE_LAYERS = 3;

/** Resolve an arbitrary string to a known alignment, or null. */
export const findAlignMode = (id: string): AlignMode | null => {
  for (let i = 0; i < ALIGN_MODES.length; i++) {
    if (ALIGN_MODES[i].id === id) return ALIGN_MODES[i].id;
  }
  return null;
};

/** Resolve an arbitrary string to a known target, or null. */
export const findAlignTo = (id: string): AlignTo | null => {
  for (let i = 0; i < ALIGN_TARGETS.length; i++) {
    if (ALIGN_TARGETS[i].id === id) return ALIGN_TARGETS[i].id;
  }
  return null;
};

/** Resolve an arbitrary string to a known axis, or null. */
export const findDistributeAxis = (id: string): DistributeAxis | null => {
  for (let i = 0; i < DISTRIBUTE_AXES.length; i++) {
    if (DISTRIBUTE_AXES[i].id === id) return DISTRIBUTE_AXES[i].id;
  }
  return null;
};

/** Human label for an alignment — used in the undo group name. */
export const alignModeLabel = (mode: AlignMode): string => {
  for (let i = 0; i < ALIGN_MODES.length; i++) {
    if (ALIGN_MODES[i].id === mode) return ALIGN_MODES[i].title;
  }
  return mode;
};

/* -------------------------------------------------------------------------- */
/* Bounding boxes                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The four corners of a layer-space rectangle, as points with a reserved z.
 *
 * Order is top-left, top-right, bottom-right, bottom-left. It does not matter to
 * the AABB — min/max is order-independent — but a stable order keeps the tests
 * readable.
 */
export const cornersOfRect = (rect: SourceRect): Vec3[] => {
  const l = rect.left;
  const t = rect.top;
  const r = rect.left + rect.width;
  const b = rect.top + rect.height;
  return [
    [l, t, 0],
    [r, t, 0],
    [r, b, 0],
    [l, b, 0],
  ];
};

/**
 * Map one layer-space corner into composition space.
 *
 * `computeAnchorMove(anchor, position, corner, scale, rotation).newPosition` is
 * `position + R * S * (corner - anchor)` — the projection, obtained from the
 * already-tested matrix rather than a second copy of it.
 */
export const projectCorner = (
  corner: Vec3,
  anchor: Vec2,
  position: Vec2,
  scale: Vec2,
  rotationDegrees: number
): Vec3 => {
  const p = computeAnchorMove(
    anchor,
    position,
    [corner[0], corner[1]],
    scale,
    rotationDegrees
  ).newPosition;
  // z passes through untouched: reserved for 3-D, unused while v1 refuses it.
  return [p[0], p[1], corner[2]];
};

/**
 * The axis-aligned bounding box enclosing a set of comp-space points.
 *
 * Returns a degenerate box at the origin for an empty set rather than
 * `Infinity` bounds, so a caller that forgets to check cannot propagate
 * infinities into a position write.
 */
export const aabbFromCorners = (corners: Vec3[]): Aabb => {
  if (!corners || corners.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = corners[0][0];
  let maxX = corners[0][0];
  let minY = corners[0][1];
  let maxY = corners[0][1];

  for (let i = 1; i < corners.length; i++) {
    const x = corners[i][0];
    const y = corners[i][1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
};

/** The comp-space AABB of a layer, from its local rect and transform. */
export const layerAabb = (
  rect: SourceRect,
  anchor: Vec2,
  position: Vec2,
  scale: Vec2,
  rotationDegrees: number
): Aabb => {
  const local = cornersOfRect(rect);
  const projected: Vec3[] = [];
  for (let i = 0; i < local.length; i++) {
    projected.push(
      projectCorner(local[i], anchor, position, scale, rotationDegrees)
    );
  }
  return aabbFromCorners(projected);
};

/** The smallest box containing all of `boxes`. */
export const unionAabb = (boxes: Aabb[]): Aabb => {
  if (!boxes || boxes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let out: Aabb = {
    minX: boxes[0].minX,
    minY: boxes[0].minY,
    maxX: boxes[0].maxX,
    maxY: boxes[0].maxY,
  };

  for (let i = 1; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.minX < out.minX) out.minX = b.minX;
    if (b.minY < out.minY) out.minY = b.minY;
    if (b.maxX > out.maxX) out.maxX = b.maxX;
    if (b.maxY > out.maxY) out.maxY = b.maxY;
  }
  return out;
};

/** A composition frame as an alignment target. */
export const compAabb = (width: number, height: number): Aabb => {
  return { minX: 0, minY: 0, maxX: width, maxY: height };
};

/**
 * Is every edge of this box a real number?
 *
 * Load-bearing, and the reason it exists: a non-finite bound propagates through
 * `alignDelta` into a NaN delta, and `isZeroOffset` — written for the anchor
 * tool, where "unreadable means nothing to do" is the safe reading — answers
 * `true` for NaN. Align would then treat the layer as already in place, report
 * success, and move nothing. "It says Aligned and nothing happens" is a far
 * worse failure than a refusal, so every box is checked before it is used.
 */
export const isFiniteAabb = (box: Aabb): boolean => {
  if (!box) return false;
  return (
    typeof box.minX === "number" &&
    typeof box.minY === "number" &&
    typeof box.maxX === "number" &&
    typeof box.maxY === "number" &&
    isFinite(box.minX) &&
    isFinite(box.minY) &&
    isFinite(box.maxX) &&
    isFinite(box.maxY)
  );
};

/**
 * Is this delta safe to apply?
 *
 * Zero is safe — it means the layer is already where it belongs. NaN and
 * Infinity are not, and must never reach a position write.
 */
export const isFiniteDelta = (delta: Vec2): boolean => {
  if (!delta) return false;
  return (
    typeof delta[0] === "number" &&
    typeof delta[1] === "number" &&
    isFinite(delta[0]) &&
    isFinite(delta[1])
  );
};

/* -------------------------------------------------------------------------- */
/* Alignment                                                                  */
/* -------------------------------------------------------------------------- */

const centerX = (box: Aabb): number => (box.minX + box.maxX) / 2;
const centerY = (box: Aabb): number => (box.minY + box.maxY) / 2;

/**
 * How far to move a layer so its box meets the target on the chosen edge.
 *
 * Only the relevant axis moves; the other component is always 0, so aligning
 * left never nudges a layer vertically. That is what makes the six buttons
 * composable — left then top lands a layer in the corner.
 */
export const alignDelta = (
  layer: Aabb,
  target: Aabb,
  mode: AlignMode
): Vec2 => {
  if (mode === "left") return [target.minX - layer.minX, 0];
  if (mode === "right") return [target.maxX - layer.maxX, 0];
  if (mode === "hcenter") return [centerX(target) - centerX(layer), 0];
  if (mode === "top") return [0, target.minY - layer.minY];
  if (mode === "bottom") return [0, target.maxY - layer.maxY];
  if (mode === "vcenter") return [0, centerY(target) - centerY(layer)];
  return [0, 0];
};

/* -------------------------------------------------------------------------- */
/* Distribution                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Space centres evenly between the two extremes, which do not move.
 *
 * Returns new centres **in the caller's original order**, not in sorted order.
 * That matters: the host holds a parallel array of layers, and handing back a
 * re-ordered list would silently assign each layer someone else's destination.
 * The sort happens internally, on indices, and the results are scattered back.
 *
 * Fewer than three centres is returned unchanged — with only the two extremes
 * there is nothing between them to space out.
 *
 * NOTE ON THE AXIS: distribution along x and along y are the same arithmetic on
 * different numbers, so the axis is chosen by the caller when it decides which
 * coordinate to pass. There is no axis parameter here because an unused one
 * would be a lie about what the function depends on; the axis lives in
 * `DISTRIBUTE_AXES` and at the call site.
 */
export const distributeCenters = (centers: number[]): number[] => {
  const out: number[] = [];
  if (!centers) return out;

  for (let i = 0; i < centers.length; i++) out.push(centers[i]);
  if (centers.length < MIN_DISTRIBUTE_LAYERS) return out;

  // Sort indices by centre so the extremes are the visual ones, not whichever
  // layers happen to sit first in the timeline.
  const order: number[] = [];
  for (let i = 0; i < centers.length; i++) order.push(i);
  order.sort((a, b) => centers[a] - centers[b]);

  const first = centers[order[0]];
  const last = centers[order[order.length - 1]];
  const step = (last - first) / (order.length - 1);

  for (let rank = 0; rank < order.length; rank++) {
    out[order[rank]] = first + step * rank;
  }
  return out;
};
