<!--
  H-Toolbelt — Smart Anchor Point Control.

  A 3x3 grid of the nine canonical bounding-box anchor points. Clicking one
  applies immediately via a typed evalTS call to the host, which moves the anchor
  and compensates `position` through the transform matrix.

  One grid handles every layer. The host detects animation itself and branches
  internally: a static layer gets a single compensating position write and does
  not move on screen; an animated one has its whole position track shifted by the
  same vector, so the motion path keeps its shape and its eases while rotation
  and scale start pivoting around the new point. This used to be two sections —
  Anchor Point and Re-pivot — which forced the user to know in advance whether
  their layer was animated in order to pick the right grid. That is the tool's
  job, not theirs.

  The host still refuses what it cannot express: an expression on position, a
  keyframed anchor, separated position dimensions, rotated 3D layers, and layers
  with no usable bounds. Those refusals surface verbatim in the feedback line.

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
  import { ANCHOR_POINTS } from "../../../shared/anchor";

  let feedback: string = $state("");
  let isError: boolean = $state(false);
  let busy: boolean = $state(false);

  const setAnchor = async (pointId: string): Promise<void> => {
    if (busy) return;
    busy = true;
    isError = false;
    feedback = "Applying…";
    try {
      const res = await evalTS("setAnchorPoint", pointId);
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

<div class="htb-anchor">
  <p class="htb-anchor-hint">
    Move the layer anchor. Animated layers keep their motion path automatically.
  </p>

  <div class="htb-anchor-grid">
    {#each ANCHOR_POINTS as point (point.id)}
      <button
        class="htb-anchor-cell"
        class:htb-anchor-center={point.id === "center"}
        disabled={busy}
        title={point.id}
        aria-label={point.id}
        onclick={() => setAnchor(point.id)}
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
  .htb-anchor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }

  .htb-anchor-hint {
    margin: 0;
    font-size: 10px;
    line-height: 1.35;
    color: var(--htb-text-muted, #9a9a9a);
    opacity: 0.85;
  }

  .htb-anchor-grid {
    display: grid;
    grid-template-columns: repeat(3, 34px);
    grid-template-rows: repeat(3, 34px);
    gap: 4px;
  }

  .htb-anchor-cell {
    appearance: none;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    font-size: 13px;
    line-height: 1;
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

  .htb-anchor-cell:hover:not(:disabled) {
    background-color: var(--htb-surface-hover, #333333);
    border-color: var(--htb-accent, #2f6fb0);
  }

  .htb-anchor-cell:active:not(:disabled) {
    background-color: var(--htb-accent, #2f6fb0);
  }

  .htb-anchor-cell:disabled {
    opacity: 0.55;
    cursor: default;
  }

  // The centre point is the most-used target; give it a subtle lift.
  .htb-anchor-cell.htb-anchor-center {
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
