<!--
  H-Toolbelt — Align & Distribute.

  Six alignments against either the composition frame or the selection's own
  combined bounds, plus horizontal and vertical distribution.

  The difference from After Effects' own Align panel is the box being measured:
  this one uses the layer's bounding box in composition space, so a rotated or
  scaled layer aligns by what is actually on screen rather than by its
  untransformed rectangle.

  The "Align to" toggle is a mode, not an action, so it sits above everything it
  governs — and it governs the distribute buttons too, not just the six aligns.
  Against the comp, distribution pushes the outermost layers until they touch
  the frame; against the selection, the extremes stay put and only the middle
  moves. It was sending only the align calls at first, which made the toggle
  look broken for half the panel.

  Animated layers are moved, not refused: the host shifts their whole position
  track by the alignment delta, exactly as the Anchor Point tool does.

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
  import { evalTS } from "../../lib/utils/bolt";
  import {
    ALIGN_MODES,
    ALIGN_TARGETS,
    DEFAULT_ALIGN_TO,
    DISTRIBUTE_AXES,
  } from "../../../shared/align";
  import type { AlignMode, AlignTo, DistributeAxis } from "../../../shared/align";
  import Icon from "../icons/Icon.svelte";
  import type { IconName } from "../icons/icons";

  // Mode id -> glyph. The map lives here rather than in `shared/align` because
  // the host has no use for an icon name, and `shared` is compiled into the
  // ExtendScript bundle where SVG is meaningless.
  const ALIGN_ICONS: Record<AlignMode, IconName> = {
    left: "align-left",
    hcenter: "align-hcenter",
    right: "align-right",
    top: "align-top",
    vcenter: "align-vcenter",
    bottom: "align-bottom",
  };

  const DISTRIBUTE_ICONS: Record<DistributeAxis, IconName> = {
    x: "distribute-horizontal",
    y: "distribute-vertical",
  };

  let alignTo: AlignTo = $state(DEFAULT_ALIGN_TO);

  let feedback: string = $state("");
  let isError: boolean = $state(false);
  let busy: boolean = $state(false);

  const align = async (mode: AlignMode): Promise<void> => {
    if (busy) return;
    busy = true;
    isError = false;
    feedback = "Aligning…";
    try {
      const res = await evalTS("alignLayers", mode, alignTo);
      isError = res.applied === 0;
      feedback = res.message;
    } catch (e: any) {
      isError = true;
      feedback = `Error: ${e?.message ?? String(e)}`;
    } finally {
      busy = false;
    }
  };

  const distribute = async (axis: DistributeAxis): Promise<void> => {
    if (busy) return;
    busy = true;
    isError = false;
    feedback = "Distributing…";
    try {
      const res = await evalTS("distributeLayers", axis, alignTo);
      isError = res.applied === 0;
      feedback = res.message;
    } catch (e: any) {
      isError = true;
      feedback = `Error: ${e?.message ?? String(e)}`;
    } finally {
      busy = false;
    }
  };
</script>

<div class="htb-align">
  <div class="htb-align-to" role="group" aria-label="Align to">
    <span class="htb-align-label">Align to</span>
    {#each ALIGN_TARGETS as target (target.id)}
      <button
        class="htb-align-mode"
        class:htb-active={alignTo === target.id}
        disabled={busy}
        title={target.title}
        aria-pressed={alignTo === target.id}
        onclick={() => (alignTo = target.id)}
      >
        {target.label}
      </button>
    {/each}
  </div>

  <!-- Icon-only: these six are spatial, so the glyph says it faster than the
       word does. Every one still carries a tooltip and an aria-label — an icon
       with neither is a guessing game, which is the failure mode this panel is
       meant to avoid, not trade into. -->
  <div class="htb-align-grid">
    {#each ALIGN_MODES as mode (mode.id)}
      <button
        class="htb-align-cell"
        disabled={busy}
        title={mode.title}
        aria-label={mode.title}
        onclick={() => align(mode.id)}
      >
        <Icon name={ALIGN_ICONS[mode.id]} />
      </button>
    {/each}
  </div>

  <div class="htb-align-dist">
    <span class="htb-align-label">Distribute</span>
    {#each DISTRIBUTE_AXES as axis (axis.id)}
      <button
        class="htb-align-cell htb-align-dist-cell"
        disabled={busy}
        title={axis.title}
        aria-label={axis.title}
        onclick={() => distribute(axis.id)}
      >
        <Icon name={DISTRIBUTE_ICONS[axis.id]} />
      </button>
    {/each}
  </div>

  <p class="htb-feedback" class:htb-error={isError} aria-live="polite">
    {feedback}
  </p>
</div>

<style lang="scss">
  .htb-align {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .htb-align-to,
  .htb-align-dist {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .htb-align-label {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--htb-text-muted, #9a9a9a);
  }

  // Six glyph buttons: three per row on a narrow docked panel, six across when
  // there is room. 34px matches the anchor grid's cells, so the two icon
  // surfaces in this tab read as one system.
  .htb-align-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(34px, 1fr));
    gap: 4px;
  }

  .htb-align-dist-cell {
    flex: 1 1 auto;
  }

  .htb-align-cell {
    appearance: none;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 30px;
    padding: 0 4px;
    line-height: 1;
    font-family: inherit;
    color: var(--htb-text, #e0e0e0);
    background-color: var(--htb-surface, #2a2a2a);
    border: 1px solid var(--htb-border, #3a3a3a);
    border-radius: 3px;
    cursor: pointer;
    user-select: none;
    transition:
      background-color 0.12s ease,
      border-color 0.12s ease;
  }

  .htb-align-mode {
    appearance: none;
    flex: 1 1 auto;
    min-width: 0;
    padding: 5px 8px;
    font-size: 11px;
    font-weight: 500;
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

  .htb-align-cell:hover:not(:disabled),
  .htb-align-mode:hover:not(:disabled) {
    background-color: var(--htb-surface-hover, #333333);
    border-color: var(--htb-accent, #2f6fb0);
  }

  .htb-align-cell:active:not(:disabled),
  .htb-align-mode:active:not(:disabled) {
    background-color: var(--htb-accent, #2f6fb0);
  }

  // Marks which target the six buttons will use, not a pending action.
  .htb-align-mode.htb-active {
    border-color: var(--htb-accent, #2f6fb0);
    background-color: var(--htb-surface-hover, #333333);
    font-weight: 600;
  }

  .htb-align-cell:disabled,
  .htb-align-mode:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .htb-feedback {
    min-height: 1.2em;
    margin: 0;
    font-size: 11px;
    color: var(--htb-text-muted, #9a9a9a);
  }

  .htb-feedback.htb-error {
    // Fixed warm tone stays readable on both light and dark AE themes.
    color: #e0654f;
  }
</style>
