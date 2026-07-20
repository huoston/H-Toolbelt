/**
 * One-Click Expression Effects — After Effects host side.
 *
 * Writes a generated bounce or elastic expression onto every selected property,
 * and clears expressions again. The text generation lives in the pure,
 * unit-tested `shared/expressions` module; this file is the AE plumbing plus the
 * guards.
 *
 * GUARD PHILOSOPHY, as in the other tools: refuse with a reason rather than
 * apply hopefully. Two refusals matter most. An existing expression is never
 * overwritten — it is hand-written work that no undo the user reaches for a day
 * later will bring back. And a property with fewer than two keyframes is refused
 * instead of decorated: these expressions scale the velocity going into the last
 * keyframe, so with nothing to measure they evaluate to a no-op that looks like
 * the tool silently failed.
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

import { buildExpression, findExpressionKind } from "../../shared/expressions";
import type { ExpressionParams } from "../../shared/expressions";

export interface ExpressionResult {
  applied: number;
  message: string;
}

const NO_COMP_MESSAGE = "Open a composition first.";
const NO_SELECTION_MESSAGE = "Select one or more animated properties first.";

/** Minimum keyframes for a velocity sample to mean anything. */
const MIN_KEYFRAMES = 2;

/* -------------------------------------------------------------------------- */
/* Refusal accumulation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Groups refused properties by reason, so the feedback line reads
 * "Needs 2+ keyframes (Rotation, Opacity)" instead of one sentence per property.
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

/** "Needs 2+ keyframes (Rotation, Opacity); Unsupported property type (Mask Path)" */
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
 * Only numeric, non-spatial-shape properties. Colors, masks, shape paths, text
 * documents and marker properties either reject the arithmetic or need a
 * different formulation entirely, so they are refused rather than mangled.
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

/** Title-case for the undo group label: "bounce" -> "Bounce". */
const kindLabel = (kind: string): string => {
  return kind.charAt(0).toUpperCase() + kind.substring(1);
};

/**
 * Write the generated expression onto every eligible selected property.
 * Ineligible ones are skipped with a reason; the rest still get the effect.
 */
export const applyExpression = (
  kind: string,
  amplitude: number,
  frequency: number,
  decay: number
): ExpressionResult => {
  const resolvedKind = findExpressionKind(kind);
  if (!resolvedKind) {
    return { applied: 0, message: "Unknown effect: " + kind };
  }

  const comp = app.project.activeItem;
  if (!(comp instanceof CompItem)) {
    return { applied: 0, message: NO_COMP_MESSAGE };
  }

  const props = collectSelectedProperties(comp);
  if (props.length === 0) {
    return { applied: 0, message: NO_SELECTION_MESSAGE };
  }

  const params: ExpressionParams = {
    amplitude: amplitude,
    frequency: frequency,
    decay: decay,
  };
  const text = buildExpression(resolvedKind, params);

  let applied = 0;
  const skips = newSkipLog();

  app.beginUndoGroup("H-Toolbelt: Apply " + kindLabel(resolvedKind));
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
        addSkip(skips, "Needs 2+ keyframes", name);
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

  let msg = "Applied " + resolvedKind + " to " + applied + " propert" + (applied === 1 ? "y" : "ies");
  if (skips.total > 0) {
    msg += "; skipped " + skips.total + ": " + describeSkips(skips);
  }
  return { applied: applied, message: msg };
};

/* -------------------------------------------------------------------------- */
/* Clear                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Remove the expression from every selected property that has one.
 *
 * Deliberately not limited to expressions this tool wrote: "Clear" on a
 * selection the user made is unambiguous, and a filter that silently spared
 * hand-written ones would be the more surprising behaviour. One undo group
 * covers the lot.
 */
export const clearExpressions = (): ExpressionResult => {
  const comp = app.project.activeItem;
  if (!(comp instanceof CompItem)) {
    return { applied: 0, message: NO_COMP_MESSAGE };
  }

  const props = collectSelectedProperties(comp);
  if (props.length === 0) {
    return { applied: 0, message: "Select one or more properties first." };
  }

  let cleared = 0;
  app.beginUndoGroup("H-Toolbelt: Clear Expressions");
  try {
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (readExpression(p) === "") continue;
      try {
        p.expression = "";
        cleared++;
      } catch (e) {
        // A property that reports an expression but rejects the write is rare
        // enough to leave alone rather than abort the whole run over.
      }
    }
  } finally {
    app.endUndoGroup();
  }

  if (cleared === 0) {
    return { applied: 0, message: "No expressions to clear in the selection." };
  }
  return {
    applied: cleared,
    message:
      "Cleared " + cleared + " expression" + (cleared === 1 ? "" : "s"),
  };
};
