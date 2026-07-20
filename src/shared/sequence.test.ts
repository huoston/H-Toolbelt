/**
 * Unit tests for the pure layer-sequencing engine.
 *
 * Two properties carry real risk and are pinned hard: the seeded shuffle must be
 * reproducible (a "random" order the user cannot re-obtain is useless), and the
 * anchor layer must never move (otherwise the tool relocates the whole selection
 * instead of staggering it).
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
  SEQUENCE_ORDERS,
  computeSequenceStartTimes,
  findSequenceOrder,
  makeSeededRandom,
  resolveSequenceOrder,
  type SeqLayer,
} from "./sequence";

/** Build a layer whose fields default to something distinguishable. */
const layer = (
  index: number,
  inPoint: number = 0,
  startTime: number = 0
): SeqLayer => ({ id: index, index: index, inPoint: inPoint, startTime: startTime });

/** Timeline indices, in the order the resolver produced. */
const indices = (layers: SeqLayer[]): number[] => layers.map((l) => l.index);

describe("resolveSequenceOrder", () => {
  const shuffled: SeqLayer[] = [layer(3), layer(1), layer(5), layer(2), layer(4)];

  it("timeline orders by ascending index", () => {
    expect(indices(resolveSequenceOrder(shuffled, "timeline", 1))).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("reverse orders by descending index", () => {
    expect(indices(resolveSequenceOrder(shuffled, "reverse", 1))).toEqual([
      5, 4, 3, 2, 1,
    ]);
  });

  it("inPoint orders by ascending in-point", () => {
    const layers = [layer(1, 3), layer(2, 1), layer(3, 2)];
    expect(indices(resolveSequenceOrder(layers, "inPoint", 1))).toEqual([2, 3, 1]);
  });

  it("inPoint breaks ties by index, not by input position", () => {
    // Equal in-points, fed in descending index order: the tie-break must still
    // produce ascending indices rather than preserving input order.
    const layers = [layer(4, 5), layer(2, 5), layer(3, 5), layer(1, 5)];
    expect(indices(resolveSequenceOrder(layers, "inPoint", 1))).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("does not mutate the input array", () => {
    const layers = [layer(3), layer(1), layer(2)];
    resolveSequenceOrder(layers, "timeline", 1);
    expect(indices(layers)).toEqual([3, 1, 2]);
  });

  it("random is reproducible for the same seed", () => {
    const a = resolveSequenceOrder(shuffled, "random", 42);
    const b = resolveSequenceOrder(shuffled, "random", 42);
    expect(indices(a)).toEqual(indices(b));
  });

  it("random differs across seeds", () => {
    const a = indices(resolveSequenceOrder(shuffled, "random", 1));
    const b = indices(resolveSequenceOrder(shuffled, "random", 2));
    expect(a).not.toEqual(b);
  });

  it("random is a permutation, losing and duplicating nothing", () => {
    const out = resolveSequenceOrder(shuffled, "random", 7);
    expect(out.length).toBe(shuffled.length);
    expect(indices(out).slice().sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("makeSeededRandom", () => {
  it("emits the same stream for the same seed", () => {
    const a = makeSeededRandom(123);
    const b = makeSeededRandom(123);
    const streamA = [a(), a(), a(), a()];
    const streamB = [b(), b(), b(), b()];
    expect(streamA).toEqual(streamB);
  });

  it("stays within [0, 1)", () => {
    const rand = makeSeededRandom(9);
    for (let i = 0; i < 500; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("does not collapse to a constant on a zero or negative seed", () => {
    // Seed 0 is the generator's fixed point if not normalized away.
    for (const seed of [0, -5]) {
      const rand = makeSeededRandom(seed);
      const values = [rand(), rand(), rand()];
      expect(new Set(values).size).toBeGreaterThan(1);
    }
  });
});

describe("computeSequenceStartTimes", () => {
  it("keeps the first layer where it is and staggers the rest", () => {
    const ordered = [layer(1, 0, 2), layer(2, 0, 9), layer(3, 0, 4)];
    const out = computeSequenceStartTimes(ordered, 0.5);
    expect(out).toEqual([
      { id: 1, newStartTime: 2 },
      { id: 2, newStartTime: 2.5 },
      { id: 3, newStartTime: 3 },
    ]);
  });

  it("anchors on the resolved first layer, not on the lowest start time", () => {
    // Layer 2 starts earlier, but layer 1 leads the resolved order, so the
    // cascade must grow from 5 — not from 1.
    const ordered = [layer(1, 0, 5), layer(2, 0, 1)];
    const out = computeSequenceStartTimes(ordered, 1);
    expect(out[0].newStartTime).toBe(5);
    expect(out[1].newStartTime).toBe(6);
  });

  it("accepts a negative offset, cascading backwards in time", () => {
    const ordered = [layer(1, 0, 10), layer(2, 0, 0), layer(3, 0, 0)];
    const out = computeSequenceStartTimes(ordered, -2);
    expect(out.map((r) => r.newStartTime)).toEqual([10, 8, 6]);
  });

  it("returns nothing for zero or one layer", () => {
    expect(computeSequenceStartTimes([], 1)).toEqual([]);
    expect(computeSequenceStartTimes([layer(1, 0, 3)], 1)).toEqual([]);
  });

  it("a zero offset stacks every layer on the anchor", () => {
    const ordered = [layer(1, 0, 4), layer(2, 0, 7)];
    const out = computeSequenceStartTimes(ordered, 0);
    expect(out.map((r) => r.newStartTime)).toEqual([4, 4]);
  });
});

describe("findSequenceOrder", () => {
  it("resolves every advertised order id", () => {
    for (const spec of SEQUENCE_ORDERS) {
      expect(findSequenceOrder(spec.id)).toBe(spec.id);
    }
  });

  it("returns null for an unknown id", () => {
    expect(findSequenceOrder("byMarker")).toBeNull();
  });
});
