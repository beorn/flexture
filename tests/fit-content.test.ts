/**
 * Tests for native fit-content and snug-content width modes.
 *
 * CSS fit-content = min(max-content, max(min-content, available-width))
 * For terminals: min(max-content, available-width)
 */

import { describe, test, expect } from "vitest"
import {
  Node,
  DIRECTION_LTR,
  FLEX_DIRECTION_ROW,
  FLEX_DIRECTION_COLUMN,
  MEASURE_MODE_AT_MOST,
  MEASURE_MODE_EXACTLY,
  MEASURE_MODE_UNDEFINED,
} from "../src/index.js"
import { expectLayout } from "./test-utils.js"

// Simple measure function: text that wraps at given width
function textMeasure(intrinsicWidth: number, lineHeight: number = 1) {
  return (width: number, widthMode: number, _height: number, _heightMode: number) => {
    const effectiveWidth =
      widthMode === MEASURE_MODE_UNDEFINED || widthMode === MEASURE_MODE_AT_MOST
        ? Math.min(intrinsicWidth, width === Infinity ? intrinsicWidth : width)
        : width
    const lines = Math.ceil(intrinsicWidth / Math.max(1, effectiveWidth))
    return { width: effectiveWidth, height: lines * lineHeight }
  }
}

describe("fit-content width", () => {
  test("shrink-wraps to content when content < available", () => {
    // Container 80 wide, fit-content child with 30-wide content
    const root = Node.create()
    root.setWidth(80)
    root.setHeight(24)
    root.setFlexDirection(FLEX_DIRECTION_COLUMN)

    const child = Node.create()
    child.setWidthFitContent()
    root.insertChild(child, 0)

    // Leaf with 30-wide text
    const text = Node.create()
    text.setMeasureFunc(textMeasure(30))
    child.insertChild(text, 0)

    root.calculateLayout(80, 24, DIRECTION_LTR)

    // Child should shrink-wrap to content (30), not stretch to 80
    expectLayout(child, { width: 30, height: 1 })
  })

  test("clamps to available when content > available", () => {
    // Container 40 wide, fit-content child with 100-wide content
    const root = Node.create()
    root.setWidth(40)
    root.setHeight(24)
    root.setFlexDirection(FLEX_DIRECTION_COLUMN)

    const child = Node.create()
    child.setWidthFitContent()
    root.insertChild(child, 0)

    const text = Node.create()
    text.setMeasureFunc(textMeasure(100))
    child.insertChild(text, 0)

    root.calculateLayout(40, 24, DIRECTION_LTR)

    // Child should clamp to available width (40), not overflow to 100
    expectLayout(child, { width: 40 })
    // Text wraps to multiple lines
    expect(text.getComputedHeight()).toBeGreaterThan(1)
  })

  test("respects maxWidth when set", () => {
    const root = Node.create()
    root.setWidth(80)
    root.setHeight(24)
    root.setFlexDirection(FLEX_DIRECTION_COLUMN)

    const child = Node.create()
    child.setWidthFitContent()
    child.setMaxWidth(30)
    root.insertChild(child, 0)

    const text = Node.create()
    text.setMeasureFunc(textMeasure(50))
    child.insertChild(text, 0)

    root.calculateLayout(80, 24, DIRECTION_LTR)

    // maxWidth should cap the fit-content width
    expect(child.getComputedWidth()).toBeLessThanOrEqual(30)
  })

  test("fit-content in row flex layout", () => {
    // Two fit-content children side by side in a row
    const root = Node.create()
    root.setWidth(80)
    root.setHeight(24)
    root.setFlexDirection(FLEX_DIRECTION_ROW)

    const child1 = Node.create()
    child1.setWidthFitContent()
    root.insertChild(child1, 0)

    const text1 = Node.create()
    text1.setMeasureFunc(textMeasure(20))
    child1.insertChild(text1, 0)

    const child2 = Node.create()
    child2.setWidthFitContent()
    root.insertChild(child2, 1)

    const text2 = Node.create()
    text2.setMeasureFunc(textMeasure(30))
    child2.insertChild(text2, 0)

    root.calculateLayout(80, 24, DIRECTION_LTR)

    // Both children should shrink-wrap to their content
    expectLayout(child1, { width: 20, left: 0 })
    expectLayout(child2, { width: 30, left: 20 })
    // No overlap, total fits in 80
    expect(child1.getComputedWidth() + child2.getComputedWidth()).toBeLessThanOrEqual(80)
  })

  test("fit-content with padding and border", () => {
    const root = Node.create()
    root.setWidth(80)
    root.setHeight(24)
    root.setFlexDirection(FLEX_DIRECTION_COLUMN)

    const child = Node.create()
    child.setWidthFitContent()
    child.setPadding(0, 2) // left padding
    child.setPadding(2, 2) // right padding
    child.setBorder(0, 1) // left border
    child.setBorder(2, 1) // right border
    root.insertChild(child, 0)

    const text = Node.create()
    text.setMeasureFunc(textMeasure(20))
    child.insertChild(text, 0)

    root.calculateLayout(80, 24, DIRECTION_LTR)

    // Width = content (20) + padding (4) + border (2) = 26
    expectLayout(child, { width: 26 })
  })

  test("fit-content beside flexGrow sibling", () => {
    const root = Node.create()
    root.setWidth(80)
    root.setHeight(24)
    root.setFlexDirection(FLEX_DIRECTION_ROW)

    const fitChild = Node.create()
    fitChild.setWidthFitContent()
    root.insertChild(fitChild, 0)

    const fitText = Node.create()
    fitText.setMeasureFunc(textMeasure(25))
    fitChild.insertChild(fitText, 0)

    const growChild = Node.create()
    growChild.setFlexGrow(1)
    root.insertChild(growChild, 1)

    root.calculateLayout(80, 24, DIRECTION_LTR)

    // Fit child: 25, grow child: 80 - 25 = 55
    expectLayout(fitChild, { width: 25 })
    expectLayout(growChild, { width: 55 })
  })
})

