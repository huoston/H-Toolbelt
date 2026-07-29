/**
 * H-Toolbelt — the panel's icon set.
 *
 * Inline SVG path data, drawn on a 16x16 grid, with no icon library behind it.
 * A dependency for eighteen shapes would be weight the panel does not need, and
 * every glyph here is a handful of straight lines.
 *
 * WHY SHAPES CARRY A `filled` FLAG. The alignment icons read best as a *rule*
 * plus *bars*: a hairline showing the edge being aligned to, and solid blocks
 * showing the layers meeting it. Stroking everything makes the bars look like
 * empty boxes and loses the distinction at 16px; filling everything loses the
 * rule. So each shape says which it is, and `Icon.svelte` sets `fill` and
 * `stroke` accordingly.
 *
 * EVERY COLOUR IS `currentColor`, never a literal. The panel is themed from the
 * host's own UI colours through `--htb-*`, and an icon with a baked-in grey
 * would be the one element that ignores a user's light-theme After Effects.
 *
 * WHAT IS DELIBERATELY NOT HERE: the nine anchor points. Those are arrows, they
 * already exist as labels in `shared/anchor`, and that module is the single
 * source of truth for the nine canonical points. Redrawing them here would
 * duplicate that list in a second place which could then disagree with it; the
 * anchor grid instead borrows this file's *sizing*, so the two look alike
 * without one copying the other's data.
 *
 * Author: Dr. Huoston Rodrigues
 * Website: https://huoston.art/
 * Email: hello@huoston.art
 * Version: 0.2.0
 * Created: 2026-07-29
 * Modified: 2026-07-29
 * License: GPL-3.0-or-later
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** One drawn element of an icon. */
export interface IconShape {
  /** SVG path data on the 16x16 grid. */
  d: string;
  /** Solid block when true; hairline when false or absent. */
  filled?: boolean;
}

export type IconName =
  | "align-left"
  | "align-hcenter"
  | "align-right"
  | "align-top"
  | "align-vcenter"
  | "align-bottom"
  | "distribute-horizontal"
  | "distribute-vertical"
  | "tab-motion"
  | "tab-transform"
  | "tab-shapes"
  | "help"
  | "close";

/** The grid every path is drawn on. */
export const ICON_VIEWBOX = "0 0 16 16";

export const ICONS: Record<IconName, IconShape[]> = {
  // Align: a rule on the edge being aligned to, plus two bars meeting it. The
  // bars are deliberately different lengths so the icon shows alignment rather
  // than a pair of equal blocks that would read as "distribute".
  "align-left": [
    { d: "M2 2V14" },
    { d: "M3.5 4.5H12.5V7.5H3.5Z", filled: true },
    { d: "M3.5 9.5H9.5V12.5H3.5Z", filled: true },
  ],
  "align-hcenter": [
    { d: "M8 2V14" },
    { d: "M3.5 4.5H12.5V7.5H3.5Z", filled: true },
    { d: "M5 9.5H11V12.5H5Z", filled: true },
  ],
  "align-right": [
    { d: "M14 2V14" },
    { d: "M3.5 4.5H12.5V7.5H3.5Z", filled: true },
    { d: "M6.5 9.5H12.5V12.5H6.5Z", filled: true },
  ],
  "align-top": [
    { d: "M2 2H14" },
    { d: "M4.5 3.5H7.5V12.5H4.5Z", filled: true },
    { d: "M9.5 3.5H12.5V9.5H9.5Z", filled: true },
  ],
  "align-vcenter": [
    { d: "M2 8H14" },
    { d: "M4.5 3.5H7.5V12.5H4.5Z", filled: true },
    { d: "M9.5 5H12.5V11H9.5Z", filled: true },
  ],
  "align-bottom": [
    { d: "M2 14H14" },
    { d: "M4.5 3.5H7.5V12.5H4.5Z", filled: true },
    { d: "M9.5 6.5H12.5V12.5H9.5Z", filled: true },
  ],

  // Distribute: three equal bars with equal gaps — equal sizes are the point
  // here, which is exactly what distinguishes it from the align pair above.
  "distribute-horizontal": [
    { d: "M1.5 4H4V12H1.5Z", filled: true },
    { d: "M7 4H9.5V12H7Z", filled: true },
    { d: "M12.5 4H15V12H12.5Z", filled: true },
  ],
  "distribute-vertical": [
    { d: "M4 1.5H12V4H4Z", filled: true },
    { d: "M4 7H12V9.5H4Z", filled: true },
    { d: "M4 12.5H12V15H4Z", filled: true },
  ],

  // Tabs. An ease curve for Motion, a bounding box with its anchor for
  // Transform, overlapping primitives for Shapes.
  "tab-motion": [{ d: "M2 13C6 13 10 3 14 3" }],
  "tab-transform": [
    { d: "M3.5 3.5H12.5V12.5H3.5Z" },
    { d: "M7 7H9V9H7Z", filled: true },
  ],
  "tab-shapes": [
    { d: "M7.5 5.5A3 3 0 1 0 13.5 5.5A3 3 0 1 0 7.5 5.5Z" },
    { d: "M2.5 7.5H9V14H2.5Z" },
  ],

  help: [
    { d: "M2 8A6 6 0 1 0 14 8A6 6 0 1 0 2 8Z" },
    { d: "M6.4 6.3A1.7 1.7 0 0 1 9.6 7.1C9.6 8.2 8 8.4 8 9.5" },
    { d: "M7.35 11.6A0.65 0.65 0 1 0 8.65 11.6A0.65 0.65 0 1 0 7.35 11.6Z", filled: true },
  ],
  close: [{ d: "M4.5 4.5L11.5 11.5" }, { d: "M11.5 4.5L4.5 11.5" }],
};

/** Shapes for an icon, or an empty list when the name is unknown. */
export const iconShapes = (name: IconName): IconShape[] => {
  const shapes = ICONS[name];
  return shapes ? shapes : [];
};
