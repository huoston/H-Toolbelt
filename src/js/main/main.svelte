<!--
  H-Toolbelt — main panel.

  A tab shell over five tools. This component owns the tab state and the layout;
  every tool lives in its own self-contained component under ./tools/ and is
  reached only through the panel it sits in.

  WHY EVERY PANEL STAYS MOUNTED: tab switching toggles CSS `display`, never
  `{#if}`. Two reasons, and neither is cosmetic. First, state: the curve editor's
  hand-tuned bezier, the per-effect expression parameters and the sequencing
  order all live in component state, and an {#if} would quietly reset them every
  time the user looked at another tab. Second, mounting: this panel has already
  been broken twice by mount-time failures in CEP's CEF (P02a, P02b), and
  mounting each tool once on boot means those failures surface immediately and
  identically for everyone, instead of hiding behind a tab nobody clicked yet.

  Boot hardening: the UI renders from CSS custom properties that already carry
  fixed dark fallbacks (also set by boot-guard), so it mounts with or without the
  AE theme. Theming is applied lazily and defensively in onMount, once, at app
  level rather than per tool. Mount-time errors are surfaced by the window error
  handlers and the mount() try/catch in index-svelte.ts, routed to the plain-DOM
  renderer in boot-guard — no <svelte:boundary>, which masks mount-time errors in
  CEP's CEF.

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
  import { onMount } from "svelte";
  import Tabs from "./Tabs.svelte";
  import { DEFAULT_TAB, tabButtonId, tabPanelId } from "./tabs";
  import type { TabId } from "./tabs";
  import EasingsPanel from "./tools/EasingsPanel.svelte";
  import SequencePanel from "./tools/SequencePanel.svelte";
  import ExpressionsPanel from "./tools/ExpressionsPanel.svelte";
  import LoopPanel from "./tools/LoopPanel.svelte";
  import AnchorPanel from "./tools/AnchorPanel.svelte";
  import AlignPanel from "./tools/AlignPanel.svelte";
  import ShapePanel from "./tools/ShapePanel.svelte";
  import About from "./About.svelte";
  import Icon from "./icons/Icon.svelte";
  import { initAeTheme } from "./theme";
  import "../index.scss";
  import "./main.scss";

  let activeTab: TabId = $state(DEFAULT_TAB);
  let aboutOpen: boolean = $state(false);

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
    <button
      class="htb-help"
      type="button"
      title="About H-Toolbelt"
      aria-label="About H-Toolbelt"
      onclick={() => (aboutOpen = true)}
    >
      <Icon name="help" size={15} />
    </button>
  </header>

  <Tabs bind:active={activeTab} />

  <!-- All three panels are rendered on boot. `htb-panel-hidden` sets
       `display: none`; nothing here unmounts. -->
  <div class="htb-panels">
    <div
      class="htb-panel"
      class:htb-panel-hidden={activeTab !== "motion"}
      id={tabPanelId("motion")}
      role="tabpanel"
      aria-labelledby={tabButtonId("motion")}
      aria-hidden={activeTab !== "motion"}
    >
      <section class="htb-tool">
        <h2 class="htb-tool-name">Easings</h2>
        <EasingsPanel />
      </section>

      <section class="htb-tool">
        <h2 class="htb-tool-name">Sequencing</h2>
        <SequencePanel />
      </section>

      <section class="htb-tool">
        <h2 class="htb-tool-name">Expressions</h2>
        <ExpressionsPanel />
      </section>

      <section class="htb-tool">
        <h2 class="htb-tool-name">Loops</h2>
        <LoopPanel />
      </section>
    </div>

    <div
      class="htb-panel"
      class:htb-panel-hidden={activeTab !== "transform"}
      id={tabPanelId("transform")}
      role="tabpanel"
      aria-labelledby={tabButtonId("transform")}
      aria-hidden={activeTab !== "transform"}
    >
      <section class="htb-tool">
        <h2 class="htb-tool-name">Anchor Point</h2>
        <AnchorPanel />
      </section>

      <section class="htb-tool">
        <h2 class="htb-tool-name">Align</h2>
        <AlignPanel />
      </section>
    </div>

    <div
      class="htb-panel"
      class:htb-panel-hidden={activeTab !== "shapes"}
      id={tabPanelId("shapes")}
      role="tabpanel"
      aria-labelledby={tabButtonId("shapes")}
      aria-hidden={activeTab !== "shapes"}
    >
      <section class="htb-tool">
        <h2 class="htb-tool-name">Shape Layer Magic</h2>
        <ShapePanel />
      </section>
    </div>
  </div>

  <!-- Overlays the panel; the tool panels behind it stay mounted. -->
  <About bind:open={aboutOpen} />
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }

  .htb-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .htb-help {
    appearance: none;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
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

  .htb-help:hover {
    color: var(--htb-text, #e0e0e0);
    border-color: var(--htb-border, #3a3a3a);
  }

  .htb-help:focus-visible {
    outline: 1px solid var(--htb-accent, #2f6fb0);
    outline-offset: 1px;
  }

  // The whole point of the tab shell: hidden, not destroyed. Every tool keeps
  // its state and its DOM while another tab is on top.
  .htb-panel-hidden {
    display: none;
  }

  // Tools within a tab stack vertically with a rule between them, so each reads
  // as its own block.
  .htb-tool + .htb-tool {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--htb-border, #3a3a3a);
  }

  .htb-tool-name {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--htb-text-muted, #9a9a9a);
  }
</style>
