<!--
  H-Toolbelt — Easings.

  Cubic-bezier preset buttons load a curve into the draggable CurveEditor; Apply
  sends the editor's current curve (preset or hand-tuned) to the native temporal
  ease engine via a typed evalTS call.

  Extracted verbatim from main.svelte when the panel moved to tabs. The logic,
  the evalTS call and the feedback wording are unchanged — only the markup's
  address in the tree is different. The styles came along because Svelte scopes
  them per component: left in the parent they would simply stop applying.

  Author: Dr. Huoston Rodrigues
  Website: https://huoston.art/
  Email: hello@huoston.art
  Version: 0.2.0
  Created: 2026-07-09
  Modified: 2026-07-28
  License: GPL-3.0-or-later
  SPDX-License-Identifier: GPL-3.0-or-later
-->
<script lang="ts">
  import { evalTS } from "../../lib/utils/bolt";
  import { EASING_PRESETS } from "../../../shared/easing";
  import type { Bezier, EasingPreset } from "../../../shared/easing";
  import CurveEditor from "../CurveEditor.svelte";

  // Local alias for the preset list, iterated by the markup below.
  //
  // This started life as a workaround for TypeScript's import elision (P02a):
  // svelte-preprocess transpiles each <script> block in isolation, so an import
  // referenced only in the template looked unused and was dropped. That class of
  // bug is now killed structurally by `verbatimModuleSyntax: true` in the UI
  // tsconfig, so this alias is no longer load-bearing — it is kept purely as a
  // readable local. Do not reintroduce per-symbol guards for new imports.
  const presets = EASING_PRESETS;

  // The live curve shared with the editor. Presets load into it; drags flow back
  // through the binding; Apply reads it. Starts on the first preset.
  //
  // This state is why tab panels stay mounted: a hand-tuned curve must survive a
  // trip to another tab, and an {#if} would silently reset it to the preset.
  let bezier: Bezier = $state([...presets[0].bezier]);

  let feedback: string = $state("");
  let isError: boolean = $state(false);
  let busy: boolean = $state(false);

  // Highlight the preset whose curve exactly matches the editor; dragging away
  // from a preset clears the highlight automatically.
  const activeLabel = $derived(
    presets.find(
      (p) =>
        p.bezier[0] === bezier[0] &&
        p.bezier[1] === bezier[1] &&
        p.bezier[2] === bezier[2] &&
        p.bezier[3] === bezier[3]
    )?.label ?? null
  );

  // Clicking a preset loads its curve into the editor (handles jump); it does
  // not apply. A fresh copy keeps the preset constant immutable under drags.
  const loadPreset = (preset: EasingPreset): void => {
    bezier = [...preset.bezier];
  };

  const apply = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    isError = false;
    feedback = "Applying…";
    try {
      const res = await evalTS("applyEasing", bezier);
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

<!-- The curve editor is a fixed square; the presets and Apply sit beside it and
     wrap underneath on a narrow panel instead of leaving dead space. -->
<div class="htb-easings">
  <CurveEditor bind:bezier />

  <div class="htb-easings-side">
    <div class="htb-grid">
      {#each presets as preset (preset.label)}
        <button
          class="htb-preset"
          class:htb-active={activeLabel === preset.label}
          onclick={() => loadPreset(preset)}
        >
          {preset.label}
        </button>
      {/each}
    </div>

    <div class="htb-actions">
      <button class="htb-apply" disabled={busy} onclick={apply}>Apply</button>
    </div>
  </div>
</div>

<p class="htb-feedback" class:htb-error={isError} aria-live="polite">
  {feedback}
</p>

<style lang="scss">
  .htb-easings {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-start;
  }

  .htb-easings-side {
    flex: 1 1 150px;
    min-width: 150px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .htb-grid {
    display: grid;
    // Fills the column beside the editor, collapsing to one per row when the
    // panel is docked narrow.
    grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
    gap: 6px;
  }

  .htb-preset {
    appearance: none;
    padding: 8px 6px;
    font-size: 12px;
    font-weight: 500;
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

  .htb-preset:hover:not(:disabled) {
    background-color: var(--htb-surface-hover, #333333);
    border-color: var(--htb-accent, #2f6fb0);
  }

  .htb-preset:active:not(:disabled) {
    background-color: var(--htb-accent, #2f6fb0);
  }

  .htb-preset:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .htb-preset.htb-active {
    border-color: var(--htb-accent, #2f6fb0);
    background-color: var(--htb-surface-hover, #333333);
  }

  .htb-actions {
    // Spacing comes from the side column's flex gap.
    margin-top: 0;
  }

  .htb-apply {
    appearance: none;
    padding: 8px 18px;
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
    margin: 10px 0 0;
    font-size: 11px;
    color: var(--htb-text-muted, #9a9a9a);
  }

  .htb-feedback.htb-error {
    // Fixed warm tone stays readable on both light and dark AE themes.
    color: #e0654f;
  }
</style>
