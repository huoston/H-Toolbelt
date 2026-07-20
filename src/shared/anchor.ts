/**
 * Pure anchor-point relocation engine for the Smart Anchor Point Control tool.
 *
 * Moving a layer's anchor point moves the layer on screen, because `position` is
 * measured relative to the anchor. This module computes the compensating
 * position so the object stays visually pinned.
 *
 * The math, not a fudge: After Effects maps a point `p` in layer space to comp
 * space as
 *
 *     comp(p) = position + R * S * (p - anchor)
 *
 * Requiring comp(p) to be unchanged for every p when the anchor moves from `A`
 * to `A'` collapses to a single term:
 *
 *     position' = position + R * S * (A' - A)
 *
 * So the anchor delta must travel through the scale and rotation matrix — a
 * naive `position + (A' - A)` is only correct at 100% scale and 0 rotation, and
 * visibly slips otherwise. Scale is applied first, then rotation (AE's transform
 * order). Rotation is clockwise-positive in AE's y-down comp space, which is
 * exactly what the [[cos, -sin], [sin, cos]] matrix produces there.
 *
 * This module is intentionally free of any After Effects API references (no
 * `app`, `layer`, `comp`) so it is unit-testable in plain Node and shared by the
 * panel UI and the ExtendScript host.
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

/** A 2-D point or vector in layer or composition space. */
export type Vec2 = [x: number, y: number];

/** The transform writes needed to relocate an anchor without visual movement. */
export interface AnchorMove {
  /** The new anchor point, in layer space. */
  newAnchor: Vec2;
  /** The compensating position, in the parent's space. */
  newPosition: Vec2;
}

/**
 * A bounding box in layer space, matching `Layer.sourceRectAtTime`'s shape.
 * `top`/`left` are the box origin; y grows downward.
 */
export interface SourceRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** One of the nine canonical anchor positions on a bounding box. */
export interface AnchorPointSpec {
  /** Stable identifier sent to the host; never localized. */
  id: string;
  /** Short human label for the UI grid. */
  label: string;
  /** Horizontal factor across the box: 0 = left, 0.5 = center, 1 = right. */
  fx: number;
  /** Vertical factor down the box: 0 = top, 0.5 = middle, 1 = bottom. */
  fy: number;
}

/**
 * The nine canonical anchor positions, in reading order so the UI can lay them
 * out as a 3x3 grid by simply iterating. Factors are named here rather than
 * scattered as magic numbers at the call sites.
 */
export const ANCHOR_POINTS: AnchorPointSpec[] = [
  { id: "top-left", label: "↖", fx: 0, fy: 0 },
  { id: "top-center", label: "↑", fx: 0.5, fy: 0 },
  { id: "top-right", label: "↗", fx: 1, fy: 0 },
  { id: "middle-left", label: "←", fx: 0, fy: 0.5 },
  { id: "center", label: "•", fx: 0.5, fy: 0.5 },
  { id: "middle-right", label: "→", fx: 1, fy: 0.5 },
  { id: "bottom-left", label: "↙", fx: 0, fy: 1 },
  { id: "bottom-center", label: "↓", fx: 0.5, fy: 1 },
  { id: "bottom-right", label: "↘", fx: 1, fy: 1 },
];

/** Look up an anchor point spec by id. Returns null when unknown. */
export function findAnchorPoint(id: string): AnchorPointSpec | null {
  for (let i = 0; i < ANCHOR_POINTS.length; i++) {
    if (ANCHOR_POINTS[i].id === id) return ANCHOR_POINTS[i];
  }
  return null;
}

/**
 * Resolve one of the nine canonical points to a concrete coordinate in layer
 * space, given the bounding box that `sourceRectAtTime` reported.
 */
export function anchorForRect(rect: SourceRect, spec: AnchorPointSpec): Vec2 {
  return [
    rect.left + rect.width * spec.fx,
    rect.top + rect.height * spec.fy,
  ];
}

/**
 * Compute the anchor and compensating position that relocate the anchor point
 * without moving the object on screen.
 *
 * @param currentAnchor    Current anchor point, in layer space.
 * @param currentPosition  Current position, in the parent's space.
 * @param targetAnchor     Desired anchor point, in layer space.
 * @param scale            AE scale percentages; [100, 100] is 1x.
 * @param rotationDegrees  AE rotation (z), clockwise-positive, in degrees.
 */
export function computeAnchorMove(
  currentAnchor: Vec2,
  currentPosition: Vec2,
  targetAnchor: Vec2,
  scale: Vec2,
  rotationDegrees: number
): AnchorMove {
  const deltaX = targetAnchor[0] - currentAnchor[0];
  const deltaY = targetAnchor[1] - currentAnchor[1];

  // Scale first: AE applies S before R.
  const scaledX = deltaX * (scale[0] / 100);
  const scaledY = deltaY * (scale[1] / 100);

  const theta = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const rotatedX = scaledX * cos - scaledY * sin;
  const rotatedY = scaledX * sin + scaledY * cos;

  return {
    newAnchor: [targetAnchor[0], targetAnchor[1]],
    newPosition: [currentPosition[0] + rotatedX, currentPosition[1] + rotatedY],
  };
}
