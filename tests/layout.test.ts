import { describe, expect, it } from "vitest"
import {
  ALIGN_BASELINE,
  ALIGN_CENTER,
  ALIGN_FLEX_END,
  ALIGN_FLEX_START,
  ALIGN_SPACE_AROUND,
  ALIGN_SPACE_BETWEEN,
  ALIGN_STRETCH,
  createDefaultStyle,
  createValue,
  DIRECTION_LTR,
  DIRECTION_RTL,
  DISPLAY_FLEX,
  DISPLAY_NONE,
  EDGE_ALL,
  EDGE_END,
  EDGE_LEFT,
  EDGE_RIGHT,
  EDGE_START,
  EDGE_TOP,
  FLEX_DIRECTION_COLUMN,
  FLEX_DIRECTION_COLUMN_REVERSE,
  FLEX_DIRECTION_ROW,
  FLEX_DIRECTION_ROW_REVERSE,
  GUTTER_ALL,
  GUTTER_COLUMN,
  GUTTER_ROW,
  JUSTIFY_CENTER,
  JUSTIFY_FLEX_END,
  JUSTIFY_FLEX_START,
  JUSTIFY_SPACE_BETWEEN,
  JUSTIFY_SPACE_EVENLY,
  MEASURE_MODE_AT_MOST,
  MEASURE_MODE_EXACTLY,
  Node,
  POSITION_TYPE_ABSOLUTE,
  POSITION_TYPE_RELATIVE,
  UNIT_AUTO,
  UNIT_PERCENT,
  UNIT_POINT,
  UNIT_UNDEFINED,
  WRAP_NO_WRAP,
  WRAP_WRAP,
  WRAP_WRAP_REVERSE,
} from "../src/index.js"
import { createChild, expectLayout, expectWidth } from "./test-utils.js"

