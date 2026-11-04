<!--
  H-Toolbelt — One-Click Expression Effects (the Dynamics section).

  Each card writes a generated bounce or elastic expression onto the selected
  properties as soon as it is clicked; Clear removes expressions again. The three
  knobs are baked into each preset and into the generated text rather than exposed
  as Expression Controls, so the layer stays clean.

  The host refuses properties that already carry an expression, that have fewer
  than two keyframes, or whose type the math does not cover; those refusals
  surface verbatim in the feedback line.

  Author: Dr. Huoston Rodrigues
  Website: https://huoston.art/
  Email: hello@huoston.art
  Version: 0.1.0
  Created: 2026-07-20
  Modified: 2026-11-05
  License: GPL-3.0-or-later
  SPDX-License-Identifier: GPL-3.0-or-later
-->
<script lang="ts">
  import { evalTS } from "../../lib/utils/bolt";
  import { DYNAMICS_PRESETS } from "../../../shared/dynamics";
  import type { DynamicsPreset } from "../../../shared/dynamics";
  import EasingCard from "./EasingCard.svelte";

  let feedback: string = $state("");
  let isError: boolean = $state(false);
  let busy: boolean = $state(false);

  const apply = async (p: DynamicsPreset): Promise<void> => {
    if (busy) return;
    busy = true;
    isError = false;
    feedback = "Applying…";
    try {
      const res = await evalTS(
        "applyExpression",
        p.kind,
        p.amplitude,
        p.frequency,
        p.decay
      );
      isError = res.applied === 0;
      feedback = res.message;
    } catch (e: any) {
      isError = true;
      feedback = `Error: ${e?.message ?? String(e)}`;
    } finally {
      busy = false;
    }
  };

  const clear = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    isError = false;
    feedback = "Clearing…";
    try {
      const res = await evalTS("clearExpressions");
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

<div class="htb-expr">
  <div class="htb-ease-grid">
    {#each DYNAMICS_PRESETS as preset (preset.id)}
      <EasingCard dynamics={preset} disabled={busy} onselect={apply} />
    {/each}
  </div>

  <div class="htb-expr-actions">
    <button
      class="htb-expr-clear"
      disabled={busy}
      title="Remove expressions from the selected properties"
      onclick={clear}>Clear</button
    >
  </div>

  <p class="htb-feedback" class:htb-error={isError} aria-live="polite">
    {feedback}
  </p>
</div>

<style lang="scss">
  .htb-expr {
    min-width: 0;
  }

  // Same grid as the Easings library. Svelte scopes styles per component, so the
  // rule has to be repeated here for the class to apply.
  .htb-ease-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    grid-gap: 5px;
    gap: 5px;
  }

  .htb-expr-actions {
    margin-top: 8px;
  }

  .htb-expr-clear {
    appearance: none;
    padding: 6px 16px;
    font-size: 12px;
    font-weight: 500;
    color: var(--htb-text, #e0e0e0);
    background-color: var(--htb-surface, #2a2a2a);
    border: 1px solid var(--htb-border, #3a3a3a);
    border-radius: 4px;
    cursor: pointer;
    user-select: none;
  }

  .htb-expr-clear:hover:not(:disabled) {
    background-color: var(--htb-surface-hover, #333333);
    border-color: var(--htb-accent, #2f6fb0);
  }

  .htb-expr-clear:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .htb-feedback {
    min-height: 1.2em;
    margin: 6px 0 0;
    font-size: 11px;
    color: var(--htb-text-muted, #9a9a9a);
  }

  .htb-feedback.htb-error {
    // Fixed warm tone stays readable on both light and dark AE themes.
    color: #e0654f;
  }
</style>
