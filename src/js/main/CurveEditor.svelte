<!--
  H-Toolbelt — cubic-bezier curve editor.

  A square SVG editor for a unit cubic-bezier timing curve with fixed endpoints
  at (0,0) and (1,1). Two draggable handles (P1, P2) set the control points; the
  values are clamped to x,y in [0,1] (a monotonic, influence/velocity-valid
  curve — overshoot/elastic belongs to the later Expression Effects tool).

  The current curve is exposed to the parent via a bindable `bezier` prop: the
  parent loads a preset by assigning to it (handles jump), and drags flow back
  through the same binding so Apply can read the live curve. This component only
  produces the Bezier tuple; applying it to keyframes is the parent's job via the
  already-validated `applyEasing` engine.

  Author: Dr. Huoston Rodrigues
  Website: https://huoston.art/
  Email: hello@huoston.art
  Version: 0.1.0
  Created: 2026-07-10
  Modified: 2026-07-10
  License: GPL-3.0-or-later
  SPDX-License-Identifier: GPL-3.0-or-later
-->
<script lang="ts">
  import type { Bezier } from "../../shared/easing";

  // Geometry, in SVG user units. PAD keeps handles fully visible at the extremes
  // (x/y = 0 or 1) and gives the editor its inset framing.
  const SIZE = 220;
  const PAD = 16;
  const INNER = SIZE - 2 * PAD;
  const HANDLE_R = 6;

  // Two-way bindable current curve. The parent assigns to load a preset; drags
  // mutate it back. Default is Easy Ease so the editor is never in a null state.
  let {
    bezier = $bindable([0.333, 0, 0.667, 1] as Bezier),
  }: { bezier?: Bezier } = $props();

  let svgEl = $state<SVGSVGElement | null>(null);
  // Which handle is being dragged: 0 = P1, 1 = P2, null = idle.
  let dragging = $state<0 | 1 | null>(null);

  const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

  // Unit (0..1, y up) -> SVG pixel (y down).
  const ux = (x: number): number => PAD + x * INNER;
  const uy = (y: number): number => PAD + (1 - y) * INNER;

  // Fixed endpoints: (0,0) bottom-left, (1,1) top-right.
  const startX = PAD;
  const startY = SIZE - PAD;
  const endX = SIZE - PAD;
  const endY = PAD;

  const p1x = $derived(ux(bezier[0]));
  const p1y = $derived(uy(bezier[1]));
  const p2x = $derived(ux(bezier[2]));
  const p2y = $derived(uy(bezier[3]));

  const pathD = $derived(
    `M ${startX} ${startY} C ${p1x} ${p1y} ${p2x} ${p2y} ${endX} ${endY}`
  );

  // Pointer pixel -> clamped unit coordinates, resolution-independent (uses the
  // rendered rect, then maps through the fixed viewBox and inset).
  const toUnit = (evt: PointerEvent): { x: number; y: number } => {
    const rect = svgEl!.getBoundingClientRect();
    const svgX = ((evt.clientX - rect.left) / rect.width) * SIZE;
    const svgY = ((evt.clientY - rect.top) / rect.height) * SIZE;
    return {
      x: clamp01((svgX - PAD) / INNER),
      y: clamp01(1 - (svgY - PAD) / INNER),
    };
  };

  const onPointerDown = (which: 0 | 1, evt: PointerEvent): void => {
    evt.preventDefault();
    dragging = which;
    (evt.currentTarget as Element).setPointerCapture(evt.pointerId);
  };

  const onPointerMove = (evt: PointerEvent): void => {
    if (dragging === null) return;
    const { x, y } = toUnit(evt);
    // Replace the tuple (not mutate in place) so the bindable prop reassignment
    // is observed by both this component's $derived and the parent.
    const next: Bezier = [bezier[0], bezier[1], bezier[2], bezier[3]];
    if (dragging === 0) {
      next[0] = x;
      next[1] = y;
    } else {
      next[2] = x;
      next[3] = y;
    }
    bezier = next;
  };

  const onPointerUp = (evt: PointerEvent): void => {
    if (dragging === null) return;
    const el = evt.currentTarget as Element;
    if (el.hasPointerCapture?.(evt.pointerId)) {
      el.releasePointerCapture(evt.pointerId);
    }
    dragging = null;
  };

  const fmt = (n: number): string => n.toFixed(3);
