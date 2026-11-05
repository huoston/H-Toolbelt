<!--
  H-Toolbelt — one tool's section: heading, help card, controls.

  The card sits in the flow, under the heading and above the controls, rather than
  floating over them: an overlay would be cut off in a narrow docked panel, and
  here it can stay open beside the controls it explains. It stays mounted and is
  toggled with `hidden`, like the tab panels. Each section keeps its own state, so
  several cards can be open at once.

  Opening moves focus into the card, because Escape only closes it from inside.
  Closing returns focus to the info button, so keyboard users do not lose their
  place when the element that held focus disappears.

  Author: Dr. Huoston Rodrigues
  Website: https://huoston.art/
  Email: hello@huoston.art
  Version: 0.2.0
  Created: 2026-11-05
  Modified: 2026-11-05
  License: GPL-3.0-or-later
  SPDX-License-Identifier: GPL-3.0-or-later
-->
<script lang="ts">
  import { tick } from "svelte";
  import type { Snippet } from "svelte";
  import Icon from "./icons/Icon.svelte";
  import type { HelpEntry } from "./help";

  let {
    title,
    help,
    children,
  }: {
    title: string;
    help: HelpEntry;
    children: Snippet;
  } = $props();

  const uid = $props.id();
  const cardId = `${uid}-help`;

  let open: boolean = $state(false);
  let infoButton: HTMLButtonElement | undefined = $state();
  let card: HTMLDivElement | undefined = $state();

  const show = async (): Promise<void> => {
    open = true;
    await tick();
    card?.focus();
  };

  const hide = (): void => {
    open = false;
    infoButton?.focus();
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      hide();
    }
  };
</script>

<section class="htb-tool">
  <div class="htb-tool-head">
    <h2 class="htb-tool-name">{title}</h2>
    <button
      bind:this={infoButton}
      class="htb-tool-info"
      class:htb-tool-info-open={open}
      type="button"
      title="How to use {title}"
      aria-label="How to use {title}"
      aria-expanded={open}
      aria-controls={cardId}
      onclick={() => (open ? hide() : show())}
    >
      <Icon name="info" size={15} />
    </button>
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
  <div
    bind:this={card}
    id={cardId}
    class="htb-tool-help"
    role="region"
    aria-label="How to use {title}"
    tabindex="-1"
    hidden={!open}
    onkeydown={onKeydown}
  >
    <button
      class="htb-tool-help-close"
      type="button"
      title="Close help"
      aria-label="Close help"
      onclick={hide}
    >
      <Icon name="close" size={14} />
    </button>

    <p class="htb-tool-help-summary">{help.summary}</p>

    <h3 class="htb-tool-help-heading">How to use</h3>
    <ol class="htb-tool-help-list">
      {#each help.steps as step, i (i)}
        <li>{step}</li>
      {/each}
    </ol>

    {#if help.terms}
      <h3 class="htb-tool-help-heading">Options</h3>
      <dl class="htb-tool-help-terms">
        {#each help.terms as item (item.term)}
          <dt>{item.term}</dt>
          <dd>{item.text}</dd>
        {/each}
      </dl>
    {/if}

    <h3 class="htb-tool-help-heading">Good to know</h3>
    <ul class="htb-tool-help-list">
      {#each help.notes as note, i (i)}
        <li>{note}</li>
      {/each}
    </ul>
  </div>

  {@render children()}
</section>

<style lang="scss">
  .htb-tool-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .htb-tool-name {
    margin: 0;
    min-width: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--htb-text-muted, #9a9a9a);
  }

  // The vertical margins keep the row at the height of the title, so the button
  // does not push the controls down. The clickable area stays the same size.
  .htb-tool-info {
    appearance: none;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    margin: -6px 0 -6px 8px;
    padding: 4px;
    color: var(--htb-text-muted, #9a9a9a);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    transition:
      color 0.12s ease,
      border-color 0.12s ease;
  }

  .htb-tool-info:hover {
    color: var(--htb-text, #e0e0e0);
    border-color: var(--htb-border, #3a3a3a);
  }

  .htb-tool-info.htb-tool-info-open {
    color: var(--htb-accent, #2f6fb0);
  }

  .htb-tool-info:focus-visible {
    outline: 1px solid var(--htb-accent, #2f6fb0);
    outline-offset: 1px;
  }

  // No `display` here: it would override the `hidden` attribute.
  .htb-tool-help {
    margin-bottom: 8px;
    padding: 8px 10px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--htb-text, #e0e0e0);
    background-color: var(--htb-surface, #2a2a2a);
    border: 1px solid var(--htb-border, #3a3a3a);
    border-radius: 4px;
  }

  .htb-tool-help:focus {
    outline: none;
  }

  .htb-tool-help-close {
    appearance: none;
    float: right;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: -4px -6px 2px 6px;
    padding: 2px;
    color: var(--htb-text-muted, #9a9a9a);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
  }

  .htb-tool-help-close:hover {
    color: var(--htb-text, #e0e0e0);
    border-color: var(--htb-border, #3a3a3a);
  }

  .htb-tool-help-close:focus-visible {
    outline: 1px solid var(--htb-accent, #2f6fb0);
    outline-offset: 1px;
  }

  .htb-tool-help-summary {
    margin: 0;
  }

  .htb-tool-help-heading {
    margin: 8px 0 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--htb-text-muted, #9a9a9a);
  }

  .htb-tool-help-list {
    margin: 0;
    padding-left: 16px;
  }

  .htb-tool-help-list > li + li {
    margin-top: 2px;
  }

  .htb-tool-help-terms {
    margin: 0;
  }

  .htb-tool-help-terms > dt {
    font-weight: 700;
  }

  .htb-tool-help-terms > dd {
    margin: 0;
  }

  .htb-tool-help-terms > dd + dt {
    margin-top: 3px;
  }
</style>
