/**
 * Unit tests for the pure re-pivot keyframe re-baking.
 *
 * The property that matters is that re-baking is a *rigid translation*: every
 * keyframe moves by the same vector, times never change, and the count never
 * changes. Those three together are what make the re-baked animation identical
 * to the original — anything else silently reshapes the user's motion.
 *
 * The composition test at the bottom is the real proof: it takes the offset from
 * `computeAnchorMove` exactly as the host does, applies it, and checks that the
 * on-screen mapping is unchanged at every keyframe.
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

import { describe, it, expect } from "vitest";
import { computeAnchorMove, type Vec2 } from "./anchor";
import {
  OFFSET_EPSILON,
  isZeroOffset,
  offsetPositionValue,
  rebakePositionKeys,
  type PositionKey,
} from "./repivot";

const keys2d = (): PositionKey[] => [
  { time: 0, value: [100, 200] },
  { time: 0.5, value: [300, 250] },
  { time: 1.25, value: [-40, 0] },
];

describe("offsetPositionValue", () => {
  it("offsets x and y of a 2-D value", () => {
    expect(offsetPositionValue([100, 200], [10, -5])).toEqual([110, 195]);
  });

  it("offsets x and y of a 3-D value and leaves z alone", () => {
    expect(offsetPositionValue([100, 200, 50], [10, -5])).toEqual([
      110, 195, 50,
    ]);
  });

  it("handles a zero offset as identity", () => {
    expect(offsetPositionValue([1, 2, 3], [0, 0])).toEqual([1, 2, 3]);
  });

  it("returns a new array rather than mutating the input", () => {
    const original = [100, 200];
    const result = offsetPositionValue(original, [1, 1]);
    expect(original).toEqual([100, 200]);
    expect(result).not.toBe(original);
  });

  it("survives an unusable value without throwing", () => {
    expect(offsetPositionValue(null as unknown as number[], [1, 1])).toEqual([]);
  });
});

describe("rebakePositionKeys", () => {
  it("preserves the keyframe count", () => {
    expect(rebakePositionKeys(keys2d(), [10, 10]).length).toBe(3);
  });

  it("never changes a keyframe time", () => {
    const before = keys2d();
    const after = rebakePositionKeys(before, [37, -12]);
    for (let i = 0; i < before.length; i++) {
      expect(after[i].time).toBe(before[i].time);
    }
  });

  it("moves every keyframe by the same vector", () => {
    const before = keys2d();
    const offset: Vec2 = [25, -7];
    const after = rebakePositionKeys(before, offset);
    for (let i = 0; i < before.length; i++) {
      expect(after[i].value[0] - before[i].value[0]).toBeCloseTo(offset[0], 10);
      expect(after[i].value[1] - before[i].value[1]).toBeCloseTo(offset[1], 10);
    }
  });

  it("preserves the shape of the animation (differences between keys)", () => {
    // A rigid translation leaves every inter-keyframe delta untouched; that is
    // what makes the re-baked motion identical rather than merely similar.
    const before = keys2d();
    const after = rebakePositionKeys(before, [999, -999]);
    for (let i = 1; i < before.length; i++) {
      expect(after[i].value[0] - after[i - 1].value[0]).toBeCloseTo(
        before[i].value[0] - before[i - 1].value[0],
        10
      );
      expect(after[i].value[1] - after[i - 1].value[1]).toBeCloseTo(
        before[i].value[1] - before[i - 1].value[1],
        10
      );
    }
  });

  it("carries z through on a 3-D layer", () => {
    const keys: PositionKey[] = [
      { time: 0, value: [0, 0, 500] },
      { time: 1, value: [10, 10, -250] },
    ];
    const after = rebakePositionKeys(keys, [5, 5]);
    expect(after[0].value[2]).toBe(500);
    expect(after[1].value[2]).toBe(-250);
  });

  it("does not mutate the input list", () => {
    const before = keys2d();
    rebakePositionKeys(before, [50, 50]);
    expect(before[0].value).toEqual([100, 200]);
  });

  it("handles an empty list", () => {
    expect(rebakePositionKeys([], [1, 1])).toEqual([]);
  });
});

describe("isZeroOffset", () => {
  it("is true for an exact zero", () => {
    expect(isZeroOffset([0, 0])).toBe(true);
  });

  it("is true within the default epsilon", () => {
    expect(isZeroOffset([OFFSET_EPSILON / 2, -OFFSET_EPSILON / 2])).toBe(true);
  });

  it("is false for a real offset", () => {
    expect(isZeroOffset([0.5, 0])).toBe(false);
    expect(isZeroOffset([0, -3])).toBe(false);
  });

  it("treats unreadable offsets as nothing to do", () => {
    expect(isZeroOffset([NaN, 0])).toBe(true);
    expect(isZeroOffset(null as unknown as Vec2)).toBe(true);
  });

  it("honours a caller-supplied epsilon", () => {
    expect(isZeroOffset([0.4, 0], 0.5)).toBe(true);
    expect(isZeroOffset([0.6, 0], 0.5)).toBe(false);
  });
});

describe("re-baking against computeAnchorMove — the whole point", () => {
  /** Where a layer-space point lands in comp space. */
  const toComp = (
    p: Vec2,
    position: number[],
    anchor: Vec2,
    scale: Vec2,
    rotationDeg: number
  ): Vec2 => {
    const dx = (p[0] - anchor[0]) * (scale[0] / 100);
    const dy = (p[1] - anchor[1]) * (scale[1] / 100);
    const t = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    return [
      position[0] + dx * cos - dy * sin,
      position[1] + dx * sin + dy * cos,
    ];
  };

  const cases: Array<{ label: string; scale: Vec2; rotation: number }> = [
    { label: "no transform", scale: [100, 100], rotation: 0 },
    { label: "scaled", scale: [250, 60], rotation: 0 },
    { label: "rotated", scale: [100, 100], rotation: 37 },
    { label: "scaled and rotated", scale: [180, 45], rotation: -110 },
    { label: "negative scale", scale: [-100, 100], rotation: 20 },
  ];

  for (const { label, scale, rotation } of cases) {
    it(`keeps every keyframe visually identical (${label})`, () => {
      const anchor: Vec2 = [40, 90];
      const target: Vec2 = [0, 0];
      const before = keys2d();

      // Exactly how the host derives the offset: a zero current position makes
      // newPosition the bare correction term R * S * (A' - A).
      const offset = computeAnchorMove(anchor, [0, 0], target, scale, rotation)
        .newPosition;
      const after = rebakePositionKeys(before, offset);

      // Probe several layer-space points, not just the anchor: the guarantee is
      // that the whole layer is pinned, not one convenient point.
      const probes: Vec2[] = [
        [0, 0],
        [40, 90],
        [200, -60],
      ];

      for (let i = 0; i < before.length; i++) {
        for (const p of probes) {
          const originalPoint = toComp(
            p,
            before[i].value,
            anchor,
            scale,
            rotation
          );
          const rebakedPoint = toComp(
            p,
            after[i].value,
            target,
            scale,
            rotation
          );
          expect(rebakedPoint[0]).toBeCloseTo(originalPoint[0], 9);
          expect(rebakedPoint[1]).toBeCloseTo(originalPoint[1], 9);
        }
      }
    });
  }

  it("is a no-op when the anchor is already on the target", () => {
    const anchor: Vec2 = [40, 90];
    const offset = computeAnchorMove(anchor, [0, 0], anchor, [130, 70], 25)
      .newPosition;
    expect(isZeroOffset(offset)).toBe(true);
  });
});