</script>

<div class="htb-curve">
  <svg
    bind:this={svgEl}
    class="htb-curve-svg"
    viewBox="0 0 {SIZE} {SIZE}"
    width={SIZE}
    height={SIZE}
    role="application"
    aria-label="Cubic-bezier curve editor"
  >
    <!-- Editor frame. -->
    <rect
      class="htb-curve-frame"
      x={PAD}
      y={PAD}
      width={INNER}
      height={INNER}
    />
    <!-- Linear reference (identity ease) from start to end. -->
    <line
      class="htb-curve-linear"
      x1={startX}
      y1={startY}
      x2={endX}
      y2={endY}
    />
    <!-- Handle guide lines. -->
    <line class="htb-curve-guide" x1={startX} y1={startY} x2={p1x} y2={p1y} />
    <line class="htb-curve-guide" x1={endX} y1={endY} x2={p2x} y2={p2y} />
    <!-- The curve. -->
    <path class="htb-curve-path" d={pathD} />
    <!-- Draggable handles. Pointer capture routes move/up back to the circle. -->
    <circle
      class="htb-curve-handle"
      class:htb-dragging={dragging === 0}
      cx={p1x}
      cy={p1y}
      r={HANDLE_R}
      role="slider"
      tabindex="0"
      aria-label="Control point 1"
      aria-valuetext="x1 {fmt(bezier[0])}, y1 {fmt(bezier[1])}"
      onpointerdown={(e) => onPointerDown(0, e)}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
    />
    <circle
      class="htb-curve-handle"
      class:htb-dragging={dragging === 1}
      cx={p2x}
      cy={p2y}
      r={HANDLE_R}
      role="slider"
      tabindex="0"
      aria-label="Control point 2"
      aria-valuetext="x2 {fmt(bezier[2])}, y2 {fmt(bezier[3])}"
      onpointerdown={(e) => onPointerDown(1, e)}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
    />
  </svg>

  <div class="htb-curve-readout" aria-live="off">
    <span>x1 <b>{fmt(bezier[0])}</b></span>
    <span>y1 <b>{fmt(bezier[1])}</b></span>
    <span>x2 <b>{fmt(bezier[2])}</b></span>
    <span>y2 <b>{fmt(bezier[3])}</b></span>
  </div>
</div>

<style lang="scss">
  .htb-curve {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }

  .htb-curve-svg {
    max-width: 100%;
    height: auto;
    touch-action: none;
    background-color: var(--htb-surface, #2a2a2a);
    border: 1px solid var(--htb-border, #3a3a3a);
    border-radius: 4px;
  }

  .htb-curve-frame {
    fill: none;
    stroke: var(--htb-border, #3a3a3a);
    stroke-width: 1;
  }

  .htb-curve-linear {
    stroke: var(--htb-border, #3a3a3a);
    stroke-width: 1;
    stroke-dasharray: 3 3;
    opacity: 0.7;
  }

  .htb-curve-guide {
    stroke: var(--htb-text-muted, #9a9a9a);
    stroke-width: 1;
    opacity: 0.6;
  }

  .htb-curve-path {
    fill: none;
    stroke: var(--htb-accent, #2f6fb0);
    stroke-width: 2;
  }

  .htb-curve-handle {
    fill: var(--htb-bg, #1e1e1e);
    stroke: var(--htb-accent, #2f6fb0);
    stroke-width: 2;
    cursor: grab;
    touch-action: none;

    &:hover,
    &.htb-dragging {
      fill: var(--htb-accent, #2f6fb0);
    }

    &.htb-dragging {
      cursor: grabbing;
    }
  }

  .htb-curve-readout {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: 11px;
    font-family: Menlo, Consolas, "Courier New", monospace;
    color: var(--htb-text-muted, #9a9a9a);

    b {
      color: var(--htb-text, #e0e0e0);
      font-weight: 600;
    }
  }
</style>
