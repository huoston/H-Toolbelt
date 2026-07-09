/**
 * Boot guard for the H-Toolbelt panel.
 *
 * This module MUST be imported before anything that touches CEP (CSInterface,
 * appSkinInfo, node modules). It has zero CEP dependencies so it always
 * evaluates cleanly, and it does two things at load time:
 *
 *   1. Paints a fixed dark fallback palette onto :root, so the UI has a usable
 *      base theme even if the After Effects theming never runs.
 *   2. Registers global `error` / `unhandledrejection` handlers that render any
 *      runtime failure as visible text inside the panel. A boot failure must
 *      never leave the panel a blank black screen.
 *
 * Author: Dr. Huoston Rodrigues
 * Website: https://huoston.art/
 * Email: hello@huoston.art
 * Version: 0.1.0
 * Created: 2026-07-10
 * Modified: 2026-07-10
 * License: GPL-3.0-or-later
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Fixed dark fallback palette. Applied before any AE theming so the panel is
 * always legible; the theming layer only overrides these on success.
 */
export const FALLBACK_VARS: Record<string, string> = {
  "--htb-bg": "#1e1e1e",
  "--htb-surface": "#2a2a2a",
  "--htb-surface-hover": "#333333",
  "--htb-text": "#e0e0e0",
  "--htb-text-muted": "#9a9a9a",
  "--htb-border": "#3a3a3a",
  "--htb-accent": "#2f6fb0",
};

/** Apply the dark fallback CSS variables to :root. Never throws. */
export const applyFallbackVars = (): void => {
  try {
    const root = document.documentElement;
    for (const key in FALLBACK_VARS) {
      root.style.setProperty(key, FALLBACK_VARS[key]);
    }
  } catch (e) {
    // Nothing we can do this early; the error handler below will still fire.
  }
};

/** Format an unknown thrown value into a readable message + stack string. */
const describeError = (err: unknown): string => {
  if (err instanceof Error) {
    return err.stack || `${err.name}: ${err.message}`;
  }
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err, null, 2);
  } catch (e) {
    return String(err);
  }
};

/**
 * Render a visible, scrollable error block inside the panel. Multiple errors are
 * appended. Uses the dark palette so it is legible even before theming runs.
 */
export const renderBootError = (err: unknown): void => {
  try {
    let box = document.getElementById("htb-boot-error");
    if (!box) {
      box = document.createElement("div");
      box.id = "htb-boot-error";
      box.setAttribute(
        "style",
        [
          "position:fixed",
          "inset:0",
          "z-index:2147483647",
          "margin:0",
          "padding:12px 14px",
          "overflow:auto",
          "background:var(--htb-bg,#1e1e1e)",
          "color:var(--htb-text,#e0e0e0)",
          "font-family:Menlo,Consolas,'Courier New',monospace",
          "font-size:11px",
          "line-height:1.5",
          "white-space:pre-wrap",
          "word-break:break-word",
        ].join(";")
      );
      const title = document.createElement("div");
      title.textContent = "H-Toolbelt — runtime error";
      title.setAttribute(
        "style",
        "font-weight:700;margin-bottom:8px;color:#e0654f"
      );
      box.appendChild(title);
      (document.body || document.documentElement).appendChild(box);
    }
    const entry = document.createElement("pre");
    entry.setAttribute(
      "style",
      "margin:0 0 10px;padding:8px;border:1px solid var(--htb-border,#3a3a3a);border-radius:4px;background:var(--htb-surface,#2a2a2a);white-space:pre-wrap;word-break:break-word"
    );
    entry.textContent = describeError(err);
    box.appendChild(entry);
  } catch (e) {
    // Last resort: never let the error handler itself throw.
  }
};

// Apply the dark base immediately and install the global safety net. These run
// as soon as this module is evaluated — before the CEP-dependent chain.
applyFallbackVars();

if (typeof window !== "undefined") {
  window.addEventListener("error", (event: ErrorEvent) => {
    renderBootError(event.error ?? event.message ?? event);
  });
  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      renderBootError(event.reason ?? event);
    }
  );
}
