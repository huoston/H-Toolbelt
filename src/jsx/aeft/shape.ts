/**
 * Shape Layer Magic (v1) — After Effects host side.
 *
 * Cleans up the debris an Illustrator or SVG import leaves in a shape layer.
 * Two operations, both pure deletion:
 *
 *   - Remove empty groups     — groups that can never draw anything.
 *   - Remove artboard rect    — the comp-sized backdrop rectangle Illustrator
 *                               exports behind the real artwork.
 *
 * Deletion is the entire vocabulary of this version, and that is a deliberate
 * design boundary rather than an accident of scope. See below.
 *
 * ============================================================================
 * WHY THERE IS NO FLATTEN IN v1
 * ============================================================================
 * The planned third operation was to collapse nested groups whose Transform is
 * an identity — the "wrappers" an AI conversion produces by the dozen — by
 * lifting their children into the parent group and deleting the husk. It is not
 * implemented because ExtendScript cannot perform the lift, and the workaround
 * cannot preserve the artwork.
 *
 * 1. THERE IS NO REPARENTING PRIMITIVE. `PropertyBase.parentProperty` is
 *    readonly, and the only mutators AE exposes are `remove()`, `moveTo(index)`
 *    — which reorders a property *within* its existing parent — and
 *    `duplicate()`, which copies in place, also within the existing parent.
 *    `PropertyGroup.addProperty(matchName)` creates a *new, default* property.
 *    Nothing moves an existing group from one parent to another.
 *
 * 2. THE ONLY ALTERNATIVE IS LOSSY. Without a move, flattening means recreating
 *    each child in the parent via `addProperty` and copying its state across.
 *    That copy cannot be faithful: gradient fill and stroke ramp data
 *    (`ADBE Vector Grad Colors`) is not readable or writable from ExtendScript,
 *    so every gradient in the layer would come back as a default. Keyframes,
 *    expressions and interpolation types on every descendant would each need
 *    their own reconstruction, and any property this build did not anticipate
 *    would be silently dropped. A cleanup tool that quietly destroys gradients
 *    is worse than no cleanup tool.
 *
 * 3. AN IDENTITY TRANSFORM DOES NOT MEAN THE GROUP IS A NO-OP. Even given a
 *    working move, the premise is unsound. A group is a scope, not only a
 *    transform: a Fill inside it paints that group's paths, and Trim Paths,
 *    Merge Paths, Offset Paths and Repeater all operate on the group's contents.
 *    Hoisting the children of an identity-transform group into a parent that
 *    holds other paths merges those scopes, so the parent's fill starts painting
 *    the hoisted paths and vice versa. The layer would change appearance — the
 *    one thing this tool promises never to do.
 *
 * Points 1 and 2 are limits of the scripting API; point 3 would remain true even
 * if Adobe added a move tomorrow. Flatten therefore needs a different design
 * (rebaking transforms, scope-aware hoisting) and is deferred rather than
 * approximated. The panel does not offer the button.
 *
 * ============================================================================
 * COLLECT, THEN REMOVE
 * ============================================================================
 * Every operation walks the tree building a list of targets and only then
 * deletes, so no traversal ever reads a group whose siblings have been
 * renumbered underneath it. Each public entry point opens exactly one undo
 * group, so a partial failure reverts as one step; `cleanAll` runs both
 * operations inside a single undo group rather than nesting two.
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

import { isArtboardRect, isIdentityTransform } from "../../shared/shape";
import type { GroupTransform } from "../../shared/shape";

export interface ShapeResult {
  applied: number;
  message: string;
}

/** Layer type. Read from `matchName`, never inferred from `layer.source`. */
const MN_LAYER_VECTOR = "ADBE Vector Layer";

/** Shape tree structure. */
const MN_ROOT_VECTORS = "ADBE Root Vectors Group";
const MN_VECTOR_GROUP = "ADBE Vector Group";
const MN_VECTORS_GROUP = "ADBE Vectors Group";
const MN_VECTOR_TRANSFORM = "ADBE Vector Transform Group";

/** Shape group transform properties. */
const MN_VECTOR_ANCHOR = "ADBE Vector Anchor";
const MN_VECTOR_POSITION = "ADBE Vector Position";
const MN_VECTOR_SCALE = "ADBE Vector Scale";
const MN_VECTOR_ROTATION = "ADBE Vector Rotation";
const MN_VECTOR_SKEW = "ADBE Vector Skew";
const MN_VECTOR_OPACITY = "ADBE Vector Group Opacity";

