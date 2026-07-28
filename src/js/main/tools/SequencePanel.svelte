<!--
  H-Toolbelt — Layer Sequencing.

  Staggers the selected layers in time by an offset expressed in frames. The
  order is never the click order (After Effects does not preserve it); the user
  picks an explicit criterion instead, and Random exposes its seed so a cascade
  the user liked can be reproduced exactly.

  The host rewrites `startTime` only, so keyframes travel with their layer and
  nothing is trimmed.

  Author: Dr. Huoston Rodrigues
  Website: https://huoston.art/
  Email: hello@huoston.art
  Version: 0.1.0
  Created: 2026-07-20
  Modified: 2026-07-20
  License: GPL-3.0-or-later
  SPDX-License-Identifier: GPL-3.0-or-later
-->
<script lang="ts">
  import { evalTS } from "../../lib/utils/bolt";
  import { SEQUENCE_ORDERS } from "../../../shared/sequence";
  import type { SequenceOrder } from "../../../shared/sequence";

  let order: SequenceOrder = $state("timeline");
  let offsetFrames: number = $state(2);
  let seed: number = $state(1);

  let feedback: string = $state("");
  let isError: boolean = $state(false);
  let busy: boolean = $state(false);

  const apply = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    isError = false;
    feedback = "Sequencing…";
    try {
      // The number inputs can hand back an empty string as NaN; fall back to a
      // sane value rather than sending garbage across the bridge.
      const frames = Number.isFinite(offsetFrames) ? offsetFrames : 0;
      const s = Number.isFinite(seed) ? Math.floor(seed) : 1;
      const res = await evalTS("sequenceLayers", order, frames, s);
      isError = res.applied === 0;
      feedback = res.message;
    } catch (e: any) {
      isError = true;
      feedback = `Error: ${e?.message ?? String(e)}`;
    } finally {
      busy = false;
    }
  };

  // Re-roll advances the seed rather than randomizing it, so the user can always
  // walk back one step to the arrangement they just saw.
  const reroll = (): void => {
    seed = (Number.isFinite(seed) ? Math.floor(seed) : 1) + 1;
  };
</script>

<div class="htb-seq">
  <div class="htb-seq-row">
    <label class="htb-seq-label" for="htb-seq-offset">Offset</label>
    <input
      id="htb-seq-offset"
      class="htb-seq-input"
      type="number"
      step="1"
      bind:value={offsetFrames}
      disabled={busy}
    />
    <span class="htb-seq-unit">frames</span>
  </div>

  <div class="htb-seq-row">
    <label class="htb-seq-label" for="htb-seq-order">Order</label>
    <select
      id="htb-seq-order"
      class="htb-seq-select"
      bind:value={order}
      disabled={busy}
    >
      {#each SEQUENCE_ORDERS as spec (spec.id)}
        <option value={spec.id}>{spec.label}</option>
      {/each}
    </select>
  </div>

  {#if order === "random"}
    <div class="htb-seq-row">
      <label class="htb-seq-label" for="htb-seq-seed">Seed</label>
      <input
        id="htb-seq-seed"
        class="htb-seq-input"
        type="number"
        step="1"
        bind:value={seed}
        disabled={busy}
      />
      <button
        class="htb-seq-reroll"
        disabled={busy}
        title="Next seed"
        aria-label="Next seed"
        onclick={reroll}
      >
        ⟳
      </button>
    </div>
  {/if}

  <div class="htb-seq-actions">
    <button class="htb-apply" disabled={busy} onclick={apply}>Apply</button>
  </div>

  <p class="htb-feedback" class:htb-error={isError} aria-live="polite">
    {feedback}
  </p>
</div>

<style lang="scss">
  .htb-seq {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .htb-seq-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .htb-seq-label {
    flex: 0 0 42px;
    font-size: 11px;
    color: var(--htb-text-muted, #9a9a9a);
  }

  .htb-seq-input,
  .htb-seq-select {
    appearance: none;
    min-width: 0;
    padding: 4px 6px;
    font-size: 12px;
    font-family: inherit;
    color: var(--htb-text, #e0e0e0);
    background-color: var(--htb-surface, #2a2a2a);
    border: 1px solid var(--htb-border, #3a3a3a);
    border-radius: 3px;
  }

  .htb-seq-input {
    flex: 0 1 62px;
  }

  .htb-seq-select {
    flex: 1 1 auto;
  }

  .htb-seq-input:focus,
  .htb-seq-select:focus {
    outline: none;
    border-color: var(--htb-accent, #2f6fb0);
  }

  .htb-seq-input:disabled,
  .htb-seq-select:disabled {
    opacity: 0.55;
  }

  .htb-seq-unit {
    font-size: 11px;
    color: var(--htb-text-muted, #9a9a9a);
  }

  .htb-seq-reroll {
    appearance: none;
    flex: 0 0 auto;
    padding: 3px 7px;
    font-size: 12px;
    line-height: 1;
    color: var(--htb-text, #e0e0e0);
    background-color: var(--htb-surface, #2a2a2a);
    border: 1px solid var(--htb-border, #3a3a3a);
    border-radius: 3px;
    cursor: pointer;
    user-select: none;
  }

  .htb-seq-reroll:hover:not(:disabled) {
    background-color: var(--htb-surface-hover, #333333);
    border-color: var(--htb-accent, #2f6fb0);
  }

  .htb-seq-reroll:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .htb-seq-actions {
    margin-top: 2px;
  }

  .htb-apply {
    appearance: none;
    padding: 6px 16px;
    font-size: 12px;
    font-weight: 600;
    color: var(--htb-text, #e0e0e0);
    background-color: var(--htb-accent, #2f6fb0);
    border: 1px solid var(--htb-accent, #2f6fb0);
    border-radius: 4px;
    cursor: pointer;
    user-select: none;
  }

  .htb-apply:hover:not(:disabled) {
    filter: brightness(1.12);
  }

  .htb-apply:disabled {
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
