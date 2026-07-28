/**
 * Unit tests for the pure anchor-point relocation engine.
 *
 * The decisive cases are scale and rotation: a naive `position + delta`
 * compensation passes the no-transform test and silently slips everywhere else,
 * so those are pinned with exact expected values rather than smoke assertions.
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

import { describe, it, expect } from "vitest";
import {
  ANCHOR_POINTS,
  OFFSET_EPSILON,
  anchorForRect,
  computeAnchorMove,
  findAnchorPoint,
  isZeroOffset,
  offsetPositionValue,
  shiftPositionKeys,
  type PositionKey,
  type SourceRect,
  type Vec2,
} from "./anchor";

const TOL = 1e-6;

describe("computeAnchorMove", () => {
  it("no scale, no rotation: position shifts by the raw anchor delta", () => {
    const move = computeAnchorMove([50, 50], [200, 300], [80, 90], [100, 100], 0);
    expect(move.newAnchor).toEqual([80, 90]);
    // delta = [30, 40] -> position + delta
    expect(move.newPosition[0]).toBeCloseTo(230, 10);
    expect(move.newPosition[1]).toBeCloseTo(340, 10);
  });

  it("200% scale doubles the compensation", () => {
    const move = computeAnchorMove([0, 0], [100, 100], [10, 20], [200, 200], 0);
    expect(move.newPosition[0]).toBeCloseTo(120, 10);
    expect(move.newPosition[1]).toBeCloseTo(140, 10);
  });

  it("non-uniform scale compensates each axis independently", () => {
    const move = computeAnchorMove([0, 0], [0, 0], [10, 10], [50, 300], 0);
    expect(move.newPosition[0]).toBeCloseTo(5, 10);
    expect(move.newPosition[1]).toBeCloseTo(30, 10);
  });

  it("90 degrees rotation turns a [10, 0] delta into [0, 10]", () => {
    const move = computeAnchorMove([0, 0], [0, 0], [10, 0], [100, 100], 90);
    expect(move.newPosition[0]).toBeCloseTo(0, 6);
    expect(move.newPosition[1]).toBeCloseTo(10, 6);
    // Guard the tolerance claim: cos(90 deg) is ~6.1e-17, not exactly 0.
    expect(Math.abs(move.newPosition[0])).toBeLessThan(TOL);
  });

  it("180 degrees rotation negates the delta", () => {
    const move = computeAnchorMove([0, 0], [100, 100], [10, 20], [100, 100], 180);
    expect(move.newPosition[0]).toBeCloseTo(90, 6);
    expect(move.newPosition[1]).toBeCloseTo(80, 6);
  });

  it("scale and rotation combined, with known values", () => {
    // delta = [10, 0]; scale 200% -> [20, 0]; rotate 90 deg -> [0, 20].
    const move = computeAnchorMove([5, 5], [50, 60], [15, 5], [200, 200], 90);
    expect(move.newAnchor).toEqual([15, 5]);
    expect(move.newPosition[0]).toBeCloseTo(50, 6);
    expect(move.newPosition[1]).toBeCloseTo(80, 6);
  });

  it("scale and rotation combined, at 45 degrees on both axes", () => {
    // delta = [10, 10]; scale 50% -> [5, 5]; rotate 45 deg:
    //   x = 5*cos45 - 5*sin45 = 0
    //   y = 5*sin45 + 5*cos45 = 10/sqrt(2) * ... = 7.0710678...
    const move = computeAnchorMove([0, 0], [0, 0], [10, 10], [50, 50], 45);
    expect(move.newPosition[0]).toBeCloseTo(0, 6);
    expect(move.newPosition[1]).toBeCloseTo(5 * Math.SQRT2, 6);
  });

  it("negative scale (flipped layer) mirrors the compensation", () => {
    const move = computeAnchorMove([0, 0], [0, 0], [10, 0], [-100, 100], 0);
    expect(move.newPosition[0]).toBeCloseTo(-10, 10);
  });

  it("is a no-op when the target equals the current anchor", () => {
    const move = computeAnchorMove([7, 9], [123, 456], [7, 9], [250, 80], 33);
    expect(move.newPosition[0]).toBeCloseTo(123, 10);
    expect(move.newPosition[1]).toBeCloseTo(456, 10);
  });

  it("round-trips: moving the anchor and back restores the position", () => {
    const start: Vec2 = [10, 20];
    const mid: Vec2 = [90, 140];
    const pos: Vec2 = [300, 400];
    const scale: Vec2 = [175, 60];
    const rot = 27;

    const out = computeAnchorMove(start, pos, mid, scale, rot);
    const back = computeAnchorMove(mid, out.newPosition, start, scale, rot);
    expect(back.newPosition[0]).toBeCloseTo(pos[0], 6);
    expect(back.newPosition[1]).toBeCloseTo(pos[1], 6);
    expect(back.newAnchor).toEqual(start);
  });

  it("never throws across the full point grid and awkward transforms", () => {
    const rect: SourceRect = { top: -50, left: -80, width: 160, height: 100 };
    for (let i = 0; i < ANCHOR_POINTS.length; i++) {
      const target = anchorForRect(rect, ANCHOR_POINTS[i]);
      expect(() =>
        computeAnchorMove([0, 0], [0, 0], target, [0, 0], 720)
      ).not.toThrow();
    }
  });
});

describe("ANCHOR_POINTS and rect resolution", () => {
  it("exposes exactly nine points with unique ids", () => {
    expect(ANCHOR_POINTS).toHaveLength(9);
    const ids = new Set(ANCHOR_POINTS.map((p) => p.id));
    expect(ids.size).toBe(9);
  });

  it("uses only the canonical 0 / 0.5 / 1 factors", () => {
    for (const p of ANCHOR_POINTS) {
      expect([0, 0.5, 1]).toContain(p.fx);
      expect([0, 0.5, 1]).toContain(p.fy);
    }
  });

  it("resolves the corners and centre of a source rect", () => {
    const rect: SourceRect = { top: -25, left: -60, width: 120, height: 50 };
    expect(anchorForRect(rect, findAnchorPoint("top-left")!)).toEqual([-60, -25]);
    expect(anchorForRect(rect, findAnchorPoint("center")!)).toEqual([0, 0]);
    expect(anchorForRect(rect, findAnchorPoint("bottom-right")!)).toEqual([60, 25]);
    expect(anchorForRect(rect, findAnchorPoint("top-center")!)).toEqual([0, -25]);
    expect(anchorForRect(rect, findAnchorPoint("middle-left")!)).toEqual([-60, 0]);
  });

  it("returns null for an unknown point id", () => {
    expect(findAnchorPoint("nope")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* The merge gate                                                             */
