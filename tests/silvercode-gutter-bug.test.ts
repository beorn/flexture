/**
 * Silvercode P1 reproduction — gutter Box(width=1, flexShrink=0,
 * overflow=hidden) collapses to width=0 when its row sibling contains a
 * scrollable list of wrap-text items.
 *
 * Bug context:
 *   - silvercode SessionCard renders a focused-pane indicator as a 1-col
 *     gutter Box wrapping a `<Text wrap="wrap">{"▎".repeat(200)}</Text>`.
 *     `width=1, flexShrink=0, overflow=hidden`.
 *   - Sibling: `flexGrow=1 flexShrink=1 minWidth=0` containing a ListView
 *     of multi-line message items.
 *   - On initial render, the gutter's computed width is 0 instead of 1.
 *
 * Expected: gutter gets width=1.
 */

import { describe, expect, test } from "vitest"
import {
  DIRECTION_LTR,
  FLEX_DIRECTION_COLUMN,
  FLEX_DIRECTION_ROW,
  MEASURE_MODE_MIN_CONTENT,
  MEASURE_MODE_UNDEFINED,
  Node,
  OVERFLOW_HIDDEN,
} from "../src/index.js"

/**
 * Mock the silvery measureFunc for `<Text wrap="wrap">`:
 *  - MIN_CONTENT (width axis) → longest unbreakable token
 *  - AT_MOST/EXACTLY → wrap-aware width/height at given constraint
 *  - UNDEFINED → max-content
 */
function makeWrapTextMeasure(text: string) {
  const lines = text.split("\n")
  return (
    width: number,
    widthMode: number,
    _height: number,
    _heightMode: number,
  ): { width: number; height: number } => {
    if (widthMode === MEASURE_MODE_MIN_CONTENT) {
      let longest = 0
      for (const line of lines) {
        for (const w of line.split(/\s+/)) {
          if (w.length > longest) longest = w.length
        }
      }
      return { width: longest, height: lines.length }
    }
    const w = widthMode === MEASURE_MODE_UNDEFINED ? Infinity : width
    let totalHeight = 0
    let actualWidth = 0
    for (const line of lines) {
      if (line.length <= w) {
        totalHeight += 1
        actualWidth = Math.max(actualWidth, line.length)
      } else {
        const wrapped = Math.ceil(line.length / w)
        totalHeight += wrapped
        actualWidth = Math.max(actualWidth, w)
      }
    }
    return { width: Math.min(actualWidth, w), height: totalHeight }
  }
}

