/**
 * Unit tests for the pure align & distribute geometry.
 *
 * The load-bearing case is rotation. After Effects' own Align uses the layer's
 * untransformed box, so a rotated layer aligns to an edge you cannot see; this
 * module uses the comp-space box, and the 45-degree square test pins the
 * difference numerically — a 100x100 square must report a 141.42 box, not 100.
 *
 * The other case worth its space is distribution order: `distributeCenters` must
 * return results in the caller's original order while sorting internally, or the
 * host would hand each layer someone else's destination.
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

import { describe, it, expect } from "vitest";
import type { SourceRect, Vec2 } from "./anchor";
import { isZeroOffset } from "./anchor";
import {
  ALIGN_MODES,
  ALIGN_TARGETS,
  DEFAULT_ALIGN_TO,
  DISTRIBUTE_AXES,
  MIN_DISTRIBUTE_LAYERS,
  MIN_DISTRIBUTE_TO_BOUNDS,
  aabbFromCorners,
  alignDelta,
  compAabb,
  cornersOfRect,
  distributeCenters,
  distributeToBounds,
  findAlignMode,
  findAlignTo,
  findDistributeAxis,
  isFiniteAabb,
  isFiniteDelta,
  layerAabb,
  projectCorner,
  unionAabb,
  type Aabb,
  type AlignMode,
  type DistributeItem,
  type Vec3,
} from "./align";

/** A 100x100 square whose local origin sits at its centre. */
const SQUARE: SourceRect = { left: -50, top: -50, width: 100, height: 100 };
const CENTER_ANCHOR: Vec2 = [0, 0];
const NO_SCALE: Vec2 = [100, 100];

describe("cornersOfRect", () => {
  it("returns four corners spanning the rect", () => {
    const corners = cornersOfRect({ left: 10, top: 20, width: 30, height: 40 });
    expect(corners.length).toBe(4);
    expect(corners).toEqual([
      [10, 20, 0],
      [40, 20, 0],
      [40, 60, 0],
      [10, 60, 0],
    ]);
  });

  it("gives every corner a zero z, reserved for 3-D", () => {
    for (const c of cornersOfRect(SQUARE)) expect(c[2]).toBe(0);
  });
});

describe("aabbFromCorners", () => {
  it("takes min and max over x and y", () => {
    const box = aabbFromCorners([
      [10, 5, 0],
      [-3, 40, 0],
      [22, 12, 0],
    ]);
    expect(box).toEqual({ minX: -3, minY: 5, maxX: 22, maxY: 40 });
  });

  it("ignores z entirely in v1", () => {
    const flat = aabbFromCorners([
      [0, 0, 0],
      [10, 10, 0],
    ]);
    const deep = aabbFromCorners([
      [0, 0, -900],
      [10, 10, 900],
    ]);
    expect(deep).toEqual(flat);
  });

  it("returns a degenerate box rather than infinities for no corners", () => {
    expect(aabbFromCorners([])).toEqual({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    });
  });
});