/* -------------------------------------------------------------------------- */

describe("static layers: one code path, two former tools", () => {
  /**
   * Anchor Point and Re-pivot were separate tools with separate maths. Merging
   * them is only safe if, on a fully static layer, the surviving formula gives
   * the byte-identical answer the retired one did.
   *
   *   retired : computeAnchorMove(A, P, A', S, R).newPosition
   *   kept    : P + computeAnchorMove(A, [0,0], A', S, R).newPosition
   *
   * Both expand to `P + R*S*(A' - A)`. This suite is what licensed deleting the
   * old path; if it ever fails, the merge was not the no-op it claims to be.
   */
  const cases: Array<{
    label: string;
    anchor: Vec2;
    position: Vec2;
    target: Vec2;
    scale: Vec2;
    rotation: number;
  }> = [
    {
      label: "identity transform",
      anchor: [50, 50],
      position: [200, 300],
      target: [0, 0],
      scale: [100, 100],
      rotation: 0,
    },
    {
      label: "scaled",
      anchor: [12, -40],
      position: [640, 360],
      target: [100, 80],
      scale: [250, 60],
      rotation: 0,
    },
    {
      label: "rotated",
      anchor: [0, 0],
      position: [-15, 900],
      target: [-33, 47],
      scale: [100, 100],
      rotation: 37,
    },
    {
      label: "scaled and rotated",
      anchor: [80, 80],
      position: [0, 0],
      target: [0, 160],
      scale: [180, 45],
      rotation: -110,
    },
    {
      label: "negative scale",
      anchor: [25, 25],
      position: [500, 500],
      target: [-25, 75],
      scale: [-100, 140],
      rotation: 20,
    },
    {
      label: "anchor already on target",
      anchor: [40, 90],
      position: [111, 222],
      target: [40, 90],
      scale: [130, 70],
      rotation: 25,
    },
  ];

  for (const c of cases) {
    it(`gives the retired tool's exact answer (${c.label})`, () => {
      const retired = computeAnchorMove(
        c.anchor,
        c.position,
        c.target,
        c.scale,
        c.rotation
      ).newPosition;

      const offset = computeAnchorMove(
        c.anchor,
        [0, 0],
        c.target,
        c.scale,
        c.rotation
      ).newPosition;
      const kept = offsetPositionValue(c.position, offset);

      expect(kept[0]).toBeCloseTo(retired[0], 12);
      expect(kept[1]).toBeCloseTo(retired[1], 12);
    });
  }

  it("agrees on the new anchor too, not just the position", () => {
    const move = computeAnchorMove([10, 20], [1, 2], [30, 40], [100, 100], 0);
    expect(move.newAnchor).toEqual([30, 40]);
  });

  it("treats a static layer as a one-entry keyframe track", () => {
    // The host shifts a static value directly and a keyframed track via
    // shiftPositionKeys. They must be the same arithmetic, or the "no keyframes"
    // branch would quietly diverge from the animated one.
    const position = [200, 300];
    const offset = computeAnchorMove([50, 50], [0, 0], [0, 0], [140, 90], 15)
      .newPosition;

    const direct = offsetPositionValue(position, offset);
    const viaTrack = shiftPositionKeys([{ time: 0, value: position }], offset);

    expect(viaTrack[0].value).toEqual(direct);
  });
});

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