/** Rectangle geometry. */
const MN_SHAPE_RECT = "ADBE Vector Shape - Rect";
const MN_RECT_SIZE = "ADBE Vector Rect Size";
const MN_RECT_POSITION = "ADBE Vector Rect Position";

/** Items that put marks on the screen. */
const SHAPE_MATCH_NAMES = [
  "ADBE Vector Shape - Group",
  MN_SHAPE_RECT,
  "ADBE Vector Shape - Ellipse",
  "ADBE Vector Shape - Star",
];

/** Items that colour those marks. */
const PAINT_MATCH_NAMES = [
  "ADBE Vector Graphic - Fill",
  "ADBE Vector Graphic - Stroke",
  "ADBE Vector Graphic - G-Fill",
  "ADBE Vector Graphic - G-Stroke",
];

const NO_COMP_MESSAGE = "Open a composition first.";
const NO_SHAPE_MESSAGE = "Select one or more shape layers first.";

/* -------------------------------------------------------------------------- */
/* Small AE readers                                                           */
/* -------------------------------------------------------------------------- */

/** Layer type, or "unknown" when AE will not report it. */
const layerMatchName = (layer: Layer): string => {
  try {
    const mn = layer.matchName;
    return mn ? mn : "unknown";
  } catch (e) {
    return "unknown";
  }
};

/** Read a property by match name, or null when absent. */
const prop = (group: PropertyGroup, matchName: string): Property | null => {
  try {
    const p = group.property(matchName);
    return p ? (p as Property) : null;
  } catch (e) {
    return null;
  }
};

/** Read a child group by match name, or null when absent. */
const subGroup = (
  group: PropertyGroup,
  matchName: string
): PropertyGroup | null => {
  try {
    const p = group.property(matchName);
    return p ? (p as PropertyGroup) : null;
  } catch (e) {
    return null;
  }
};

/** Number of children, or 0 when AE will not say. */
const childCount = (group: PropertyGroup): number => {
  try {
    const n = group.numProperties;
    return typeof n === "number" && isFinite(n) ? n : 0;
  } catch (e) {
    return 0;
  }
};

/** Child at a 1-based index, or null when unreadable. */
const childAt = (group: PropertyGroup, i: number): PropertyBase | null => {
  try {
    const p = group.property(i);
    return p ? (p as PropertyBase) : null;
  } catch (e) {
    return null;
  }
};

/** Match name of a property, or "" when unreadable. */
const propMatchName = (p: PropertyBase): string => {
  try {
    return p.matchName ? p.matchName : "";
  } catch (e) {
    return "";
  }
};

/** A property carrying keyframes or an expression is not a static leftover. */
const isAnimated = (p: Property | null): boolean => {
  if (!p) return false;
  try {
    if (p.numKeys > 0) return true;
  } catch (e) {
    return true; // unreadable: treat as animated, i.e. do not touch
  }
  try {
    if (p.expressionEnabled) return true;
  } catch (e) {
    // Property does not expose expressions; not animated by that route.
  }
  return false;
};

/** Vector value of a property, or null when unreadable. */
const vecValue = (p: Property | null): number[] | null => {
  if (!p) return null;
  try {
    const v = p.value as unknown as number[];
    if (v instanceof Array) return v;
    return null;
  } catch (e) {
    return null;
  }
};

/** Numeric value of a property, or NaN when unreadable. */
const numValue = (p: Property | null): number => {
  if (!p) return NaN;
  try {
    const v = p.value as unknown as number;
    return typeof v === "number" ? v : NaN;
  } catch (e) {
    return NaN;
  }
};

/** Is `mn` one of `list`? (ES3: no Array.prototype.indexOf on this target.) */
const inList = (list: string[], mn: string): boolean => {
  for (let i = 0; i < list.length; i++) {
    if (list[i] === mn) return true;
  }
  return false;
};

/* -------------------------------------------------------------------------- */
/* Selection                                                                  */
/* -------------------------------------------------------------------------- */

interface ShapeSelection {
  layers: Layer[];
  skipped: string[];
}

/**
 * Split the selection into shape layers and refusals.
 *
 * Type is decided by `matchName` alone. `instanceof ShapeLayer` looks like the
 * same question but is unreliable across ExtendScript builds, and `layer.source`
 * is null for shape layers, so it says nothing at all.
 */