describe("snug-content width", () => {
  test("behaves like fit-content at layout level", () => {
    // Snug-content is fit-content at the Flexily level;
    // the consuming framework (silvery) handles binary-search tightening
    const root = Node.create()
    root.setWidth(80)
    root.setHeight(24)
    root.setFlexDirection(FLEX_DIRECTION_COLUMN)

    const child = Node.create()
    child.setWidthSnugContent()
    root.insertChild(child, 0)

    const text = Node.create()
    text.setMeasureFunc(textMeasure(30))
    child.insertChild(text, 0)

    root.calculateLayout(80, 24, DIRECTION_LTR)

    // Same as fit-content: shrink-wrap to content
    expectLayout(child, { width: 30, height: 1 })
  })
})

describe("fit-content edge cases", () => {
  test("fit-content with unconstrained parent", () => {
    // When parent is unconstrained, fit-content = max-content
    const root = Node.create()
    root.setFlexDirection(FLEX_DIRECTION_COLUMN)

    const child = Node.create()
    child.setWidthFitContent()
    root.insertChild(child, 0)

    const text = Node.create()
    text.setMeasureFunc(textMeasure(50))
    child.insertChild(text, 0)

    root.calculateLayout(NaN, NaN, DIRECTION_LTR)

    // Unconstrained: uses max-content width
    expectLayout(child, { width: 50 })
  })

  test("fit-content leaf node without measure func", () => {
    const root = Node.create()
    root.setWidth(80)
    root.setHeight(24)
    root.setFlexDirection(FLEX_DIRECTION_COLUMN)

    // Leaf fit-content node with no children or measure func
    const child = Node.create()
    child.setWidthFitContent()
    child.setPadding(0, 3) // left padding
    child.setPadding(2, 3) // right padding
    root.insertChild(child, 0)

    root.calculateLayout(80, 24, DIRECTION_LTR)

    // Leaf without measureFunc: width = padding only
    expectLayout(child, { width: 6 })
  })

  test("re-layout after content change preserves fit-content behavior", () => {
    const root = Node.create()
    root.setWidth(80)
    root.setHeight(24)
    root.setFlexDirection(FLEX_DIRECTION_COLUMN)

    const child = Node.create()
    child.setWidthFitContent()
    root.insertChild(child, 0)

    const text = Node.create()
    let width = 30
    text.setMeasureFunc((w, wm, h, hm) => textMeasure(width)(w, wm, h, hm))
    child.insertChild(text, 0)

    root.calculateLayout(80, 24, DIRECTION_LTR)
    expectLayout(child, { width: 30 })

    // Change content width and re-layout
    width = 50
    text.markDirty()
    root.calculateLayout(80, 24, DIRECTION_LTR)
    expectLayout(child, { width: 50 })

    // Shrink below available
    width = 20
    text.markDirty()
    root.calculateLayout(80, 24, DIRECTION_LTR)
    expectLayout(child, { width: 20 })
  })
})
