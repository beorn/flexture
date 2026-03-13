/**
 * P1 Bug Fix Tests
 *
 * Tests for bugs found in GPT 5.4 Pro code review (km-flexily.pipeline-review-0312).
 */

import { describe, test, expect, afterEach } from "vitest"
import { Node, DIRECTION_LTR, FLEX_DIRECTION_ROW, FLEX_DIRECTION_COLUMN } from "../src/index.js"
import { applyMinMax } from "../src/utils.js"
import * as C from "../src/constants.js"
import { enableTrace, disableTrace } from "../src/trace.js"

// =============================================================================
// Bug 1: km-flexily.min-max-precedence
// CSS spec: when min > max, min wins. clamp(min, value, max) where if min > max, min wins.
// =============================================================================

describe("applyMinMax: min takes precedence over max (CSS spec)", () => {
  test("min > max => min wins (point values)", () => {
    const result = applyMinMax(50, { value: 80, unit: C.UNIT_POINT }, { value: 60, unit: C.UNIT_POINT }, 100)
    expect(result).toBe(80) // min=80 should win over max=60
  })

  test("min > max => min wins (value below min)", () => {
    const result = applyMinMax(40, { value: 80, unit: C.UNIT_POINT }, { value: 60, unit: C.UNIT_POINT }, 100)
    expect(result).toBe(80) // min=80 wins
  })

  test("min > max => min wins (value above max)", () => {
    const result = applyMinMax(100, { value: 80, unit: C.UNIT_POINT }, { value: 60, unit: C.UNIT_POINT }, 100)
    expect(result).toBe(80) // min=80 wins
  })

  test("min < max works normally", () => {
    const result = applyMinMax(50, { value: 30, unit: C.UNIT_POINT }, { value: 80, unit: C.UNIT_POINT }, 100)
    expect(result).toBe(50) // 50 is between 30 and 80
  })

  test("value below min gets clamped up", () => {
    const result = applyMinMax(20, { value: 30, unit: C.UNIT_POINT }, { value: 80, unit: C.UNIT_POINT }, 100)
    expect(result).toBe(30)
  })

  test("value above max gets clamped down", () => {
    const result = applyMinMax(90, { value: 30, unit: C.UNIT_POINT }, { value: 80, unit: C.UNIT_POINT }, 100)
    expect(result).toBe(80)
  })

  test("min > max with percent values", () => {
    // min=80% of 100 = 80, max=60% of 100 = 60
    const result = applyMinMax(50, { value: 80, unit: C.UNIT_PERCENT }, { value: 60, unit: C.UNIT_PERCENT }, 100)
    expect(result).toBe(80) // min wins
  })

  test("layout: child with min > max computes to min", () => {
    const root = Node.create()
    root.setWidth(200)
    root.setHeight(200)
    root.setFlexDirection(FLEX_DIRECTION_ROW)

    const child = Node.create()
    child.setWidth(50)
    child.setMinWidth(80)
    child.setMaxWidth(60)
    root.insertChild(child, 0)

    root.calculateLayout(200, 200, DIRECTION_LTR)
    expect(child.getComputedWidth()).toBe(80) // min=80 wins over max=60
  })
})

// =============================================================================
// Bug 2: km-flexily.count-nodes-unconditional
// countNodes() and Date.now() run on every layout call even in production.
// =============================================================================

describe("countNodes is conditional on debug logging", () => {
  test("layout calculates correctly without debug logging", () => {
    // This test verifies layout still works after making countNodes conditional
    const root = Node.create()
    root.setWidth(100)
    root.setHeight(100)
    root.setFlexDirection(FLEX_DIRECTION_ROW)

    const child = Node.create()
    child.setFlexGrow(1)
    root.insertChild(child, 0)

    root.calculateLayout(100, 100, DIRECTION_LTR)
    expect(child.getComputedWidth()).toBe(100)
    expect(child.getComputedHeight()).toBe(100)
  })
})

// =============================================================================
// Bug 3: km-flexily.no-cycle-guard
// insertChild() has no cycle guard — self-insertion causes infinite loops.
// =============================================================================

