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
      "An eased arrival (Easy Ease, any Out or In-Out curve) leaves no speed to bounce with, so the property is skipped with a message.",
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
      "Optional: Keys limits the loop to the end of the animation (1 = the last two keyframes). 0 loops everything.",
      "Click Apply, then play past the last keyframe. The layer must last longer than its animation, or there is nothing to see.",
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
        text: "Keeps moving at the speed of the last keyframe, forever. Needs a non-eased last keyframe (Linear or an In curve); otherwise there is no speed to continue.",
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
      "Select one or more layers, or a single shape group inside a shape layer.",
      "Park the playhead on a frame where the layer looks right. Text and animated layers are measured at the current frame.",
      "Click one of the nine points.",
    ],
    notes: [
      "Animated layers keep their motion path; rotation and scale then pivot around the new anchor.",
      "A shape group works when it is the layer's only top-level group and is not rotated.",
      "Skipped with a message: an expression on Position, a keyframed Anchor Point, separated dimensions, 3D layers rotated in X or Y, cameras and lights.",
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
      "Layers are spaced by their centres, so layers of different sizes end up evenly centred, not evenly gapped.",
      "Animated layers keep their motion path.",
      "Skipped with a message: 3D layers, parented layers, separated dimensions, an expression on Position, cameras and lights. Shapes inside a single layer are not supported yet.",
    ],
  },
};
