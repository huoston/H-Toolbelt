/**
 * Shape Layer Magic — pure predicates.
 *
 * The two questions the cleanup tools must answer before touching anything:
 * "is this group's transform an identity?" and "is this rectangle the artboard
 * Illustrator left behind?". Both are pure arithmetic, so they live here, get
 * unit tests, and are shared verbatim by the panel and the ExtendScript host
 * rather than being re-derived (and drifting) on each side.
 *
 * WHY EVERY COMPARISON IS TOLERANCED: these numbers arrive from a file the user
 * imported, not from a literal in this repo. An Illustrator artboard that is
 * conceptually 1920 wide can arrive as 1919.99998 after unit conversion, and a
 * group AE reports as untransformed can carry a scale of 99.99999997. Exact
 * equality would silently match nothing, which for a *cleanup* tool looks
 * identical to "there was nothing to clean" — the worst failure mode, because it
 * is invisible.
 *
 * WHY THE TOLERANCES DIFFER BY TWO ORDERS OF MAGNITUDE: an identity transform is
 * compared against constants this code chose (0, 100), so any deviation is pure
 * float noise and the tolerance only has to clear that. Artboard dimensions are
 * compared against a composition size in pixels, where the noise is whatever the
 * importer's unit conversion produced — a different, larger scale of error.
 *
 * NOT-A-NUMBER IS NOT A MATCH. Every predicate here answers "may I delete or
 * collapse this?", so an unreadable value must read as *no*. `near` therefore
 * rejects NaN and Infinity outright instead of letting them propagate through a
 * comparison that would return false by accident rather than by decision.
 *
 * ES3 CONSTRAINT: this module is bundled into the ExtendScript host, so it uses
 * only ES3 built-ins — no `Number.isFinite`, no array methods. See
 * `scripts/check-host-es3.mjs`.
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

/**
 * A shape group's Transform, in the units After Effects reports them:
 * scale and opacity as percentages, rotation and skew in degrees.
 */
export interface GroupTransform {
  anchor: [number, number];
  position: [number, number];
  scale: [number, number];
  rotation: number;
  skew: number;
  opacity: number;
}

/**
 * Float-noise tolerance for identity comparisons. Small, because the reference
 * values (0, 100) are constants this code owns.
 */
export const IDENTITY_EPSILON = 1e-4;

/**
 * Tolerance in pixels for matching a rectangle against the composition size.
 * One pixel: tight enough that a genuine piece of artwork which merely happens
 * to be near comp-sized does not match, loose enough to survive the rounding an
 * importer introduces.
 */
export const ARTBOARD_EPSILON = 1;

/** Read index `i` of a pair, yielding NaN when the pair is absent or ragged. */
const at = (pair: [number, number] | null | undefined, i: number): number => {
  if (!pair) return NaN;
  const v = pair[i];
  return typeof v === "number" ? v : NaN;
};

/**
 * `a` is within `eps` of `b`, and `a` is a real number.
 *
 * The finiteness test is the point: NaN fails every comparison, so without it a
 * missing value would flow into `Math.abs(NaN - b) <= eps` and return false —
 * the right answer for the wrong reason, and one that stops being right the
 * moment a caller inverts the test.
 */
const near = (a: number, b: number, eps: number): boolean => {
  if (typeof a !== "number" || !isFinite(a)) return false;
  return Math.abs(a - b) <= eps;
};

/** Resolve an optional tolerance, ignoring a nonsensical one. */
const tolerance = (eps: number | undefined, fallback: number): number => {
  if (typeof eps !== "number" || !isFinite(eps) || eps < 0) return fallback;
  return eps;
};

/**
 * Does this group's Transform leave its contents exactly where they are?
 *
 * True only when anchor and position are [0,0], scale is [100,100], rotation
 * and skew are 0, and opacity is 100 — every component within `eps`. Any
 * unreadable component makes the whole answer false, because "I could not read
 * the scale" must never be mistaken for "the scale is 100".
 */
export const isIdentityTransform = (
  t: GroupTransform,
  eps?: number
): boolean => {
  if (!t) return false;
  const e = tolerance(eps, IDENTITY_EPSILON);

  return (
    near(at(t.anchor, 0), 0, e) &&
    near(at(t.anchor, 1), 0, e) &&
    near(at(t.position, 0), 0, e) &&
    near(at(t.position, 1), 0, e) &&
    near(at(t.scale, 0), 100, e) &&
    near(at(t.scale, 1), 100, e) &&
    near(t.rotation, 0, e) &&
    near(t.skew, 0, e) &&
    near(t.opacity, 100, e)
  );
};

/**
 * Is this rectangle the artboard backdrop — comp-sized and centred on the
 * layer's origin?
 *
 * Illustrator exports the artboard as a rectangle the size of the document,
 * sitting behind the real artwork; After Effects imports it as an ordinary
 * shape, so it survives as an invisible full-frame rectangle that swallows
 * clicks and inflates the layer's bounding box.
 *
 * `rectPosition` is the rectangle's own Position within its group, so "centred"
 * is literally [0,0]. The caller is responsible for having established that the
 * enclosing group does not itself move the rectangle — a comp-sized rectangle
 * inside a group scaled to 50% is not a backdrop, and this function cannot see
 * that group. See `isIdentityTransform`, which the host checks first.
 */
export const isArtboardRect = (
  rectSize: [number, number],
  rectPosition: [number, number],
  compSize: [number, number],
  eps?: number
): boolean => {
  const e = tolerance(eps, ARTBOARD_EPSILON);

  // A comp with no positive size cannot be matched against; refuse rather than
  // let a degenerate reference value make every rectangle look like a backdrop.
  const compWidth = at(compSize, 0);
  const compHeight = at(compSize, 1);
  if (!isFinite(compWidth) || !isFinite(compHeight)) return false;
  if (compWidth <= 0 || compHeight <= 0) return false;

  return (
    near(at(rectSize, 0), compWidth, e) &&
    near(at(rectSize, 1), compHeight, e) &&
    near(at(rectPosition, 0), 0, e) &&
    near(at(rectPosition, 1), 0, e)
  );
};
