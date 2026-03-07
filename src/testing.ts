/**
 * Flexture Testing Utilities
 *
 * Diagnostic helpers for verifying layout correctness, especially
 * incremental re-layout consistency. Used by downstream consumers
 * (inkx, km-tui) and flexture's own test suite.
 *
 * @example
 * ```typescript
 * import { Node, DIRECTION_LTR } from 'flexture';
 * import { getLayout, diffLayouts, assertLayoutSanity } from 'flexture/testing';
 *
 * const root = Node.create();
 * root.setWidth(80);
 * root.calculateLayout(80, 24, DIRECTION_LTR);
 * assertLayoutSanity(root);
 * const layout = getLayout(root);
 * ```
 */

import { DIRECTION_LTR, MEASURE_MODE_AT_MOST, MEASURE_MODE_EXACTLY } from "./constants.js"
import type { MeasureFunc } from "./types.js"
import { Node } from "./node-zero.js"

// ============================================================================
// Types
// ============================================================================

export interface LayoutResult {
  left: number
  top: number
  width: number
  height: number
  children: LayoutResult[]
}

export interface BuildTreeResult {
  root: Node
  dirtyTargets: Node[]
}

// ============================================================================
// Layout Inspection
// ============================================================================

/** Recursively extract computed layout from a node tree. */
export function getLayout(node: Node): LayoutResult {
  return {
    left: node.getComputedLeft(),
    top: node.getComputedTop(),
    width: node.getComputedWidth(),
    height: node.getComputedHeight(),
    children: Array.from({ length: node.getChildCount() }, (_, i) => getLayout(node.getChild(i)!)),
  }
}

/** Format a layout tree as an indented string for debugging. */
export function formatLayout(layout: LayoutResult, indent = 0): string {
  const pad = "  ".repeat(indent)
  let result = `${pad}{ left: ${layout.left}, top: ${layout.top}, width: ${layout.width}, height: ${layout.height} }`
  if (layout.children.length > 0) {
    result += ` [\n${layout.children.map((c) => formatLayout(c, indent + 1)).join(",\n")}\n${pad}]`
  }
  return result
}

/**
 * Collect node-by-node diffs between two layout trees.
 * Returns empty array if layouts match.
 */
export function diffLayouts(a: LayoutResult, b: LayoutResult, path = "root"): string[] {
  const diffs: string[] = []
  // Use Object.is for NaN-safe comparison (NaN === NaN is false, Object.is(NaN, NaN) is true)
  if (!Object.is(a.left, b.left)) diffs.push(`${path}: left ${a.left} vs ${b.left}`)
  if (!Object.is(a.top, b.top)) diffs.push(`${path}: top ${a.top} vs ${b.top}`)
  if (!Object.is(a.width, b.width)) diffs.push(`${path}: width ${a.width} vs ${b.width}`)
  if (!Object.is(a.height, b.height)) diffs.push(`${path}: height ${a.height} vs ${b.height}`)
  for (let i = 0; i < Math.max(a.children.length, b.children.length); i++) {
    if (a.children[i] && b.children[i]) {
      diffs.push(...diffLayouts(a.children[i]!, b.children[i]!, `${path}[${i}]`))
    } else if (a.children[i]) {
      diffs.push(`${path}[${i}]: missing in incremental`)
    } else {
      diffs.push(`${path}[${i}]: missing in reference`)
    }
  }
  return diffs
}

// ============================================================================
// Measure Functions
// ============================================================================

/**
 * Wrapping text measure function factory.
 * Simulates text of given width that wraps to multiple lines when constrained.
 */
export function textMeasure(textWidth: number): MeasureFunc {
  return (width: number, widthMode: number, _height: number, _heightMode: number) => {
    if (widthMode === MEASURE_MODE_EXACTLY || widthMode === MEASURE_MODE_AT_MOST) {
      if (width >= textWidth) return { width: textWidth, height: 1 }
      const lines = Math.ceil(textWidth / width)
      return { width: Math.min(textWidth, width), height: lines }
    }
    return { width: textWidth, height: 1 }
  }
}

// ============================================================================
// Assertions (throw on failure, no vitest dependency)
// ============================================================================

