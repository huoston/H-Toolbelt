/**
 * Unit tests for the Dynamics presets and their oscillation curve.
 *
 * Author: Dr. Huoston Rodrigues
 * Website: https://huoston.art/
 * Email: hello@huoston.art
 * Version: 0.2.0
 * Created: 2026-11-04
 * Modified: 2026-11-04
 * License: GPL-3.0-or-later
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { DYNAMICS_PRESETS, oscillation } from "./dynamics";
import type { DynamicsPreset } from "./dynamics";
import { buildExpression, EXPRESSION_DEFAULTS } from "./expressions";

const byLabel = (label: string): DynamicsPreset => {
  const p = DYNAMICS_PRESETS.find((x) => x.label === label);
  if (!p) throw new Error("No preset labelled " + label);
  return p;
};

const SAMPLE_TIMES = [0, 0.1, 0.25, 0.5, 1];

describe("DYNAMICS_PRESETS", () => {
  it("holds the six presets, in order, with the exact values", () => {
    expect(
      DYNAMICS_PRESETS.map((p) => [p.label, p.kind, p.amplitude, p.frequency, p.decay])
    ).toEqual([
      ["Bounce Soft", "bounce", 0.05, 2.0, 8],
      ["Bounce Medium", "bounce", 0.1, 2.5, 6],
      ["Bounce Hard", "bounce", 0.18, 3.0, 4],
      ["Elastic Soft", "elastic", 0.05, 1.5, 7],
      ["Elastic Medium", "elastic", 0.12, 2.0, 4],
      ["Elastic Hard", "elastic", 0.18, 2.5, 3.5],
    ]);
  });

  it("gives every preset a unique id and label", () => {
    expect(new Set(DYNAMICS_PRESETS.map((p) => p.id)).size).toBe(6);
    expect(new Set(DYNAMICS_PRESETS.map((p) => p.label)).size).toBe(6);
  });

  it("uses kebab-case ids and one-line hints", () => {
    for (const p of DYNAMICS_PRESETS) {
      expect(p.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(p.hint.length).toBeGreaterThan(0);
      expect(p.hint).not.toContain("\n");
    }
  });

  // The regression control against v0.1.0: these are the values the Bounce and
  // Elastic buttons applied before the fields were removed.
  it("keeps the Medium presets equal to the expression defaults", () => {
    const pick = ({ amplitude, frequency, decay }: DynamicsPreset) => ({
      amplitude,
      frequency,
      decay,
    });
    expect(pick(byLabel("Bounce Medium"))).toEqual(EXPRESSION_DEFAULTS.bounce);
    expect(pick(byLabel("Elastic Medium"))).toEqual(EXPRESSION_DEFAULTS.elastic);
  });

  it("orders amplitude Soft < Medium < Hard within each kind", () => {
    for (const kind of ["Bounce", "Elastic"]) {
      const soft = byLabel(kind + " Soft").amplitude;
      const medium = byLabel(kind + " Medium").amplitude;
      const hard = byLabel(kind + " Hard").amplitude;
      expect(soft).toBeLessThan(medium);
      expect(medium).toBeLessThan(hard);
    }
  });
});

describe("oscillation", () => {
  it("matches the bounce formula", () => {
    for (const p of DYNAMICS_PRESETS.filter((x) => x.kind === "bounce")) {
      for (const t of SAMPLE_TIMES) {
        const expected =
          p.amplitude * Math.abs(Math.sin(p.frequency * t * Math.PI)) / Math.exp(p.decay * t);
        expect(Math.abs(oscillation(p, t) - expected)).toBeLessThanOrEqual(1e-12);
      }
    }
  });

  it("matches the elastic formula", () => {
    for (const p of DYNAMICS_PRESETS.filter((x) => x.kind === "elastic")) {
      for (const t of SAMPLE_TIMES) {
        const expected =
          p.amplitude * Math.sin(p.frequency * t * 2 * Math.PI) / Math.exp(p.decay * t);
        expect(Math.abs(oscillation(p, t) - expected)).toBeLessThanOrEqual(1e-12);
      }
    }
  });

  it("never goes negative for bounce", () => {
    for (const p of DYNAMICS_PRESETS.filter((x) => x.kind === "bounce")) {
      for (const t of SAMPLE_TIMES) {
        expect(oscillation(p, t)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  // `oscillationFactor` is private to expressions.ts, so its text is checked
  // through the generated expression. If that text changes, the thumbnails stop
  // drawing what the expression does, and this fails.
  it("mirrors the text the generated expression carries", () => {
    expect(buildExpression("bounce", EXPRESSION_DEFAULTS.bounce)).toContain(
      "amp * Math.abs(Math.sin(freq * t * Math.PI)) / Math.exp(decay * t)"
    );
    expect(buildExpression("elastic", EXPRESSION_DEFAULTS.elastic)).toContain(
      "amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t)"
    );
  });
});
