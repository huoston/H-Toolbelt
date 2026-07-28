/**
 * Loop Creator — After Effects host side.
 *
 * Writes a `loopOut(...)` / `loopIn(...)` expression onto every selected
 * property. The text generation lives in the pure, unit-tested `shared/loop`
 * module; this file is the AE plumbing plus the guards.
 *
 * GUARD PHILOSOPHY, as in the other tools: refuse with a reason rather than
 * apply hopefully. Two refusals matter most here. An existing expression is
 * never overwritten — it is hand-written work no undo reached for a day later
 * will bring back. And a property with fewer than two keyframes is refused
 * rather than decorated: a loop replays the span between keyframes, so with one
 * keyframe there is no span and `loopOut` returns a constant. The property would
 * look untouched while carrying an expression, which is the worst of both.
 *
 * WHY THIS FILE DOES NOT IMPORT FROM `expressions.ts`: the two tools share the
 * shape of their guards but not their meaning, and the small readers below
 * (`readExpression`, `keyCount`, ...) are private to that module. Duplicating a
 * dozen lines keeps Expression Effects untouched — the alternative was widening
 * its public surface for a second caller, which is a change to a shipped tool.
 *
 * Clear is deliberately absent: the panel's Clear button calls the existing
 * `clearExpressions` from `expressions.ts`. Removing an expression does not
 * depend on which tool wrote it, so a second implementation would only be a
 * second thing to keep in step.
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

import {
  buildLoopExpression,
  findLoopDir,
  findLoopType,
  loopTypeLabel,
} from "../../shared/loop";

export interface LoopResult {
  applied: number;
  message: string;
}

const NO_COMP_MESSAGE = "Open a composition first.";
const NO_SELECTION_MESSAGE = "Select one or more animated properties first.";

/** A loop needs a span to replay, and a span needs two keyframes. */
const MIN_KEYFRAMES = 2;

/* -------------------------------------------------------------------------- */
/* Refusal accumulation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Groups refused properties by reason, so the feedback line reads
 * "Needs 2+ keyframes to loop (Rotation, Opacity)" rather than one sentence per
 * property.
 */
interface SkipLog {
  reasons: string[];
  names: string[][];
  total: number;
}

/** How many names to list per reason before summarizing the rest. */
const MAX_NAMES = 3;

const newSkipLog = (): SkipLog => {
  return { reasons: [], names: [], total: 0 };
};

const addSkip = (log: SkipLog, reason: string, name: string): void => {
  log.total++;
  for (let i = 0; i < log.reasons.length; i++) {
    if (log.reasons[i] === reason) {
      log.names[i].push(name);
      return;
    }
  }
  log.reasons.push(reason);
  log.names.push([name]);
};

/** "Needs 2+ keyframes to loop (Rotation); Unsupported property type (Mask Path)" */
const describeSkips = (log: SkipLog): string => {
  const parts: string[] = [];
  for (let i = 0; i < log.reasons.length; i++) {
    const names = log.names[i];
    let shown = "";
    for (let j = 0; j < names.length && j < MAX_NAMES; j++) {
      shown += (j > 0 ? ", " : "") + names[j];
    }
    if (names.length > MAX_NAMES) {
      shown += ", +" + (names.length - MAX_NAMES) + " more";
    }
    parts.push(log.reasons[i] + " (" + shown + ")");
  }
  return parts.join("; ");
};

/* -------------------------------------------------------------------------- */
/* Property inspection                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Read a property's expression without assuming it has one. Properties that do
 * not support expressions may not expose the field at all.
 */
const readExpression = (p: Property): string => {
  try {
    return p.expression ? p.expression : "";
  } catch (e) {
    return "";
  }
};

/** Whether the property accepts an expression at all. */
const acceptsExpression = (p: Property): boolean => {
  try {
    return p.canSetExpression === true;
  } catch (e) {
    return false;
  }
};

/** Keyframe count, treating an unreadable count as none. */
const keyCount = (p: Property): number => {
  try {
    return p.numKeys;
  } catch (e) {
    return 0;
  }
};