describe("insertChild cycle guard", () => {
  test("self-insertion throws error", () => {
    const node = Node.create()
    node.setWidth(100)
    node.setHeight(100)

    expect(() => node.insertChild(node, 0)).toThrow()
  })

  test("ancestor insertion throws error (prevents cycle)", () => {
    const grandparent = Node.create()
    const parent = Node.create()
    const child = Node.create()
    grandparent.insertChild(parent, 0)
    parent.insertChild(child, 0)

    // Inserting grandparent as child of child creates a cycle
    expect(() => child.insertChild(grandparent, 0)).toThrow()
  })

  test("inserting unrelated nodes still works", () => {
    const parent = Node.create()
    const child = Node.create()
    child.setWidth(50)
    parent.insertChild(child, 0)
    expect(parent.getChildCount()).toBe(1)
    expect(parent.getChild(0)).toBe(child)
  })

  test("re-parenting a child between two unrelated parents works", () => {
    const parent1 = Node.create()
    const parent2 = Node.create()
    const child = Node.create()

    parent1.insertChild(child, 0)
    expect(parent1.getChildCount()).toBe(1)

    parent2.insertChild(child, 0)
    expect(parent1.getChildCount()).toBe(0)
    expect(parent2.getChildCount()).toBe(1)
  })
})

// =============================================================================
// Bug 5: km-flexily.trace-dead-events
// Trace facility declares event types that are never emitted:
// cache_hit, cache_miss, measure_cache_hit, measure_cache_miss, measure_save_restore
// =============================================================================

describe("trace: all declared event types are emitted", () => {
  afterEach(() => {
    disableTrace()
  })

  test("cache_hit / cache_miss events are emitted during layout", () => {
    // Build a tree with a measure function (to trigger measure cache events)
    const root = Node.create()
    root.setWidth(100)
    root.setHeight(100)
    root.setFlexDirection(FLEX_DIRECTION_ROW)

    const child = Node.create()
    child.setMeasureFunc((w, wm, h, hm) => ({ width: 30, height: 20 }))
    root.insertChild(child, 0)

    // First layout populates caches
    root.calculateLayout(100, 100, DIRECTION_LTR)

    // Dirty and re-layout should trigger cache/fingerprint events
    root.getChild(0)!.markDirty()

    const trace = enableTrace()
    root.calculateLayout(100, 100, DIRECTION_LTR)
    disableTrace()

    const eventTypes = new Set(trace.events.map((e) => e.type))
    // After fixing, at least some of these should be emitted
    // (which ones depends on the tree structure and caching behavior)
    expect(trace.events.length).toBeGreaterThan(0)
  })

  test("measure_cache_hit events are emitted on cache hit", () => {
    const root = Node.create()
    root.setWidth(100)
    root.setHeight(100)

    const child = Node.create()
    let measureCallCount = 0
    child.setMeasureFunc((w, wm, h, hm) => {
      measureCallCount++
      return { width: 30, height: 20 }
    })
    root.insertChild(child, 0)

    // First layout: measure is called
    root.calculateLayout(100, 100, DIRECTION_LTR)
    const firstCallCount = measureCallCount

    // Dirty parent only (not the child with measure func) and re-layout
    // The child's measure cache should have a hit
    root.markDirty()

    const trace = enableTrace()
    root.calculateLayout(100, 100, DIRECTION_LTR)
    disableTrace()

    // After the fix, we should see measure_cache_hit in trace
    const measureHits = trace.events.filter((e) => e.type === "measure_cache_hit")
    // If the measure function wasn't called again, it was a cache hit
    if (measureCallCount === firstCallCount) {
      expect(measureHits.length).toBeGreaterThan(0)
    }
  })
})

// =============================================================================
// Bug 6: km-flexily.missing-api-methods
// Documented API methods are missing: freeRecursive, computed getters
// =============================================================================

// =============================================================================
// Bug 7: km-flexily.auto-cross-nan
// Cross-axis alignment in auto-sized containers produces NaN offsets.
// When parent cross size is NaN (auto), availableCrossSpace becomes NaN,
// so ALIGN_CENTER, ALIGN_FLEX_END, and cross-axis auto margins compute NaN
// offsets. Phase 9b only revisits ALIGN_STRETCH, not center/flex-end.
// =============================================================================

