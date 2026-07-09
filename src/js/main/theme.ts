/**
 * After Effects theming for the H-Toolbelt panel.
 *
 * Reads the host `appSkinInfo` (panel background + system highlight) via CEP and
 * exposes it as CSS custom properties on :root so the UI paints itself with the
 * current AE theme. Text and surface colors are derived from the background
 * luminance rather than hardcoded, and the panel repaints on theme change.
 *
 * Author: Dr. Huoston Rodrigues
 * Website: https://huoston.art/
 * Email: hello@huoston.art
 * Version: 0.1.0
 * Created: 2026-07-09
 * Modified: 2026-07-09
 * License: GPL-3.0-or-later
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { csi } from "../lib/utils/bolt";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

// Fallback palette (dark) used outside of CEP, e.g. in a plain browser.
const FALLBACK_BG: Rgb = { r: 40, g: 44, b: 52 };
const FALLBACK_ACCENT: Rgb = { r: 32, g: 99, b: 155 };

const clamp255 = (n: number): number => Math.min(255, Math.max(0, Math.round(n)));

const rgb = (c: Rgb): string => `rgb(${c.r}, ${c.g}, ${c.b})`;

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

/** Read the AE panel background and system highlight, with a dark fallback. */
const readAeColors = (): { bg: Rgb; accent: Rgb } => {
  try {
    const env = JSON.parse(
      window.__adobe_cep__.getHostEnvironment() as string
    );
    const skin = env.appSkinInfo;
    const bgColor = skin.panelBackgroundColor.color;
    const hl = skin.systemHighlightColor;
    return {
      bg: { r: bgColor.red, g: bgColor.green, b: bgColor.blue },
      accent: hl
        ? { r: hl.red, g: hl.green, b: hl.blue }
        : FALLBACK_ACCENT,
    };
  } catch (e) {
    return { bg: FALLBACK_BG, accent: FALLBACK_ACCENT };
  }
};

/** Compute the CSS variable set for the current AE theme and paint :root. */
const paint = (): void => {
  const { bg, accent } = readAeColors();
  const isDark = luminance(bg) < 0.5;

  // Derive surfaces/text from the background so nothing is hardcoded light.
  const fg = isDark ? shade(bg, 0.85) : shade(bg, -0.8);
  const muted = isDark ? shade(bg, 0.45) : shade(bg, -0.45);
  const surface = isDark ? shade(bg, 0.14) : shade(bg, -0.08);
  const surfaceHover = isDark ? shade(bg, 0.26) : shade(bg, -0.16);
  const border = isDark ? shade(bg, 0.22) : shade(bg, -0.18);

  const root = document.documentElement;
  const vars: Record<string, string> = {
    "--htb-bg": rgb(bg),
    "--htb-fg": rgb(fg),
    "--htb-muted": rgb(muted),
    "--htb-surface": rgb(surface),
    "--htb-surface-hover": rgb(surfaceHover),
    "--htb-border": rgb(border),
    "--htb-accent": rgb(accent),
  };
  for (const key in vars) {
    root.style.setProperty(key, vars[key]);
  }
};

/** Paint once and re-paint whenever the AE theme color changes. */
export const initAeTheme = (): void => {
  paint();
  if (window.cep) {
    csi.addEventListener(
      "com.adobe.csxs.events.ThemeColorChanged",
      () => paint(),
      {}
    );
  }
};
