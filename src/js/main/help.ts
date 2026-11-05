/**
 * H-Toolbelt — the in-panel help text, one entry per tool section.
 *
 * Product copy, kept apart from the markup so it can be read and edited as text.
 * `ToolSection.svelte` renders each entry; the headings around the lists live
 * there.
 *
 * Author: Dr. Huoston Rodrigues
 * Website: https://huoston.art/
 * Email: hello@huoston.art
 * Version: 0.2.0
 * Created: 2026-11-05
 * Modified: 2026-11-05
 * License: GPL-3.0-or-later
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface HelpTerm {
  term: string;
  text: string;
}

export interface HelpEntry {
  summary: string;
  steps: string[];
  terms?: HelpTerm[];
  notes: string[];
}

export const HELP: {
  easings: HelpEntry;
  dynamics: HelpEntry;
  sequencer: HelpEntry;
  loops: HelpEntry;
  anchor: HelpEntry;
  align: HelpEntry;
} = {
  easings: {
    summary:
      "Shapes the timing between keyframes with a curve, using After Effects' own keyframe easing — no expressions.",
    steps: [
      "In the timeline, select two or more keyframes on an animated property.",
      "Click a card to load its curve. Drag the two handles to fine-tune it.",
      "Click Apply.",
    ],
    notes: [
      "Clicking a card only loads the curve. Nothing changes until you click Apply.",
      "Timing only: a motion path keeps its shape; only the speed along it changes.",
      "Every dimension gets the same ease, as with Easy Ease.",
      "Overshoots (bounce, elastic) cannot be keyframe curves — see Dynamics.",
    ],
  },

  dynamics: {
    summary:
      "Adds a bounce or an elastic wobble after each keyframe. It is an expression, scaled by the speed the property arrives with.",
    steps: [
      "In the timeline, select an animated property by its name (for example Position), with two or more keyframes.",
      "Make sure the keyframes are reached at speed: Linear, or an In curve from Easings.",
      "Click a card. It applies immediately. Soft, Medium and Hard set the strength.",
    ],
    notes: [
      "If every keyframe is reached with an eased arrival (Easy Ease, any Out or In-Out curve), there is no speed left to bounce with and the property is skipped with a message. If only some are, it applies and names the ones that will not bounce. Very short segments (under about 9 frames) still keep a little speed, so they bounce weakly instead of being skipped.",
      "The bounce happens after the keyframe: play or scrub past it to see it.",
      "One expression per property: Clear before switching between Dynamics and Loops.",
      "Clear removes every expression on the selected properties, including ones you wrote yourself.",
    ],
  },

  sequencer: {
    summary: "Staggers the selected layers in time, one after another.",
    steps: [
      "Select two or more layers.",
      "Set Offset: the number of frames between one layer and the next.",
      "Choose an Order, then click Apply.",
    ],
    notes: [
      "Layers slide whole: their keyframes move with them and nothing is trimmed.",
      "The first layer in the chosen order stays where it is.",
      "Random uses the Seed: the same seed always gives the same order. Use the next-seed button for a new one.",
      "Locked layers are skipped.",
    ],
  },

  loops: {
    summary:
      "Repeats the keyframed animation of a property beyond its keyframes, with a loop expression.",
    steps: [
      "In the timeline, select an animated property by its name, with two or more keyframes.",
      "Pick a loop type and a direction: Out repeats after the last keyframe, In before the first.",
      "Optional: Keys limits how much of the animation loops, counted from the end for Out or from the start for In (1 = two keyframes). 0 loops everything. Continue does not use it.",
      "Click Apply, then play past the last keyframe (Out) or before the first (In). The layer must extend beyond the animation, or there is nothing to see.",
    ],
    terms: [
      {
        term: "Cycle",
        text: "Plays the animation again from the start. For a seamless loop, give the first and last keyframes the same value.",
      },
      {
        term: "Ping-Pong",
        text: "Plays it forwards, then backwards, and repeats.",
      },
      {
        term: "Offset",
        text: "Repeats it, each time starting where the previous one ended. Good for walks, steps and rotation that keeps adding up.",
      },
      {
        term: "Continue",
        text: "Keeps moving forever at the speed of the last keyframe (Out) or the first (In). That keyframe must not be eased; otherwise there is no speed to continue and the property is skipped with a message.",
      },
    ],
    notes: [
      "Out changes nothing before the last keyframe; In changes nothing after the first.",
      "One expression per property: Clear before switching between Loops and Dynamics.",
    ],
  },

  anchor: {
    summary:
      "Moves a layer's anchor point to one of nine points of its bounding box, without the layer moving on screen.",
    steps: [
      "Select one or more layers, or shape groups inside shape layers (one group per layer).",
      "Park the playhead on a frame where the layer looks right. Text and animated layers are measured at the current frame.",
      "Click one of the nine points.",
    ],
    notes: [
      "Animated layers keep their motion path; rotation and scale then pivot around the new anchor.",
      "A shape group works when it is its layer's only top-level group, is not rotated or scaled to zero, and its transform is not animated.",
      "Skipped with a message: an expression on Position, a keyframed Anchor Point, separated dimensions, 3D layers rotated in X or Y or with a non-zero Orientation, cameras and lights.",
    ],
  },

  align: {
    summary:
      "Aligns and spaces layers by what you see on screen, rotation and scale included.",
    steps: [
      "Select the layers.",
      "Choose Align to: Comp (the frame) or Selection (the area covered by the selected layers).",
      "Click an align button, or Distribute horizontally or vertically.",
    ],
    notes: [
      "Distribute needs two or more layers against the Comp, three or more against the Selection.",
      "Layers are spaced by their centers, so layers of different sizes end up evenly centered, not evenly gapped.",
      "Animated layers keep their motion path.",
      "Skipped with a message: 3D layers, parented layers, separated dimensions, an expression on Position, cameras and lights. Shapes inside a single layer are not supported yet.",
    ],
  },
};