/**
 * Assert that all layout values are non-negative and width is finite.
 * Height may be NaN for auto-height trees with unconstrained height.
 * Throws a descriptive error on failure.
 */
export function assertLayoutSanity(node: Node, path = "root"): void {
  const w = node.getComputedWidth()
  const h = node.getComputedHeight()
  const l = node.getComputedLeft()
  const t = node.getComputedTop()

  if (w < 0) throw new Error(`${path}: width is negative (${w})`)
  if (!Number.isFinite(w)) throw new Error(`${path}: width is not finite (${w})`)
  if (!Number.isFinite(l)) throw new Error(`${path}: left is not finite (${l})`)
  if (Number.isFinite(h) && h < 0) throw new Error(`${path}: height is negative (${h})`)
  if (Number.isFinite(t) && t < 0) throw new Error(`${path}: top is negative (${t})`)

  for (let i = 0; i < node.getChildCount(); i++) {
    assertLayoutSanity(node.getChild(i)!, `${path}[${i}]`)
  }
}

/**
 * Differential oracle: re-layout of partially-dirty tree must match fresh layout.
 * Throws a descriptive error with node-by-node diff on failure.
 */
export function expectRelayoutMatchesFresh(
  buildTree: () => BuildTreeResult,
  layoutWidth: number,
  layoutHeight: number,
): void {
  // 1. Build, layout, mark dirty, re-layout
  const { root, dirtyTargets } = buildTree()
  root.calculateLayout(layoutWidth, layoutHeight, DIRECTION_LTR)
  for (const t of dirtyTargets) t.markDirty()
  root.calculateLayout(layoutWidth, layoutHeight, DIRECTION_LTR)
  const incremental = getLayout(root)

  // 2. Build identical fresh tree, layout once
  const fresh = buildTree()
  fresh.root.calculateLayout(layoutWidth, layoutHeight, DIRECTION_LTR)
  const reference = getLayout(fresh.root)

  // 3. Must be identical — show detailed diff on failure
  const diffs = diffLayouts(reference, incremental)
  if (diffs.length > 0) {
    const detail = diffs.map((d) => `  ${d}`).join("\n")
    throw new Error(
      `Incremental layout differs from fresh (${diffs.length} diffs):\n${detail}\n\nFresh:\n${formatLayout(reference)}\n\nIncremental:\n${formatLayout(incremental)}`,
    )
  }
}

/**
 * Assert that laying out twice with identical constraints produces identical results.
 * Catches non-determinism or state corruption from a single layout pass.
 */
export function expectIdempotent(buildTree: () => BuildTreeResult, layoutWidth: number, layoutHeight: number): void {
  const { root } = buildTree()
  root.calculateLayout(layoutWidth, layoutHeight, DIRECTION_LTR)
  const first = getLayout(root)
  root.calculateLayout(layoutWidth, layoutHeight, DIRECTION_LTR)
  const second = getLayout(root)

  const diffs = diffLayouts(first, second)
  if (diffs.length > 0) {
    const detail = diffs.map((d) => `  ${d}`).join("\n")
    throw new Error(`Layout not idempotent (${diffs.length} diffs after 2nd pass):\n${detail}`)
  }
}

/**
 * Assert that layout at width W, then different width W', then back to W
 * produces the same result as fresh layout at W.
 * Catches stale cache entries that don't update on constraint change.
 */
export function expectResizeRoundTrip(buildTree: () => BuildTreeResult, widths: number[]): void {
  const { root } = buildTree()
  for (const w of widths) {
    root.setWidth(w)
    root.calculateLayout(w, NaN, DIRECTION_LTR)
  }
  const incremental = getLayout(root)

  // Fresh reference at final width
  const finalWidth = widths[widths.length - 1]!
  const fresh = buildTree()
  fresh.root.setWidth(finalWidth)
  fresh.root.calculateLayout(finalWidth, NaN, DIRECTION_LTR)
  const reference = getLayout(fresh.root)

  const diffs = diffLayouts(reference, incremental)
  if (diffs.length > 0) {
    const detail = diffs.map((d) => `  ${d}`).join("\n")
    throw new Error(`Resize round-trip differs (widths: ${widths.join("→")}, ${diffs.length} diffs):\n${detail}`)
  }
}