const collectShapeLayers = (comp: CompItem): ShapeSelection => {
  const layers: Layer[] = [];
  const skipped: string[] = [];

  const selected = comp.selectedLayers;
  for (let i = 0; i < selected.length; i++) {
    const layer = selected[i];
    const mn = layerMatchName(layer);
    if (mn === MN_LAYER_VECTOR) {
      layers.push(layer);
    } else {
      skipped.push("Skipped " + layer.name + ": not a shape layer [" + mn + "]");
    }
  }

  return { layers: layers, skipped: skipped };
};

/** "; Skipped Foo: not a shape layer [ADBE AV Layer]" — or "" when none. */
const skipNote = (skipped: string[]): string => {
  if (skipped.length === 0) return "";
  return "; " + skipped.join("; ");
};

/** The `Contents` group of a shape layer. */
const layerContents = (layer: Layer): PropertyGroup | null => {
  try {
    const c = layer.property(MN_ROOT_VECTORS);
    return c ? (c as PropertyGroup) : null;
  } catch (e) {
    return null;
  }
};

/** The contents of a shape *group* — its `ADBE Vectors Group`. */
const groupContents = (group: PropertyGroup): PropertyGroup | null => {
  return subGroup(group, MN_VECTORS_GROUP);
};

/* -------------------------------------------------------------------------- */
/* Removal                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Delete collected properties, last first.
 *
 * Backwards because `remove()` renumbers the surviving siblings: walking in
 * reverse means each deletion only ever disturbs properties already handled,
 * so the pass does not depend on how AE treats a reference whose index moved.
 * A property AE refuses to delete is left in place and simply not counted —
 * the reported number is what actually happened, not what was attempted.
 */
const removeAll = (targets: PropertyBase[]): number => {
  let removed = 0;
  for (let i = targets.length - 1; i >= 0; i--) {
    try {
      targets[i].remove();
      removed++;
    } catch (e) {
      // Not removable; leave it and keep going.
    }
  }
  return removed;
};

/* -------------------------------------------------------------------------- */
/* Empty groups                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Can nothing inside this group ever draw?
 *
 * True when its contents are made up exclusively of groups that are themselves
 * empty (which includes having no contents at all).
 *
 * DEFINED BY EXCLUSION, ON PURPOSE. The alternative — "empty means it contains
 * none of these drawable match names" — has to be exhaustive to be safe, and
 * would start deleting real content the day Adobe ships an operator missing
 * from the list. Here, anything that is not a provably empty group makes the
 * group non-empty: a path, a fill, a repeater, a trim, or a match name this
 * build has never seen. Unreadable is likewise non-empty.
 */
const isEmptyGroup = (group: PropertyGroup): boolean => {
  const contents = groupContents(group);
  // A group without the expected contents property is not a shape this build
  // understands. Leave it alone.
  if (!contents) return false;

  const n = childCount(contents);
  for (let i = 1; i <= n; i++) {
    const child = childAt(contents, i);
    if (!child) return false;
    if (propMatchName(child) !== MN_VECTOR_GROUP) return false;
    if (!isEmptyGroup(child as PropertyGroup)) return false;
  }
  return true;
};

/**
 * Collect the outermost empty groups under `container`.
 *
 * Never descends into a group already marked for removal: the removal set must
 * be disjoint, or a nested empty group would be deleted a second time after its
 * parent had already taken it out of the tree. Because `isEmptyGroup` recurses,
 * a chain of empty groups is caught whole by its outermost member, so one pass
 * reaches a fixed point.
 */
const collectEmptyGroups = (
  container: PropertyGroup,
  out: PropertyBase[]
): void => {
  const n = childCount(container);
  for (let i = 1; i <= n; i++) {
    const child = childAt(container, i);
    if (!child || propMatchName(child) !== MN_VECTOR_GROUP) continue;

    const group = child as PropertyGroup;
    if (isEmptyGroup(group)) {
      out.push(group);
      continue;
    }

    const contents = groupContents(group);
    if (contents) collectEmptyGroups(contents, out);
  }
};

/** Remove empty groups across the given layers. Returns how many went. */
const removeEmptyGroupsIn = (layers: Layer[]): number => {
  let removed = 0;
  for (let i = 0; i < layers.length; i++) {
    const contents = layerContents(layers[i]);
    if (!contents) continue;

    const targets: PropertyBase[] = [];
    collectEmptyGroups(contents, targets);
    removed += removeAll(targets);
  }
  return removed;
};

