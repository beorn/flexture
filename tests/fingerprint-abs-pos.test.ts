/**
 * Fingerprint caching must include absX/absY for edge-based rounding correctness.
 *
 * Bug: km-flexily.fingerprint-abs-pos
 *
 * The fingerprint used for layout caching only compares availableWidth,
 * availableHeight, direction, and offset — but NOT the absolute position
 * (absX/absY) that affects edge-based rounding. When a fractional ancestor
 * movement changes absolute coordinates, the rounded edges change, but the
 * fingerprint falsely matches and returns stale widths/heights.
 *
 * Edge-based rounding: width = round(absRight) - round(absLeft).
 * Phase 10 computes: absNodeLeft = absX + margin + posOffset
 *                    width = round(absNodeRight) - round(absNodeLeft)
 *
 * The bug manifests when:
 * 1. A node's Phase 10 width depends on absX (fractional nodeWidth)
 * 2. The node is NOT dirty (sibling changed, not this node)
 * 3. The fingerprint matches (same availW/availH/dir) even though absX changed
 * 4. The stale width from the old absX is returned
 *
 * Auto-sized containers with fractional padding have fractional nodeWidth
 * (e.g., child width 10 + padding 0.3 = nodeWidth 10.3). Their Phase 10
 * produces: width = round(absX + 10.3) - round(absX), which varies with absX.
 * The parent doesn't override their main-axis width (mainIsAutoChild=true).
 */

import { describe, test, expect } from "vitest"
import { Node, DIRECTION_LTR, FLEX_DIRECTION_ROW, FLEX_DIRECTION_COLUMN, EDGE_LEFT, EDGE_TOP } from "../src/index.js"
import { getLayout, diffLayouts, formatLayout } from "../src/testing.js"

