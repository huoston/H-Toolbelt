/**
 * Tests for the arrival-speed classification.
 *
 * Author: Dr. Huoston Rodrigues
 * Website: https://huoston.art/
 * Email: hello@huoston.art
 * Version: 0.2.0
 * Created: 2026-11-05
 * Modified: 2026-11-05
 * License: GPL-3.0-or-later
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, expect, it } from "vitest";
import {
  EASED_ARRIVAL_RATIO,
  classifyArrivals,
  magnitude,
  subtractValues,
} from "./arrival";

/** One sample with the given ratio of arrival speed to segment speed. */
const atRatio = (ratio: number) => ({ arrivalSpeed: ratio * 100, segmentSpeed: 100 });

const easedCount = (arrivalSpeed: number, segmentSpeed: number): number =>
  classifyArrivals([{ arrivalSpeed, segmentSpeed }]).eased;

describe("magnitude", () => {
  it("is the absolute value in 1D", () => {
    expect(magnitude(-7)).toBe(7);
    expect(magnitude(7)).toBe(7);
  });

  it("is the Euclidean norm in 2D", () => {
    expect(magnitude([3, -4])).toBe(5);
  });

  it("is the Euclidean norm in 3D", () => {
    expect(magnitude([2, 3, 6])).toBe(7);
  });

  it("is zero for the zero vector", () => {
    expect(magnitude(0)).toBe(0);
    expect(magnitude([0, 0, 0])).toBe(0);
  });
});

describe("subtractValues", () => {
  it("subtracts scalars", () => {
    expect(subtractValues(5, 8)).toBe(-3);
  });

  it("subtracts component by component", () => {
    expect(subtractValues([5, 8], [1, 2])).toEqual([4, 6]);
    expect(subtractValues([5, 8, 1], [1, 2, 4])).toEqual([4, 6, -3]);
  });

  it("makes mismatched shapes count as eased, through NaN", () => {
    const speed = magnitude(subtractValues([1, 2], 1));
    expect(speed).toBeNaN();
    expect(easedCount(speed, 100)).toBe(1);
  });
});

describe("classifyArrivals", () => {
  it("pins the threshold at a tenth of the segment speed", () => {
    expect(EASED_ARRIVAL_RATIO).toBe(0.1);
  });

  it("does not count a linear arrival (ratio 1) as eased", () => {
    expect(classifyArrivals([atRatio(1)]).eased).toBe(0);
  });

  it("does not count an In curve (ratio above 1) as eased", () => {
    expect(classifyArrivals([atRatio(3)]).eased).toBe(0);
  });

  it("counts a stopped arrival (ratio 0) as eased", () => {
    expect(classifyArrivals([atRatio(0)]).eased).toBe(1);
  });

  it("sits between 0.099 and 0.1", () => {
    expect(classifyArrivals([atRatio(0.099)]).eased).toBe(1);
    expect(classifyArrivals([atRatio(0.1)]).eased).toBe(0);
  });

  it("counts a segment with no movement as eased", () => {
    expect(easedCount(0, 0)).toBe(1);
    expect(easedCount(50, 0)).toBe(1);
  });

  it("counts NaN and Infinity in either speed as eased", () => {
    expect(easedCount(NaN, 100)).toBe(1);
    expect(easedCount(Infinity, 100)).toBe(1);
    expect(easedCount(-Infinity, 100)).toBe(1);
    expect(easedCount(100, NaN)).toBe(1);
    expect(easedCount(100, Infinity)).toBe(1);
    expect(easedCount(100, -Infinity)).toBe(1);
  });

  it("reports total and eased on a mix of arrivals", () => {
    expect(
      classifyArrivals([
        atRatio(1),
        atRatio(0),
        atRatio(2.5),
        { arrivalSpeed: 10, segmentSpeed: 0 },
        { arrivalSpeed: NaN, segmentSpeed: 100 },
      ])
    ).toEqual({ total: 5, eased: 3 });
  });

  it("reports an empty list as nothing to count", () => {
    expect(classifyArrivals([])).toEqual({ total: 0, eased: 0 });
  });
});
