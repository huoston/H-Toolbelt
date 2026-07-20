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
  anchorForRect,
  computeAnchorMove,
  findAnchorPoint,
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
