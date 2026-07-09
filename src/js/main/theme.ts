/**
 * After Effects theming for the H-Toolbelt panel (optional enrichment).
 *
 * Reads the host `appSkinInfo` (panel background + system highlight) via CEP and
 * exposes it as CSS custom properties on :root so the UI paints itself with the
 * current AE theme. Text and surface colors are derived from the background
 * luminance rather than hardcoded, and the panel repaints on theme change.
 *
 * IMPORTANT (blank-screen hardening): theming is an *enrichment*, never a boot
 * prerequisite. All CEP access happens lazily inside `initAeTheme` (called from
 * onMount) wrapped in try/catch. If the host does not respond, the fixed dark
 * fallback from `boot-guard` stays in place and the panel still renders. There is
 * no CEP access at module top level.
 *
 * Author: Dr. Huoston Rodrigues
 * Website: https://huoston.art/
 * Email: hello@huoston.art
 * Version: 0.1.0
 * Created: 2026-07-09
 * Modified: 2026-07-10
 * License: GPL-3.0-or-later
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

// Fallback accent used when the host reports no system highlight color.
const FALLBACK_ACCENT: Rgb = { r: 47, g: 111, b: 176 };

const clamp255 = (n: number): number => Math.min(255, Math.max(0, Math.round(n)));

const rgb = (c: Rgb): string => `rgb(${c.r}, ${c.g}, ${c.b})`;

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && isFinite(v);

/**
 * Read an RGB triple from an AE color node. Accepts either a color wrapper
 * (`{ color: { red, green, blue } }`, as panelBackgroundColor uses) or a bare
 * `{ red, green, blue }` (as systemHighlightColor uses). Returns null on any
 * unexpected shape instead of throwing.
 */
const readColor = (node: any): Rgb | null => {
  if (!node || typeof node !== "object") return null;
  const c =
    node.color && typeof node.color === "object" ? node.color : node;
  if (isFiniteNumber(c.red) && isFiniteNumber(c.green) && isFiniteNumber(c.blue)) {
    return { r: c.red, g: c.green, b: c.blue };
  }
  return null;
};

/** Mix a color toward white (amount > 0) or black (amount < 0), -1..1. */
const shade = (c: Rgb, amount: number): Rgb => {
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  return {
    r: clamp255(c.r + (target - c.r) * t),
    g: clamp255(c.g + (target - c.g) * t),
    b: clamp255(c.b + (target - c.b) * t),
  };
};

/** Perceived luminance (0..1) using the Rec. 601 weights. */
const luminance = (c: Rgb): number =>
  (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;

/**
 * Read the AE panel background and system highlight, validating every level of
 * the payload (AE 2026 may report an unexpected shape). Returns null — never
 * throws — when anything is missing or malformed, so the dark fallback stays.
 */
const readAeColors = (): { bg: Rgb; accent: Rgb } | null => {
  const cep = window.__adobe_cep__;
  if (!cep || typeof cep.getHostEnvironment !== "function") return null;

  const raw = cep.getHostEnvironment();
  if (typeof raw !== "string") {
    console.warn("[H-Toolbelt] getHostEnvironment did not return a string", raw);
    return null;
  }

  let env: any;
  try {
    env = JSON.parse(raw);
  } catch (e) {
    console.warn("[H-Toolbelt] hostEnvironment is not valid JSON", raw);
    return null;
  }

  const skin = env && typeof env === "object" ? env.appSkinInfo : undefined;
  if (!skin || typeof skin !== "object") {
    console.warn("[H-Toolbelt] appSkinInfo missing on hostEnvironment", env);
    return null;
  }

  const bg = readColor(skin.panelBackgroundColor);
  if (!bg) {
    console.warn(
      "[H-Toolbelt] panelBackgroundColor has an unexpected shape",
      skin.panelBackgroundColor
    );
    return null;
  }

  const accent = readColor(skin.systemHighlightColor) ?? FALLBACK_ACCENT;
  return { bg, accent };
};

/**
 * Compute the CSS variable set for the current AE theme and paint :root. Returns
 * false (leaving the dark fallback untouched) when the skin cannot be read.
 */
const paint = (): boolean => {
  const colors = readAeColors();
  if (!colors) return false;
  const { bg, accent } = colors;
  const isDark = luminance(bg) < 0.5;

  // Derive surfaces/text from the background so nothing is hardcoded light.
  const text = isDark ? shade(bg, 0.85) : shade(bg, -0.8);
  const textMuted = isDark ? shade(bg, 0.45) : shade(bg, -0.45);
  const surface = isDark ? shade(bg, 0.14) : shade(bg, -0.08);
  const surfaceHover = isDark ? shade(bg, 0.26) : shade(bg, -0.16);
  const border = isDark ? shade(bg, 0.22) : shade(bg, -0.18);

  const root = document.documentElement;
  const vars: Record<string, string> = {
    "--htb-bg": rgb(bg),
    "--htb-text": rgb(text),
    "--htb-text-muted": rgb(textMuted),
    "--htb-surface": rgb(surface),
    "--htb-surface-hover": rgb(surfaceHover),
    "--htb-border": rgb(border),
    "--htb-accent": rgb(accent),
  };
  for (const key in vars) {
    root.style.setProperty(key, vars[key]);
  }
  return true;
};

/**
 * Enrich the UI with the AE theme, if available. Fully guarded: any failure
 * leaves the dark fallback palette (from boot-guard) in place and never throws.
 * Safe to call from onMount.
 */
export const initAeTheme = (): void => {
  try {
    // Outside of CEP (e.g. plain browser) there is nothing to read; keep dark.
    if (!window.cep || !window.__adobe_cep__) return;

    // If the skin can't be parsed, keep the dark fallback and skip the listener.
    if (!paint()) return;

    try {
      window.__adobe_cep__.addEventListener(
        "com.adobe.csxs.events.ThemeColorChanged",
        () => {
          try {
            paint();
          } catch (e) {
            // Ignore transient theme reads; keep the last good palette.
          }
        }
      );
    } catch (e) {
      // No live theme updates, but the initial paint already applied.
    }
  } catch (e) {
    // Theming is optional; the dark fallback remains. Never break the boot.
  }
};