describe("shiftPositionKeys", () => {
  it("preserves the keyframe count", () => {
    expect(shiftPositionKeys(keys2d(), [10, 10]).length).toBe(3);
  });

  it("never changes a keyframe time", () => {
    const before = keys2d();
    const after = shiftPositionKeys(before, [37, -12]);
    for (let i = 0; i < before.length; i++) {
      expect(after[i].time).toBe(before[i].time);
    }
  });

  it("moves every keyframe by the same vector", () => {
    const before = keys2d();
    const offset: Vec2 = [25, -7];
    const after = shiftPositionKeys(before, offset);
    for (let i = 0; i < before.length; i++) {
      expect(after[i].value[0] - before[i].value[0]).toBeCloseTo(offset[0], 10);
      expect(after[i].value[1] - before[i].value[1]).toBeCloseTo(offset[1], 10);
    }
  });

  it("preserves the shape of the animation (differences between keys)", () => {
    // A rigid translation leaves every inter-keyframe delta untouched; that is
    // what makes the re-baked motion identical rather than merely similar.
    const before = keys2d();
    const after = shiftPositionKeys(before, [999, -999]);
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
    const after = shiftPositionKeys(keys, [5, 5]);
    expect(after[0].value[2]).toBe(500);
    expect(after[1].value[2]).toBe(-250);
  });

  it("does not mutate the input list", () => {
    const before = keys2d();
    shiftPositionKeys(before, [50, 50]);
    expect(before[0].value).toEqual([100, 200]);
  });

  it("handles an empty list", () => {
    expect(shiftPositionKeys([], [1, 1])).toEqual([]);
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
      const after = shiftPositionKeys(before, offset);

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

describe("what re-pivoting deliberately changes", () => {
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

  const anchor: Vec2 = [40, 90];
  const target: Vec2 = [0, 0];
  const scale: Vec2 = [100, 100];

  /** The offset the host computes, evaluated at the current time's rotation. */
  const offsetAt = (rotationNow: number): Vec2 =>
    computeAnchorMove(anchor, [0, 0], target, scale, rotationNow)
      .newPosition as Vec2;

  it("keeps the layer pinned at the time the offset was evaluated", () => {
    const rotationNow = 30;
    const before = keys2d();
    const after = shiftPositionKeys(before, offsetAt(rotationNow));

    for (let i = 0; i < before.length; i++) {
      const originalPoint = toComp(
        [200, -60],
        before[i].value,
        anchor,
        scale,
        rotationNow
      );
      const shiftedPoint = toComp(
        [200, -60],
        after[i].value,
        target,
        scale,
        rotationNow
      );
      expect(shiftedPoint[0]).toBeCloseTo(originalPoint[0], 9);
      expect(shiftedPoint[1]).toBeCloseTo(originalPoint[1], 9);
    }
  });

  it("moves the layer at other rotations — the point of a new pivot", () => {
    // The offset is fixed at t_now's rotation; at a different rotation the layer
    // swings about the new anchor instead of the old one, so the rendered
    // position differs. Asserting sameness here is what the previous, wrong
    // implementation did, and it cost the user their motion path.
    const after = shiftPositionKeys(keys2d(), offsetAt(30));

    const atOriginal = toComp([200, -60], keys2d()[0].value, anchor, scale, 120);
    const atRepivoted = toComp([200, -60], after[0].value, target, scale, 120);

    const dx = atRepivoted[0] - atOriginal[0];
    const dy = atRepivoted[1] - atOriginal[1];
    expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThan(1);
  });

  it("preserves the path shape whatever the rotation used for the offset", () => {
    // The reason the trade is worth it: the offset's magnitude changes with
    // t_now, but it is always ONE vector, so the path never deforms.
    for (const rotationNow of [0, 30, 90, -145]) {
      const before = keys2d();
      const after = shiftPositionKeys(before, offsetAt(rotationNow));
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
    }
  });

  it("keeps the keyframe count fixed — no densification", () => {
    // The regression guard for the resampling approach: three keyframes in,
    // three keyframes out, at any rotation.
    for (const rotationNow of [0, 45, 200]) {
      expect(shiftPositionKeys(keys2d(), offsetAt(rotationNow)).length).toBe(3);
    }
  });
});