describe("Fingerprint must include absX/absY for edge-based rounding", () => {
  test("auto-width container with fractional padding: absX shift changes width", () => {
    // Row: [spacer, container(auto-width, padding-left=0.3) > [child(width=10)]]
    //
    // Container nodeWidth = 10 + 0.3 = 10.3 (fractional from padding)
    // Phase 10: width = round(absX + 10.3) - round(absX)
    //
    // At absX=0:   round(10.3) - round(0) = 10 - 0 = 10
    // At absX=0.3: round(10.6) - round(0.3) = 11 - 0 = 11
    //
    // Incremental: spacer=0 → container at absX=0, width=10
    //              spacer=0.3 → container at absX=0.3, fingerprint matches, stale width=10
    // Fresh:       spacer=0.3 → container at absX=0.3, width=11
    //
    // BUG: incremental returns width=10, fresh returns width=11

    const r = Node.create()
    r.setFlexDirection(FLEX_DIRECTION_ROW)
    r.setWidth(100)
    r.setHeight(50)

    const spacer = Node.create()
    spacer.setWidth(0)
    spacer.setHeight(50)
    r.insertChild(spacer, 0)

    const container = Node.create()
    container.setFlexDirection(FLEX_DIRECTION_ROW)
    container.setHeight(50)
    container.setPadding(EDGE_LEFT, 0.3)
    r.insertChild(container, 1)

    const inner = Node.create()
    inner.setWidth(10)
    inner.setHeight(50)
    container.insertChild(inner, 0)

    // Pass 1: spacer=0, container absX=0, width = round(10.3)-round(0) = 10
    r.calculateLayout(100, 50, DIRECTION_LTR)
    expect(container.getComputedWidth()).toBe(10)

    // Pass 2: change spacer to 0.3, container absX shifts to 0.3
    spacer.setWidth(0.3)
    r.calculateLayout(100, 50, DIRECTION_LTR)

    // Fresh reference
    const rFresh = Node.create()
    rFresh.setFlexDirection(FLEX_DIRECTION_ROW)
    rFresh.setWidth(100)
    rFresh.setHeight(50)

    const sFresh = Node.create()
    sFresh.setWidth(0.3)
    sFresh.setHeight(50)
    rFresh.insertChild(sFresh, 0)

    const cFresh = Node.create()
    cFresh.setFlexDirection(FLEX_DIRECTION_ROW)
    cFresh.setHeight(50)
    cFresh.setPadding(EDGE_LEFT, 0.3)
    rFresh.insertChild(cFresh, 1)

    const iFresh = Node.create()
    iFresh.setWidth(10)
    iFresh.setHeight(50)
    cFresh.insertChild(iFresh, 0)

    rFresh.calculateLayout(100, 50, DIRECTION_LTR)

    // Fresh: container absX=0.3, width = round(10.6)-round(0.3) = 11-0 = 11
    expect(cFresh.getComputedWidth()).toBe(11)

    // Incremental must match fresh
    expect(container.getComputedWidth()).toBe(cFresh.getComputedWidth())
  })

  test("differential oracle: fractional padding container shifts with spacer", () => {
    // Same bug via differential oracle pattern
    function buildTree(spacerWidth: number) {
      const root = Node.create()
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setWidth(100)
      root.setHeight(50)

      const spacer = Node.create()
      spacer.setWidth(spacerWidth)
      spacer.setHeight(50)
      root.insertChild(spacer, 0)

      const container = Node.create()
      container.setFlexDirection(FLEX_DIRECTION_ROW)
      container.setHeight(50)
      container.setPadding(EDGE_LEFT, 0.3)
      root.insertChild(container, 1)

      const inner = Node.create()
      inner.setWidth(10)
      inner.setHeight(50)
      container.insertChild(inner, 0)

      return { root, spacer }
    }

    // Incremental: layout at spacer=0, change to spacer=0.3
    const { root: incRoot, spacer: incSpacer } = buildTree(0)
    incRoot.calculateLayout(100, 50, DIRECTION_LTR)
    incSpacer.setWidth(0.3)
    incRoot.calculateLayout(100, 50, DIRECTION_LTR)
    const incrementalLayout = getLayout(incRoot)

    // Fresh: layout at spacer=0.3
    const { root: freshRoot } = buildTree(0.3)
    freshRoot.calculateLayout(100, 50, DIRECTION_LTR)
    const freshLayout = getLayout(freshRoot)

    const diffs = diffLayouts(freshLayout, incrementalLayout)
    if (diffs.length > 0) {
      const detail = diffs.map((d) => `  ${d}`).join("\n")
      throw new Error(
        `Incremental layout differs from fresh (${diffs.length} diffs):\n${detail}\n\n` +
          `Fresh:\n${formatLayout(freshLayout)}\n\nIncremental:\n${formatLayout(incrementalLayout)}`,
      )
    }
  })

  test("Y-axis: auto-height column container with fractional padding", () => {
    // Same bug on Y axis: column layout with fractional top padding
    function buildTree(spacerHeight: number) {
      const root = Node.create()
      root.setFlexDirection(FLEX_DIRECTION_COLUMN)
      root.setWidth(50)
      root.setHeight(200)

      const spacer = Node.create()
      spacer.setWidth(50)
      spacer.setHeight(spacerHeight)
      root.insertChild(spacer, 0)

      const container = Node.create()
      container.setFlexDirection(FLEX_DIRECTION_COLUMN)
      container.setWidth(50)
      // Auto height, fractional top padding → fractional nodeHeight
      container.setPadding(EDGE_TOP, 0.3)
      root.insertChild(container, 1)

      const inner = Node.create()
      inner.setWidth(50)
      inner.setHeight(10)
      container.insertChild(inner, 0)

      return { root, spacer, container }
    }

    // Incremental: spacer=0 → spacer=0.3
    const { root: incRoot, spacer: incSpacer, container: incContainer } = buildTree(0)
    incRoot.calculateLayout(50, 200, DIRECTION_LTR)
    const heightBefore = incContainer.getComputedHeight()

    incSpacer.setHeight(0.3)
    incRoot.calculateLayout(50, 200, DIRECTION_LTR)

    // Fresh reference
    const { root: freshRoot, container: freshContainer } = buildTree(0.3)
    freshRoot.calculateLayout(50, 200, DIRECTION_LTR)

    // Must match
    expect(incContainer.getComputedHeight()).toBe(freshContainer.getComputedHeight())
  })

  test("nested: row > [spacer, row(auto-w, padding) > [row(auto-w, padding) > [child]]]", () => {
    // Deeper nesting where the innermost auto-width container has fractional padding.
    // Both the middle and inner containers are auto-width rows, so their Phase 10
    // widths depend on absX and are NOT overridden by the parent.
    function buildTree(spacerWidth: number) {
      const root = Node.create()
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setWidth(200)
      root.setHeight(50)

      const spacer = Node.create()
      spacer.setWidth(spacerWidth)
      spacer.setHeight(50)
      root.insertChild(spacer, 0)

      // Middle: auto-width row with fractional padding (not overridden by parent)
      const middle = Node.create()
      middle.setFlexDirection(FLEX_DIRECTION_ROW)
      middle.setHeight(50)
      middle.setPadding(EDGE_LEFT, 0.3)
      root.insertChild(middle, 1)

      // Inner: auto-width row with fractional padding inside middle
      const inner = Node.create()
      inner.setFlexDirection(FLEX_DIRECTION_ROW)
      inner.setHeight(50)
      inner.setPadding(EDGE_LEFT, 0.3)
      middle.insertChild(inner, 0)

      const leaf = Node.create()
      leaf.setWidth(10)
      leaf.setHeight(50)
      inner.insertChild(leaf, 0)

      return { root, spacer, middle, inner }
    }

    // Incremental
    const { root: incRoot, spacer: incSpacer, middle: incMiddle, inner: incInner } = buildTree(0)
    incRoot.calculateLayout(200, 50, DIRECTION_LTR)
    incSpacer.setWidth(0.3)
    incRoot.calculateLayout(200, 50, DIRECTION_LTR)

    // Fresh
    const { root: freshRoot, middle: freshMiddle, inner: freshInner } = buildTree(0.3)
    freshRoot.calculateLayout(200, 50, DIRECTION_LTR)

    // Both middle and inner containers must match fresh
    expect(incMiddle.getComputedWidth()).toBe(freshMiddle.getComputedWidth())
    expect(incInner.getComputedWidth()).toBe(freshInner.getComputedWidth())
  })
})
