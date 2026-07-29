<!--
  H-Toolbelt — one easing preset card.

  A thumbnail of the curve, the preset's name, and its description on hover.
  Clicking loads the curve into the editor; it does not apply. Apply stays a
  separate, deliberate button, so browsing the library never writes to anyone's
  keyframes.

  WHY THE THUMBNAIL IS DRAWN HERE RATHER THAN SHARED WITH THE CURVE EDITOR: the
  editor's path is built from its own SIZE/PAD/INNER geometry, with room for
  draggable handles and guide lines it has to hit-test. A thumbnail needs none of
  that, and the two would have to agree on padding forever to share one helper.
  The formula is three numbers long, so it is repeated rather than abstracted —
  and the editor is left byte-identical, which is the point.

  The y axis is flipped for the same reason it is in the editor: SVG grows
  downward and easing curves are read growing upward.

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
  import type { EasingPreset } from "../../../shared/easing";

  let {
    preset,
    active = false,
    disabled = false,
    onselect,
  }: {
    preset: EasingPreset;
    active?: boolean;
    disabled?: boolean;
    onselect: (preset: EasingPreset) => void;
  } = $props();

  /** Thumbnail box. Square, so the curve's slope reads truthfully. */
  const W = 40;

  // Endpoints are fixed at (0,0) and (1,1); only the two control points vary.
  const path = $derived(
    `M 0 ${W} C ${preset.bezier[0] * W} ${(1 - preset.bezier[1]) * W} ` +
      `${preset.bezier[2] * W} ${(1 - preset.bezier[3]) * W} ${W} 0`
  );
</script>

<button
  class="htb-ease-card"
  class:htb-ease-active={active}
  type="button"
  {disabled}
  title={`${preset.label} — ${preset.hint}`}
  aria-label={`${preset.label}. ${preset.hint}`}
  aria-pressed={active}
  onclick={() => onselect(preset)}
>
  <svg
    class="htb-ease-thumb"
    viewBox="0 0 {W} {W}"
    width={W}
    height={W}
    aria-hidden="true"
    focusable="false"
  >
    <!-- Linear reference, so every card shows its curve's departure from
         constant speed rather than an unanchored squiggle. -->
    <line class="htb-ease-guide" x1="0" y1={W} x2={W} y2="0" />
    <path class="htb-ease-curve" d={path} />
  </svg>
  <span class="htb-ease-label">{preset.label}</span>
</button>

<style lang="scss">
  .htb-ease-card {
    appearance: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 6px 4px;
    font-family: inherit;
    color: var(--htb-text, #e0e0e0);
    background-color: var(--htb-surface, #2a2a2a);
    border: 1px solid var(--htb-border, #3a3a3a);
    border-radius: 4px;
    cursor: pointer;
    user-select: none;
    transition:
      background-color 0.12s ease,
      border-color 0.12s ease;
  }

  .htb-ease-card:hover:not(:disabled) {
    background-color: var(--htb-surface-hover, #333333);
    border-color: var(--htb-accent, #2f6fb0);
  }

  .htb-ease-card:disabled {
    opacity: 0.55;
    cursor: default;
  }

  // Marks which curve is loaded in the editor, not a pending action: the card
  // arms the editor, Apply is what writes.
  .htb-ease-card.htb-ease-active {
    border-color: var(--htb-accent, #2f6fb0);
    background-color: var(--htb-surface-hover, #333333);
  }

  .htb-ease-thumb {
    display: block;
    overflow: visible;
  }

  .htb-ease-guide {
    stroke: var(--htb-border, #3a3a3a);
    stroke-width: 1;
    stroke-dasharray: 2 2;
  }

  .htb-ease-curve {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
  }

  .htb-ease-card.htb-ease-active .htb-ease-curve {
    stroke: var(--htb-accent, #2f6fb0);
  }

  .htb-ease-label {
    font-size: 10px;
    line-height: 1.2;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
</style>
