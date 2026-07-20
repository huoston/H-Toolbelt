<!--
  H-Toolbelt — main panel.

  Hosts the Easings tool: cubic-bezier preset buttons load a curve into the
  draggable CurveEditor; Apply sends the editor's current curve (preset or
  hand-tuned) to the native temporal-ease engine via a typed evalTS call.

  Boot hardening: the UI renders from CSS custom properties that already carry
  fixed dark fallbacks (also set by boot-guard), so it mounts with or without the
  AE theme. Theming is applied lazily and defensively in onMount. Mount-time
  errors are surfaced by the window error handlers and the mount() try/catch in
  index-svelte.ts, routed to the plain-DOM renderer in boot-guard — no
  <svelte:boundary>, which masks mount-time errors in CEP's CEF.

  Author: Dr. Huoston Rodrigues
  Website: https://huoston.art/
  Email: hello@huoston.art
  Version: 0.1.0
  Created: 2026-07-09
  Modified: 2026-07-10
  License: GPL-3.0-or-later
  SPDX-License-Identifier: GPL-3.0-or-later
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { evalTS } from "../lib/utils/bolt";
  import { EASING_PRESETS } from "../../shared/easing";
  import type { Bezier, EasingPreset } from "../../shared/easing";
  import CurveEditor from "./CurveEditor.svelte";
  import { initAeTheme } from "./theme";
  import "../index.scss";
  import "./main.scss";

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

  onMount(() => {
    // Theming is optional enrichment; failure must not blank the panel.
    try {
      initAeTheme();
    } catch (e) {
      console.error("initAeTheme failed", e);
    }
  });
</script>

<main class="htb">
  <header class="htb-head">
    <h1 class="htb-title">H-Toolbelt</h1>
  </header>

  <section class="htb-tool">
    <h2 class="htb-tool-name">Easings</h2>
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

    <CurveEditor bind:bezier />

    <div class="htb-actions">
      <button class="htb-apply" disabled={busy} onclick={apply}>Apply</button>
    </div>

    <p class="htb-feedback" class:htb-error={isError} aria-live="polite">
      {feedback}
    </p>
  </section>
</main>

<style lang="scss">
  .htb {
    box-sizing: border-box;
    min-height: 100vh;
    padding: 12px 14px;
    background-color: var(--htb-bg, #1e1e1e);
    color: var(--htb-text, #e0e0e0);
    font-size: 12px;
  }

  .htb-head {
    margin-bottom: 10px;
  }

  .htb-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .htb-tool-name {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--htb-text-muted, #9a9a9a);
  }

  .htb-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
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
    margin-top: 10px;
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