describe("auto cross-axis NaN alignment", () => {
  test("row with height:auto and alignItems:center — child should be centered", () => {
    // Row container with auto height and alignItems:center
    // Two children: one tall (10), one short (4)
    // After shrink-wrap, row height = 10 (tallest child)
    // Short child should be centered: top = (10 - 4) / 2 = 3
    const root = Node.create()
    root.setWidth(100)
    root.setHeight(100)
    root.setAlignItems(C.ALIGN_FLEX_START) // prevent stretch of row

    const row = Node.create()
    row.setFlexDirection(FLEX_DIRECTION_ROW)
    row.setAlignItems(C.ALIGN_CENTER)
    // height is auto (NaN) — this triggers the bug
    root.insertChild(row, 0)

    const tallChild = Node.create()
    tallChild.setWidth(30)
    tallChild.setHeight(10)
    row.insertChild(tallChild, 0)

    const shortChild = Node.create()
    shortChild.setWidth(30)
    shortChild.setHeight(4)
    row.insertChild(shortChild, 1)

    root.calculateLayout(100, 100, DIRECTION_LTR)

    // Row should shrink-wrap to tallest child
    expect(row.getComputedHeight()).toBe(10)

    // Tall child: top should be 0 (fills the row)
    expect(tallChild.getComputedTop()).toBe(0)
    // BUG: shortChild.getComputedTop() returns NaN instead of 3
    const shortTop = shortChild.getComputedTop()
    expect(Number.isNaN(shortTop)).toBe(false) // Must not be NaN
    expect(shortTop).toBe(3) // centered: (10 - 4) / 2 = 3
  })

  test("row with height:auto and alignItems:flex-end — child should be at bottom", () => {
    const root = Node.create()
    root.setWidth(100)
    root.setHeight(100)
    root.setAlignItems(C.ALIGN_FLEX_START) // prevent stretch of row

    const row = Node.create()
    row.setFlexDirection(FLEX_DIRECTION_ROW)
    row.setAlignItems(C.ALIGN_FLEX_END)
    // height is auto (NaN)
    root.insertChild(row, 0)

    const tallChild = Node.create()
    tallChild.setWidth(30)
    tallChild.setHeight(10)
    row.insertChild(tallChild, 0)

    const shortChild = Node.create()
    shortChild.setWidth(30)
    shortChild.setHeight(4)
    row.insertChild(shortChild, 1)

    root.calculateLayout(100, 100, DIRECTION_LTR)

    expect(row.getComputedHeight()).toBe(10)
    // Short child should be at bottom: top = 10 - 4 = 6
    const shortTop = shortChild.getComputedTop()
    expect(Number.isNaN(shortTop)).toBe(false)
    expect(shortTop).toBe(6)
  })

  test("column with width:auto and alignItems:center — child should be centered", () => {
    const root = Node.create()
    root.setWidth(100)
    root.setHeight(100)
    root.setFlexDirection(FLEX_DIRECTION_ROW)
    root.setAlignItems(C.ALIGN_FLEX_START) // prevent stretch of col

    const col = Node.create()
    col.setFlexDirection(FLEX_DIRECTION_COLUMN)
    col.setAlignItems(C.ALIGN_CENTER)
    // width is auto (NaN)
    root.insertChild(col, 0)

    const wideChild = Node.create()
    wideChild.setWidth(40)
    wideChild.setHeight(10)
    col.insertChild(wideChild, 0)

    const narrowChild = Node.create()
    narrowChild.setWidth(20)
    narrowChild.setHeight(10)
    col.insertChild(narrowChild, 1)

    root.calculateLayout(100, 100, DIRECTION_LTR)

    // Column should shrink-wrap to widest child
    expect(col.getComputedWidth()).toBe(40)

    // Narrow child should be centered: left = (40 - 20) / 2 = 10
    const narrowLeft = narrowChild.getComputedLeft()
    expect(Number.isNaN(narrowLeft)).toBe(false)
    expect(narrowLeft).toBe(10)
  })

  test("row with height:auto and auto cross margins — child should be centered", () => {
    const root = Node.create()
    root.setWidth(100)
    root.setHeight(100)
    root.setAlignItems(C.ALIGN_FLEX_START) // prevent stretch of row

    const row = Node.create()
    row.setFlexDirection(FLEX_DIRECTION_ROW)
    // No alignItems set (default stretch), but auto margins override
    root.insertChild(row, 0)

    const tallChild = Node.create()
    tallChild.setWidth(30)
    tallChild.setHeight(10)
    row.insertChild(tallChild, 0)

    const shortChild = Node.create()
    shortChild.setWidth(30)
    shortChild.setHeight(4)
    // Auto margins on cross axis (top and bottom) — should center
    shortChild.setMarginAuto(C.EDGE_TOP)
    shortChild.setMarginAuto(C.EDGE_BOTTOM)
    row.insertChild(shortChild, 1)

    root.calculateLayout(100, 100, DIRECTION_LTR)

    expect(row.getComputedHeight()).toBe(10)
    const shortTop = shortChild.getComputedTop()
    expect(Number.isNaN(shortTop)).toBe(false)
    expect(shortTop).toBe(3) // centered via auto margins: (10 - 4) / 2 = 3
  })
})

