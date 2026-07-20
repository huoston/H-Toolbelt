<!--
  H-Toolbelt — One-Click Expression Effects.

  Bounce and Elastic write a generated expression onto the selected properties;
  Clear removes expressions again. The three knobs are baked into the generated
  text rather than exposed as Expression Controls, so the layer stays clean.

  Each effect keeps its own parameter set: switching between Bounce and Elastic
  restores that effect's values instead of carrying the other one's tuning over,
  which would silently change what the button does.

  The host refuses properties that already carry an expression, that have fewer
  than two keyframes, or whose type the math does not cover; those refusals
  surface verbatim in the feedback line.

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
  import { evalTS } from "../lib/utils/bolt";
  import {
    EXPRESSION_DEFAULTS,
    EXPRESSION_KINDS,
  } from "../../shared/expressions";
  import type { ExpressionKind, ExpressionParams } from "../../shared/expressions";

  // One parameter set per effect, seeded from the shared defaults. Copies, so
  // edits here never mutate the shared constant.
  let params: { bounce: ExpressionParams; elastic: ExpressionParams } = $state({
    bounce: { ...EXPRESSION_DEFAULTS.bounce },
    elastic: { ...EXPRESSION_DEFAULTS.elastic },
  });

  // Which effect's parameters the inputs are currently editing.
  let kind: ExpressionKind = $state("bounce");

  let feedback: string = $state("");
  let isError: boolean = $state(false);
  let busy: boolean = $state(false);

  /** Guard the bridge against an empty numeric input arriving as NaN. */
  const num = (v: number, fallback: number): number =>
    Number.isFinite(v) ? v : fallback;

  const apply = async (next: ExpressionKind): Promise<void> => {
    if (busy) return;
    kind = next;
    busy = true;
    isError = false;
    feedback = "Applying…";
    try {
      const p = params[next];
      const d = EXPRESSION_DEFAULTS[next];
      const res = await evalTS(
        "applyExpression",
        next,
        num(p.amplitude, d.amplitude),
        num(p.frequency, d.frequency),
        num(p.decay, d.decay)
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
  <div class="htb-expr-kinds">
    {#each EXPRESSION_KINDS as spec (spec.id)}
      <button
        class="htb-expr-kind"
        class:htb-active={kind === spec.id}
        disabled={busy}
        onclick={() => apply(spec.id)}
      >
        {spec.label}
      </button>
    {/each}
  </div>

  <div class="htb-expr-params">
    <div class="htb-expr-field">
      <label class="htb-expr-label" for="htb-expr-amp">Amp</label>
      <input
        id="htb-expr-amp"
        class="htb-expr-input"
        type="number"
        step="0.01"
        bind:value={params[kind].amplitude}
        disabled={busy}
      />
    </div>

    <div class="htb-expr-field">
      <label class="htb-expr-label" for="htb-expr-freq">Freq</label>
      <input
        id="htb-expr-freq"
        class="htb-expr-input"
        type="number"
        step="0.1"
        bind:value={params[kind].frequency}
        disabled={busy}
      />
    </div>

    <div class="htb-expr-field">
      <label class="htb-expr-label" for="htb-expr-decay">Decay</label>
      <input
        id="htb-expr-decay"
        class="htb-expr-input"
        type="number"
        step="0.5"
        bind:value={params[kind].decay}
        disabled={busy}
      />
    </div>
  </div>

  <div class="htb-expr-actions">
    <button class="htb-expr-clear" disabled={busy} onclick={clear}>Clear</button>
  </div>

  <p class="htb-feedback" class:htb-error={isError} aria-live="polite">
    {feedback}
  </p>
</div>

<style lang="scss">
  .htb-expr {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .htb-expr-kinds {
    display: flex;
    gap: 6px;
  }

  .htb-expr-kind {
    appearance: none;
    flex: 1 1 auto;
    padding: 7px 8px;
    font-size: 12px;
    font-weight: 600;
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

  .htb-expr-kind:hover:not(:disabled) {
    background-color: var(--htb-surface-hover, #333333);
    border-color: var(--htb-accent, #2f6fb0);
  }

  .htb-expr-kind:active:not(:disabled) {
    background-color: var(--htb-accent, #2f6fb0);
  }

  // Marks whose parameters the inputs below are editing, not a pending action:
  // the buttons apply on click, they do not arm.
  .htb-expr-kind.htb-active {
    border-color: var(--htb-accent, #2f6fb0);
    background-color: var(--htb-surface-hover, #333333);
  }

  .htb-expr-kind:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .htb-expr-params {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .htb-expr-field {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1 1 88px;
    min-width: 0;
  }

  .htb-expr-label {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--htb-text-muted, #9a9a9a);
  }

  .htb-expr-input {
    appearance: none;
    flex: 1 1 44px;
    min-width: 0;
    padding: 4px 6px;
    font-size: 12px;
    font-family: inherit;
    color: var(--htb-text, #e0e0e0);
    background-color: var(--htb-surface, #2a2a2a);
    border: 1px solid var(--htb-border, #3a3a3a);
    border-radius: 3px;
  }

  .htb-expr-input:focus {
    outline: none;
    border-color: var(--htb-accent, #2f6fb0);
  }

  .htb-expr-input:disabled {
    opacity: 0.55;
  }

  .htb-expr-actions {
    margin-top: 2px;
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
    margin: 0;
    font-size: 11px;
    color: var(--htb-text-muted, #9a9a9a);
  }

  .htb-feedback.htb-error {
    // Fixed warm tone stays readable on both light and dark AE themes.
    color: #e0654f;
  }
</style>
