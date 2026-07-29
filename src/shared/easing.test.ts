/**
 * Unit tests for the pure temporal-ease engine.
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

import { describe, it, expect } from "vitest";
import {
  bezierToTemporalEase,
  EASING_PRESETS,
  INFLUENCE_MIN,
  type Bezier,
} from "./easing";

/**
 * Engine assertions use literal curves rather than looking presets up by name.
 *
 * They were written against the preset list, which made a rename or a
 * reordering of the library break tests that are really about the maths. The
 * two are now independent: these pin the engine, and the suite at the bottom
 * pins the library.
 */
const EASY_EASE: Bezier = [0.333, 0, 0.667, 1];

describe("bezierToTemporalEase", () => {
  it("symmetric curve: ~33.3% influence both sides, zero speed", () => {
    const ease = bezierToTemporalEase(EASY_EASE, 1, 100);
    expect(ease.out.influence).toBeCloseTo(33.3, 1);
    expect(ease.in.influence).toBeCloseTo(33.3, 1);
    expect(ease.out.speed).toBe(0);
    expect(ease.in.speed).toBe(0);
  });

  it("x1 = 0: out influence clamps to the minimum, in influence ~42%", () => {
    const ease = bezierToTemporalEase([0, 0, 0.58, 1], 1, 100);
    // x1 = 0 -> influence 0 -> clamped up to INFLUENCE_MIN (0.1)
    expect(ease.out.influence).toBeCloseTo(INFLUENCE_MIN, 5);
    // in influence = (1 - x2) * 100 = (1 - 0.58) * 100 = 42
    expect(ease.in.influence).toBeCloseTo(42, 1);
    expect(ease.out.speed).toBe(0);
    expect(ease.in.speed).toBe(0);
  });

  it("respects the valueDelta/timeDelta scaling for non-zero endpoint slopes", () => {
    // A linear-ish curve with slope 1 at the start: y1/x1 = 1.
    const linearStart: Bezier = [0.5, 0.5, 1, 1];
    const ease = bezierToTemporalEase(linearStart, 2, 200);
    // averageSpeed = 200 / 2 = 100; out.speed = (0.5/0.5) * 100 = 100
    expect(ease.out.speed).toBeCloseTo(100, 5);
  });

  it("non-zero endpoint slopes drive real out/in speeds (covers the speed path)", () => {
    // The six presets all have x1=y1... endpoints that zero the speed term; a
    // steep, hand-tuned curve (the editor's reason for existing) exercises it.
    // Both tangents are steeper than the segment's average rate.
    const steep: Bezier = [0.25, 0.5, 0.75, 0.5];
    const timeDelta = 2;
    const valueDelta = 200;
    const averageSpeed = valueDelta / timeDelta; // 100
    const ease = bezierToTemporalEase(steep, timeDelta, valueDelta);

    // out.speed = (y1 / x1) * averageSpeed = (0.5 / 0.25) * 100 = 200
    expect(ease.out.speed).toBeCloseTo(2 * averageSpeed, 5);
    // in.speed = ((1 - y2) / (1 - x2)) * averageSpeed = (0.5 / 0.25) * 100 = 200
    expect(ease.in.speed).toBeCloseTo(2 * averageSpeed, 5);
    // Positive sign (value rising) and genuinely non-zero on both sides.
    expect(ease.out.speed).toBeGreaterThan(0);
    expect(ease.in.speed).toBeGreaterThan(0);
    // Influences track the x components: x1*100 = 25 and (1 - x2)*100 = 25.
    expect(ease.out.influence).toBeCloseTo(25, 5);
    expect(ease.in.influence).toBeCloseTo(25, 5);
  });

  it("throws a catchable error when timeDelta <= 0", () => {
    expect(() => bezierToTemporalEase(EASY_EASE, 0, 100)).toThrow();
    expect(() => bezierToTemporalEase(EASY_EASE, -1, 100)).toThrow();
  });
});

describe("the easing library", () => {
  it("exposes the full bezier set", () => {
    expect(EASING_PRESETS).toHaveLength(14);
  });

  it("gives every preset a unique id and label", () => {
    const ids = new Set(EASING_PRESETS.map((p) => p.id));
    const labels = new Set(EASING_PRESETS.map((p) => p.label));
    expect(ids.size).toBe(EASING_PRESETS.length);
    expect(labels.size).toBe(EASING_PRESETS.length);
  });

  it("gives every preset a hint for the hover legend", () => {
    for (const p of EASING_PRESETS) {
      expect(p.hint.length).toBeGreaterThan(0);
      expect(p.hint.charAt(p.hint.length - 1)).toBe(".");
    }
  });

  it("marks every preset as a bezier curve", () => {
    // The field exists so overshoot easings can join this list later with a
    // different kind. Until then, anything else here would reach the keyframe
    // engine, which cannot express it.
    for (const p of EASING_PRESETS) {
      expect(p.kind).toBe("bezier");
    }
  });

  // The engine's contract: x controls influence, which After Effects reads as a
  // percentage of the segment. An x outside [0,1] is not a curve it can express.
  it("keeps every control point's x inside the unit interval", () => {
    for (const p of EASING_PRESETS) {
      const [x1, , x2] = p.bezier;
      expect(x1).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(1);
      expect(x2).toBeGreaterThanOrEqual(0);
      expect(x2).toBeLessThanOrEqual(1);
    }
  });

  it("keeps every y within the unit square, so no preset overshoots", () => {
    // Overshoot is exactly what the keyframe engine cannot do; a y outside [0,1]
    // here would silently be flattened rather than bounced.
    for (const p of EASING_PRESETS) {
      const [, y1, , y2] = p.bezier;
      expect(y1).toBeGreaterThanOrEqual(0);
      expect(y1).toBeLessThanOrEqual(1);
      expect(y2).toBeGreaterThanOrEqual(0);
      expect(y2).toBeLessThanOrEqual(1);
    }
  });

  it("converts every preset without throwing, with legal influences", () => {
    for (const p of EASING_PRESETS) {
      const ease = bezierToTemporalEase(p.bezier, 1, 100);
      for (const side of [ease.out, ease.in]) {
        expect(side.influence).toBeGreaterThanOrEqual(INFLUENCE_MIN);
        expect(side.influence).toBeLessThanOrEqual(100);
        expect(Number.isFinite(side.speed)).toBe(true);
      }
    }
  });

  it("keeps Linear linear", () => {
    const linear = EASING_PRESETS.find((p) => p.id === "linear");
    expect(linear?.bezier).toEqual([0, 0, 1, 1]);
  });
});