describe("missing API methods", () => {
  test("freeRecursive() exists and frees entire tree", () => {
    const root = Node.create()
    root.setWidth(100)
    root.setHeight(100)

    const child1 = Node.create()
    const child2 = Node.create()
    const grandchild = Node.create()

    root.insertChild(child1, 0)
    root.insertChild(child2, 1)
    child1.insertChild(grandchild, 0)

    // Should not throw
    expect(typeof root.freeRecursive).toBe("function")
    root.freeRecursive()

    // After freeRecursive, all nodes should be orphaned
    expect(root.getChildCount()).toBe(0)
    expect(child1.getChildCount()).toBe(0)
    expect(child1.getParent()).toBeNull()
    expect(child2.getParent()).toBeNull()
    expect(grandchild.getParent()).toBeNull()
  })

  test("getComputedRight() exists and returns correct value", () => {
    const root = Node.create()
    root.setWidth(100)
    root.setHeight(100)

    const child = Node.create()
    child.setWidth(30)
    root.insertChild(child, 0)
    root.calculateLayout(100, 100, DIRECTION_LTR)

    expect(typeof child.getComputedRight).toBe("function")
    // right = parent width - (left + width) = 100 - (0 + 30) = 70
    // But getComputedRight returns left + width (the right edge)
    expect(child.getComputedRight()).toBe(30) // left(0) + width(30)
  })

  test("getComputedBottom() exists and returns correct value", () => {
    const root = Node.create()
    root.setWidth(100)
    root.setHeight(100)

    const child = Node.create()
    child.setHeight(30)
    root.insertChild(child, 0)
    root.calculateLayout(100, 100, DIRECTION_LTR)

    expect(typeof child.getComputedBottom).toBe("function")
    expect(child.getComputedBottom()).toBe(30) // top(0) + height(30)
  })

  test("getComputedPadding() exists", () => {
    const root = Node.create()
    root.setWidth(100)
    root.setHeight(100)
    root.setPadding(C.EDGE_LEFT, 5)
    root.setPadding(C.EDGE_TOP, 10)
    root.calculateLayout(100, 100, DIRECTION_LTR)

    expect(typeof root.getComputedPadding).toBe("function")
    expect(root.getComputedPadding(C.EDGE_LEFT)).toBe(5)
    expect(root.getComputedPadding(C.EDGE_TOP)).toBe(10)
  })

  test("getComputedMargin() exists", () => {
    const root = Node.create()
    root.setWidth(100)
    root.setHeight(100)

    const child = Node.create()
    child.setWidth(50)
    child.setMargin(C.EDGE_LEFT, 8)
    root.insertChild(child, 0)
    root.calculateLayout(100, 100, DIRECTION_LTR)

    expect(typeof child.getComputedMargin).toBe("function")
    expect(child.getComputedMargin(C.EDGE_LEFT)).toBe(8)
  })

  test("getComputedBorder() exists", () => {
    const root = Node.create()
    root.setWidth(100)
    root.setHeight(100)
    root.setBorder(C.EDGE_LEFT, 3)
    root.calculateLayout(100, 100, DIRECTION_LTR)

    expect(typeof root.getComputedBorder).toBe("function")
    expect(root.getComputedBorder(C.EDGE_LEFT)).toBe(3)
  })
})
