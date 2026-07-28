/**
 * H-Toolbelt — the panel's tab set.
 *
 * One list, consumed by both the tab bar and the panel container, so a new tab
 * is a single entry here rather than an edit in three places that must agree.
 *
 * WHY COMPOSITING IS NOT LISTED YET: it is a planned tab with no tools in it.
 * Rendering it now would give the user a button that leads to an empty box,
 * which reads as a bug rather than as a roadmap. It joins `TABS` and `TabId`
 * together, on the day its first tool ships. See ROADMAP.md.
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

/** Add "compositing" here when the tab gains its first tool. */
export type TabId = "motion" | "transform" | "shapes";

export interface TabSpec {
  id: TabId;
  label: string;
  /** Tooltip: what the user will find under the tab. */
  title: string;
}

export const TABS: TabSpec[] = [
  {
    id: "motion",
    label: "Motion",
    title: "Easings, sequencing and expression effects.",
  },
  {
    id: "transform",
    label: "Transform",
    title: "Anchor point.",
  },
  {
    id: "shapes",
    label: "Shapes",
    title: "Shape layer cleanup.",
  },
];

/** The tab the panel opens on. */
export const DEFAULT_TAB: TabId = "motion";

/** DOM id of a tab button — referenced by its panel's `aria-labelledby`. */
export const tabButtonId = (id: TabId): string => `htb-tab-${id}`;

/** DOM id of a tab panel — referenced by its tab's `aria-controls`. */
export const tabPanelId = (id: TabId): string => `htb-panel-${id}`;
