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

const preset = (label: string): Bezier => {
  const found = EASING_PRESETS.find((p) => p.label === label);
  if (!found) throw new Error(`preset not found: ${label}`);
  return found.bezier;
};

describe("bezierToTemporalEase", () => {
  it("Easy Ease: symmetric ~33.3% influence, zero speed", () => {
    const ease = bezierToTemporalEase(preset("Easy Ease"), 1, 100);
    expect(ease.out.influence).toBeCloseTo(33.3, 1);
    expect(ease.in.influence).toBeCloseTo(33.3, 1);
    expect(ease.out.speed).toBe(0);
    expect(ease.in.speed).toBe(0);
  });

  it("Ease Out: out influence clamps to minimum, in influence ~42%", () => {
    const ease = bezierToTemporalEase(preset("Ease Out"), 1, 100);
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

  it("throws a catchable error when timeDelta <= 0", () => {
    expect(() => bezierToTemporalEase(preset("Easy Ease"), 0, 100)).toThrow();
    expect(() => bezierToTemporalEase(preset("Easy Ease"), -1, 100)).toThrow();
  });

  it("exposes exactly six named presets", () => {
    expect(EASING_PRESETS).toHaveLength(6);
  });
});
