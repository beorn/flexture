/**
 * Tests for measure-function flex items with flexGrow > 0.
 *
 * Bug: When flexGrow > 0, the intrinsic measurement is skipped,
 * so base size falls through to padding+border (often 0).
 * CSS spec says flex base size should still be content-based
 * regardless of flexGrow.
 *
 * Bead: km-flexily.measure-flex-grow
 */
import { describe, expect, it } from "vitest"
import {
  DIRECTION_LTR,
  FLEX_DIRECTION_ROW,
  FLEX_DIRECTION_COLUMN,
  MEASURE_MODE_AT_MOST,
  MEASURE_MODE_EXACTLY,
  Node,
} from "../src/index.js"
import { expectLayout } from "./test-utils.js"

describe("measure-function flex items with flexGrow", () => {
  it("should use intrinsic content size as base size when flexGrow > 0 (row)", () => {
    // Two text nodes with intrinsic widths 10 and 20, both flexGrow:1
    // Container width 60.
    //
    // Correct (CSS spec): base sizes are 10 and 20, total = 30, free = 30.
    // Each gets 15 extra (equal flexGrow). Final: 25 and 35.
    //
    // Bug: base sizes are 0 and 0 (measurement skipped), total = 0, free = 60.
    // Each gets 30 extra. Final: 30 and 30.
    const root = Node.create()
    root.setWidth(60)
    root.setHeight(10)
    root.setFlexDirection(FLEX_DIRECTION_ROW)

    const child1 = Node.create()
    child1.setMeasureFunc((_w, _wm, _h, _hm) => ({ width: 10, height: 1 }))
    child1.setFlexGrow(1)
    root.insertChild(child1, 0)

    const child2 = Node.create()
    child2.setMeasureFunc((_w, _wm, _h, _hm) => ({ width: 20, height: 1 }))
    child2.setFlexGrow(1)
    root.insertChild(child2, 1)

    root.calculateLayout(60, 10, DIRECTION_LTR)

    // With content-based base sizes: 10+15=25, 20+15=35
    expectLayout(child1, { width: 25 })
    expectLayout(child2, { width: 35 })
  })

  it("should use intrinsic content size as base size when flexGrow > 0 (column)", () => {
    // Same bug in column direction: intrinsic heights 10 and 20, flexGrow:1
    // Container height 60.
    const root = Node.create()
    root.setWidth(10)
    root.setHeight(60)
    root.setFlexDirection(FLEX_DIRECTION_COLUMN)

    const child1 = Node.create()
    child1.setMeasureFunc((_w, _wm, _h, _hm) => ({ width: 1, height: 10 }))
    child1.setFlexGrow(1)
    root.insertChild(child1, 0)

    const child2 = Node.create()
    child2.setMeasureFunc((_w, _wm, _h, _hm) => ({ width: 1, height: 20 }))
    child2.setFlexGrow(1)
    root.insertChild(child2, 1)

    root.calculateLayout(10, 60, DIRECTION_LTR)

    // With content-based base sizes: 10+15=25, 20+15=35
    expectLayout(child1, { height: 25 })
    expectLayout(child2, { height: 35 })
  })

  it("should still grow from measured base size with unequal flexGrow", () => {
    // Child1: intrinsic width 10, flexGrow: 1
    // Child2: intrinsic width 20, flexGrow: 2
    // Container width 60. Free space = 30.
    // Child1 gets 30 * 1/3 = 10 extra -> 20
    // Child2 gets 30 * 2/3 = 20 extra -> 40
    const root = Node.create()
    root.setWidth(60)
    root.setHeight(10)
    root.setFlexDirection(FLEX_DIRECTION_ROW)

    const child1 = Node.create()
    child1.setMeasureFunc((_w, _wm, _h, _hm) => ({ width: 10, height: 1 }))
    child1.setFlexGrow(1)
    root.insertChild(child1, 0)

    const child2 = Node.create()
    child2.setMeasureFunc((_w, _wm, _h, _hm) => ({ width: 20, height: 1 }))
    child2.setFlexGrow(2)
    root.insertChild(child2, 1)

    root.calculateLayout(60, 10, DIRECTION_LTR)

    expectLayout(child1, { width: 20 })
    expectLayout(child2, { width: 40 })
  })

  it("should mix measured flexGrow items with non-measured flexGrow items", () => {
    // Child1: measured, intrinsic width 10, flexGrow: 1
    // Child2: no measure, no explicit width, flexGrow: 1 (base = 0)
    // Container width 60. Free = 50 (60 - 10 - 0).
    // Each gets 25 extra. Final: 35 and 25.
    const root = Node.create()
    root.setWidth(60)
    root.setHeight(10)
    root.setFlexDirection(FLEX_DIRECTION_ROW)

    const child1 = Node.create()
    child1.setMeasureFunc((_w, _wm, _h, _hm) => ({ width: 10, height: 1 }))
    child1.setFlexGrow(1)
    root.insertChild(child1, 0)

    const child2 = Node.create()
    child2.setFlexGrow(1)
    root.insertChild(child2, 1)

    root.calculateLayout(60, 10, DIRECTION_LTR)

    expectLayout(child1, { width: 35 })
    expectLayout(child2, { width: 25 })
  })

  it("should preserve correct base size when flexGrow is 0 (existing behavior)", () => {
    // Sanity check: flexGrow=0 still works (the existing code path)
    const root = Node.create()
    root.setWidth(60)
    root.setHeight(10)
    root.setFlexDirection(FLEX_DIRECTION_ROW)

    const child1 = Node.create()
    child1.setMeasureFunc((_w, _wm, _h, _hm) => ({ width: 10, height: 1 }))
    root.insertChild(child1, 0)

    const child2 = Node.create()
    child2.setMeasureFunc((_w, _wm, _h, _hm) => ({ width: 20, height: 1 }))
    root.insertChild(child2, 1)

    root.calculateLayout(60, 10, DIRECTION_LTR)

    // No flexGrow, so they stay at intrinsic sizes
    expectLayout(child1, { width: 10 })
    expectLayout(child2, { width: 20 })
  })
})
