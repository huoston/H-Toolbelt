/**
 * Easings tool — After Effects host side.
 *
 * Applies native temporal ease (influence/speed) to selected keyframes using the
 * pure engine in `shared/easing`. Only temporal ease is touched here; spatial
 * tangents (e.g. Position motion paths) are left untouched.
 *
 * Author: Dr. Huoston Rodrigues
 * Website: https://huoston.art/
 * Email: hello@huoston.art
 * Version: 0.1.0
 * Created: 2026-07-09
 * Modified: 2026-07-09
 * License: GPL-3.0-or-later
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { bezierToTemporalEase } from "../../shared/easing";
import type { EaseSide, Bezier } from "../../shared/easing";

export interface ApplyEasingResult {
  applied: number;
  message: string;
}

/** The tuple shapes After Effects uses for a property's temporal ease. */
type EaseTuple =
  | [KeyframeEase]
  | [KeyframeEase, KeyframeEase]
  | [KeyframeEase, KeyframeEase, KeyframeEase];

const NO_SELECTION_MESSAGE =
  "Select 2+ keyframes on an animated property first.";

/**
 * Apply the given bezier ease to every adjacent pair of selected keyframes on
 * every selected property of every selected layer in the active composition.
 */
export const applyEasing = (b: Bezier): ApplyEasingResult => {
  const comp = app.project.activeItem;
  if (!(comp instanceof CompItem)) {
    return { applied: 0, message: "Open a composition first." };
  }

  let applied = 0;
  app.beginUndoGroup("H-Toolbelt: Apply Easing");
  try {
    const layers = comp.selectedLayers;
    for (let li = 0; li < layers.length; li++) {
      const props = layers[li].selectedProperties;
      for (let pi = 0; pi < props.length; pi++) {
        const prop = props[pi];
        if (prop.propertyType !== PropertyType.PROPERTY) continue;
        applied += applyToProperty(prop as Property, b);
      }
    }
  } finally {
    app.endUndoGroup();
  }

  if (applied === 0) {
    return { applied: 0, message: NO_SELECTION_MESSAGE };
  }
  return { applied: applied, message: "Applied to " + applied + " keyframes" };
};

/** Apply the ease to one keyframable property. Returns the count of eased keys. */
const applyToProperty = (prop: Property, b: Bezier): number => {
  if (!prop.canVaryOverTime || prop.numKeys < 2) return 0;

  const selKeys = prop.selectedKeys;
  if (!selKeys || selKeys.length < 2) return 0;

  // Only numeric properties expose a value delta we can turn into a speed.
  const dims = getValueDimensions(readValue(prop, selKeys[0]));
  if (dims === 0) return 0;

  let eased = false;
  for (let s = 0; s < selKeys.length - 1; s++) {
    const iA = selKeys[s];
    const iB = selKeys[s + 1];

    const timeDelta = prop.keyTime(iB) - prop.keyTime(iA);
    if (timeDelta <= 0) continue;

    const valueDelta = getValueDelta(prop, iA, iB, dims);

    let ease;
    try {
      ease = bezierToTemporalEase(b, timeDelta, valueDelta);
    } catch (e) {
      continue;
    }

    // Ensure the relevant side of each key is Bezier, preserving the opposite
    // side so segments outside the selection are left untouched.
    prop.setInterpolationTypeAtKey(
      iA,
      prop.keyInInterpolationType(iA),
      KeyframeInterpolationType.BEZIER
    );
    prop.setInterpolationTypeAtKey(
      iB,
      KeyframeInterpolationType.BEZIER,
      prop.keyOutInterpolationType(iB)
    );

    // Read the existing, correctly-sized ease tuples (this transparently
    // handles spatial Position, whose temporal ease is 1-D even for a 2-D/3-D
    // value), mutate the target side in place, and write both sides back.
    const aIn = prop.keyInTemporalEase(iA);
    const aOut = prop.keyOutTemporalEase(iA);
    setSide(aOut, ease.out);
    setTemporalEase(prop, iA, aIn, aOut);

    const bIn = prop.keyInTemporalEase(iB);
    const bOut = prop.keyOutTemporalEase(iB);
    setSide(bIn, ease.in);
    setTemporalEase(prop, iB, bIn, bOut);

    eased = true;
  }

  return eased ? selKeys.length : 0;
};

/** Overwrite every dimension of an ease tuple with the same side values. */
const setSide = (eases: EaseTuple, side: EaseSide): void => {
  for (let d = 0; d < eases.length; d++) {
    eases[d].speed = side.speed;
    eases[d].influence = side.influence;
  }
};

/**
 * Set both temporal ease sides of a key. The tuple lengths always match the
 * property's dimensionality (they come straight from AE); the cast only selects
 * a single overload for the compiler.
 */
const setTemporalEase = (
  prop: Property,
  keyIndex: number,
  inEase: EaseTuple,
  outEase: EaseTuple
): void => {
  prop.setTemporalEaseAtKey(
    keyIndex,
    inEase as [KeyframeEase],
    outEase as [KeyframeEase]
  );
};

/** Read a keyframe value as a scalar or numeric vector. */
const readValue = (prop: Property, keyIndex: number): number | number[] => {
  return prop.keyValue(keyIndex) as unknown as number | number[];
};

/** Dimension count of a keyframe value; 0 if it is not numeric. */
const getValueDimensions = (value: number | number[]): number => {
  if (value instanceof Array) return value.length;
  if (typeof value === "number") return 1;
  return 0;
};

/** Scalar value change between two keyframes (euclidean magnitude if vector). */
const getValueDelta = (
  prop: Property,
  iA: number,
  iB: number,
  dims: number
): number => {
  const a = readValue(prop, iA);
  const b = readValue(prop, iB);
  if (dims === 1) {
    return Math.abs((b as number) - (a as number));
  }
  let sumSquares = 0;
  for (let d = 0; d < dims; d++) {
    const diff = (b as number[])[d] - (a as number[])[d];
    sumSquares += diff * diff;
  }
  return Math.sqrt(sumSquares);
};
