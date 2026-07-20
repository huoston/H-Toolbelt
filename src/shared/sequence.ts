/**
 * Pure layer-sequencing engine for the Layer Sequencing tool.
 *
 * Sequencing means staggering layers in time: layer i starts `i * offset` after
 * the anchor. Two things make that non-trivial enough to deserve a tested module
 * of its own.
 *
 * ORDER IS NEVER CLICK ORDER. After Effects' `comp.selectedLayers` does not
 * preserve the order in which the user clicked, so deriving the cascade from it
 * produces a result that looks arbitrary and changes between runs on the same
 * selection. Order is therefore resolved from explicit, reproducible criteria —
 * timeline index, its reverse, in-point, or a seeded shuffle.
 *
 * THE FIRST LAYER DOES NOT MOVE. The anchor is the resolved first layer's own
 * `startTime`, so applying the tool never yanks the whole selection somewhere
 * else in the timeline; the cascade grows out of where the user already put it.
 * A negative offset is legal and simply cascades backwards in time.
 *
 * PRNG NOTE: the random order uses a seeded Lehmer/Park-Miller generator rather
 * than the more common mulberry32, because mulberry32 needs `Math.imul` and this
 * module is bundled into the ExtendScript host, whose engine predates it. The
 * multiplication here stays inside the exact-integer range of a double
 * (16807 * 2147483646 is about 3.6e13, well under 2^53), so it is exact in
 * ExtendScript and in Node alike — the same seed yields the same shuffle in both.
 *
 * This module is intentionally free of any After Effects API references (no
 * `app`, `comp`, `layer`) so it is unit-testable in plain Node and shared by the
 * panel UI and the ExtendScript host.
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

/** How the cascade order is derived. Never the user's click order. */
export type SequenceOrder = "timeline" | "reverse" | "inPoint" | "random";

/** One selected layer, reduced to the fields sequencing actually reasons about. */
export interface SeqLayer {
  /** Stable identifier for the operation; the host passes `layer.index`. */
  id: number;
  /** Timeline position, 1 = topmost. */
  index: number;
  /** Layer in-point, in seconds. Read-only here — sequencing never trims. */
  inPoint: number;
  /** Layer start time, in seconds. This is the only value the tool rewrites. */
  startTime: number;
}

/** A single layer's new start time. */
export interface SeqResult {
  id: number;
  newStartTime: number;
}

/** A selectable order mode, for the UI to render without hardcoding ids. */
export interface SequenceOrderSpec {
  /** Stable identifier sent to the host; never localized. */
  id: SequenceOrder;
  /** Human label for the UI select. */
  label: string;
}

/**
 * The order modes, in the order the UI lists them. Named here so neither the
 * panel nor the host carries loose string literals.
 */
export const SEQUENCE_ORDERS: SequenceOrderSpec[] = [
  { id: "timeline", label: "Timeline (top→bottom)" },
  { id: "reverse", label: "Reverse (bottom→top)" },
  { id: "inPoint", label: "By in-point" },
  { id: "random", label: "Random" },
];

/** The order used when an unknown id arrives from the UI. */
export const DEFAULT_SEQUENCE_ORDER: SequenceOrder = "timeline";

/** Resolve an arbitrary string to a known order, or null when unrecognized. */
export const findSequenceOrder = (id: string): SequenceOrder | null => {
  for (let i = 0; i < SEQUENCE_ORDERS.length; i++) {
    if (SEQUENCE_ORDERS[i].id === id) return SEQUENCE_ORDERS[i].id;
  }
  return null;
};

/* -------------------------------------------------------------------------- */
/* Seeded PRNG                                                                 */
/* -------------------------------------------------------------------------- */

/** 2^31 - 1, a Mersenne prime: the Park-Miller modulus. */
const PRNG_MODULUS = 2147483647;
/** Park-Miller's multiplier; a primitive root of the modulus. */
const PRNG_MULTIPLIER = 16807;

/**
 * Fold any incoming number into the generator's valid state range, [1, m-1].
 * State 0 is a fixed point that would emit a constant stream, so it is excluded.
 */
const normalizeSeed = (seed: number): number => {
  let s = seed;
  if (typeof s !== "number" || !isFinite(s)) s = 1;
  s = Math.floor(Math.abs(s));
  return (s % (PRNG_MODULUS - 1)) + 1;
};

/**
 * A deterministic generator of numbers in [0, 1). Same seed, same sequence —
 * that reproducibility is the whole point: re-running Random with the seed the
 * user kept must land the layers exactly where they landed before.
 */
export const makeSeededRandom = (seed: number): (() => number) => {
  let state = normalizeSeed(seed);
  return (): number => {
    state = (state * PRNG_MULTIPLIER) % PRNG_MODULUS;
    return (state - 1) / (PRNG_MODULUS - 1);
  };
};

/**
 * Fisher-Yates, driven by the seeded generator. Returns a new array; the input
 * is left alone so callers can keep their own ordering.
 */
const seededShuffle = (layers: SeqLayer[], seed: number): SeqLayer[] => {
  const out = layers.slice();
  const rand = makeSeededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
};

/* -------------------------------------------------------------------------- */
/* Order resolution                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Put the layers into cascade order.
 *
 * Ties are broken explicitly by timeline index rather than by leaning on a
 * stable sort: this runs in ExtendScript too, whose `Array.sort` stability is
 * not guaranteed, so equal in-points would otherwise cascade differently in the
 * host than in the tests.
 */
export const resolveSequenceOrder = (
  layers: SeqLayer[],
  order: SequenceOrder,
  seed: number
): SeqLayer[] => {
  const out = layers.slice();

  if (order === "random") return seededShuffle(out, seed);

  if (order === "inPoint") {
    out.sort((a, b) => {
      if (a.inPoint !== b.inPoint) return a.inPoint - b.inPoint;
      return a.index - b.index;
    });
    return out;
  }

  if (order === "reverse") {
    out.sort((a, b) => b.index - a.index);
    return out;
  }

  out.sort((a, b) => a.index - b.index);
  return out;
};

/* -------------------------------------------------------------------------- */
/* Time computation                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Stagger the ordered layers by `offsetSeconds`, anchored on the first one.
 *
 * Nothing to sequence below two layers — a lone layer has no relationship to
 * stagger against, so the caller gets an empty list rather than a no-op write.
 */
export const computeSequenceStartTimes = (
  ordered: SeqLayer[],
  offsetSeconds: number
): SeqResult[] => {
  if (ordered.length < 2) return [];

  const anchor = ordered[0].startTime;
  const out: SeqResult[] = [];
  for (let i = 0; i < ordered.length; i++) {
    out.push({ id: ordered[i].id, newStartTime: anchor + i * offsetSeconds });
  }
  return out;
};
