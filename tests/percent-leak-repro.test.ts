import { describe, test, expect } from "vitest"
import {
  Node,
  DIRECTION_LTR,
  FLEX_DIRECTION_COLUMN,
  FLEX_DIRECTION_ROW,
  UNIT_POINT,
} from "../src/index.js"

// Synthetic repro for @km/flexily/15164-percent-phantom-leak.
//
// The bead claims: a descendant with maxWidth="100%" inside a fitWidth
// container pollutes the lane chooser's max-content read, forcing it to
// snap to the largest lane regardless of intrinsic content size.
//
// Post-AutoFit-deletion (silvery A0.7, 2026-05-13 SHA 86f300f4), fitWidth
// calls `measureNode(child, NaN, NaN)` for max-content measurement — NaN
// propagates → percent maxWidth resolves to 0 in applyMinMax → no
// pollution. This test confirms the post-A0.7 behavior is correct, i.e.
// the bug described in the bead is obsolete.

describe("fitWidth + descendant maxWidth='100%' (regression repro for 15164)", () => {
  test("column-flex fitWidth picks smallest lane >= content (not polluted by percent maxWidth)", () => {
    const root = Node.create()
    root.setFlexDirection(FLEX_DIRECTION_COLUMN)
    root.setFitWidth([
      { unit: UNIT_POINT, value: 100 },
      { unit: UNIT_POINT, value: 500 },
    ])
    // Parent context: real available width, like silvercode's pane.
    root.setWidth(500)
    root.setHeight(100)

    const child = Node.create()
    child.setMaxWidthPercent(100) // The "pollutant" — was breaking AutoFit
    child.setMeasureFunc(() => ({ width: 5, height: 1 }))
    root.insertChild(child, 0)

    root.calculateLayout(undefined, undefined, DIRECTION_LTR)

    // EXPECTED: lane picker reads max-content as 5 (the measurer), picks 100
    // (smallest >= 5). BUG (if percent leak persists): reads max-content as
    // ~500 (polluted), picks 500.
    expect(root.getComputedWidth()).toBe(100)
  })

  test("row-flex fitWidth picks smallest lane >= content", () => {
    const root = Node.create()
    root.setFlexDirection(FLEX_DIRECTION_ROW)
    root.setFitWidth([
      { unit: UNIT_POINT, value: 100 },
      { unit: UNIT_POINT, value: 500 },
    ])
    root.setWidth(500)
    root.setHeight(100)

    const child = Node.create()
    child.setMaxWidthPercent(100)
    child.setMeasureFunc(() => ({ width: 5, height: 1 }))
    root.insertChild(child, 0)

    root.calculateLayout(undefined, undefined, DIRECTION_LTR)
    expect(root.getComputedWidth()).toBe(100)
  })

  test("nested column-flex with percent-maxWidth child (silvercode MarkdownView shape)", () => {
    // Outer fitWidth container (the AutoFit replacement)
    const root = Node.create()
    root.setFlexDirection(FLEX_DIRECTION_COLUMN)
    root.setFitWidth([
      { unit: UNIT_POINT, value: 60 },
      { unit: UNIT_POINT, value: 80 },
      { unit: UNIT_POINT, value: 500 },
    ])
    root.setWidth(500)
    root.setHeight(100)

    // Inner column-flex (like MarkdownView)
    const inner = Node.create()
    inner.setFlexDirection(FLEX_DIRECTION_COLUMN)
    root.insertChild(inner, 0)

    // Block (like Content.Prose) with maxWidth="100%" + measureFunc returning short
    const block = Node.create()
    block.setMaxWidthPercent(100)
    block.setMeasureFunc(() => ({ width: 50, height: 1 })) // intrinsic ~50
    inner.insertChild(block, 0)

    root.calculateLayout(undefined, undefined, DIRECTION_LTR)
    // Should pick 60 (smallest >= 50), NOT 500.
    expect(root.getComputedWidth()).toBe(60)
  })
})
