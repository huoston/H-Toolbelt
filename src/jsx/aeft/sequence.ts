/**
 * Layer Sequencing — After Effects host side.
 *
 * Staggers the selected layers in time by rewriting `startTime` only. The
 * ordering and time math live in the pure, unit-tested `shared/sequence` module;
 * this file is the AE plumbing plus the guards.
 *
 * WHY `startTime` AND NEVER `inPoint`: moving `startTime` slides the entire
 * layer — its footage and every keyframe on it — along the timeline, which is
 * what "sequence these layers" means. Writing `inPoint` instead would trim the
 * layer in place, silently destroying the head of the user's animation while
 * looking, in the timeline, like it had worked. There is no code path here that
 * touches `inPoint` or `outPoint`.
 *
 * WHY THE ORDER IS NOT THE SELECTION ORDER: `comp.selectedLayers` does not
 * preserve click order, so the cascade is derived from explicit criteria
 * instead. See `shared/sequence`.
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

import {
  computeSequenceStartTimes,
  findSequenceOrder,
  resolveSequenceOrder,
} from "../../shared/sequence";
import type { SeqLayer } from "../../shared/sequence";

export interface SequenceResult {
  applied: number;
  message: string;
}

const NO_COMP_MESSAGE = "Open a composition first.";
const TOO_FEW_MESSAGE = "Select 2+ layers to sequence.";

/**
 * Stagger the selected layers.
 *
 * `offsetFrames` arrives in frames because that is the unit motion designers
 * think in; it is converted to seconds here, against the comp's own frame
 * duration, since the pure math works in seconds.
 */
export const sequenceLayers = (
  order: string,
  offsetFrames: number,
  seed: number
): SequenceResult => {
  const resolvedOrder = findSequenceOrder(order);
  if (!resolvedOrder) {
    return { applied: 0, message: "Unknown order: " + order };
  }

  if (typeof offsetFrames !== "number" || !isFinite(offsetFrames)) {
    return { applied: 0, message: "Offset must be a number." };
  }

  const comp = app.project.activeItem;
  if (!(comp instanceof CompItem)) {
    return { applied: 0, message: NO_COMP_MESSAGE };
  }

  const selected = comp.selectedLayers;
  if (selected.length < 2) {
    return { applied: 0, message: TOO_FEW_MESSAGE };
  }

  // Locked layers reject writes, so they are dropped before the order is
  // resolved rather than after: leaving them in would let a layer we cannot
  // write become the anchor, shifting every other layer against a reference
  // that never moved.
  const writable: Layer[] = [];
  const lockedNames: string[] = [];
  for (let i = 0; i < selected.length; i++) {
    if (selected[i].locked) {
      lockedNames.push(selected[i].name);
    } else {
      writable.push(selected[i]);
    }
  }

  const lockedNote =
    lockedNames.length > 0
      ? "; skipped locked layer(s): " + lockedNames.join(", ")
      : "";

  if (writable.length < 2) {
    return {
      applied: 0,
      message: "Select 2+ unlocked layers to sequence" + lockedNote + ".",
    };
  }

  const seqLayers: SeqLayer[] = [];
  for (let i = 0; i < writable.length; i++) {
    seqLayers.push({
      id: writable[i].index,
      index: writable[i].index,
      inPoint: writable[i].inPoint,
      startTime: writable[i].startTime,
    });
  }

  const offsetSeconds = offsetFrames * comp.frameDuration;
  const ordered = resolveSequenceOrder(seqLayers, resolvedOrder, seed);
  const times = computeSequenceStartTimes(ordered, offsetSeconds);

  let applied = 0;
  app.beginUndoGroup("H-Toolbelt: Sequence Layers");
  try {
    for (let i = 0; i < times.length; i++) {
      const layer = layerByIndex(writable, times[i].id);
      if (!layer) continue;
      layer.startTime = times[i].newStartTime;
      applied++;
    }
  } finally {
    app.endUndoGroup();
  }

  return {
    applied: applied,
    message: "Sequenced " + applied + " layer(s)" + lockedNote,
  };
};

/** Find the collected layer carrying a given timeline index. */
const layerByIndex = (layers: Layer[], index: number): Layer | null => {
  for (let i = 0; i < layers.length; i++) {
    if (layers[i].index === index) return layers[i];
  }
  return null;
};