/**
 * Only numeric properties. Colors, masks, shape paths, text documents and
 * marker properties either reject a loop expression or need a different
 * formulation entirely, so they are refused rather than mangled.
 */
const isSupportedValueType = (p: Property): boolean => {
  let vt: PropertyValueType;
  try {
    vt = p.propertyValueType;
  } catch (e) {
    return false;
  }
  return (
    vt === PropertyValueType.OneD ||
    vt === PropertyValueType.TwoD ||
    vt === PropertyValueType.TwoD_SPATIAL ||
    vt === PropertyValueType.ThreeD ||
    vt === PropertyValueType.ThreeD_SPATIAL
  );
};

/** Whether a selected item is an actual property rather than a group. */
const isProperty = (p: PropertyBase): boolean => {
  try {
    return p.propertyType === PropertyType.PROPERTY;
  } catch (e) {
    return false;
  }
};

/**
 * Collect every selected property across the selected layers.
 *
 * Selecting a group (Transform, Contents) puts the group itself in
 * `selectedProperties` without its children, so groups are filtered out here and
 * counted by the caller as "nothing selected" rather than refused one by one —
 * a user who clicked "Transform" has not chosen a target yet.
 */
const collectSelectedProperties = (comp: CompItem): Property[] => {
  const out: Property[] = [];
  const layers = comp.selectedLayers;
  for (let li = 0; li < layers.length; li++) {
    const sel = layers[li].selectedProperties;
    for (let pi = 0; pi < sel.length; pi++) {
      if (isProperty(sel[pi])) out.push(sel[pi] as Property);
    }
  }
  return out;
};

/* -------------------------------------------------------------------------- */
/* Apply                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Write the loop expression onto every eligible selected property.
 * Ineligible ones are skipped with a reason; the rest still get the loop.
 */
export const applyLoop = (
  type: string,
  dir: string,
  numKeyframes: number
): LoopResult => {
  const resolvedType = findLoopType(type);
  if (!resolvedType) {
    return { applied: 0, message: "Unknown loop type: " + type };
  }

  const resolvedDir = findLoopDir(dir);
  if (!resolvedDir) {
    return { applied: 0, message: "Unknown loop direction: " + dir };
  }

  const comp = app.project.activeItem;
  if (!(comp instanceof CompItem)) {
    return { applied: 0, message: NO_COMP_MESSAGE };
  }

  const props = collectSelectedProperties(comp);
  if (props.length === 0) {
    return { applied: 0, message: NO_SELECTION_MESSAGE };
  }

  // Built once: the text does not vary per property.
  const text = buildLoopExpression(resolvedType, resolvedDir, numKeyframes);

  let applied = 0;
  const skips = newSkipLog();

  app.beginUndoGroup("H-Toolbelt: Loop (" + loopTypeLabel(resolvedType) + ")");
  try {
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      const name = p.name;

      if (!acceptsExpression(p)) {
        addSkip(skips, "Property does not accept expressions", name);
        continue;
      }
      if (readExpression(p) !== "") {
        addSkip(skips, "Already has an expression (not overwritten)", name);
        continue;
      }
      if (keyCount(p) < MIN_KEYFRAMES) {
        addSkip(skips, "Needs 2+ keyframes to loop", name);
        continue;
      }
      if (!isSupportedValueType(p)) {
        addSkip(skips, "Unsupported property type", name);
        continue;
      }

      p.expression = text;
      applied++;
    }
  } finally {
    app.endUndoGroup();
  }

  if (applied === 0) {
    return {
      applied: 0,
      message: "Skipped " + skips.total + ": " + describeSkips(skips),
    };
  }

  let msg =
    "Looped " +
    applied +
    " propert" +
    (applied === 1 ? "y" : "ies") +
    " (" +
    loopTypeLabel(resolvedType) +
    " " +
    resolvedDir +
    ")";
  if (skips.total > 0) {
    msg += "; skipped " + skips.total + ": " + describeSkips(skips);
  }
  return { applied: applied, message: msg };
};