describe("silvercode gutter-collapse repro", () => {
  test("gutter Box(width=1, flexShrink=0, overflow=hidden) keeps width=1 when sibling has wrap content", () => {
    const root = Node.create()
    root.setFlexDirection(FLEX_DIRECTION_ROW)
    root.setWidth(60)
    root.setHeight(20)

    // Gutter Box: width=1, flexShrink=0, overflow=hidden, contains
    // measure-func leaf reporting min-content WIDTH=200.
    const gutter = Node.create()
    gutter.setWidth(1)
    gutter.setFlexShrink(0)
    gutter.setFlexGrow(0)
    gutter.setOverflow(OVERFLOW_HIDDEN)
    gutter.setFlexDirection(FLEX_DIRECTION_COLUMN)

    const gutterText = Node.create()
    gutterText.setMeasureFunc(makeWrapTextMeasure("▎".repeat(200)))
    gutter.insertChild(gutterText, 0)
    root.insertChild(gutter, 0)

    // Sibling: flexGrow=1 flexShrink=1 minWidth=0 column with 5 wrap-text
    // leaves having multi-line content.
    const list = Node.create()
    list.setFlexGrow(1)
    list.setFlexShrink(1)
    list.setMinWidth(0)
    list.setFlexDirection(FLEX_DIRECTION_COLUMN)
    root.insertChild(list, 1)

    for (let i = 0; i < 5; i++) {
      const item = Node.create()
      item.setMeasureFunc(
        makeWrapTextMeasure(
          `msg-${i + 1}: assistant token-stream chunk ${i + 1} containing some prose\n` +
            `  + a continuation line that may also wrap depending on width\n` +
            `  + a snippet: const longIdentifierName = computeSomethingExpensive(arg1, arg2, arg3)`,
        ),
      )
      list.insertChild(item, i)
    }

    root.calculateLayout(60, 20, DIRECTION_LTR)

    expect(gutter.getComputedWidth()).toBe(1)
    expect(gutter.getComputedHeight()).toBeGreaterThan(0)
  })

  test("NARROW: width=20 row, gutter+1, sibling with 31-char min-content multi-line", () => {
    // Mirror NARROW-FORCE failing scenario.
    const heavy = (i: number) =>
      [
        `msg-${i}: assistant token-stream chunk ${i} containing some prose`,
        `  + a continuation line that may also wrap depending on width`,
        `  + a snippet: const longIdentifierName = computeSomethingExpensive(arg1, arg2, arg3)`,
      ].join("\n")
    const root = Node.create()
    root.setFlexDirection(FLEX_DIRECTION_ROW)
    root.setWidth(20)
    root.setHeight(20)

    const gutter = Node.create()
    gutter.setWidth(1)
    gutter.setFlexShrink(0)
    gutter.setOverflow(OVERFLOW_HIDDEN)
    gutter.setFlexDirection(FLEX_DIRECTION_COLUMN)

    const gutterText = Node.create()
    gutterText.setMeasureFunc(makeWrapTextMeasure("▎".repeat(200)))
    gutter.insertChild(gutterText, 0)
    root.insertChild(gutter, 0)

    const list = Node.create()
    list.setFlexGrow(1)
    list.setFlexShrink(1)
    list.setMinWidth(0)
    list.setFlexDirection(FLEX_DIRECTION_COLUMN)
    root.insertChild(list, 1)

    for (let i = 0; i < 5; i++) {
      const item = Node.create()
      item.setMeasureFunc(makeWrapTextMeasure(heavy(i + 1)))
      list.insertChild(item, i)
    }

    root.calculateLayout(20, 20, DIRECTION_LTR)

    console.log(
      `gutter: width=${gutter.getComputedWidth()}, height=${gutter.getComputedHeight()}, x=${gutter.getComputedLeft()}`,
    )
    console.log(
      `list: width=${list.getComputedWidth()}, height=${list.getComputedHeight()}, x=${list.getComputedLeft()}`,
    )
    console.log(`gutter.minContentRow=${gutter.getMinContent(FLEX_DIRECTION_ROW, 20)}`)
    console.log(`list.minContentRow=${list.getMinContent(FLEX_DIRECTION_ROW, 20)}`)
    console.log(`root.minContentRow=${root.getMinContent(FLEX_DIRECTION_ROW, 20)}`)
    // Inspect each list child:
    for (let i = 0; i < list.children.length; i++) {
      const c = list.children[i]!
      console.log(
        `  list[${i}]: width=${c.getComputedWidth()}, x=${c.getComputedLeft()}, minContentRow=${c.getMinContent(FLEX_DIRECTION_ROW, 19)}`,
      )
    }
    expect(gutter.getComputedWidth()).toBe(1)
  })

  test("MINIMAL: width=10 row, gutter width=1 overflow=hidden + flexGrow=1 sibling with single measureFunc child reporting min=8", () => {
    const root = Node.create()
    root.setFlexDirection(FLEX_DIRECTION_ROW)
    root.setWidth(10)
    root.setHeight(5)

    const gutter = Node.create()
    gutter.setWidth(1)
    gutter.setFlexShrink(0)
    gutter.setOverflow(OVERFLOW_HIDDEN)
    root.insertChild(gutter, 0)

    const sib = Node.create()
    sib.setFlexGrow(1)
    sib.setFlexShrink(1)
    sib.setMinWidth(0)
    // measureFunc: max-content width=8, min-content width=8 (single unbreakable word).
    sib.setMeasureFunc((w, wm) => {
      if (wm === MEASURE_MODE_MIN_CONTENT) return { width: 8, height: 1 }
      return { width: 8, height: 1 }
    })
    root.insertChild(sib, 1)

    root.calculateLayout(10, 5, DIRECTION_LTR)
    console.log(`MINIMAL gutter: width=${gutter.getComputedWidth()}`)
    console.log(`MINIMAL sib: width=${sib.getComputedWidth()}`)
    expect(gutter.getComputedWidth()).toBe(1)
  })

  test("simpler repro: row with two width=1 + flexGrow=1 measure-func sibling reporting longer max-content", () => {
    // Even simpler: just two children. Gutter width=1, sibling with
    // wrap-text whose max-content width exceeds available.
    const root = Node.create()
    root.setFlexDirection(FLEX_DIRECTION_ROW)
    root.setWidth(20)
    root.setHeight(10)

    const gutter = Node.create()
    gutter.setWidth(1)
    gutter.setFlexShrink(0)
    root.insertChild(gutter, 0)

    const sibling = Node.create()
    sibling.setFlexGrow(1)
    sibling.setFlexShrink(1)
    sibling.setMinWidth(0)
    // Big wrap text — max-content well over 20.
    sibling.setMeasureFunc(makeWrapTextMeasure("hello world ".repeat(20)))
    root.insertChild(sibling, 1)

    root.calculateLayout(20, 10, DIRECTION_LTR)

    expect(gutter.getComputedWidth()).toBe(1)
    expect(sibling.getComputedWidth()).toBe(19)
  })
})
