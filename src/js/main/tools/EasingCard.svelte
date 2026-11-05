<!--
  H-Toolbelt — one easing or dynamics preset card.

  A thumbnail of the curve, the preset's name, and its description on hover.
  Clicking an easing card loads the curve into the editor; it does not apply.
  Apply stays a separate, deliberate button, so browsing the library never writes
  to anyone's keyframes.

  A dynamics card has the same anatomy but a different meaning: clicking it is the
  action, so it never shows as active. Its thumbnail draws a linear rise to the
  rest value followed by the preset's decaying oscillation, over a dashed rest
  line. The oscillation is amplified so that Soft, Medium and Hard can be told
  apart at this size.

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
  Modified: 2026-11-05
  License: GPL-3.0-or-later
  SPDX-License-Identifier: GPL-3.0-or-later
-->
<script lang="ts">
  import type { EasingPreset } from "../../../shared/easing";
  import { oscillation } from "../../../shared/dynamics";
  import type { DynamicsPreset } from "../../../shared/dynamics";

  /** Exactly one of `preset` and `dynamics` is set; it picks the card's mode. */
  type Props = {
    active?: boolean;
    disabled?: boolean;
  } & (
    | {
        preset: EasingPreset;
        dynamics?: undefined;
        onselect: (preset: EasingPreset) => void;
      }
    | {
        preset?: undefined;
        dynamics: DynamicsPreset;
        onselect: (dynamics: DynamicsPreset) => void;
      }
  );

  // Kept as one object, not destructured: the mode narrows `onselect` only while
  // both still belong to the same value.
  const props: Props = $props();

  /** Thumbnail box. Square, so the curve's slope reads truthfully. */
  const W = 34;

  /** Dynamics thumbnail: sample count, end of the rise, and the value at the top. */
  const LAST_SAMPLE = 48;
  const RISE_END = 0.35;
  const Y_TOP = 1.5;

  const toSvgY = (y: number): number => W * (1 - y / Y_TOP);
  const REST_Y = toSvgY(1);

  const dynamicsPath = (p: DynamicsPreset): string => {
    let d = "";
    for (let i = 0; i <= LAST_SAMPLE; i++) {
      const x = i / LAST_SAMPLE;
      const y =
        x <= RISE_END ? x / RISE_END : 1 + 2.5 * oscillation(p, (x - RISE_END) / 0.65);
      d += `${i === 0 ? "M" : "L"} ${(x * W).toFixed(2)} ${toSvgY(y).toFixed(2)} `;
    }
    return d.trim();
  };

  // Easing endpoints are fixed at (0,0) and (1,1); only the two control points vary.
  const path = $derived(
    props.dynamics
      ? dynamicsPath(props.dynamics)
      : `M 0 ${W} C ${props.preset.bezier[0] * W} ${(1 - props.preset.bezier[1]) * W} ` +
          `${props.preset.bezier[2] * W} ${(1 - props.preset.bezier[3]) * W} ${W} 0`
  );

  const isDynamics = $derived(props.dynamics !== undefined);
  const active = $derived(!isDynamics && (props.active ?? false));

  const title = $derived(
    props.dynamics
      ? `${props.dynamics.label} — ${props.dynamics.hint}`
      : `${props.preset.label} — ${props.preset.hint}`
  );
  const ariaLabel = $derived(
    props.dynamics ? title : `${props.preset.label}. ${props.preset.hint}`
  );
  const label = $derived(props.dynamics ? props.dynamics.label : props.preset.label);

  const select = (): void => {
    if (props.dynamics) props.onselect(props.dynamics);
    else props.onselect(props.preset);
  };
</script>

<button
  class="htb-ease-card"
  class:htb-ease-active={active}
  type="button"
  disabled={props.disabled ?? false}
  {title}
  aria-label={ariaLabel}
  aria-pressed={isDynamics ? undefined : active}
  onclick={select}
>
  <svg
    class="htb-ease-thumb"
    viewBox="0 0 {W} {W}"
    width={W}
    height={W}
    aria-hidden="true"
    focusable="false"
  >
    {#if isDynamics}
      <!-- The rest value, which the oscillation settles back onto. -->
      <line class="htb-ease-guide" x1="0" y1={REST_Y} x2={W} y2={REST_Y} />
    {:else}
      <!-- Linear reference, so every card shows its curve's departure from
           constant speed rather than an unanchored squiggle. -->
      <line class="htb-ease-guide" x1="0" y1={W} x2={W} y2="0" />
    {/if}
    <path
      class="htb-ease-curve"
      class:htb-ease-curve-dynamics={isDynamics}
      d={path}
    />
  </svg>
  <span class="htb-ease-label">{label}</span>
</button>

<style lang="scss">
  .htb-ease-card {
    appearance: none;
    display: flex;
    flex-direction: column;
    align-items: center;
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

  .htb-ease-card > * + * {
    margin-top: 4px;
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

  // Deliberately not the #e0654f of the error messages.
  .htb-ease-curve-dynamics {
    stroke: #e5486e;
  }

  .htb-ease-card.htb-ease-active .htb-ease-curve {
    stroke: var(--htb-accent, #2f6fb0);
  }

  // Two lines reserved whether or not the name needs them, so one- and two-line
  // cards in the same row stay the same height. Anything longer is cut at two.
  .htb-ease-label {
    font-size: 10px;
    line-height: 1.2;
    text-align: center;
    white-space: normal;
    min-height: 2.4em;
    max-height: 2.4em;
    overflow: hidden;
    max-width: 100%;
  }
</style>
