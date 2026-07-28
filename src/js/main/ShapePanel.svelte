<!--
  H-Toolbelt — Shape Layer Magic (v1).

  Cleanup for Illustrator/SVG imports. Both operations are pure deletion, so the
  panel offers them separately and together: Remove empty, Remove artboard, and
  Clean all, which runs both as a single undoable step.

  WHY THERE IS NO FLATTEN BUTTON: collapsing identity-transform wrapper groups
  needs to move a property group to a new parent, and ExtendScript has no such
  call — `parentProperty` is readonly, `moveTo` reorders within the existing
  parent, and rebuilding by hand cannot carry gradients, keyframes or
  expressions across. The note below says so in the panel rather than leaving a
  dead control the user would keep clicking. See src/jsx/aeft/shape.ts.

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
  import { evalTS } from "../lib/utils/bolt";

  let feedback: string = $state("");
  let isError: boolean = $state(false);
  let busy: boolean = $state(false);

  // The three host calls this panel can make. Named so the smoke test's import
  // scan and the reader see the same list the buttons render.
  type ShapeAction = "removeEmptyGroups" | "removeArtboardRect" | "cleanAll";

  const ACTIONS: Array<{ id: ShapeAction; label: string; title: string }> = [
    {
      id: "removeEmptyGroups",
      label: "Remove empty",
      title: "Delete groups that contain nothing which can draw.",
    },
    {
      id: "removeArtboardRect",
      label: "Remove artboard",
      title:
        "Delete the comp-sized backdrop rectangle left by an Illustrator import.",
    },
    {
      id: "cleanAll",
      label: "Clean all",
      title: "Run both cleanups as a single undoable step.",
    },
  ];

  const run = async (action: ShapeAction): Promise<void> => {
    if (busy) return;
    busy = true;
    isError = false;
    feedback = "Cleaning…";
    try {
      const res = await evalTS(action);
      // A run that removed nothing is a normal outcome for a clean layer, not
      // an error — only a refusal (no comp, no shape layer) reads as one.
      isError = res.applied === 0 && /^(Open a composition|Select one)/.test(res.message);
      feedback = res.message;
    } catch (e: any) {
      isError = true;
      feedback = `Error: ${e?.message ?? String(e)}`;
    } finally {
      busy = false;
    }
  };
</script>

<div class="htb-shape">
  <div class="htb-shape-actions">
    {#each ACTIONS as action (action.id)}
      <button
        class="htb-shape-btn"
        class:htb-shape-primary={action.id === "cleanAll"}
        disabled={busy}
        title={action.title}
        onclick={() => run(action.id)}
      >
        {action.label}
      </button>
    {/each}
  </div>

  <p class="htb-shape-note">
    Flatten is not in this version: After Effects' scripting API cannot move a
    shape group to a new parent without losing gradients and keyframes.
  </p>

  <p class="htb-feedback" class:htb-error={isError} aria-live="polite">
    {feedback}
  </p>
</div>

<style lang="scss">
  .htb-shape {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  // Buttons share a row and wrap to a stack on a narrow docked panel.
  .htb-shape-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .htb-shape-btn {
    appearance: none;
    flex: 1 1 96px;
    min-width: 0;
    padding: 7px 8px;
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

  .htb-shape-btn:hover:not(:disabled) {
    background-color: var(--htb-surface-hover, #333333);
    border-color: var(--htb-accent, #2f6fb0);
  }

  .htb-shape-btn:active:not(:disabled) {
    background-color: var(--htb-accent, #2f6fb0);
  }

  .htb-shape-btn:disabled {
    opacity: 0.55;
    cursor: default;
  }

  // "Clean all" is the button most users want; the accent border marks it
  // without making the other two look disabled.
  .htb-shape-btn.htb-shape-primary {
    font-weight: 600;
    border-color: var(--htb-accent, #2f6fb0);
  }

  .htb-shape-note {
    margin: 0;
    font-size: 10px;
    line-height: 1.35;
    color: var(--htb-text-muted, #9a9a9a);
    opacity: 0.85;
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