/* -------------------------------------------------------------------------- */
/* Artboard rectangle                                                         */
/* -------------------------------------------------------------------------- */

/** Read a shape group's Transform into the shared predicate's shape. */
const groupTransform = (group: PropertyGroup): GroupTransform | null => {
  const t = subGroup(group, MN_VECTOR_TRANSFORM);
  if (!t) return null;

  const anchor = vecValue(prop(t, MN_VECTOR_ANCHOR));
  const position = vecValue(prop(t, MN_VECTOR_POSITION));
  const scale = vecValue(prop(t, MN_VECTOR_SCALE));
  if (!anchor || !position || !scale) return null;

  // Unreadable scalars arrive as NaN, which `isIdentityTransform` rejects —
  // "could not read the rotation" must not pass as "the rotation is zero".
  return {
    anchor: [anchor[0], anchor[1]],
    position: [position[0], position[1]],
    scale: [scale[0], scale[1]],
    rotation: numValue(prop(t, MN_VECTOR_ROTATION)),
    skew: numValue(prop(t, MN_VECTOR_SKEW)),
    opacity: numValue(prop(t, MN_VECTOR_OPACITY)),
  };
};

/** Does this rectangle match the comp frame, statically? */
const rectIsArtboard = (
  rect: PropertyGroup,
  compSize: [number, number]
): boolean => {
  const sizeProp = prop(rect, MN_RECT_SIZE);
  const posProp = prop(rect, MN_RECT_POSITION);
  if (!sizeProp || !posProp) return false;

  // An animated backdrop is not leftover import debris — someone is using it.
  if (isAnimated(sizeProp) || isAnimated(posProp)) return false;

  const size = vecValue(sizeProp);
  const pos = vecValue(posProp);
  if (!size || !pos) return false;

  return isArtboardRect([size[0], size[1]], [pos[0], pos[1]], compSize);
};

/**
 * Is this top-level group nothing but the artboard backdrop?
 *
 * All of the following, or it is left alone:
 *
 *   - identity group transform, so the rectangle's own Size is what reaches the
 *     screen. Without this the test is meaningless in both directions: a
 *     960x540 rect inside a group scaled 200% does cover a 1920x1080 comp, and
 *     a comp-sized rect inside a group scaled 50% does not;
 *   - exactly one drawable item, and it a rectangle matching the comp frame;
 *   - nothing else but paint. A nested group, a repeater, a trim — anything
 *     else means this group is doing work, and work is not a backdrop.
 */
const isArtboardGroup = (
  group: PropertyGroup,
  compSize: [number, number]
): boolean => {
  const t = groupTransform(group);
  if (!t || !isIdentityTransform(t)) return false;

  const contents = groupContents(group);
  if (!contents) return false;

  let rect: PropertyGroup | null = null;
  let shapeCount = 0;

  const n = childCount(contents);
  for (let i = 1; i <= n; i++) {
    const child = childAt(contents, i);
    if (!child) return false;

    const mn = propMatchName(child);
    if (inList(SHAPE_MATCH_NAMES, mn)) {
      shapeCount++;
      if (mn === MN_SHAPE_RECT) rect = child as PropertyGroup;
      continue;
    }
    if (inList(PAINT_MATCH_NAMES, mn)) continue;

    return false;
  }

  if (shapeCount !== 1 || !rect) return false;
  return rectIsArtboard(rect, compSize);
};

interface ArtboardSweep {
  removed: number;
  names: string[];
}

/**
 * Remove artboard backdrops across the given layers.
 *
 * Only top-level groups are considered. Illustrator puts the backdrop at the
 * root of the layer, and a comp-sized rectangle nested deeper is far more
 * likely to be deliberate artwork than debris.
 */
const removeArtboardIn = (
  layers: Layer[],
  compSize: [number, number]
): ArtboardSweep => {
  let removed = 0;
  const names: string[] = [];

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const contents = layerContents(layer);
    if (!contents) continue;

    const targets: PropertyBase[] = [];
    const found: string[] = [];

    const n = childCount(contents);
    for (let i = 1; i <= n; i++) {
      const child = childAt(contents, i);
      if (!child || propMatchName(child) !== MN_VECTOR_GROUP) continue;

      const group = child as PropertyGroup;
      if (isArtboardGroup(group, compSize)) {
        targets.push(group);
        found.push(layer.name + " / " + group.name);
      }
    }

    const gone = removeAll(targets);
    removed += gone;
    // Only report what actually left the tree.
    for (let k = 0; k < gone && k < found.length; k++) {
      names.push(found[k]);
    }
  }

  return { removed: removed, names: names };
};