describe("layerAabb — comp-space bounds", () => {
  it("is the plain rect when nothing is transformed", () => {
    const box = layerAabb(SQUARE, CENTER_ANCHOR, [0, 0], NO_SCALE, 0);
    expect(box).toEqual({ minX: -50, minY: -50, maxX: 50, maxY: 50 });
  });

  it("follows position", () => {
    const box = layerAabb(SQUARE, CENTER_ANCHOR, [200, 300], NO_SCALE, 0);
    expect(box).toEqual({ minX: 150, minY: 250, maxX: 250, maxY: 350 });
  });

  // THE case: a rotated square's visible box is its diagonal, not its side.
  // Aligning to this is the entire reason for working in comp space.
  it("grows for a 45-degree rotation, to the diagonal", () => {
    const box = layerAabb(SQUARE, CENTER_ANCHOR, [0, 0], NO_SCALE, 45);
    const expected = (100 * Math.SQRT2) / 2; // half-diagonal
    expect(box.minX).toBeCloseTo(-expected, 9);
    expect(box.maxX).toBeCloseTo(expected, 9);
    expect(box.minY).toBeCloseTo(-expected, 9);
    expect(box.maxY).toBeCloseTo(expected, 9);
    expect(box.maxX - box.minX).toBeCloseTo(141.4213562373, 6);
  });

  it("is unchanged by a 90-degree rotation of a square", () => {
    const box = layerAabb(SQUARE, CENTER_ANCHOR, [0, 0], NO_SCALE, 90);
    expect(box.minX).toBeCloseTo(-50, 9);
    expect(box.maxX).toBeCloseTo(50, 9);
    expect(box.minY).toBeCloseTo(-50, 9);
    expect(box.maxY).toBeCloseTo(50, 9);
  });

  it("swaps extents when a non-square rect turns 90 degrees", () => {
    const wide: SourceRect = { left: -100, top: -10, width: 200, height: 20 };
    const box = layerAabb(wide, CENTER_ANCHOR, [0, 0], NO_SCALE, 90);
    expect(box.maxX - box.minX).toBeCloseTo(20, 9);
    expect(box.maxY - box.minY).toBeCloseTo(200, 9);
  });

  it("follows scale, including negative scale", () => {
    const doubled = layerAabb(SQUARE, CENTER_ANCHOR, [0, 0], [200, 200], 0);
    expect(doubled.maxX - doubled.minX).toBeCloseTo(200, 9);

    // A mirrored layer occupies the same extent; min/max must not invert.
    const mirrored = layerAabb(SQUARE, CENTER_ANCHOR, [0, 0], [-100, 100], 0);
    expect(mirrored.minX).toBeCloseTo(-50, 9);
    expect(mirrored.maxX).toBeCloseTo(50, 9);
  });

  it("accounts for an off-centre anchor", () => {
    // Anchor at the top-left corner: the box hangs down-right of position.
    const box = layerAabb(SQUARE, [-50, -50], [0, 0], NO_SCALE, 0);
    expect(box).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
  });

  it("combines scale and rotation the way the transform does", () => {
    // Scale first, then rotate: a 2x square rotated 45 has a 200*sqrt(2) box.
    const box = layerAabb(SQUARE, CENTER_ANCHOR, [0, 0], [200, 200], 45);
    expect(box.maxX - box.minX).toBeCloseTo(200 * Math.SQRT2, 6);
  });
});

describe("projectCorner", () => {
  it("maps a corner through position, anchor, scale and rotation", () => {
    // 180 degrees about the centre sends the top-left corner to bottom-right.
    const p = projectCorner([-50, -50, 0], CENTER_ANCHOR, [100, 100], NO_SCALE, 180);
    expect(p[0]).toBeCloseTo(150, 9);
    expect(p[1]).toBeCloseTo(150, 9);
  });

  it("passes z through untouched", () => {
    const p = projectCorner([0, 0, 42], CENTER_ANCHOR, [0, 0], NO_SCALE, 30);
    expect(p[2]).toBe(42);
  });
});

