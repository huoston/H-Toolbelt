<!--
  H-Toolbelt — inline SVG icon.

  Renders one glyph from `icons.ts` at a consistent size, inheriting the panel's
  text colour so it themes with everything else.

  DECORATIVE BY DEFAULT, ON PURPOSE. The icon carries `aria-hidden="true"` and no
  label of its own, because every place it is used sits inside a button that
  already has a `title` and an `aria-label`. Labelling both would make a screen
  reader announce the same control twice. The rule this component relies on —
  never render an icon into a control that has no accessible name — is enforced
  at the call sites, not here.

  Author: Dr. Huoston Rodrigues
  Website: https://huoston.art/
  Email: hello@huoston.art
  Version: 0.2.0
  Created: 2026-07-29
  Modified: 2026-07-29
  License: GPL-3.0-or-later
  SPDX-License-Identifier: GPL-3.0-or-later
-->
<script lang="ts">
  import { ICON_VIEWBOX, iconShapes } from "./icons";
  import type { IconName } from "./icons";

  let {
    name,
    size = 16,
  }: {
    name: IconName;
    size?: number;
  } = $props();

  const shapes = $derived(iconShapes(name));
</script>

<svg
  class="htb-icon"
  viewBox={ICON_VIEWBOX}
  width={size}
  height={size}
  aria-hidden="true"
  focusable="false"
>
  {#each shapes as shape, i (i)}
    <path
      d={shape.d}
      fill={shape.filled ? "currentColor" : "none"}
      stroke={shape.filled ? "none" : "currentColor"}
      stroke-width="1.25"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  {/each}
</svg>

<style lang="scss">
  .htb-icon {
    display: block;
    // Inherits the button's colour, so hover and disabled states carry through
    // without the icon needing to know about them.
    color: inherit;
    flex: 0 0 auto;
    pointer-events: none;
  }
</style>
