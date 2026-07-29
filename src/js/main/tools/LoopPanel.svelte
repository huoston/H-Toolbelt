<!--
  H-Toolbelt — Loop Creator.

  Applies one of After Effects' four native loop expressions to the selected
  properties, in either direction, optionally over the last N keyframes.

  Clear calls the *existing* `clearExpressions` host function rather than a loop
  specific one: removing an expression does not depend on which tool wrote it,
  so a second implementation would only be a second thing to keep in step. It
  also means Clear here removes bounce and elastic expressions too, which is the
  same behaviour the Expressions panel already has.

  The keyframe count is disabled for Continue, because that mode extrapolates
  from the last keyframe's velocity rather than replaying a segment — the count
  has nothing to apply to, and the generator omits the argument entirely.

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
  import {
    DEFAULT_LOOP_DIR,
    DEFAULT_LOOP_KEYFRAMES,
    DEFAULT_LOOP_TYPE,
    LOOP_DIRECTIONS,
    LOOP_TYPES,
    usesKeyframeCount,
  } from "../../../shared/loop";
  import type { LoopDir, LoopType } from "../../../shared/loop";

  let loopType: LoopType = $state(DEFAULT_LOOP_TYPE);
  let direction: LoopDir = $state(DEFAULT_LOOP_DIR);
  let keyframes: number = $state(DEFAULT_LOOP_KEYFRAMES);

  let feedback: string = $state("");
  let isError: boolean = $state(false);
  let busy: boolean = $state(false);

  // Continue extrapolates rather than replaying a segment, so the count has
  // nothing to act on. Mirrors what the generator does with the argument.
  const countApplies = $derived(usesKeyframeCount(loopType));

  /** Guard the bridge against an empty numeric input arriving as NaN. */
  const num = (v: number): number =>
    Number.isFinite(v) ? v : DEFAULT_LOOP_KEYFRAMES;

  const apply = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    isError = false;
    feedback = "Applying…";
    try {
      const res = await evalTS(
        "applyLoop",
        loopType,
        direction,
        num(keyframes)
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

<div class="htb-loop">
  <div class="htb-loop-types">
    {#each LOOP_TYPES as spec (spec.id)}
      <button
        class="htb-loop-type"
        class:htb-active={loopType === spec.id}
        disabled={busy}
        title={spec.title}
        aria-pressed={loopType === spec.id}
        onclick={() => (loopType = spec.id)}
      >
        {spec.label}
      </button>
    {/each}
  </div>

  <div class="htb-loop-row">
    <div class="htb-loop-dirs" role="group" aria-label="Loop direction">
      {#each LOOP_DIRECTIONS as spec (spec.id)}
        <button
          class="htb-loop-dir"
          class:htb-active={direction === spec.id}
          disabled={busy}
          title={spec.title}
          aria-pressed={direction === spec.id}
          onclick={() => (direction = spec.id)}
        >
          {spec.label}
        </button>
      {/each}
    </div>

    <div class="htb-loop-field">
      <label class="htb-loop-label" for="htb-loop-keys">Keys</label>
      <input
        id="htb-loop-keys"
        class="htb-loop-input"
        type="number"
        min="0"
        step="1"
        title="Number of keyframes to loop over. 0 uses all of them."
        bind:value={keyframes}
        disabled={busy || !countApplies}
      />
    </div>
  </div>

  <div class="htb-loop-actions">
    <button
      class="htb-loop-apply"
      disabled={busy}
      title="Write the loop expression onto the selected properties"
      onclick={apply}>Apply</button
    >
    <button
      class="htb-loop-clear"
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
  .htb-loop {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  // Four modes; two per row on a narrow docked panel rather than four cramped
  // ones or a horizontal scroll.
  .htb-loop-types {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
    gap: 6px;
  }

  .htb-loop-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .htb-loop-dirs {
    display: flex;
    gap: 6px;
    flex: 1 1 auto;
  }

  .htb-loop-type,
  .htb-loop-dir {
    appearance: none;
    flex: 1 1 auto;
    min-width: 0;
    padding: 7px 8px;
    font-size: 12px;
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

  .htb-loop-type:hover:not(:disabled),
  .htb-loop-dir:hover:not(:disabled) {
    background-color: var(--htb-surface-hover, #333333);
    border-color: var(--htb-accent, #2f6fb0);
  }

  // These buttons arm a choice rather than acting, so the active state marks a
  // selection the Apply button will use — unlike the Expressions panel, where
  // clicking the effect applies it.
  .htb-loop-type.htb-active,
  .htb-loop-dir.htb-active {
    border-color: var(--htb-accent, #2f6fb0);
    background-color: var(--htb-surface-hover, #333333);
    font-weight: 600;
  }

  .htb-loop-type:disabled,
  .htb-loop-dir:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .htb-loop-field {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 0 1 96px;
    min-width: 0;
  }

  .htb-loop-label {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--htb-text-muted, #9a9a9a);
  }

  .htb-loop-input {
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

  .htb-loop-input:focus {
    outline: none;
    border-color: var(--htb-accent, #2f6fb0);
  }

  .htb-loop-input:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .htb-loop-actions {
    display: flex;
    gap: 6px;
    margin-top: 2px;
  }

  .htb-loop-apply {
    appearance: none;
    padding: 6px 18px;
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    color: var(--htb-text, #e0e0e0);
    background-color: var(--htb-accent, #2f6fb0);
    border: 1px solid var(--htb-accent, #2f6fb0);
    border-radius: 4px;
    cursor: pointer;
    user-select: none;
  }

  .htb-loop-apply:hover:not(:disabled) {
    filter: brightness(1.12);
  }

  .htb-loop-clear {
    appearance: none;
    padding: 6px 16px;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    color: var(--htb-text, #e0e0e0);
    background-color: var(--htb-surface, #2a2a2a);
    border: 1px solid var(--htb-border, #3a3a3a);
    border-radius: 4px;
    cursor: pointer;
    user-select: none;
  }

  .htb-loop-clear:hover:not(:disabled) {
    background-color: var(--htb-surface-hover, #333333);
    border-color: var(--htb-accent, #2f6fb0);
  }

  .htb-loop-apply:disabled,
  .htb-loop-clear:disabled {
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
