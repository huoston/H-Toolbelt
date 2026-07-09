<!--
  H-Toolbelt — main panel.

  Hosts the Easings tool: a grid of cubic-bezier preset buttons that apply native
  temporal ease to the selected keyframes via a typed evalTS call to the host.

  Author: Dr. Huoston Rodrigues
  Website: https://huoston.art/
  Email: hello@huoston.art
  Version: 0.1.0
  Created: 2026-07-09
  Modified: 2026-07-09
  License: GPL-3.0-or-later
  SPDX-License-Identifier: GPL-3.0-or-later
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { evalTS } from "../lib/utils/bolt";
  import { EASING_PRESETS, type Bezier } from "../../shared/easing";
  import { initAeTheme } from "./theme";
  import "../index.scss";
  import "./main.scss";

  let feedback: string = $state("");
  let isError: boolean = $state(false);
  let busy: boolean = $state(false);

  const applyPreset = async (label: string, bezier: Bezier) => {
    if (busy) return;
    busy = true;
    isError = false;
    feedback = `Applying ${label}…`;
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
    initAeTheme();
  });
</script>

<main class="htb">
  <header class="htb-head">
    <h1 class="htb-title">H-Toolbelt</h1>
  </header>

  <section class="htb-tool">
    <h2 class="htb-tool-name">Easings</h2>
    <div class="htb-grid">
      {#each EASING_PRESETS as preset (preset.label)}
        <button
          class="htb-preset"
          disabled={busy}
          onclick={() => applyPreset(preset.label, preset.bezier)}
        >
          {preset.label}
        </button>
      {/each}
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
    background-color: var(--htb-bg, #282c34);
    color: var(--htb-fg, #d8dbe0);
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
    color: var(--htb-muted, #8a8f98);
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
    color: var(--htb-fg, #d8dbe0);
    background-color: var(--htb-surface, #333842);
    border: 1px solid var(--htb-border, #3f4550);
    border-radius: 4px;
    cursor: pointer;
    user-select: none;
    transition:
      background-color 0.12s ease,
      border-color 0.12s ease;
  }

  .htb-preset:hover:not(:disabled) {
    background-color: var(--htb-surface-hover, #3d434f);
    border-color: var(--htb-accent, #2063a0);
  }

  .htb-preset:active:not(:disabled) {
    background-color: var(--htb-accent, #2063a0);
  }

  .htb-preset:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .htb-feedback {
    min-height: 1.2em;
    margin: 10px 0 0;
    font-size: 11px;
    color: var(--htb-muted, #8a8f98);
  }

  .htb-feedback.htb-error {
    // Fixed warm tone stays readable on both light and dark AE themes.
    color: #e0654f;
  }
</style>