describe("unionAabb / compAabb", () => {
  it("encloses every box", () => {
    const u = unionAabb([
      { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      { minX: -5, minY: 3, maxX: 4, maxY: 30 },
    ]);
    expect(u).toEqual({ minX: -5, minY: 0, maxX: 10, maxY: 30 });
  });

  it("returns a degenerate box for no input", () => {
    expect(unionAabb([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it("describes the comp frame from the origin", () => {
    expect(compAabb(1920, 1080)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 1920,
      maxY: 1080,
    });
  });
});

describe("alignDelta", () => {
  const layer: Aabb = { minX: 100, minY: 200, maxX: 300, maxY: 400 };
  const comp: Aabb = compAabb(1920, 1080);

  it("aligns left to the target's left edge", () => {
    expect(alignDelta(layer, comp, "left")).toEqual([-100, 0]);
  });

  it("aligns right to the target's right edge", () => {
    expect(alignDelta(layer, comp, "right")).toEqual([1620, 0]);
  });

  it("aligns top to the target's top edge", () => {
    expect(alignDelta(layer, comp, "top")).toEqual([0, -200]);
  });

  it("aligns bottom to the target's bottom edge", () => {
    expect(alignDelta(layer, comp, "bottom")).toEqual([0, 680]);
  });

  it("centres horizontally", () => {
    // layer centre 200, comp centre 960
    expect(alignDelta(layer, comp, "hcenter")).toEqual([760, 0]);
  });

  it("centres vertically", () => {
    // layer centre 300, comp centre 540
    expect(alignDelta(layer, comp, "vcenter")).toEqual([0, 240]);
  });

  // Composability: a horizontal align must never nudge a layer vertically, or
  // clicking left then top would not land the layer in the corner.
  it("leaves the cross axis at exactly zero", () => {
    const horizontal: AlignMode[] = ["left", "hcenter", "right"];
    for (const mode of horizontal) {
      expect(alignDelta(layer, comp, mode)[1]).toBe(0);
    }
    const vertical: AlignMode[] = ["top", "vcenter", "bottom"];
    for (const mode of vertical) {
      expect(alignDelta(layer, comp, mode)[0]).toBe(0);
    }
  });

  it("aligns to a selection box, not only to the comp", () => {
    const selection: Aabb = { minX: 50, minY: 50, maxX: 500, maxY: 500 };
    expect(alignDelta(layer, selection, "left")).toEqual([-50, 0]);
    expect(alignDelta(layer, selection, "right")).toEqual([200, 0]);
  });

  it("is a no-op when the layer already meets the target", () => {
    expect(alignDelta(layer, layer, "left")).toEqual([0, 0]);
    expect(alignDelta(layer, layer, "hcenter")).toEqual([0, 0]);
    expect(alignDelta(layer, layer, "bottom")).toEqual([0, 0]);
  });

  it("is idempotent: applying twice moves nothing the second time", () => {
    const moved: Aabb = {
      minX: layer.minX - 100,
      minY: layer.minY,
      maxX: layer.maxX - 100,
      maxY: layer.maxY,
    };
    expect(alignDelta(moved, comp, "left")).toEqual([0, 0]);
  });
});

describe("distributeCenters", () => {
  it("spaces three centres evenly, keeping the extremes", () => {
    expect(distributeCenters([0, 30, 100])).toEqual([0, 50, 100]);
  });

  it("spaces five centres evenly", () => {
    const out = distributeCenters([0, 10, 20, 30, 100]);
    expect(out).toEqual([0, 25, 50, 75, 100]);
  });

  it("leaves an already-uniform set untouched", () => {
    expect(distributeCenters([0, 50, 100])).toEqual([0, 50, 100]);
  });

  it("never moves the two extremes", () => {
    const out = distributeCenters([5, 90, 40, 12, 77]);
    expect(Math.min.apply(null, out)).toBeCloseTo(5, 9);
    expect(Math.max.apply(null, out)).toBeCloseTo(90, 9);
  });

  // The order contract: results come back positionally, so the host can pair
  // them with its parallel layer array. Sorted output would silently give each
  // layer someone else's destination.
  it("returns results in the caller's original order, not sorted order", () => {
    const out = distributeCenters([100, 0, 30]);
    expect(out[0]).toBeCloseTo(100, 9); // was the largest, stays the largest
    expect(out[1]).toBeCloseTo(0, 9); // was the smallest, stays the smallest
    expect(out[2]).toBeCloseTo(50, 9); // the middle one gets evenly placed
  });

  it("handles unsorted input by visual order, not index order", () => {
    const out = distributeCenters([80, 0, 40, 120]);
    // sorted: 0, 40, 80, 120 -> evenly spaced is already 0, 40, 80, 120
    expect(out).toEqual([80, 0, 40, 120]);
  });

  it("returns fewer than three centres unchanged", () => {
    expect(distributeCenters([])).toEqual([]);
    expect(distributeCenters([7])).toEqual([7]);
    expect(distributeCenters([7, 3])).toEqual([7, 3]);
    expect(MIN_DISTRIBUTE_LAYERS).toBe(3);
  });

  it("does not mutate the input", () => {
    const input = [0, 10, 100];
    distributeCenters(input);
    expect(input).toEqual([0, 10, 100]);
  });

  it("collapses to a single point when every centre is identical", () => {
    expect(distributeCenters([50, 50, 50])).toEqual([50, 50, 50]);
  });
});

describe("distributeToBounds — edge-to-edge across the comp", () => {
  const COMP_W = 1920;

  /** Equally sized items: half-extent 50 means a 100-wide box. */
  const sized = (centers: number[], half: number): DistributeItem[] => {
    const out: DistributeItem[] = [];
    for (const c of centers) out.push({ center: c, half: half });
    return out;
  };

  it("pushes the outer layers until their edges touch the bounds", () => {
    const out = distributeToBounds(sized([400, 800, 1200], 50), 0, COMP_W);
    // First box's left edge at 0 -> centre 50; last box's right edge at 1920
    // -> centre 1870. The middle sits halfway between those centres.
    expect(out[0]).toBeCloseTo(50, 9);
    expect(out[1]).toBeCloseTo(960, 9);
    expect(out[2]).toBeCloseTo(1870, 9);
  });

  it("touches, rather than centring on, the bound", () => {
    // The distinction that makes it look right: a 100-wide box aligned to the
    // left edge has its centre at 50, not at 0.
    const out = distributeToBounds(sized([500, 900], 50), 0, COMP_W);
    expect(out[0] - 50).toBeCloseTo(0, 9); // left edge at 0
    expect(out[1] + 50).toBeCloseTo(COMP_W, 9); // right edge at 1920
  });

  it("works with exactly two layers — both just touch", () => {
    const out = distributeToBounds(sized([100, 200], 25), 0, 1000);
    expect(out[0]).toBeCloseTo(25, 9);
    expect(out[1]).toBeCloseTo(975, 9);
    expect(MIN_DISTRIBUTE_TO_BOUNDS).toBe(2);
  });

  it("accounts for differently sized layers at the ends", () => {
    const items: DistributeItem[] = [
      { center: 300, half: 100 }, // 200 wide, ends up leftmost
      { center: 700, half: 10 },
      { center: 1100, half: 40 }, // 80 wide, ends up rightmost
    ];
    const out = distributeToBounds(items, 0, COMP_W);
    expect(out[0]).toBeCloseTo(100, 9); // left edge at 0
    expect(out[2]).toBeCloseTo(1880, 9); // right edge at 1920
    expect(out[1]).toBeCloseTo((100 + 1880) / 2, 9); // evenly between centres
  });

  it("spaces the interior evenly in centre terms", () => {
    const out = distributeToBounds(sized([0, 1, 2, 3, 4], 20), 0, 1000);
    for (let i = 2; i < out.length; i++) {
      expect(out[i] - out[i - 1]).toBeCloseTo(out[1] - out[0], 9);
    }
  });

  // Same order contract as distributeCenters: the host pairs results with a
  // parallel layer array, so sorted output would misassign every destination.
  it("returns results in the caller's original order", () => {
    const items: DistributeItem[] = [
      { center: 1500, half: 50 }, // rightmost
      { center: 100, half: 50 }, // leftmost
      { center: 800, half: 50 }, // middle
    ];
    const out = distributeToBounds(items, 0, COMP_W);
    expect(out[1]).toBeCloseTo(50, 9); // the leftmost item, still at index 1
    expect(out[0]).toBeCloseTo(1870, 9); // the rightmost item, still at index 0
    expect(out[2]).toBeCloseTo(960, 9);
  });

  it("orders by position on screen, not by index", () => {
    const a = distributeToBounds(sized([100, 800, 1500], 50), 0, COMP_W);
    const b = distributeToBounds(sized([1500, 100, 800], 50), 0, COMP_W);
    expect(b[1]).toBeCloseTo(a[0], 9);
    expect(b[2]).toBeCloseTo(a[1], 9);
    expect(b[0]).toBeCloseTo(a[2], 9);
  });

  it("is idempotent — running it again changes nothing", () => {
    const first = distributeToBounds(sized([400, 800, 1200], 50), 0, COMP_W);
    const again = distributeToBounds(sized(first, 50), 0, COMP_W);
    for (let i = 0; i < first.length; i++) {
      expect(again[i]).toBeCloseTo(first[i], 9);
    }
  });

  it("leaves fewer than two items alone", () => {
    expect(distributeToBounds([], 0, COMP_W)).toEqual([]);
    expect(distributeToBounds(sized([42], 10), 0, COMP_W)).toEqual([42]);
  });

  it("refuses unreadable bounds by returning the centres unchanged", () => {
    const items = sized([400, 800, 1200], 50);
    expect(distributeToBounds(items, NaN, COMP_W)).toEqual([400, 800, 1200]);
    expect(distributeToBounds(items, 0, Infinity)).toEqual([400, 800, 1200]);
  });

  it("does not mutate its input", () => {
    const items = sized([400, 800, 1200], 50);
    distributeToBounds(items, 0, COMP_W);
    expect(items[0].center).toBe(400);
  });

  it("still produces finite results when the layers exceed the bounds", () => {
    // Boxes wider than the comp cannot both touch without overlapping; the
    // arithmetic stays defined rather than producing NaN, and the caller sees a
    // usable (if cramped) layout instead of a silent failure.
    const out = distributeToBounds(sized([0, 100, 200], 400), 0, 500);
    for (const c of out) expect(isFinite(c)).toBe(true);
  });
});

describe("regression: Align to Comp was silently ignored", () => {
  /**
   * The failure had two halves, and only the second made it invisible.
   *
   * A non-finite bound reaching `alignDelta` produces a NaN delta. `isZeroOffset`
   * — written for the anchor tool, where an unreadable value means "leave it
   * alone" — answers TRUE for NaN. Align read that as "already in place",
   * counted the layer as done and moved nothing, so the panel reported
   * "Aligned N layer(s)" while the comp never changed.
   *
   * The comp target is the only place external numbers enter the computation:
   * the selection target is built from layer boxes this code measured itself,
   * which is why "Align to Selection" never showed the bug.
   */
  it("still swallows NaN in isZeroOffset — the trap this guards against", () => {
    // Not a bug in isZeroOffset: correct for its own tool, wrong to rely on here.
    expect(isZeroOffset([NaN, NaN])).toBe(true);
    expect(isZeroOffset([Infinity, 0])).toBe(true);
  });

  it("isFiniteDelta separates 'nothing to do' from 'invalid'", () => {
    expect(isFiniteDelta([0, 0])).toBe(true); // nothing to do, still valid
    expect(isFiniteDelta([12, -4])).toBe(true);
    expect(isFiniteDelta([NaN, 0])).toBe(false);
    expect(isFiniteDelta([0, NaN])).toBe(false);
    expect(isFiniteDelta([Infinity, 0])).toBe(false);
    expect(isFiniteDelta(null as unknown as [number, number])).toBe(false);
  });

  it("isFiniteAabb rejects any unreadable edge", () => {
    expect(isFiniteAabb({ minX: 0, minY: 0, maxX: 1920, maxY: 1080 })).toBe(true);
    expect(isFiniteAabb({ minX: NaN, minY: 0, maxX: 1920, maxY: 1080 })).toBe(false);
    expect(isFiniteAabb({ minX: 0, minY: 0, maxX: Infinity, maxY: 1080 })).toBe(false);
    expect(
      isFiniteAabb({
        minX: 0,
        minY: 0,
        maxX: undefined as unknown as number,
        maxY: 1080,
      })
    ).toBe(false);
    expect(isFiniteAabb(null as unknown as Aabb)).toBe(false);
  });

  it("a comp target built from unreadable dimensions is caught, not applied", () => {
    // What the host now refuses on, instead of producing a NaN delta.
    const bad = compAabb(undefined as unknown as number, 1080);
    expect(isFiniteAabb(bad)).toBe(false);

    const layer: Aabb = { minX: 100, minY: 200, maxX: 300, maxY: 400 };
    const delta = alignDelta(layer, bad, "right");
    expect(isFiniteDelta(delta)).toBe(false);
    // The old path: NaN delta read as "already aligned", counted as success.
    expect(isZeroOffset(delta)).toBe(true);
  });

  it("an unreadable width corrupts only the edges that use it", () => {
    // Worth pinning because it explains the failure's shape: `compAabb` hardcodes
    // minX/minY to 0, so a bad *width* leaves `left` and `top` working while
    // `right`, `bottom` and both centres quietly do nothing. Validating the whole
    // box up front is what makes that partial, confusing failure impossible.
    const bad = compAabb(undefined as unknown as number, 1080);
    const layer: Aabb = { minX: 100, minY: 200, maxX: 300, maxY: 400 };

    expect(isFiniteDelta(alignDelta(layer, bad, "left"))).toBe(true);
    expect(isFiniteDelta(alignDelta(layer, bad, "top"))).toBe(true);
    expect(isFiniteDelta(alignDelta(layer, bad, "right"))).toBe(false);
    expect(isFiniteDelta(alignDelta(layer, bad, "hcenter"))).toBe(false);

    // Height is readable here, so the vertical pair survives.
    expect(isFiniteDelta(alignDelta(layer, bad, "bottom"))).toBe(true);
    expect(isFiniteDelta(alignDelta(layer, bad, "vcenter"))).toBe(true);
  });

  it("computes the right delta once the comp bounds are real", () => {
    // The arithmetic was never wrong; only the value reaching it was.
    const comp = compAabb(1920, 1080);
    const layer: Aabb = { minX: 100, minY: 200, maxX: 300, maxY: 400 };

    expect(isFiniteAabb(comp)).toBe(true);
    expect(alignDelta(layer, comp, "left")).toEqual([-100, 0]);
    expect(alignDelta(layer, comp, "right")).toEqual([1620, 0]);
    expect(alignDelta(layer, comp, "top")).toEqual([0, -200]);
    expect(alignDelta(layer, comp, "bottom")).toEqual([0, 680]);
    expect(alignDelta(layer, comp, "hcenter")).toEqual([760, 0]);
    expect(alignDelta(layer, comp, "vcenter")).toEqual([0, 240]);

    for (const mode of ALIGN_MODES) {
      expect(isFiniteDelta(alignDelta(layer, comp, mode.id))).toBe(true);
    }
  });

  it("keeps the toggle token identical on both sides of the bridge", () => {
    // The UI sends these ids verbatim and the host resolves them with
    // findAlignTo. A casing drift on either side would route every click to the
    // wrong branch, so the exact strings are pinned here.
    expect(ALIGN_TARGETS[0].id).toBe("comp");
    expect(ALIGN_TARGETS[1].id).toBe("selection");
    expect(DEFAULT_ALIGN_TO).toBe("comp");
    expect(findAlignTo(DEFAULT_ALIGN_TO)).toBe("comp");

    // Casing must not resolve: a silent match would hide a real mismatch.
    expect(findAlignTo("Comp")).toBeNull();
    expect(findAlignTo("Selection")).toBeNull();
  });
});

describe("mode metadata", () => {
  it("resolves every align mode and rejects unknown ones", () => {
    for (const spec of ALIGN_MODES) {
      expect(findAlignMode(spec.id)).toBe(spec.id);
    }
    expect(findAlignMode("diagonal")).toBeNull();
  });

  it("lists exactly six alignments", () => {
    expect(ALIGN_MODES.length).toBe(6);
  });

  it("resolves targets and axes", () => {
    expect(findAlignTo("comp")).toBe("comp");
    expect(findAlignTo("selection")).toBe("selection");
    expect(findAlignTo("keylayer")).toBeNull();
    expect(findDistributeAxis("x")).toBe("x");
    expect(findDistributeAxis("y")).toBe("y");
    expect(findDistributeAxis("z")).toBeNull(); // 3-D deferred to P16b
  });

  it("gives every mode a label and a tooltip", () => {
    const specs = [...ALIGN_MODES, ...ALIGN_TARGETS, ...DISTRIBUTE_AXES];
    for (const spec of specs) {
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.title.length).toBeGreaterThan(0);
    }
  });
});