/* -------------------------------------------------------------------------- */
/* Entry points                                                               */
/* -------------------------------------------------------------------------- */

/** Comp size as the shared predicate wants it. */
const compFrameSize = (comp: CompItem): [number, number] => {
  return [comp.width, comp.height];
};

/**
 * Delete every group that can never draw anything.
 *
 * Idempotent: a second run finds nothing left to remove and says so.
 */
export const removeEmptyGroups = (): ShapeResult => {
  const comp = app.project.activeItem;
  if (!(comp instanceof CompItem)) {
    return { applied: 0, message: NO_COMP_MESSAGE };
  }

  const sel = collectShapeLayers(comp);
  if (sel.layers.length === 0) {
    return { applied: 0, message: NO_SHAPE_MESSAGE + skipNote(sel.skipped) };
  }

  let removed = 0;
  app.beginUndoGroup("H-Toolbelt: Remove Empty Groups");
  try {
    removed = removeEmptyGroupsIn(sel.layers);
  } finally {
    app.endUndoGroup();
  }

  const message =
    removed === 0
      ? "No empty groups found." + skipNote(sel.skipped)
      : "Removed " + removed + " empty group(s)" + skipNote(sel.skipped);

  return { applied: removed, message: message };
};

/**
 * Delete the comp-sized backdrop rectangle an Illustrator import leaves behind.
 *
 * Conservative by construction: no match means nothing is removed, and the
 * message names exactly what left.
 */
export const removeArtboardRect = (): ShapeResult => {
  const comp = app.project.activeItem;
  if (!(comp instanceof CompItem)) {
    return { applied: 0, message: NO_COMP_MESSAGE };
  }

  const sel = collectShapeLayers(comp);
  if (sel.layers.length === 0) {
    return { applied: 0, message: NO_SHAPE_MESSAGE + skipNote(sel.skipped) };
  }

  let sweep: ArtboardSweep = { removed: 0, names: [] };
  app.beginUndoGroup("H-Toolbelt: Remove Artboard Rectangle");
  try {
    sweep = removeArtboardIn(sel.layers, compFrameSize(comp));
  } finally {
    app.endUndoGroup();
  }

  const message =
    sweep.removed === 0
      ? "No artboard rectangle found." + skipNote(sel.skipped)
      : "Removed " +
        sweep.removed +
        " artboard rectangle(s): " +
        sweep.names.join(", ") +
        skipNote(sel.skipped);

  return { applied: sweep.removed, message: message };
};

/**
 * Run the whole cleanup as one undoable step.
 *
 * Artboard first, then empty groups: removing the backdrop can leave its
 * ancestors with nothing in them, and running the empty sweep afterwards
 * collects those in the same pass instead of requiring a second click.
 *
 * The two operations share one undo group rather than nesting their own, since
 * AE does not nest undo groups — the user asked for one action and gets one
 * Ctrl+Z.
 */
export const cleanAll = (): ShapeResult => {
  const comp = app.project.activeItem;
  if (!(comp instanceof CompItem)) {
    return { applied: 0, message: NO_COMP_MESSAGE };
  }

  const sel = collectShapeLayers(comp);
  if (sel.layers.length === 0) {
    return { applied: 0, message: NO_SHAPE_MESSAGE + skipNote(sel.skipped) };
  }

  let sweep: ArtboardSweep = { removed: 0, names: [] };
  let empties = 0;

  app.beginUndoGroup("H-Toolbelt: Clean Shape Layers");
  try {
    sweep = removeArtboardIn(sel.layers, compFrameSize(comp));
    empties = removeEmptyGroupsIn(sel.layers);
  } finally {
    app.endUndoGroup();
  }

  const total = sweep.removed + empties;
  if (total === 0) {
    return {
      applied: 0,
      message: "Nothing to clean." + skipNote(sel.skipped),
    };
  }

  const parts: string[] = [];
  if (sweep.removed > 0) {
    parts.push(sweep.removed + " artboard rectangle(s)");
  }
  if (empties > 0) {
    parts.push(empties + " empty group(s)");
  }

  return {
    applied: total,
    message: "Removed " + parts.join(" and ") + skipNote(sel.skipped),
  };
};
