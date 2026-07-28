<!--
  H-Toolbelt — tab bar.

  Renders the tab buttons from the shared TABS list and reports the selection
  back through a bindable prop. It owns no panel content: the panels live in
  main.svelte and all of them stay mounted, so this component's only job is
  saying which one is on top.

  Keyboard handling follows the WAI-ARIA tabs pattern: a roving tabindex (only
  the selected tab is in the tab order), arrows to move between tabs, Home/End
  for the ends. Focus follows selection, which is the expected behaviour for a
  tablist whose panels are already rendered — there is nothing to wait for.

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
  import { TABS, tabButtonId, tabPanelId } from "./tabs";
  import type { TabId } from "./tabs";

  let { active = $bindable() }: { active: TabId } = $props();

  const tabs = TABS;

  /** Select a tab and move focus onto it, so the two never disagree. */
  const focusTab = (id: TabId): void => {
    active = id;
    const el = document.getElementById(tabButtonId(id));
    if (el) el.focus();
  };

  const onKeydown = (event: KeyboardEvent, index: number): void => {
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = tabs.length - 1;
    }
    if (next < 0) return;

    // Only now, so unrelated keys (Tab, typing) keep their default behaviour.
    event.preventDefault();
    focusTab(tabs[next].id);
  };
</script>

<div class="htb-tabs" role="tablist" aria-label="H-Toolbelt tools">
  {#each tabs as tab, i (tab.id)}
    <button
      class="htb-tab"
      class:htb-tab-active={active === tab.id}
      id={tabButtonId(tab.id)}
      role="tab"
      type="button"
      title={tab.title}
      aria-selected={active === tab.id}
      aria-controls={tabPanelId(tab.id)}
      tabindex={active === tab.id ? 0 : -1}
      onclick={() => (active = tab.id)}
      onkeydown={(e) => onKeydown(e, i)}
    >
      {tab.label}
    </button>
  {/each}
</div>

<style lang="scss">
  // Tabs share the row and wrap to a second line on a narrow docked panel
  // rather than overflowing or shrinking their labels to nothing.
  .htb-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--htb-border, #3a3a3a);
  }

  .htb-tab {
    appearance: none;
    flex: 1 1 auto;
    min-width: 72px;
    padding: 7px 12px;
    font-size: 11px;
    font-weight: 600;
    font-family: inherit;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--htb-text-muted, #9a9a9a);
    background-color: transparent;
    border: none;
    // Reserves the active underline on every tab, so selecting one does not
    // shift the row by a pixel.
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    cursor: pointer;
    user-select: none;
    transition:
      color 0.12s ease,
      border-color 0.12s ease;
  }

  .htb-tab:hover {
    color: var(--htb-text, #e0e0e0);
  }

  .htb-tab:focus-visible {
    outline: 1px solid var(--htb-accent, #2f6fb0);
    outline-offset: -2px;
  }

  .htb-tab.htb-tab-active {
    color: var(--htb-text, #e0e0e0);
    border-bottom-color: var(--htb-accent, #2f6fb0);
  }
</style>
