/**
 * Unit tests for the pure Shape Layer Magic predicates.
 *
 * Both predicates gate a deletion, so the tests are weighted towards proving
 * they say *no*: a false negative leaves a stray group in the tree, which the
 * user can see and re-run the tool on, while a false positive deletes artwork.
 * Every component of the identity transform is therefore falsified on its own,
 * so a future refactor that drops one from the conjunction fails here rather
 * than in someone's project.
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
import {
  ARTBOARD_EPSILON,
  IDENTITY_EPSILON,
  isArtboardRect,
  isIdentityTransform,
  type GroupTransform,
} from "./shape";

/** An untouched shape group, exactly as After Effects reports one. */
const identity = (): GroupTransform => ({
  anchor: [0, 0],
  position: [0, 0],
  scale: [100, 100],
  rotation: 0,
  skew: 0,
  opacity: 100,
});

/** `identity()` with one field overridden. */
const withField = (patch: Partial<GroupTransform>): GroupTransform => ({
  ...identity(),
  ...patch,
});

describe("isIdentityTransform", () => {
  it("accepts an untouched group transform", () => {
    expect(isIdentityTransform(identity())).toBe(true);
  });

  // Each component on its own: a conjunction that loses a term still passes the
  // all-default case above, so only these catch it.
  const deviations: Array<[string, Partial<GroupTransform>]> = [
    ["anchor x", { anchor: [1, 0] }],
    ["anchor y", { anchor: [0, -3] }],
    ["position x", { position: [0.5, 0] }],
    ["position y", { position: [0, 1] }],
    ["scale x", { scale: [101, 100] }],
    ["scale y", { scale: [100, 99] }],
    ["rotation", { rotation: 0.5 }],
    ["skew", { skew: 2 }],
    ["opacity", { opacity: 99 }],
  ];

  for (let i = 0; i < deviations.length; i++) {
    const label = deviations[i][0];
    const patch = deviations[i][1];
    it(`rejects a deviation in ${label}`, () => {
      expect(isIdentityTransform(withField(patch))).toBe(false);
    });
  }

  it("tolerates float noise below the default epsilon", () => {
    const noisy = withField({
      scale: [100 + IDENTITY_EPSILON / 2, 100 - IDENTITY_EPSILON / 2],
      rotation: IDENTITY_EPSILON / 2,
    });
    expect(isIdentityTransform(noisy)).toBe(true);
  });

  it("rejects a deviation just above the default epsilon", () => {
    expect(
      isIdentityTransform(withField({ rotation: IDENTITY_EPSILON * 10 }))
    ).toBe(false);
  });

  it("honours a caller-supplied epsilon", () => {
    const t = withField({ scale: [100.4, 100], rotation: 0.4 });
    expect(isIdentityTransform(t)).toBe(false); // default epsilon
    expect(isIdentityTransform(t, 0.5)).toBe(true); // loosened
  });

  it("ignores a nonsensical epsilon and falls back to the default", () => {
    const t = withField({ rotation: 5 });
    expect(isIdentityTransform(t, NaN)).toBe(false);
    expect(isIdentityTransform(t, -1)).toBe(false);
  });

  // An unreadable component must read as "not provably identity", never as a
  // pass. These stand in for a property AE refused to hand over.
  it("rejects unreadable components rather than assuming a default", () => {
    expect(isIdentityTransform(withField({ rotation: NaN }))).toBe(false);
    expect(isIdentityTransform(withField({ opacity: Infinity }))).toBe(false);
    expect(
      isIdentityTransform(withField({ scale: null as unknown as [number, number] }))
    ).toBe(false);
    expect(isIdentityTransform(null as unknown as GroupTransform)).toBe(false);
  });
});

describe("isArtboardRect", () => {
  const COMP: [number, number] = [1920, 1080];

  it("accepts a comp-sized rectangle centred on the origin", () => {
    expect(isArtboardRect([1920, 1080], [0, 0], COMP)).toBe(true);
  });

  it("rejects a rectangle smaller than the comp", () => {
    expect(isArtboardRect([1900, 1080], [0, 0], COMP)).toBe(false);
    expect(isArtboardRect([1920, 500], [0, 0], COMP)).toBe(false);
  });

  it("rejects a rectangle larger than the comp", () => {
    expect(isArtboardRect([2000, 1200], [0, 0], COMP)).toBe(false);
  });

  it("rejects a comp-sized rectangle that is offset", () => {
    expect(isArtboardRect([1920, 1080], [40, 0], COMP)).toBe(false);
    expect(isArtboardRect([1920, 1080], [0, -12], COMP)).toBe(false);
  });

  it("tolerates importer rounding below the default epsilon", () => {
    expect(
      isArtboardRect([1919.6, 1080.4], [0.2, -0.3], COMP, ARTBOARD_EPSILON)
    ).toBe(true);
  });

  it("rejects a deviation just above the default epsilon", () => {
    expect(isArtboardRect([1918, 1080], [0, 0], COMP)).toBe(false);
  });

  it("honours a caller-supplied epsilon", () => {
    expect(isArtboardRect([1915, 1080], [0, 0], COMP)).toBe(false);
    expect(isArtboardRect([1915, 1080], [0, 0], COMP, 10)).toBe(true);
  });

  it("refuses to match against a degenerate comp size", () => {
    expect(isArtboardRect([0, 0], [0, 0], [0, 0])).toBe(false);
    expect(isArtboardRect([1920, 1080], [0, 0], [-1920, 1080])).toBe(false);
    expect(
      isArtboardRect([1920, 1080], [0, 0], null as unknown as [number, number])
    ).toBe(false);
  });

  it("rejects unreadable rectangle values", () => {
    expect(isArtboardRect([NaN, 1080], [0, 0], COMP)).toBe(false);
    expect(isArtboardRect([1920, 1080], [NaN, 0], COMP)).toBe(false);
    expect(
      isArtboardRect(null as unknown as [number, number], [0, 0], COMP)
    ).toBe(false);
  });
});
