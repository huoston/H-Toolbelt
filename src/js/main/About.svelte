<!--
  H-Toolbelt — Help / About overlay.

  Author credit, version, links and licence. Rendered in-panel rather than in a
  new window: a CEP extension has one webview, and a popup would be a second
  thing to manage for content this small.

  LINKS GO THROUGH `openLinkInBrowser`, the project's existing helper, which uses
  `csi.openURLInDefaultBrowser` when CEP is present and falls back to navigation
  otherwise. Not `window.open`: inside the panel that either does nothing or
  replaces the panel itself with the page, which would look like a crash.

  The version is imported from package.json — the same file `cep.config.ts` reads
  when it stamps the manifest — so the number shown here cannot drift from the
  number in the installed extension.

  Author: Dr. Huoston Rodrigues
  Website: https://huoston.art/
  Email: hello@huoston.art
  Version: 0.2.0
  Created: 2026-07-29
  Modified: 2026-07-29
  License: GPL-3.0-or-later
  SPDX-License-Identifier: GPL-3.0-or-later
-->
<script lang="ts">
  import { openLinkInBrowser } from "../lib/utils/bolt";
  import { version } from "../../../package.json";
  import Icon from "./icons/Icon.svelte";

  let { open = $bindable() }: { open: boolean } = $props();

  const SITE_URL = "https://huoston.art/";
  const REPO_URL = "https://github.com/huoston/H-Toolbelt";

  const close = (): void => {
    open = false;
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  const openUrl = (url: string): void => {
    try {
      openLinkInBrowser(url);
    } catch (e) {
      // A link that will not open must not take the panel down with it.
      console.error("Could not open", url, e);
    }
  };

  /** Focus the dialog when it opens, so Escape reaches it immediately. */
  const focusOnOpen = (node: HTMLElement) => {
    node.focus();
    return {};
  };
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="htb-about"
    role="dialog"
    aria-modal="true"
    aria-label="About H-Toolbelt"
    tabindex="-1"
    use:focusOnOpen
  >
    <div class="htb-about-card">
      <div class="htb-about-head">
        <h2 class="htb-about-title">H-Toolbelt</h2>
        <button
          class="htb-about-close"
          type="button"
          title="Close (Esc)"
          aria-label="Close"
          onclick={close}
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      <p class="htb-about-version">Version {version}</p>

      <p class="htb-about-by">by Dr. Huoston Rodrigues</p>

      <div class="htb-about-links">
        <button
          class="htb-about-link"
          type="button"
          title="Open huoston.art in your browser"
          onclick={() => openUrl(SITE_URL)}
        >
          huoston.art
        </button>
        <button
          class="htb-about-link"
          type="button"
          title="Open the project on GitHub"
          onclick={() => openUrl(REPO_URL)}
        >
          GitHub
        </button>
      </div>

      <p class="htb-about-licence">
        Free and open source under GPL-3.0-or-later.
      </p>
    </div>
  </div>
{/if}

<style lang="scss">
  // Covers the panel rather than the tools' own boxes, so nothing behind it can
  // be clicked while it is up. The tool panels themselves stay mounted.
  .htb-about {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background-color: rgba(0, 0, 0, 0.55);
  }

  .htb-about:focus {
    outline: none;
  }

  .htb-about-card {
    box-sizing: border-box;
    width: 100%;
    max-width: 260px;
    padding: 14px;
    color: var(--htb-text, #e0e0e0);
    background-color: var(--htb-bg, #1e1e1e);
    border: 1px solid var(--htb-border, #3a3a3a);
    border-radius: 6px;
  }

  .htb-about-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .htb-about-title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .htb-about-close {
    appearance: none;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    color: var(--htb-text-muted, #9a9a9a);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
  }

  .htb-about-close:hover {
    color: var(--htb-text, #e0e0e0);
    border-color: var(--htb-border, #3a3a3a);
  }

  .htb-about-version,
  .htb-about-by,
  .htb-about-licence {
    margin: 8px 0 0;
    font-size: 11px;
    color: var(--htb-text-muted, #9a9a9a);
  }

  .htb-about-by {
    color: var(--htb-text, #e0e0e0);
    font-weight: 600;
  }

  .htb-about-links {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }

  // Buttons, not anchors: these do not navigate the panel, they hand a URL to
  // the OS browser. An <a href> here would risk replacing the panel's own page.
  .htb-about-link {
    appearance: none;
    flex: 1 1 auto;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 500;
    font-family: inherit;
    color: var(--htb-text, #e0e0e0);
    background-color: var(--htb-surface, #2a2a2a);
    border: 1px solid var(--htb-border, #3a3a3a);
    border-radius: 4px;
    cursor: pointer;
  }

  .htb-about-link:hover {
    background-color: var(--htb-surface-hover, #333333);
    border-color: var(--htb-accent, #2f6fb0);
  }

  .htb-about-licence {
    margin-top: 12px;
    line-height: 1.4;
  }
</style>
