/**
 * Loop Creator — pure expression-text generator.
 *
 * Builds the `loopOut(...)` / `loopIn(...)` calls that drive After Effects'
 * four native loop modes. Unlike the bounce and elastic generators, there is no
 * maths here: the whole job is emitting a correct call, which makes the
 * interesting part the argument rules rather than the arithmetic.
 *
 * WHY `continue` OMITS THE KEYFRAME COUNT: `loopOut(type, numKeyframes)` takes a
 * count for cycle, pingpong and offset, which all replay a *segment* of the
 * animation. `continue` replays nothing — it extrapolates from the velocity at
 * the last keyframe — so a count is meaningless to it. After Effects ignores a
 * second argument there rather than erroring, which is exactly why it must not
 * be emitted: `loopOut("continue", 2)` would sit in the user's expression field
 * looking like a setting that does something.
 *
 * ES3 CONSTRAINT, TWICE OVER. This module is bundled into the ExtendScript host,
 * so its own code is ES3 (see `scripts/check-host-es3.mjs`). The *text it
 * generates* is also ES3, because After Effects ships two expression engines and
 * a project switched to Legacy ExtendScript treats modern syntax as a parse
 * error — which disables the expression on the user's property. Loop calls are
 * inherently ES3, so this is nearly free here; the tests pin it anyway, because
 * "nearly free" is how a regression gets in.
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

/** The four native loop modes. Ids are AE's own strings, never localized. */
export type LoopType = "cycle" | "pingpong" | "offset" | "continue";

/** Which side of the keyframes the loop extends from. */
export type LoopDir = "out" | "in";

/** A selectable loop mode, for the UI to render without hardcoding ids. */
export interface LoopTypeSpec {
  /** Stable identifier, passed straight into the generated call. */
  id: LoopType;
  /** Human label for the UI. */
  label: string;
  /** One line explaining what it does, used as the button tooltip. */
  title: string;
}

/** The loop modes, in the order the UI lists them. */
export const LOOP_TYPES: LoopTypeSpec[] = [
  {
    id: "cycle",
    label: "Cycle",
    title: "Repeat the animation from the start, over and over.",
  },
  {
    id: "pingpong",
    label: "Ping-Pong",
    title: "Play the animation forwards, then backwards, and repeat.",
  },
  {
    id: "offset",
    label: "Offset",
    title: "Repeat the animation, accumulating from where the last one ended.",
  },
  {
    id: "continue",
    label: "Continue",
    title: "Carry on at the velocity of the last keyframe. Ignores the count.",
  },
];

/** A selectable direction. */
export interface LoopDirSpec {
  id: LoopDir;
  label: string;
  title: string;
}

export const LOOP_DIRECTIONS: LoopDirSpec[] = [
  {
    id: "out",
    label: "Out",
    title: "Loop after the last keyframe.",
  },
  {
    id: "in",
    label: "In",
    title: "Loop before the first keyframe.",
  },
];

export const DEFAULT_LOOP_TYPE: LoopType = "cycle";
export const DEFAULT_LOOP_DIR: LoopDir = "out";

/** 0 means "all keyframes" — After Effects' own default for the argument. */
export const DEFAULT_LOOP_KEYFRAMES = 0;

/** Loop modes that take a keyframe count. `continue` is the exception. */
const TAKES_KEYFRAME_COUNT = ["cycle", "pingpong", "offset"];

/** Resolve an arbitrary string to a known loop mode, or null. */
export const findLoopType = (id: string): LoopType | null => {
  for (let i = 0; i < LOOP_TYPES.length; i++) {
    if (LOOP_TYPES[i].id === id) return LOOP_TYPES[i].id;
  }
  return null;
};

/** Resolve an arbitrary string to a known direction, or null. */
export const findLoopDir = (id: string): LoopDir | null => {
  for (let i = 0; i < LOOP_DIRECTIONS.length; i++) {
    if (LOOP_DIRECTIONS[i].id === id) return LOOP_DIRECTIONS[i].id;
  }
  return null;
};

/** Human label for a loop mode — used in the undo group name. */
export const loopTypeLabel = (type: LoopType): string => {
  for (let i = 0; i < LOOP_TYPES.length; i++) {
    if (LOOP_TYPES[i].id === type) return LOOP_TYPES[i].label;
  }
  return type;
};

/** Does this loop mode use the keyframe-count argument? */
export const usesKeyframeCount = (type: LoopType): boolean => {
  for (let i = 0; i < TAKES_KEYFRAME_COUNT.length; i++) {
    if (TAKES_KEYFRAME_COUNT[i] === type) return true;
  }
  return false;
};

/**
 * Upper bound on the emitted keyframe count.
 *
 * Not a limit of After Effects — it clamps an over-large count to "all" by
 * itself. It exists so the emitted number is always a plain decimal: JavaScript
 * switches to exponent notation at 1e21, and `loopOut("cycle", 1e+21)` sitting
 * in the expression field reads as a typo rather than as a setting. Same
 * reasoning as `formatNumber` in `shared/expressions`. A thousand is already far
 * past any real property's keyframe count.
 */
const MAX_KEYFRAME_COUNT = 1000;

/**
 * Coerce the keyframe count to a non-negative integer.
 *
 * Anything unusable becomes 0, which is After Effects' "use all keyframes" —
 * the same result the user would get from an empty field, and never an error in
 * their expression. A fractional count is floored rather than rejected, since
 * `loopOut("cycle", 2.7)` is not something the user can have meant.
 */
const normalizeCount = (n: number): number => {
  if (typeof n !== "number" || !isFinite(n) || n <= 0) return 0;
  if (n > MAX_KEYFRAME_COUNT) return MAX_KEYFRAME_COUNT;
  return Math.floor(n);
};

/**
 * Build the loop expression text.
 *
 * The leading comment marks the expression as this panel's work, matching the
 * Expression Effects tool, so a user reading their own project can tell what
 * wrote it. It is also what makes the documented "check before you Clear" advice
 * true for loops as well.
 */
export const buildLoopExpression = (
  type: LoopType,
  dir: LoopDir,
  numKeyframes: number
): string => {
  const fn = dir === "in" ? "loopIn" : "loopOut";

  const args = usesKeyframeCount(type)
    ? '"' + type + '", ' + normalizeCount(numKeyframes)
    : '"' + type + '"';

  const lines = [
    "// H-Toolbelt loop - ES3 syntax, runs on both AE expression engines.",
    fn + "(" + args + ")",
  ];

  return lines.join("\n");
};