describe("Flexily Layout Engine", () => {
  describe("Basic Layout", () => {
    it("should layout a single node with explicit dimensions", () => {
      const root = Node.create()
      root.setWidth(80)
      root.setHeight(24)
      root.calculateLayout(80, 24, DIRECTION_LTR)

      expectLayout(root, { left: 0, top: 0, width: 80, height: 24 })
    })

    it("should set display:none node to zero size", () => {
      const root = Node.create()
      root.setWidth(80)
      root.setHeight(24)
      root.setDisplay(DISPLAY_NONE)
      root.calculateLayout(80, 24, DIRECTION_LTR)

      expectLayout(root, { width: 0, height: 0 })
    })

    it("should exclude display:none children from layout", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setFlexDirection(FLEX_DIRECTION_ROW)

      const child1 = createChild(root, 0, { width: 30, height: 20 })
      const hiddenChild = createChild(root, 1, { width: 30, height: 20 })
      hiddenChild.setDisplay(DISPLAY_NONE)
      const child2 = createChild(root, 2, { width: 30, height: 20 })

      root.calculateLayout(100, 100)

      expectLayout(child1, { left: 0, width: 30 })
      expectLayout(hiddenChild, { width: 0, height: 0 })
      expectLayout(child2, { left: 30, width: 30 })
    })

    it("should layout a column with fixed-height children", () => {
      const root = Node.create()
      root.setWidth(80)
      root.setHeight(24)
      root.setFlexDirection(FLEX_DIRECTION_COLUMN)

      const header = createChild(root, 0, { height: 1 })
      const content = createChild(root, 1, { flexGrow: 1 })
      const footer = createChild(root, 2, { height: 1 })

      root.calculateLayout(80, 24, DIRECTION_LTR)

      expectLayout(header, { left: 0, top: 0, width: 80, height: 1 })
      expectLayout(content, { left: 0, top: 1, width: 80, height: 22 })
      expectLayout(footer, { left: 0, top: 23, width: 80, height: 1 })
    })

    it("should layout a row with equal flex grow", () => {
      const root = Node.create()
      root.setWidth(80)
      root.setHeight(24)
      root.setFlexDirection(FLEX_DIRECTION_ROW)

      const col1 = createChild(root, 0, { flexGrow: 1 })
      const col2 = createChild(root, 1, { flexGrow: 1 })

      root.calculateLayout(80, 24, DIRECTION_LTR)

      expectLayout(col1, { left: 0, width: 40, height: 24 })
      expectLayout(col2, { left: 40, width: 40, height: 24 })
    })
  })

  describe("Gap", () => {
    it("should apply gap between row children", () => {
      const root = Node.create()
      root.setWidth(80)
      root.setHeight(24)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setGap(GUTTER_ALL, 2)

      const col1 = createChild(root, 0, { flexGrow: 1 })
      const col2 = createChild(root, 1, { flexGrow: 1 })
      const col3 = createChild(root, 2, { flexGrow: 1 })

      root.calculateLayout(80, 24, DIRECTION_LTR)

      expect(col1.getComputedLeft()).toBe(0)
      // Verify gaps are applied correctly
      const gap1 = col2.getComputedLeft() - (col1.getComputedLeft() + col1.getComputedWidth())
      const gap2 = col3.getComputedLeft() - (col2.getComputedLeft() + col2.getComputedWidth())
      expect(gap1).toBe(2)
      expect(gap2).toBe(2)
    })
  })

  describe("Absolute Positioning", () => {
    it("should position absolute children using margin", () => {
      const root = Node.create()
      root.setWidth(80)
      root.setHeight(24)

      const modal = Node.create()
      modal.setPositionType(POSITION_TYPE_ABSOLUTE)
      modal.setWidth(40)
      modal.setHeight(10)
      modal.setMargin(EDGE_LEFT, 20)
      modal.setMargin(EDGE_TOP, 7)
      root.insertChild(modal, 0)

      root.calculateLayout(80, 24, DIRECTION_LTR)

      expectLayout(modal, { left: 20, top: 7, width: 40, height: 10 })
    })
  })

  describe("Padding and Border", () => {
    it("should account for padding in child layout", () => {
      const root = Node.create()
      root.setWidth(80)
      root.setHeight(24)
      root.setPadding(EDGE_ALL, 2)

      const child = createChild(root, 0, { flexGrow: 1 })
      root.calculateLayout(80, 24, DIRECTION_LTR)

      expectLayout(child, { left: 2, top: 2, width: 76, height: 20 })
    })

    it("should account for border in child layout", () => {
      const root = Node.create()
      root.setWidth(80)
      root.setHeight(24)
      root.setBorder(EDGE_ALL, 1)

      const child = createChild(root, 0, { flexGrow: 1 })
      root.calculateLayout(80, 24, DIRECTION_LTR)

      expectLayout(child, { left: 1, top: 1, width: 78, height: 22 })
    })
  })

  describe("Justify Content", () => {
    it.each([
      { justify: JUSTIFY_FLEX_END, expectedLeft: 60, name: "flex-end" },
      { justify: JUSTIFY_CENTER, expectedLeft: 30, name: "center" },
    ])("should justify content $name", ({ justify, expectedLeft }) => {
      const root = Node.create()
      root.setWidth(80)
      root.setHeight(24)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setJustifyContent(justify)

      const child = createChild(root, 0, { width: 20 })
      root.calculateLayout(80, 24, DIRECTION_LTR)

      expectLayout(child, { left: expectedLeft })
    })

    it("should justify content space-between", () => {
      const root = Node.create()
      root.setWidth(80)
      root.setHeight(24)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setJustifyContent(JUSTIFY_SPACE_BETWEEN)

      const child1 = createChild(root, 0, { width: 20 })
      const child2 = createChild(root, 1, { width: 20 })

      root.calculateLayout(80, 24, DIRECTION_LTR)

      expectLayout(child1, { left: 0 })
      expectLayout(child2, { left: 60 })
    })
  })

  describe("Align Items", () => {
    it.each([
      { align: ALIGN_CENTER, expectedTop: 7, name: "center" },
      { align: ALIGN_FLEX_END, expectedTop: 14, name: "flex-end" },
    ])("should align items $name", ({ align, expectedTop }) => {
      const root = Node.create()
      root.setWidth(80)
      root.setHeight(24)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setAlignItems(align)

      const child = createChild(root, 0, { width: 20, height: 10 })
      root.calculateLayout(80, 24, DIRECTION_LTR)

      expectLayout(child, { top: expectedTop })
    })
  })

  describe("Measure Function", () => {
    it("should use measure function for intrinsic sizing", () => {
      const root = Node.create()
      root.setWidth(80)
      root.setHeight(24)

      const text = Node.create()
      text.setMeasureFunc((width, widthMode, _height, _heightMode) => {
        const textWidth = 10
        const textHeight = 1

        if (widthMode === MEASURE_MODE_EXACTLY) {
          return { width, height: textHeight }
        } else if (widthMode === MEASURE_MODE_AT_MOST) {
          return { width: Math.min(textWidth, width), height: textHeight }
        }
        return { width: textWidth, height: textHeight }
      })
      root.insertChild(text, 0)

      root.calculateLayout(80, 24, DIRECTION_LTR)

      expectLayout(text, { width: 10, height: 1 })
    })

    it("should constrain measure height to parent column height", () => {
      // Column parent with height=1 containing a text node with 10 chars.
      // The text measure function wraps text into available width.
      // Bug: pre-measure passed mainAxisSize (height=1) as width arg,
      // causing text to wrap into 1-wide column => height=10, overflowing parent.
      const root = Node.create()
      root.setWidth(80)
      root.setHeight(1)
      root.setFlexDirection(FLEX_DIRECTION_COLUMN)

      const text = Node.create()
      text.setMeasureFunc((width, widthMode, _height, _heightMode) => {
        // Simulate 10-char text that wraps based on available width
        const totalChars = 10
        if (widthMode === MEASURE_MODE_EXACTLY) {
          const lines = Math.ceil(totalChars / Math.max(1, Math.floor(width)))
          return { width, height: lines }
        } else if (widthMode === MEASURE_MODE_AT_MOST) {
          const usedWidth = Math.min(totalChars, width)
          const lines = Math.ceil(totalChars / Math.max(1, Math.floor(usedWidth)))
          return { width: usedWidth, height: lines }
        }
        return { width: totalChars, height: 1 }
      })
      root.insertChild(text, 0)

      root.calculateLayout(80, 1, DIRECTION_LTR)

      // Text should be constrained to parent height=1, not overflow to height=10
      expectLayout(text, { width: 10, height: 1 })
    })
  })

  describe("Flex Shrink", () => {
    it("should shrink children when they exceed available space", () => {
      const root = Node.create()
      root.setWidth(80)
      root.setFlexDirection(FLEX_DIRECTION_ROW)

      const child1 = Node.create()
      child1.setWidth(50)
      child1.setFlexShrink(1)
      root.insertChild(child1, 0)

      const child2 = Node.create()
      child2.setWidth(50)
      child2.setFlexShrink(1)
      root.insertChild(child2, 1)

      root.calculateLayout(80, 24, DIRECTION_LTR)

      expectWidth(child1, 40)
      expectWidth(child2, 40)
    })
  })

  describe("Dirty Tracking", () => {
    it("should mark node dirty when properties change", () => {
      const root = Node.create()
      root.setWidth(80)
      root.setHeight(24)
      root.calculateLayout(80, 24, DIRECTION_LTR)

      expect(root.isDirty()).toBe(false)
      root.setWidth(100)
      expect(root.isDirty()).toBe(true)
    })

    it("should propagate dirty flag to parent", () => {
      const root = Node.create()
      root.setWidth(80)
      root.setHeight(24)

      const child = Node.create()
      root.insertChild(child, 0)

      root.calculateLayout(80, 24, DIRECTION_LTR)
      expect(root.isDirty()).toBe(false)

      child.setWidth(50)
      expect(root.isDirty()).toBe(true)
    })
  })

  describe("Percent Values", () => {
    it("should handle percent width", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(50)

      const child = Node.create()
      child.setWidthPercent(50)
      child.setHeightPercent(50)
      root.insertChild(child, 0)

      root.calculateLayout(100, 50, DIRECTION_LTR)

      expectLayout(child, { width: 50, height: 25 })
    })
  })

  describe("Min/Max Constraints", () => {
    it("should respect minWidth", () => {
      const root = Node.create()
      root.setWidth(80)
      root.setFlexDirection(FLEX_DIRECTION_ROW)

      const child = createChild(root, 0, { flexGrow: 1 })
      child.setMinWidth(50)
      createChild(root, 1, { flexGrow: 1 })

      root.calculateLayout(80, 24, DIRECTION_LTR)

      expect(child.getComputedWidth()).toBeGreaterThanOrEqual(50)
    })

    it("should respect maxWidth", () => {
      const root = Node.create()
      root.setWidth(80)
      root.setFlexDirection(FLEX_DIRECTION_ROW)

      const child = createChild(root, 0, { flexGrow: 1 })
      child.setMaxWidth(30)

      root.calculateLayout(80, 24, DIRECTION_LTR)

      expect(child.getComputedWidth()).toBeLessThanOrEqual(30)
    })
  })

  describe("Node Lifecycle", () => {
    it("should properly free nodes", () => {
      const root = Node.create()
      const child = Node.create()
      root.insertChild(child, 0)

      expect(root.getChildCount()).toBe(1)

      child.free()
      expect(root.getChildCount()).toBe(0)
      expect(child.getParent()).toBe(null)
    })

    it("should handle removeChild", () => {
      const root = Node.create()
      const child1 = Node.create()
      const child2 = Node.create()

      root.insertChild(child1, 0)
      root.insertChild(child2, 1)

      expect(root.getChildCount()).toBe(2)

      root.removeChild(child1)
      expect(root.getChildCount()).toBe(1)
      expect(root.getChild(0)).toBe(child2)
    })
  })

  describe("Style Getters", () => {
    describe("dimension getters", () => {
      it.each([
        {
          method: "setWidth",
          getter: "getWidth",
          value: 100,
          expected: { value: 100, unit: UNIT_POINT },
        },
        {
          method: "setWidthPercent",
          getter: "getWidth",
          value: 50,
          expected: { value: 50, unit: UNIT_PERCENT },
        },
        {
          method: "setHeight",
          getter: "getHeight",
          value: 200,
          expected: { value: 200, unit: UNIT_POINT },
        },
      ] as const)("should get $getter after $method($value)", ({ method, getter, value, expected }) => {
        const node = Node.create()
        ;(node[method] as (v: number) => void)(value)
        expect(node[getter]()).toEqual(expected)
      })

      it("should get width auto after setting", () => {
        const node = Node.create()
        node.setWidthAuto()
        expect(node.getWidth()).toEqual({ value: 0, unit: UNIT_AUTO })
      })
    })

    describe("flex property getters", () => {
      it.each([
        { method: "setFlexGrow", getter: "getFlexGrow", value: 2 },
        { method: "setFlexShrink", getter: "getFlexShrink", value: 0.5 },
        {
          method: "setFlexDirection",
          getter: "getFlexDirection",
          value: FLEX_DIRECTION_ROW,
        },
        { method: "setFlexWrap", getter: "getFlexWrap", value: WRAP_NO_WRAP },
        {
          method: "setAlignItems",
          getter: "getAlignItems",
          value: ALIGN_CENTER,
        },
        {
          method: "setAlignSelf",
          getter: "getAlignSelf",
          value: ALIGN_FLEX_END,
        },
        {
          method: "setJustifyContent",
          getter: "getJustifyContent",
          value: JUSTIFY_SPACE_BETWEEN,
        },
        {
          method: "setPositionType",
          getter: "getPositionType",
          value: POSITION_TYPE_ABSOLUTE,
        },
      ] as const)("should get $getter after $method", ({ method, getter, value }) => {
        const node = Node.create()
        ;(node[method] as (v: number) => void)(value)
        expect(node[getter]()).toBe(value)
      })
    })

    describe("edge property getters", () => {
      it("should get padding after setting", () => {
        const node = Node.create()
        node.setPadding(EDGE_LEFT, 10)
        expect(node.getPadding(EDGE_LEFT)).toEqual({
          value: 10,
          unit: UNIT_POINT,
        })
      })

      it("should get margin after setting", () => {
        const node = Node.create()
        node.setMargin(EDGE_TOP, 5)
        expect(node.getMargin(EDGE_TOP)).toEqual({ value: 5, unit: UNIT_POINT })
      })

      it("should get border after setting", () => {
        const node = Node.create()
        node.setBorder(EDGE_ALL, 1)
        expect(node.getBorder(EDGE_LEFT)).toBe(1)
        expect(node.getBorder(EDGE_RIGHT)).toBe(1)
      })
    })

    it("should have correct default values", () => {
      const node = Node.create()
      expect(node.getFlexShrink()).toBe(0)
      expect(node.getFlexGrow()).toBe(0)
      expect(node.getFlexDirection()).toBe(FLEX_DIRECTION_COLUMN)
      expect(node.getAlignItems()).toBe(ALIGN_STRETCH)
      expect(node.getJustifyContent()).toBe(JUSTIFY_FLEX_START)
      expect(node.getPositionType()).toBe(POSITION_TYPE_RELATIVE)
    })
  })

  describe("Aspect Ratio", () => {
    it.each([
      {
        width: 200,
        height: undefined,
        ratio: 2,
        expectedW: 200,
        expectedH: 100,
        name: "height from width",
      },
      {
        width: undefined,
        height: 100,
        ratio: 2,
        expectedW: 200,
        expectedH: 100,
        name: "width from height",
      },
    ])("should compute $name when aspectRatio is set", ({ width, height, ratio, expectedW, expectedH }) => {
      const root = Node.create()
      if (width !== undefined) root.setWidth(width)
      if (height !== undefined) root.setHeight(height)
      root.setAspectRatio(ratio)
      root.calculateLayout(200, 200)

      expectLayout(root, { width: expectedW, height: expectedH })
    })

    it("should respect explicit dimensions over aspectRatio", () => {
      const root = Node.create()
      root.setWidth(200)
      root.setHeight(50)
      root.setAspectRatio(2)
      root.calculateLayout(200, 200)

      expectLayout(root, { width: 200, height: 50 })
    })

    it("should have NaN as default aspectRatio", () => {
      const node = Node.create()
      expect(Number.isNaN(node.getAspectRatio())).toBe(true)
    })

    it("should get/set aspectRatio correctly", () => {
      const node = Node.create()
      node.setAspectRatio(1.5)
      expect(node.getAspectRatio()).toBe(1.5)
    })
  })

  describe("Flex Wrap", () => {
    it("should wrap items to new line when they exceed container width", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(100)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setFlexWrap(WRAP_WRAP)

      const child1 = createChild(root, 0, { width: 40, height: 20 })
      const child2 = createChild(root, 1, { width: 40, height: 20 })
      const child3 = createChild(root, 2, { width: 40, height: 20 })

      root.calculateLayout(100, 100)

      // First two items on first line
      expectLayout(child1, { left: 0, top: 0 })
      expectLayout(child2, { left: 40, top: 0 })
      // Third item wrapped to second line
      expectLayout(child3, { left: 0, top: 20 })
    })

    it("should not wrap when flex-wrap is no-wrap (default)", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(100)
      root.setFlexDirection(FLEX_DIRECTION_ROW)

      const child1 = createChild(root, 0, { width: 40, height: 20 })
      const child2 = createChild(root, 1, { width: 40, height: 20 })
      const child3 = createChild(root, 2, { width: 40, height: 20 })

      root.calculateLayout(100, 100)

      // All items on same line (overflowing)
      expect(child1.getComputedTop()).toBe(0)
      expect(child2.getComputedTop()).toBe(0)
      expect(child3.getComputedTop()).toBe(0)
    })
  })

  describe("Utility Functions", () => {
    describe("createValue", () => {
      it.each([
        {
          args: [],
          expected: { value: 0, unit: UNIT_UNDEFINED },
          name: "default",
        },
        {
          args: [100],
          expected: { value: 100, unit: UNIT_UNDEFINED },
          name: "value only",
        },
        {
          args: [50, UNIT_PERCENT],
          expected: { value: 50, unit: UNIT_PERCENT },
          name: "percent",
        },
        {
          args: [200, UNIT_POINT],
          expected: { value: 200, unit: UNIT_POINT },
          name: "point",
        },
        {
          args: [0, UNIT_AUTO],
          expected: { value: 0, unit: UNIT_AUTO },
          name: "auto",
        },
      ] as const)("should create $name value", ({ args, expected }) => {
        const value = createValue(...(args as [number?, number?]))
        expect(value).toEqual(expected)
      })
    })

    describe("createDefaultStyle", () => {
      it("should create a style object with correct defaults", () => {
        const style = createDefaultStyle()

        expect(style.display).toBe(DISPLAY_FLEX)
        expect(style.positionType).toBe(POSITION_TYPE_RELATIVE)
        expect(style.flexDirection).toBe(FLEX_DIRECTION_COLUMN)
        expect(style.flexGrow).toBe(0)
        expect(style.flexShrink).toBe(0)
        expect(style.flexBasis).toEqual({ value: 0, unit: UNIT_AUTO })
        expect(style.alignItems).toBe(ALIGN_STRETCH)
        expect(style.justifyContent).toBe(JUSTIFY_FLEX_START)
        expect(style.width).toEqual({ value: 0, unit: UNIT_AUTO })
        expect(style.height).toEqual({ value: 0, unit: UNIT_AUTO })
        expect(style.minWidth).toEqual({ value: 0, unit: UNIT_UNDEFINED })
        expect(style.maxWidth).toEqual({ value: 0, unit: UNIT_UNDEFINED })
        expect(style.padding).toHaveLength(6)
        expect(style.margin).toHaveLength(6)
        expect(style.position).toHaveLength(6)
        expect(style.border).toEqual([0, 0, 0, 0, NaN, NaN])
        expect(style.gap).toEqual([0, 0])
      })

      it("should create independent style objects", () => {
        const style1 = createDefaultStyle()
        const style2 = createDefaultStyle()

        style1.flexGrow = 5
        expect(style2.flexGrow).toBe(0)

        style1.padding[0] = { value: 10, unit: UNIT_POINT }
        expect(style2.padding[0]).toEqual({ value: 0, unit: UNIT_UNDEFINED })
      })
    })
  })

  describe("Baseline Alignment", () => {
    it("should align items by bottom edge when no baselineFunc provided", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(50)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setAlignItems(ALIGN_BASELINE)

      const child1 = createChild(root, 0, { width: 30, height: 20 })
      const child2 = createChild(root, 1, { width: 30, height: 40 })

      root.calculateLayout(100, 50, DIRECTION_LTR)

      // Without baselineFunc, baseline is at bottom of each child
      expectLayout(child1, { top: 20 })
      expectLayout(child2, { top: 0 })

      root.free()
    })

    it("should use baselineFunc when provided", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(50)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setAlignItems(ALIGN_BASELINE)

      const child1 = createChild(root, 0, { width: 30, height: 20 })
      child1.setBaselineFunc((w, h) => h * 0.8)
      const child2 = createChild(root, 1, { width: 30, height: 40 })
      child2.setBaselineFunc((w, h) => h * 0.8)

      root.calculateLayout(100, 50, DIRECTION_LTR)

      expectLayout(child1, { top: 16 })
      expectLayout(child2, { top: 0 })

      root.free()
    })

    it("should align text-like nodes with different font sizes", () => {
      const root = Node.create()
      root.setWidth(200)
      root.setHeight(50)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setAlignItems(ALIGN_BASELINE)

      const small = createChild(root, 0, { width: 50, height: 12 })
      small.setBaselineFunc(() => 10)
      const large = createChild(root, 1, { width: 50, height: 24 })
      large.setBaselineFunc(() => 20)

      root.calculateLayout(200, 50, DIRECTION_LTR)

      expectLayout(small, { top: 10 })
      expectLayout(large, { top: 0 })

      root.free()
    })

    it("should support align-self baseline", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(50)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setAlignItems(ALIGN_FLEX_START)

      const child1 = createChild(root, 0, { width: 30, height: 20 })
      child1.setAlignSelf(ALIGN_BASELINE)
      const child2 = createChild(root, 1, { width: 30, height: 40 })
      child2.setAlignSelf(ALIGN_BASELINE)

      root.calculateLayout(100, 50, DIRECTION_LTR)

      expectLayout(child1, { top: 20 })
      expectLayout(child2, { top: 0 })

      root.free()
    })

    it("should not affect column direction", () => {
      const root = Node.create()
      root.setWidth(50)
      root.setHeight(100)
      root.setFlexDirection(FLEX_DIRECTION_COLUMN)
      root.setAlignItems(ALIGN_BASELINE)

      const child1 = createChild(root, 0, { width: 30, height: 20 })
      const child2 = createChild(root, 1, { width: 40, height: 30 })

      root.calculateLayout(50, 100, DIRECTION_LTR)

      // In column direction, baseline alignment falls back to flex-start
      expectLayout(child1, { top: 0 })
      expectLayout(child2, { top: 20 })

      root.free()
    })

    it("should handle hasBaselineFunc correctly", () => {
      const node = Node.create()

      expect(node.hasBaselineFunc()).toBe(false)

      node.setBaselineFunc(() => 10)
      expect(node.hasBaselineFunc()).toBe(true)

      node.unsetBaselineFunc()
      expect(node.hasBaselineFunc()).toBe(false)

      node.free()
    })
  })

  describe("RTL Direction", () => {
    it("should position row children from right in RTL", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(50)
      root.setFlexDirection(FLEX_DIRECTION_ROW)

      const child1 = createChild(root, 0, { width: 30, height: 50 })
      const child2 = createChild(root, 1, { width: 20, height: 50 })

      // LTR
      root.calculateLayout(100, 50, DIRECTION_LTR)
      expectLayout(child1, { left: 0 })
      expectLayout(child2, { left: 30 })

      // RTL
      root.markDirty()
      root.calculateLayout(100, 50, DIRECTION_RTL)
      expectLayout(child1, { left: 70 })
      expectLayout(child2, { left: 50 })

      root.free()
    })

    it("should handle EDGE_START/END correctly in RTL", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(50)
      root.setFlexDirection(FLEX_DIRECTION_ROW)

      const child = createChild(root, 0, { width: 30, height: 50 })
      child.setMargin(EDGE_START, 10)

      // LTR: START means left
      root.calculateLayout(100, 50, DIRECTION_LTR)
      expectLayout(child, { left: 10 })

      // RTL: START means right
      root.markDirty()
      root.calculateLayout(100, 50, DIRECTION_RTL)
      expectLayout(child, { left: 60 })

      root.free()
    })

    it("should not affect column direction in RTL", () => {
      const root = Node.create()
      root.setWidth(50)
      root.setHeight(100)
      root.setFlexDirection(FLEX_DIRECTION_COLUMN)

      const child1 = createChild(root, 0, { width: 50, height: 30 })
      const child2 = createChild(root, 1, { width: 50, height: 20 })

      root.calculateLayout(50, 100, DIRECTION_LTR)
      expectLayout(child1, { top: 0 })
      expectLayout(child2, { top: 30 })

      root.markDirty()
      root.calculateLayout(50, 100, DIRECTION_RTL)
      expectLayout(child1, { top: 0 })
      expectLayout(child2, { top: 30 })

      root.free()
    })

    it("should handle EDGE_END margin correctly in RTL", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(50)
      root.setFlexDirection(FLEX_DIRECTION_ROW)

      const child = createChild(root, 0, { width: 30, height: 50 })
      child.setMargin(EDGE_END, 15)

      // LTR: END means right margin
      root.calculateLayout(100, 50, DIRECTION_LTR)
      expectLayout(child, { left: 0 })

      // RTL: END means left margin
      root.markDirty()
      root.calculateLayout(100, 50, DIRECTION_RTL)
      expectLayout(child, { left: 70 })

      root.free()
    })

    it("should handle justify-content flex-end in RTL", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(50)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setJustifyContent(JUSTIFY_FLEX_END)

      const child = createChild(root, 0, { width: 30, height: 50 })

      // LTR + flex-end: pushed to right
      root.calculateLayout(100, 50, DIRECTION_LTR)
      expectLayout(child, { left: 70 })

      // RTL + flex-end: flex-end means left in RTL
      root.markDirty()
      root.calculateLayout(100, 50, DIRECTION_RTL)
      expectLayout(child, { left: 0 })

      root.free()
    })

    it("should distribute flex-grow correctly in RTL", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(50)
      root.setFlexDirection(FLEX_DIRECTION_ROW)

      const child1 = createChild(root, 0, { height: 50, flexGrow: 1 })
      const child2 = createChild(root, 1, { height: 50, flexGrow: 1 })

      // LTR
      root.calculateLayout(100, 50, DIRECTION_LTR)
      expectLayout(child1, { left: 0, width: 50 })
      expectLayout(child2, { left: 50, width: 50 })

      // RTL: visual order reversed
      root.markDirty()
      root.calculateLayout(100, 50, DIRECTION_RTL)
      expectLayout(child1, { left: 50, width: 50 })
      expectLayout(child2, { left: 0, width: 50 })

      root.free()
    })

    it("should handle padding with EDGE_START/END in RTL", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(50)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setPadding(EDGE_START, 10)
      root.setPadding(EDGE_END, 20)

      const child = createChild(root, 0, { height: 50, flexGrow: 1 })

      // LTR: START=left (10), END=right (20)
      root.calculateLayout(100, 50, DIRECTION_LTR)
      expectLayout(child, { left: 10, width: 70 })

      // RTL: START=right (10), END=left (20)
      root.markDirty()
      root.calculateLayout(100, 50, DIRECTION_RTL)
      expectLayout(child, { left: 20, width: 70 })

      root.free()
    })

    it("should handle border EDGE_START/END in RTL (row)", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(50)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setBorder(EDGE_START, 5)
      root.setBorder(EDGE_END, 10)

      const child = createChild(root, 0, { height: 50, flexGrow: 1 })

      // LTR: START=left border (5), END=right border (10)
      root.calculateLayout(100, 50, DIRECTION_LTR)
      expectLayout(child, { left: 5, width: 85 })

      // RTL: START=right border (5), END=left border (10)
      root.markDirty()
      root.calculateLayout(100, 50, DIRECTION_RTL)
      expectLayout(child, { left: 10, width: 85 })

      root.free()
    })

    it("should handle border EDGE_START/END in RTL (column)", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(50)
      root.setFlexDirection(FLEX_DIRECTION_COLUMN)
      root.setBorder(EDGE_START, 5)
      root.setBorder(EDGE_END, 10)

      const child = createChild(root, 0, { flexGrow: 1 })

      // LTR column: START=left border (5), END=right border (10)
      root.calculateLayout(100, 50, DIRECTION_LTR)
      expectLayout(child, { left: 5, width: 85, height: 50 })

      // RTL column: START=right border (5), END=left border (10)
      root.markDirty()
      root.calculateLayout(100, 50, DIRECTION_RTL)
      expectLayout(child, { left: 10, width: 85, height: 50 })

      root.free()
    })

    it("should handle margin EDGE_START/END in row + RTL", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(50)
      root.setFlexDirection(FLEX_DIRECTION_ROW)

      const child = createChild(root, 0, { width: 30, height: 50 })
      child.setMargin(EDGE_START, 10)
      child.setMargin(EDGE_END, 20)

      // LTR: START=left(10), END=right(20)
      root.calculateLayout(100, 50, DIRECTION_LTR)
      expectLayout(child, { left: 10 })

      // RTL: START=right(10), END=left(20). Child placed from right: 100-10-30=60
      root.markDirty()
      root.calculateLayout(100, 50, DIRECTION_RTL)
      expectLayout(child, { left: 60 })

      root.free()
    })
  })

  describe("alignContent with measureFunc children", () => {
    // Box width=2 height=6 flexWrap=wrap flexDirection=row, 4 text children (1x1 each)
    // Two lines: AB on line 0, CD on line 1. Each line has cross size 1.
    // Total line cross = 2, free space = 4.

    function makeTree(alignContent: number) {
      const root = Node.create()
      root.setWidth(2)
      root.setHeight(6)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setFlexWrap(WRAP_WRAP)
      root.setAlignContent(alignContent)

      for (let i = 0; i < 4; i++) {
        const child = Node.create()
        child.setMeasureFunc(() => ({ width: 1, height: 1 }))
        root.insertChild(child, i)
      }

      root.calculateLayout(2, 6, DIRECTION_LTR)
      return root
    }

    it("flex-start: lines packed at start", () => {
      const root = makeTree(ALIGN_FLEX_START)
      expectLayout(root.getChild(0), { top: 0 })
      expectLayout(root.getChild(1), { top: 0 })
      expectLayout(root.getChild(2), { top: 1 })
      expectLayout(root.getChild(3), { top: 1 })
      root.free()
    })

    it("center: lines centered in cross axis", () => {
      const root = makeTree(ALIGN_CENTER)
      expectLayout(root.getChild(0), { top: 2 })
      expectLayout(root.getChild(1), { top: 2 })
      expectLayout(root.getChild(2), { top: 3 })
      expectLayout(root.getChild(3), { top: 3 })
      root.free()
    })

    it("flex-end: lines packed at end", () => {
      const root = makeTree(ALIGN_FLEX_END)
      expectLayout(root.getChild(0), { top: 4 })
      expectLayout(root.getChild(1), { top: 4 })
      expectLayout(root.getChild(2), { top: 5 })
      expectLayout(root.getChild(3), { top: 5 })
      root.free()
    })

    it("space-between: first line at start, last at end", () => {
      const root = makeTree(ALIGN_SPACE_BETWEEN)
      expectLayout(root.getChild(0), { top: 0 })
      expectLayout(root.getChild(1), { top: 0 })
      expectLayout(root.getChild(2), { top: 5 })
      expectLayout(root.getChild(3), { top: 5 })
      root.free()
    })
  })

  // ==========================================================================
  // Bug fixes: alignContent with non-measureFunc children
  // ==========================================================================
  describe("alignContent with fixed-size children", () => {
    // Box width=2 height=6 flexWrap=wrap flexDirection=row, 4 children (1x1 each)
    // Two lines: AB on line 0, CD on line 1. Each line has cross size 1.
    // Total line cross = 2, free space = 4.

    function makeTree(alignContent: number) {
      const root = Node.create()
      root.setWidth(2)
      root.setHeight(6)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setFlexWrap(WRAP_WRAP)
      root.setAlignContent(alignContent)

      for (let i = 0; i < 4; i++) {
        const child = Node.create()
        child.setWidth(1)
        child.setHeight(1)
        root.insertChild(child, i)
      }

      root.calculateLayout(2, 6, DIRECTION_LTR)
      return root
    }

    it("flex-start: lines packed at start", () => {
      const root = makeTree(ALIGN_FLEX_START)
      expectLayout(root.getChild(0), { top: 0 })
      expectLayout(root.getChild(1), { top: 0 })
      expectLayout(root.getChild(2), { top: 1 })
      expectLayout(root.getChild(3), { top: 1 })
      root.free()
    })

    it("center: lines centered in cross axis", () => {
      const root = makeTree(ALIGN_CENTER)
      expectLayout(root.getChild(0), { top: 2 })
      expectLayout(root.getChild(1), { top: 2 })
      expectLayout(root.getChild(2), { top: 3 })
      expectLayout(root.getChild(3), { top: 3 })
      root.free()
    })

    it("flex-end: lines packed at end", () => {
      const root = makeTree(ALIGN_FLEX_END)
      expectLayout(root.getChild(0), { top: 4 })
      expectLayout(root.getChild(1), { top: 4 })
      expectLayout(root.getChild(2), { top: 5 })
      expectLayout(root.getChild(3), { top: 5 })
      root.free()
    })

    it("space-between: first line at start, last at end", () => {
      const root = makeTree(ALIGN_SPACE_BETWEEN)
      expectLayout(root.getChild(0), { top: 0 })
      expectLayout(root.getChild(1), { top: 0 })
      expectLayout(root.getChild(2), { top: 5 })
      expectLayout(root.getChild(3), { top: 5 })
      root.free()
    })

    it("space-around: equal space around each line", () => {
      const root = makeTree(ALIGN_SPACE_AROUND)
      // 2 lines of height 1, container=6, free space=4
      // space-around: each line gets 2 units around it (4/2/2=1 half-gap per side)
      // Line 0: offset = 1 (half-gap), Line 1: offset = 1 + 1 + 2 = 4
      expectLayout(root.getChild(0), { top: 1 })
      expectLayout(root.getChild(1), { top: 1 })
      expectLayout(root.getChild(2), { top: 4 })
      expectLayout(root.getChild(3), { top: 4 })
      root.free()
    })

    it("stretch: lines stretched to fill cross axis (auto-height children)", () => {
      // Use auto-height children so stretch actually affects them
      const root = Node.create()
      root.setWidth(2)
      root.setHeight(6)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setFlexWrap(WRAP_WRAP)
      root.setAlignContent(ALIGN_STRETCH)

      for (let i = 0; i < 4; i++) {
        const child = Node.create()
        child.setWidth(1)
        // No explicit height - child should stretch
        root.insertChild(child, i)
      }

      root.calculateLayout(2, 6, DIRECTION_LTR)

      // 2 lines, each gets 3 units of cross space (6/2=3)
      // Auto-height children stretch to fill their line's cross size
      expectLayout(root.getChild(0), { top: 0, height: 3 })
      expectLayout(root.getChild(1), { top: 0, height: 3 })
      expectLayout(root.getChild(2), { top: 3, height: 3 })
      expectLayout(root.getChild(3), { top: 3, height: 3 })
      root.free()
    })
  })

  describe("alignContent column direction", () => {
    // Box width=6 height=2 flexWrap=wrap flexDirection=column, 4 children (1x1 each)
    // Two lines: AC on line 0, BD on line 1. Each line has cross size 1.
    // Total line cross = 2, free space = 4.

    function makeTree(alignContent: number) {
      const root = Node.create()
      root.setWidth(6)
      root.setHeight(2)
      root.setFlexDirection(FLEX_DIRECTION_COLUMN)
      root.setFlexWrap(WRAP_WRAP)
      root.setAlignContent(alignContent)

      for (let i = 0; i < 4; i++) {
        const child = Node.create()
        child.setWidth(1)
        child.setHeight(1)
        root.insertChild(child, i)
      }

      root.calculateLayout(6, 2, DIRECTION_LTR)
      return root
    }

    it("center: lines centered in cross axis", () => {
      const root = makeTree(ALIGN_CENTER)
      expectLayout(root.getChild(0), { left: 2 })
      expectLayout(root.getChild(1), { left: 2 })
      expectLayout(root.getChild(2), { left: 3 })
      expectLayout(root.getChild(3), { left: 3 })
      root.free()
    })

    it("flex-end: lines packed at end", () => {
      const root = makeTree(ALIGN_FLEX_END)
      expectLayout(root.getChild(0), { left: 4 })
      expectLayout(root.getChild(1), { left: 4 })
      expectLayout(root.getChild(2), { left: 5 })
      expectLayout(root.getChild(3), { left: 5 })
      root.free()
    })
  })

  // ==========================================================================
  // Bug fixes: flexBasis
  // ==========================================================================
  describe("flexBasis", () => {
    it("should apply flexBasis in row direction (px)", () => {
      const root = Node.create()
      root.setWidth(7)
      root.setHeight(1)
      root.setFlexDirection(FLEX_DIRECTION_ROW)

      const child1 = Node.create()
      child1.setFlexBasis(3)
      child1.setMeasureFunc(() => ({ width: 1, height: 1 }))
      root.insertChild(child1, 0)

      const child2 = Node.create()
      child2.setFlexBasis(3)
      child2.setMeasureFunc(() => ({ width: 1, height: 1 }))
      root.insertChild(child2, 1)

      root.calculateLayout(7, 1, DIRECTION_LTR)

      expectLayout(child1, { left: 0, width: 3 })
      expectLayout(child2, { left: 3, width: 3 })
      root.free()
    })

    it("should apply flexBasis in column direction (px)", () => {
      const root = Node.create()
      root.setWidth(1)
      root.setHeight(7)
      root.setFlexDirection(FLEX_DIRECTION_COLUMN)

      const child1 = Node.create()
      child1.setFlexBasis(3)
      child1.setMeasureFunc(() => ({ width: 1, height: 1 }))
      root.insertChild(child1, 0)

      const child2 = Node.create()
      child2.setFlexBasis(3)
      child2.setMeasureFunc(() => ({ width: 1, height: 1 }))
      root.insertChild(child2, 1)

      root.calculateLayout(1, 7, DIRECTION_LTR)

      expectLayout(child1, { top: 0, height: 3 })
      expectLayout(child2, { top: 3, height: 3 })
      root.free()
    })

    it("should apply flexBasis percent in row direction", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(10)
      root.setFlexDirection(FLEX_DIRECTION_ROW)

      const child1 = Node.create()
      child1.setFlexBasisPercent(30)
      root.insertChild(child1, 0)

      const child2 = Node.create()
      child2.setFlexBasisPercent(30)
      root.insertChild(child2, 1)

      root.calculateLayout(100, 10, DIRECTION_LTR)

      expectLayout(child1, { left: 0, width: 30 })
      expectLayout(child2, { left: 30, width: 30 })
      root.free()
    })

    it("should apply flexBasis percent in column direction", () => {
      const root = Node.create()
      root.setWidth(10)
      root.setHeight(100)
      root.setFlexDirection(FLEX_DIRECTION_COLUMN)

      const child1 = Node.create()
      child1.setFlexBasisPercent(30)
      root.insertChild(child1, 0)

      const child2 = Node.create()
      child2.setFlexBasisPercent(30)
      root.insertChild(child2, 1)

      root.calculateLayout(10, 100, DIRECTION_LTR)

      expectLayout(child1, { top: 0, height: 30 })
      expectLayout(child2, { top: 30, height: 30 })
      root.free()
    })
  })

  // ==========================================================================
  // Bug fixes: flexWrap
  // ==========================================================================
  describe("flexWrap row bugs", () => {
    it("should wrap row items correctly with measureFunc children", () => {
      // Container width=2, three 1-wide children
      // Should wrap: first line [A,B], second line [C]
      const root = Node.create()
      root.setWidth(2)
      root.setHeight(3)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setFlexWrap(WRAP_WRAP)

      for (let i = 0; i < 3; i++) {
        const child = Node.create()
        child.setMeasureFunc(() => ({ width: 1, height: 1 }))
        root.insertChild(child, i)
      }

      root.calculateLayout(2, 3, DIRECTION_LTR)

      expectLayout(root.getChild(0), { left: 0, top: 0, width: 1, height: 1 })
      expectLayout(root.getChild(1), { left: 1, top: 0, width: 1, height: 1 })
      expectLayout(root.getChild(2), { left: 0, top: 1, width: 1, height: 1 })
      root.free()
    })

    it("should wrap column items correctly", () => {
      // Container height=2, three 1-tall children
      // Should wrap: first line [A,B], second line [C]
      const root = Node.create()
      root.setWidth(3)
      root.setHeight(2)
      root.setFlexDirection(FLEX_DIRECTION_COLUMN)
      root.setFlexWrap(WRAP_WRAP)

      for (let i = 0; i < 3; i++) {
        const child = Node.create()
        child.setWidth(1)
        child.setHeight(1)
        root.insertChild(child, i)
      }

      root.calculateLayout(3, 2, DIRECTION_LTR)

      expectLayout(root.getChild(0), { left: 0, top: 0 })
      expectLayout(root.getChild(1), { left: 0, top: 1 })
      expectLayout(root.getChild(2), { left: 1, top: 0 })
      root.free()
    })

    it("should handle wrap-reverse in row direction", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(100)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setFlexWrap(WRAP_WRAP_REVERSE)

      const child1 = Node.create()
      child1.setWidth(40)
      child1.setHeight(20)
      root.insertChild(child1, 0)

      const child2 = Node.create()
      child2.setWidth(40)
      child2.setHeight(20)
      root.insertChild(child2, 1)

      const child3 = Node.create()
      child3.setWidth(40)
      child3.setHeight(20)
      root.insertChild(child3, 2)

      root.calculateLayout(100, 100, DIRECTION_LTR)

      // wrap-reverse: first line at bottom, wrapped line above
      // Line 0 (child1, child2): should be at bottom
      // Line 1 (child3): should be above
      expectLayout(child1, { left: 0, top: 80 })
      expectLayout(child2, { left: 40, top: 80 })
      expectLayout(child3, { left: 0, top: 60 })
      root.free()
    })

    it("should handle wrap-reverse in column direction", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(100)
      root.setFlexDirection(FLEX_DIRECTION_COLUMN)
      root.setFlexWrap(WRAP_WRAP_REVERSE)

      const child1 = Node.create()
      child1.setWidth(20)
      child1.setHeight(40)
      root.insertChild(child1, 0)

      const child2 = Node.create()
      child2.setWidth(20)
      child2.setHeight(40)
      root.insertChild(child2, 1)

      const child3 = Node.create()
      child3.setWidth(20)
      child3.setHeight(40)
      root.insertChild(child3, 2)

      root.calculateLayout(100, 100, DIRECTION_LTR)

      // wrap-reverse column: first line at right, wrapped line to left
      expectLayout(child1, { left: 80, top: 0 })
      expectLayout(child2, { left: 80, top: 40 })
      expectLayout(child3, { left: 60, top: 0 })
      root.free()
    })

    it("should wrap row items with fixed-size children", () => {
      const root = Node.create()
      root.setWidth(2)
      root.setHeight(3)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setFlexWrap(WRAP_WRAP)

      for (let i = 0; i < 3; i++) {
        const child = Node.create()
        child.setWidth(1)
        child.setHeight(1)
        root.insertChild(child, i)
      }

      root.calculateLayout(2, 3, DIRECTION_LTR)

      expectLayout(root.getChild(0), { left: 0, top: 0 })
      expectLayout(root.getChild(1), { left: 1, top: 0 })
      expectLayout(root.getChild(2), { left: 0, top: 1 })
      root.free()
    })

    it("should wrap with larger children", () => {
      const root = Node.create()
      root.setWidth(5)
      root.setHeight(4)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setFlexWrap(WRAP_WRAP)

      const child1 = Node.create()
      child1.setWidth(3)
      child1.setHeight(2)
      root.insertChild(child1, 0)

      const child2 = Node.create()
      child2.setWidth(3)
      child2.setHeight(2)
      root.insertChild(child2, 1)

      root.calculateLayout(5, 4, DIRECTION_LTR)

      // 3+3=6 > 5, so child2 wraps to next line
      expectLayout(child1, { left: 0, top: 0, width: 3, height: 2 })
      expectLayout(child2, { left: 0, top: 2, width: 3, height: 2 })
      root.free()
    })
  })

  // ==========================================================================
  // Bug fixes: space-evenly off-by-one
  // ==========================================================================
  describe("justifyContent space-evenly", () => {
    it("should distribute space evenly with rounding", () => {
      // Container width=7, two 1-wide children
      // Free space = 5, divided among 3 gaps (before, between, after) = 5/3 ≈ 1.667
      // Yoga rounds: child1 at x=2, child2 at x=5
      const root = Node.create()
      root.setWidth(7)
      root.setHeight(1)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setJustifyContent(JUSTIFY_SPACE_EVENLY)

      const child1 = Node.create()
      child1.setWidth(1)
      child1.setHeight(1)
      root.insertChild(child1, 0)

      const child2 = Node.create()
      child2.setWidth(1)
      child2.setHeight(1)
      root.insertChild(child2, 1)

      root.calculateLayout(7, 1, DIRECTION_LTR)

      expectLayout(child1, { left: 2 })
      expectLayout(child2, { left: 4 })
      root.free()
    })
  })

  // ==========================================================================
  // Bug fixes: baseline alignment with alignSelf
  // ==========================================================================
  describe("baseline alignment edge cases", () => {
    it("should align to baseline correctly with mixed heights and alignSelf", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(50)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      // Default alignItems is stretch, individual children use alignSelf=baseline

      const child1 = Node.create()
      child1.setWidth(30)
      child1.setHeight(10)
      child1.setAlignSelf(ALIGN_BASELINE)
      root.insertChild(child1, 0)

      const child2 = Node.create()
      child2.setWidth(30)
      child2.setHeight(20)
      child2.setAlignSelf(ALIGN_BASELINE)
      root.insertChild(child2, 1)

      root.calculateLayout(100, 50, DIRECTION_LTR)

      // Without baselineFunc, baseline = bottom of element
      // Max baseline = 20 (child2), so child1 shifts down by 10
      expectLayout(child1, { top: 10 })
      expectLayout(child2, { top: 0 })
      root.free()
    })
  })

  // ==========================================================================
  // Bug fixes: gap combined (row + column)
  // ==========================================================================
  describe("gap combined", () => {
    it("should apply both row and column gap in wrapping row layout", () => {
      // Row container with wrap, gap=1 in both directions
      // Two 1x1 children on first line, one 1x1 child wrapping to second line
      const root = Node.create()
      root.setWidth(3)
      root.setHeight(5)
      root.setFlexDirection(FLEX_DIRECTION_ROW)
      root.setFlexWrap(WRAP_WRAP)
      root.setGap(GUTTER_ALL, 1)

      const child1 = Node.create()
      child1.setWidth(1)
      child1.setHeight(1)
      root.insertChild(child1, 0)

      const child2 = Node.create()
      child2.setWidth(1)
      child2.setHeight(1)
      root.insertChild(child2, 1)

      const child3 = Node.create()
      child3.setWidth(1)
      child3.setHeight(1)
      root.insertChild(child3, 2)

      root.calculateLayout(3, 5, DIRECTION_LTR)

      // First line: A at 0, B at 2 (1 gap between A and B)
      // Second line: C at top=2 (1 cross gap between lines: height of line 0 is 1, gap is 1, so 1+1=2)
      expectLayout(child1, { left: 0, top: 0 })
      expectLayout(child2, { left: 2, top: 0 })
      expectLayout(child3, { left: 0, top: 2 })
      root.free()
    })

    it("should apply column gap in wrapping column layout", () => {
      const root = Node.create()
      root.setWidth(5)
      root.setHeight(3)
      root.setFlexDirection(FLEX_DIRECTION_COLUMN)
      root.setFlexWrap(WRAP_WRAP)
      root.setGap(GUTTER_ALL, 1)

      const child1 = Node.create()
      child1.setWidth(1)
      child1.setHeight(1)
      root.insertChild(child1, 0)

      const child2 = Node.create()
      child2.setWidth(1)
      child2.setHeight(1)
      root.insertChild(child2, 1)

      const child3 = Node.create()
      child3.setWidth(1)
      child3.setHeight(1)
      root.insertChild(child3, 2)

      root.calculateLayout(5, 3, DIRECTION_LTR)

      // First line (column): A at top=0, B at top=2 (1 gap)
      // A wraps to height=3, so B should be at top=2 (1+1gap). But 1+1=2 < 3, fits.
      // Wait: children are 1x1. Container height=3. First line: A(0), B(1+1gap=2). Fits.
      // C wraps to next line (column). Next line left = 1 (first line width) + 1 (cross gap) = 2
      expectLayout(child1, { left: 0, top: 0 })
      expectLayout(child2, { left: 0, top: 2 })
      expectLayout(child3, { left: 2, top: 0 })
      root.free()
    })
  })

  // ==========================================================================
  // Bug fixes: min/max sizing edge cases
  // ==========================================================================
  describe("min/max sizing edge cases", () => {
    it("should respect minWidth percent", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(50)
      root.setFlexDirection(FLEX_DIRECTION_ROW)

      const child = Node.create()
      child.setMinWidthPercent(50)
      root.insertChild(child, 0)

      root.calculateLayout(100, 50, DIRECTION_LTR)

      expect(child.getComputedWidth()).toBeGreaterThanOrEqual(50)
      root.free()
    })

    it("should respect maxWidth percent", () => {
      const root = Node.create()
      root.setWidth(100)
      root.setHeight(50)
      root.setFlexDirection(FLEX_DIRECTION_ROW)

      const child = Node.create()
      child.setFlexGrow(1)
      child.setMaxWidthPercent(30)
      root.insertChild(child, 0)

      root.calculateLayout(100, 50, DIRECTION_LTR)

      expect(child.getComputedWidth()).toBeLessThanOrEqual(30)
      root.free()
    })

    it("should respect maxHeight percent", () => {
      const root = Node.create()
      root.setWidth(50)
      root.setHeight(100)
      root.setFlexDirection(FLEX_DIRECTION_COLUMN)

      const child = Node.create()
      child.setFlexGrow(1)
      child.setMaxHeightPercent(30)
      root.insertChild(child, 0)

      root.calculateLayout(50, 100, DIRECTION_LTR)

      expect(child.getComputedHeight()).toBeLessThanOrEqual(30)
      root.free()
    })
  })
})
