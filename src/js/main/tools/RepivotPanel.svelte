<!--
  H-Toolbelt — Re-pivot.

  Moves the anchor of a layer whose position is animated, re-baking every
  position keyframe so the animation stays visually identical. This is the case
  Smart Anchor Point refuses on purpose; the two sit side by side in the
  Transform tab, and the safe one stays safe.

  WHY THIS PANEL CARRIES ITS OWN GRID: AnchorPanel's 3x3 grid is not a
  presentational component — it calls `evalTS("setAnchorPoint", ...)` directly.
  Reusing it would mean refactoring a shipped tool to lift the grid out, which is
  a change to working code for this tool's convenience. The grid is a dozen lines
  of markup over the same shared ANCHOR_POINTS list, so it is repeated here and
  AnchorPanel is left untouched.

  Author: Dr. Huoston Rodrigues
  Website: https://huoston.art/
  Email: hello@huoston.art
  Version: 0.2.0
  Created: 2026-07-28
  Modified: 2026-07-28
  License: GPL-3.0-or-later
  SPDX-License-Identifier: GPL-3.0-or-later
-->
<script lang="ts">
  import { evalTS } from "../../lib/utils/bolt";
  import { ANCHOR_POINTS } from "../../../shared/anchor";

  let feedback: string = $state("");
  let isError: boolean = $state(false);
  let busy: boolean = $state(false);

  const repivot = async (pointId: string): Promise<void> => {
    if (busy) return;
    busy = true;
    isError = false;
    feedback = "Re-pivoting…";
    try {
      const res = await evalTS("repivotAnimated", pointId);
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

<div class="htb-repivot">
  <p class="htb-repivot-hint">
    Move the anchor of an animated layer, keeping the animation.
  </p>

  <div class="htb-repivot-grid">
    {#each ANCHOR_POINTS as point (point.id)}
      <button
        class="htb-repivot-cell"
        class:htb-repivot-center={point.id === "center"}
        disabled={busy}
        title={point.id}
        aria-label={point.id}
        onclick={() => repivot(point.id)}
      >
        {point.label}
      </button>
    {/each}
  </div>

  <p class="htb-feedback" class:htb-error={isError} aria-live="polite">
    {feedback}
  </p>
</div>

<style lang="scss">
  .htb-repivot {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }

  .htb-repivot-hint {
    margin: 0;
    font-size: 10px;
    line-height: 1.35;
    color: var(--htb-text-muted, #9a9a9a);
    opacity: 0.85;
  }

  .htb-repivot-grid {
    display: grid;
    grid-template-columns: repeat(3, 34px);
    grid-template-rows: repeat(3, 34px);
    gap: 4px;
  }

  .htb-repivot-cell {
    appearance: none;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    font-size: 13px;
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

  .htb-repivot-cell:hover:not(:disabled) {
    background-color: var(--htb-surface-hover, #333333);
    border-color: var(--htb-accent, #2f6fb0);
  }

  .htb-repivot-cell:active:not(:disabled) {
    background-color: var(--htb-accent, #2f6fb0);
  }

  .htb-repivot-cell:disabled {
    opacity: 0.55;
    cursor: default;
  }

  // The centre point is the most-used target; give it a subtle lift.
  .htb-repivot-cell.htb-repivot-center {
    border-color: var(--htb-accent, #2f6fb0);
    background-color: var(--htb-surface-hover, #333333);
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
