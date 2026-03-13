/**
 * Test: Phase 7a line cross sizes must use child's resolved flex.mainSize,
 * not the parent's mainAxisSize.
 *
 * Bug: When a wrapping container has children with measureFuncs, Phase 7a
 * estimates each line's cross size by measuring children against the parent's
 * main axis size. But after flex distribution (Phase 6a), each child's actual
 * width (flex.mainSize) may be smaller than the parent width. For text nodes,
 * measuring against the wider parent width produces fewer wrapped lines
 * (shorter height), underestimating the line's cross size.
 *
 * This causes line overlap when alignContent distributes lines based on
 * the underestimated cross sizes.
 */
import { describe, expect, it } from "vitest"
import {
  ALIGN_FLEX_START,
  DIRECTION_LTR,
  FLEX_DIRECTION_ROW,
  MEASURE_MODE_AT_MOST,
  MEASURE_MODE_EXACTLY,
  Node,
  WRAP_WRAP,
} from "../src/index.js"

/**
 * Creates a measure function simulating text of a given character width.
 * When constrained, the text wraps: height = ceil(textWidth / availableWidth).
 */
function textMeasure(textWidth: number) {
  return (width: number, widthMode: number, _height: number, _heightMode: number) => {
    if (widthMode === MEASURE_MODE_EXACTLY || widthMode === MEASURE_MODE_AT_MOST) {
      if (width >= textWidth) {
        return { width: textWidth, height: 1 }
      }
      const lines = Math.ceil(textWidth / width)
      return { width: Math.min(textWidth, width), height: lines }
    }
    return { width: textWidth, height: 1 }
  }
}

describe("wrapped line cross sizes use child resolved width", () => {
  it("line height reflects child flex.mainSize, not parent width", () => {
    // Parent row, width=40, wrap=true.
    // Two children with explicit width=25, text=35 chars.
    // Line breaking: 25+25=50 > 40, so each child on its own line.
    // Each child's flex.mainSize = 25.
    //
    // Phase 7a BUG: measures at parent width (40) → ceil(35/40)=1 → line height=1
    // CORRECT: measure at child mainSize (25) → ceil(35/25)=2 → line height=2

    const container = Node.create()
    container.setFlexDirection(FLEX_DIRECTION_ROW)
    container.setFlexWrap(WRAP_WRAP)
    container.setWidth(40)
    container.setAlignItems(ALIGN_FLEX_START)

    const childA = Node.create()
    childA.setWidth(25)
    childA.setMeasureFunc(textMeasure(35))
    container.insertChild(childA, 0)

    const childB = Node.create()
    childB.setWidth(25)
    childB.setMeasureFunc(textMeasure(35))
    container.insertChild(childB, 1)

    container.calculateLayout(40, NaN, DIRECTION_LTR)

    expect(childA.getComputedWidth()).toBe(25)
    expect(childB.getComputedWidth()).toBe(25)

    // Text 35 chars at width 25: ceil(35/25) = 2 lines
    expect(childA.getComputedHeight()).toBe(2)
    expect(childB.getComputedHeight()).toBe(2)

    // Child B on line 2, should be at top=2 (after line 1 height=2)
    // BUG: top=1 because Phase 7a underestimates line height as 1
    expect(childB.getComputedTop()).toBe(2)
  })

  it("line cross size accounts for child mainSize with multiple lines", () => {
    // 3 children, each width=20, text=25 chars. Parent width=30, wrap.
    // Only 1 child per line (20+20=40 > 30). 3 lines.
    // At parent width 30: ceil(25/30)=1. At child width 20: ceil(25/20)=2.

    const root = Node.create()
    root.setFlexDirection(FLEX_DIRECTION_ROW)
    root.setFlexWrap(WRAP_WRAP)
    root.setWidth(30)
    root.setAlignItems(ALIGN_FLEX_START)

    for (let i = 0; i < 3; i++) {
      const child = Node.create()
      child.setWidth(20)
      child.setMeasureFunc(textMeasure(25))
      root.insertChild(child, i)
    }

    root.calculateLayout(30, NaN, DIRECTION_LTR)

    for (let i = 0; i < 3; i++) {
      const child = root.getChild(i)!
      expect(child.getComputedWidth()).toBe(20)
      expect(child.getComputedHeight()).toBe(2) // ceil(25/20) = 2
    }

    // Line offsets: each line is height 2
    expect(root.getChild(0)!.getComputedTop()).toBe(0)
    expect(root.getChild(1)!.getComputedTop()).toBe(2)
    expect(root.getChild(2)!.getComputedTop()).toBe(4)

    // Container auto-height = 3 lines × 2 = 6
    expect(root.getComputedHeight()).toBe(6)
  })

  it("line cross size correct with maxWidth-constrained measureFunc children", () => {
    // Children with maxWidth=25 (no explicit width), text=40 chars. Parent width=40.
    // Phase 5: measure at AT_MOST 40 → {width:40, height:1}, clamped by maxWidth=25.
    // baseSize=25, mainSize=25.
    // 25+25=50 > 40 → each wraps to own line.
    // Phase 7a BUG: measures at parent width 40 → ceil(40/40)=1.
    // CORRECT: measures at child mainSize 25 → ceil(40/25)=2.

    const root = Node.create()
    root.setFlexDirection(FLEX_DIRECTION_ROW)
    root.setFlexWrap(WRAP_WRAP)
    root.setWidth(40)
    root.setAlignItems(ALIGN_FLEX_START)

    const c1 = Node.create()
    c1.setMaxWidth(25)
    c1.setMeasureFunc(textMeasure(40))
    root.insertChild(c1, 0)

    const c2 = Node.create()
    c2.setMaxWidth(25)
    c2.setMeasureFunc(textMeasure(40))
    root.insertChild(c2, 1)

    root.calculateLayout(40, NaN, DIRECTION_LTR)

    expect(c1.getComputedWidth()).toBe(25)
    expect(c2.getComputedWidth()).toBe(25)

    // At width 25: ceil(40/25) = 2
    expect(c1.getComputedHeight()).toBe(2)
    expect(c2.getComputedHeight()).toBe(2)

    // c2 on line 2, after line 1 height=2
    expect(c2.getComputedTop()).toBe(2)
    expect(root.getComputedHeight()).toBe(4)
  })
})
