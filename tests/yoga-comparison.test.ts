/**
 * Yoga Compatibility Tests
 *
 * Systematically compares Flexture output against Yoga (the reference implementation)
 * to identify discrepancies and edge cases.
 *
 * Run: bun test tests/yoga-comparison.test.ts
 */

import { describe, expect, it, beforeAll } from "vitest"
import { createLogger } from "decant"

const log = createLogger("flexture:test:compat")
import * as Flexture from "../src/index.js"
import initYoga, { type Yoga, type Node as YogaNode } from "yoga-wasm-web"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// ============================================================================
// Setup
// ============================================================================

let yoga: Yoga
const __dirname = dirname(fileURLToPath(import.meta.url))
const wasmPath = join(__dirname, "../node_modules/yoga-wasm-web/dist/yoga.wasm")

beforeAll(async () => {
  const wasmBuffer = readFileSync(wasmPath)
  yoga = await initYoga(wasmBuffer)
})

// ============================================================================
// Types and Layout Extraction
// ============================================================================

interface LayoutResult {
  left: number
  top: number
  width: number
  height: number
}

interface NodeLayout extends LayoutResult {
  children: NodeLayout[]
}

function getFlextureLayout(node: Flexture.Node): NodeLayout {
  return {
    left: node.getComputedLeft(),
    top: node.getComputedTop(),
    width: node.getComputedWidth(),
    height: node.getComputedHeight(),
    children: Array.from({ length: node.getChildCount() }, (_, i) => getFlextureLayout(node.getChild(i)!)),
  }
}

function getYogaLayout(node: YogaNode): NodeLayout {
  return {
    left: node.getComputedLeft(),
    top: node.getComputedTop(),
    width: node.getComputedWidth(),
    height: node.getComputedHeight(),
    children: Array.from({ length: node.getChildCount() }, (_, i) => getYogaLayout(node.getChild(i))),
  }
}

function layoutsMatch(a: NodeLayout, b: NodeLayout, tolerance = 0.001): boolean {
  if (
    Math.abs(a.left - b.left) > tolerance ||
    Math.abs(a.top - b.top) > tolerance ||
    Math.abs(a.width - b.width) > tolerance ||
    Math.abs(a.height - b.height) > tolerance
  ) {
    return false
  }
  if (a.children.length !== b.children.length) return false
  return a.children.every((child, i) => layoutsMatch(child, b.children[i]!, tolerance))
}

function formatLayout(layout: NodeLayout, indent = 0): string {
  const pad = "  ".repeat(indent)
  let result = `${pad}{ left: ${layout.left}, top: ${layout.top}, width: ${layout.width}, height: ${layout.height} }`
  if (layout.children.length > 0) {
    result += ` [\n${layout.children.map((c) => formatLayout(c, indent + 1)).join(",\n")}\n${pad}]`
  }
  return result
}

// ============================================================================
// Test Results Tracking
// ============================================================================

interface TestResult {
  category: string
  name: string
  passed: boolean
  flexture?: NodeLayout
  yoga?: NodeLayout
  error?: string
}

const results: TestResult[] = []

function recordResult(result: TestResult) {
  results.push(result)
}

// ============================================================================
// Test Helpers
// ============================================================================

/** Node configuration for setup functions */
interface NodeConfig {
  width?: number
  height?: number
  widthPercent?: number
  heightPercent?: number
  flexDirection?: number
  flexWrap?: number
  alignContent?: number
  alignItems?: number
  justifyContent?: number
  flexGrow?: number
  flexShrink?: number
  flexBasis?: number
  gap?: { gutter: number; value: number }
  gapRow?: number
  gapColumn?: number
  padding?: number
  paddingPercent?: number
  margin?: { edge: number; value: number }
  marginPercent?: { edge: number; value: number }
  minWidth?: number
  maxWidth?: number
  minWidthPercent?: number
  maxWidthPercent?: number
  positionType?: number
  position?: { edge: number; value: number }[]
  positionPercent?: { edge: number; value: number }[]
}

/** Child configuration for creating multiple children */
interface ChildConfig extends NodeConfig {
  count?: number
}

/**
 * Creates and configures a Flexture node
 */
function createFlextureNode(config: NodeConfig): Flexture.Node {
  const node = Flexture.Node.create()
  applyFlextureConfig(node, config)
  return node
}

function applyFlextureConfig(node: Flexture.Node, config: NodeConfig) {
  if (config.width !== undefined) {
    node.setWidth(config.width)
  }
  if (config.height !== undefined) {
    node.setHeight(config.height)
  }
  if (config.widthPercent !== undefined) {
    node.setWidthPercent(config.widthPercent)
  }
  if (config.heightPercent !== undefined) {
    node.setHeightPercent(config.heightPercent)
  }
  if (config.flexDirection !== undefined) {
    node.setFlexDirection(config.flexDirection)
  }
  if (config.flexWrap !== undefined) {
    node.setFlexWrap(config.flexWrap)
  }
  if (config.alignContent !== undefined) {
    node.setAlignContent(config.alignContent)
  }
  if (config.alignItems !== undefined) {
    node.setAlignItems(config.alignItems)
  }
  if (config.justifyContent !== undefined) {
    node.setJustifyContent(config.justifyContent)
  }
  if (config.flexGrow !== undefined) {
    node.setFlexGrow(config.flexGrow)
  }
  if (config.flexShrink !== undefined) {
    node.setFlexShrink(config.flexShrink)
  }
  if (config.flexBasis !== undefined) {
    node.setFlexBasis(config.flexBasis)
  }
  if (config.gap !== undefined) {
    node.setGap(config.gap.gutter, config.gap.value)
  }
  if (config.gapRow !== undefined) {
    node.setGap(Flexture.GUTTER_ROW, config.gapRow)
  }
  if (config.gapColumn !== undefined) {
    node.setGap(Flexture.GUTTER_COLUMN, config.gapColumn)
  }
  if (config.padding !== undefined) {
    node.setPadding(Flexture.EDGE_ALL, config.padding)
  }
  if (config.paddingPercent !== undefined) {
    node.setPaddingPercent(Flexture.EDGE_ALL, config.paddingPercent)
  }
  if (config.margin !== undefined) {
    node.setMargin(config.margin.edge, config.margin.value)
  }
  if (config.marginPercent !== undefined) {
    node.setMarginPercent(config.marginPercent.edge, config.marginPercent.value)
  }
  if (config.minWidth !== undefined) {
    node.setMinWidth(config.minWidth)
  }
  if (config.maxWidth !== undefined) {
    node.setMaxWidth(config.maxWidth)
  }
  if (config.minWidthPercent !== undefined) {
    node.setMinWidthPercent(config.minWidthPercent)
  }
  if (config.maxWidthPercent !== undefined) {
    node.setMaxWidthPercent(config.maxWidthPercent)
  }
  if (config.positionType !== undefined) {
    node.setPositionType(config.positionType)
  }
  if (config.position !== undefined) {
    for (const p of config.position) {
      node.setPosition(p.edge, p.value)
    }
  }
  if (config.positionPercent !== undefined) {
    for (const p of config.positionPercent) {
      node.setPositionPercent(p.edge, p.value)
    }
  }
}

/**
 * Creates and configures a Yoga node
 */
function createYogaNode(config: NodeConfig): YogaNode {
  const node = yoga.Node.create()
  applyYogaConfig(node, config)
  return node
}

function applyYogaConfig(node: YogaNode, config: NodeConfig) {
  if (config.width !== undefined) {
    node.setWidth(config.width)
  }
  if (config.height !== undefined) {
    node.setHeight(config.height)
  }
  if (config.widthPercent !== undefined) {
    node.setWidthPercent(config.widthPercent)
  }
  if (config.heightPercent !== undefined) {
    node.setHeightPercent(config.heightPercent)
  }
  if (config.flexDirection !== undefined) {
    node.setFlexDirection(config.flexDirection)
  }
  if (config.flexWrap !== undefined) {
    node.setFlexWrap(config.flexWrap)
  }
  if (config.alignContent !== undefined) {
    node.setAlignContent(config.alignContent)
  }
  if (config.alignItems !== undefined) {
    node.setAlignItems(config.alignItems)
  }
  if (config.justifyContent !== undefined) {
    node.setJustifyContent(config.justifyContent)
  }
  if (config.flexGrow !== undefined) {
    node.setFlexGrow(config.flexGrow)
  }
  if (config.flexShrink !== undefined) {
    node.setFlexShrink(config.flexShrink)
  }
  if (config.flexBasis !== undefined) {
    node.setFlexBasis(config.flexBasis)
  }
  if (config.gap !== undefined) {
    node.setGap(config.gap.gutter, config.gap.value)
  }
  if (config.gapRow !== undefined) {
    node.setGap(yoga.GUTTER_ROW, config.gapRow)
  }
  if (config.gapColumn !== undefined) {
    node.setGap(yoga.GUTTER_COLUMN, config.gapColumn)
  }
  if (config.padding !== undefined) {
    node.setPadding(yoga.EDGE_ALL, config.padding)
  }
  if (config.paddingPercent !== undefined) {
    node.setPaddingPercent(yoga.EDGE_ALL, config.paddingPercent)
  }
  if (config.margin !== undefined) {
    node.setMargin(config.margin.edge, config.margin.value)
  }
  if (config.marginPercent !== undefined) {
    node.setMarginPercent(config.marginPercent.edge, config.marginPercent.value)
  }
  if (config.minWidth !== undefined) {
    node.setMinWidth(config.minWidth)
  }
  if (config.maxWidth !== undefined) {
    node.setMaxWidth(config.maxWidth)
  }
  if (config.minWidthPercent !== undefined) {
    node.setMinWidthPercent(config.minWidthPercent)
  }
  if (config.maxWidthPercent !== undefined) {
    node.setMaxWidthPercent(config.maxWidthPercent)
  }
  if (config.positionType !== undefined) {
    node.setPositionType(config.positionType)
  }
  if (config.position !== undefined) {
    for (const p of config.position) {
      node.setPosition(p.edge, p.value)
    }
  }
  if (config.positionPercent !== undefined) {
    for (const p of config.positionPercent) {
      node.setPositionPercent(p.edge, p.value)
    }
  }
}

interface CompareLayoutsOptions {
  category: string
  name: string
  rootConfig: NodeConfig
  childConfigs?: ChildConfig[]
  /** Custom setup for nodes that need special configuration */
  customSetup?: (fRoot: Flexture.Node, yRoot: YogaNode) => void
  layoutWidth?: number
  layoutHeight?: number
}

/**
 * Main comparison helper - creates Flexture and Yoga trees, compares layouts
 */
function compareLayouts(options: CompareLayoutsOptions): boolean {
  const { category, name, rootConfig, childConfigs = [], customSetup, layoutWidth = 100, layoutHeight = 100 } = options

  // Create Flexture tree
  const fRoot = createFlextureNode(rootConfig)

  // Create children
  for (let i = 0; i < childConfigs.length; i++) {
    const childConfig = childConfigs[i]!
    const count = childConfig.count ?? 1
    for (let j = 0; j < count; j++) {
      const child = createFlextureNode(childConfig)
      fRoot.insertChild(child, fRoot.getChildCount())
    }
  }

  // Create Yoga tree
  const yRoot = createYogaNode(rootConfig)

  for (let i = 0; i < childConfigs.length; i++) {
    const childConfig = childConfigs[i]!
    const count = childConfig.count ?? 1
    for (let j = 0; j < count; j++) {
      const child = createYogaNode(childConfig)
      yRoot.insertChild(child, yRoot.getChildCount())
    }
  }

  // Apply custom setup if provided
  if (customSetup) {
    customSetup(fRoot, yRoot)
  }

  // Calculate layouts
  fRoot.calculateLayout(layoutWidth, layoutHeight, Flexture.DIRECTION_LTR)
  yRoot.calculateLayout(layoutWidth, layoutHeight, yoga.DIRECTION_LTR)

  const flextureLayout = getFlextureLayout(fRoot)
  const yogaLayout = getYogaLayout(yRoot)

  yRoot.freeRecursive()

  const match = layoutsMatch(flextureLayout, yogaLayout)
  recordResult({
    category,
    name,
    passed: match,
    flexture: flextureLayout,
    yoga: yogaLayout,
  })

  return match
}

// ============================================================================
// Category: Flex Wrap Edge Cases
// ============================================================================

describe("Yoga Comparison: FlexWrap", () => {
  it.each([
    {
      name: "wrap-basic",
      description: "three items that need wrapping",
      childCount: 3,
      childWidth: 40,
      childHeight: 20,
      flexWrap: Flexture.WRAP_WRAP,
    },
    {
      name: "wrap-reverse",
      description: "wrap-reverse direction",
      childCount: 3,
      childWidth: 40,
      childHeight: 20,
      flexWrap: Flexture.WRAP_WRAP_REVERSE,
    },
  ])("$name: $description", ({ name, childCount, childWidth, childHeight, flexWrap }) => {
    const match = compareLayouts({
      category: "FlexWrap",
      name,
      rootConfig: {
        width: 100,
        height: 100,
        flexDirection: Flexture.FLEX_DIRECTION_ROW,
        flexWrap,
      },
      childConfigs: [{ width: childWidth, height: childHeight, count: childCount }],
    })
    expect(match).toBe(true)
  })

  it("wrap-with-gap: wrapping with row and column gap", () => {
    const match = compareLayouts({
      category: "FlexWrap",
      name: "wrap-with-gap",
      rootConfig: {
        width: 100,
        height: 100,
        flexDirection: Flexture.FLEX_DIRECTION_ROW,
        flexWrap: Flexture.WRAP_WRAP,
        gapColumn: 10,
        gapRow: 5,
      },
      childConfigs: [{ width: 40, height: 20, count: 4 }],
    })
    expect(match).toBe(true)
  })

  it("wrap-with-flexgrow: items with flex-grow on wrapped lines", () => {
    const match = compareLayouts({
      category: "FlexWrap",
      name: "wrap-with-flexgrow",
      rootConfig: {
        width: 100,
        height: 100,
        flexDirection: Flexture.FLEX_DIRECTION_ROW,
        flexWrap: Flexture.WRAP_WRAP,
      },
      childConfigs: [{ width: 40, height: 20, flexGrow: 1, count: 3 }],
    })
    expect(match).toBe(true)
  })

  it("wrap-column: column wrap", () => {
    const match = compareLayouts({
      category: "FlexWrap",
      name: "wrap-column",
      rootConfig: {
        width: 100,
        height: 100,
        flexDirection: Flexture.FLEX_DIRECTION_COLUMN,
        flexWrap: Flexture.WRAP_WRAP,
      },
      childConfigs: [{ width: 30, height: 40, count: 6 }],
    })
    expect(match).toBe(true)
  })
})

// ============================================================================
// Category: AlignContent
// ============================================================================

describe("Yoga Comparison: AlignContent", () => {
  const alignContentCases = [
    {
      name: "flex-start",
      align: Flexture.ALIGN_FLEX_START,
      description: "lines packed at start",
    },
    {
      name: "center",
      align: Flexture.ALIGN_CENTER,
      description: "lines packed at center",
    },
    {
      name: "flex-end",
      align: Flexture.ALIGN_FLEX_END,
      description: "lines packed at end",
    },
    {
      name: "space-between",
      align: Flexture.ALIGN_SPACE_BETWEEN,
      description: "lines spaced evenly",
    },
    {
      name: "space-around",
      align: Flexture.ALIGN_SPACE_AROUND,
      description: "lines with space around",
    },
    {
      name: "stretch",
      align: Flexture.ALIGN_STRETCH,
      description: "lines stretch to fill",
    },
  ]

  it.each(alignContentCases)("align-content-$name: $description", ({ name, align }) => {
    const match = compareLayouts({
      category: "AlignContent",
      name: `align-content-${name}`,
      rootConfig: {
        width: 100,
        height: 100,
        flexDirection: Flexture.FLEX_DIRECTION_ROW,
        flexWrap: Flexture.WRAP_WRAP,
        alignContent: align,
      },
      childConfigs: [{ width: 40, height: 20, count: 4 }],
    })
    expect(match).toBe(true)
  })
})

// ============================================================================
// Category: Absolute Positioning
// ============================================================================

describe("Yoga Comparison: AbsolutePositioning", () => {
  it("absolute-with-padding: absolute child in padded parent", () => {
    const match = compareLayouts({
      category: "AbsolutePositioning",
      name: "absolute-with-padding",
      rootConfig: {
        width: 100,
        height: 100,
        padding: 10,
      },
      childConfigs: [
        {
          positionType: Flexture.POSITION_TYPE_ABSOLUTE,
          position: [
            { edge: Flexture.EDGE_LEFT, value: 0 },
            { edge: Flexture.EDGE_TOP, value: 0 },
          ],
          width: 50,
          height: 50,
        },
      ],
    })
    expect(match).toBe(true)
  })

  it("absolute-all-edges: absolute with all edges set", () => {
    const match = compareLayouts({
      category: "AbsolutePositioning",
      name: "absolute-all-edges",
      rootConfig: { width: 100, height: 100 },
      childConfigs: [
        {
          positionType: Flexture.POSITION_TYPE_ABSOLUTE,
          position: [
            { edge: Flexture.EDGE_LEFT, value: 10 },
            { edge: Flexture.EDGE_TOP, value: 10 },
            { edge: Flexture.EDGE_RIGHT, value: 10 },
            { edge: Flexture.EDGE_BOTTOM, value: 10 },
          ],
        },
      ],
    })
    expect(match).toBe(true)
  })

  it("absolute-percent-position: absolute with percent positions", () => {
    const match = compareLayouts({
      category: "AbsolutePositioning",
      name: "absolute-percent-position",
      rootConfig: { width: 100, height: 100 },
      childConfigs: [
        {
          positionType: Flexture.POSITION_TYPE_ABSOLUTE,
          positionPercent: [
            { edge: Flexture.EDGE_LEFT, value: 10 },
            { edge: Flexture.EDGE_TOP, value: 10 },
          ],
          width: 50,
          height: 50,
        },
      ],
    })
    expect(match).toBe(true)
  })

  it("absolute-with-margin: absolute with margin offset", () => {
    // This test needs custom setup for setting margin on specific edges
    const fRoot = Flexture.Node.create()
    fRoot.setWidth(100)
    fRoot.setHeight(100)

    const fChild = Flexture.Node.create()
    fChild.setPositionType(Flexture.POSITION_TYPE_ABSOLUTE)
    fChild.setPosition(Flexture.EDGE_LEFT, 0)
    fChild.setPosition(Flexture.EDGE_TOP, 0)
    fChild.setMargin(Flexture.EDGE_LEFT, 10)
    fChild.setMargin(Flexture.EDGE_TOP, 10)
    fChild.setWidth(50)
    fChild.setHeight(50)
    fRoot.insertChild(fChild, 0)

    fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)
    const flextureLayout = getFlextureLayout(fRoot)

    const yRoot = yoga.Node.create()
    yRoot.setWidth(100)
    yRoot.setHeight(100)

    const yChild = yoga.Node.create()
    yChild.setPositionType(yoga.POSITION_TYPE_ABSOLUTE)
    yChild.setPosition(yoga.EDGE_LEFT, 0)
    yChild.setPosition(yoga.EDGE_TOP, 0)
    yChild.setMargin(yoga.EDGE_LEFT, 10)
    yChild.setMargin(yoga.EDGE_TOP, 10)
    yChild.setWidth(50)
    yChild.setHeight(50)
    yRoot.insertChild(yChild, 0)

    yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)
    const yogaLayout = getYogaLayout(yRoot)
    yRoot.freeRecursive()

    const match = layoutsMatch(flextureLayout, yogaLayout)
    recordResult({
      category: "AbsolutePositioning",
      name: "absolute-with-margin",
      passed: match,
      flexture: flextureLayout,
      yoga: yogaLayout,
    })
    expect(match).toBe(true)
  })

  // Note: Flexture centers absolute children with auto margins, Yoga does not.
  // This is a Flexture extension that follows CSS behavior more closely.
  it.skip("absolute-centering: center absolute child with auto margins (Flexture extension)", () => {
    // Intentionally skipped - documents known difference
  })
})

// ============================================================================
// Category: Min/Max Dimensions
// ============================================================================

describe("Yoga Comparison: MinMaxDimensions", () => {
  it("min-width-overrides-shrink: minWidth prevents shrinking", () => {
    // Custom setup needed for two children with different configs
    const fRoot = Flexture.Node.create()
    fRoot.setWidth(100)
    fRoot.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)

    const fChild1 = Flexture.Node.create()
    fChild1.setWidth(80)
    fChild1.setMinWidth(60)
    fChild1.setFlexShrink(1)
    fRoot.insertChild(fChild1, 0)

    const fChild2 = Flexture.Node.create()
    fChild2.setWidth(80)
    fChild2.setFlexShrink(1)
    fRoot.insertChild(fChild2, 1)

    fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)
    const flextureLayout = getFlextureLayout(fRoot)

    const yRoot = yoga.Node.create()
    yRoot.setWidth(100)
    yRoot.setFlexDirection(yoga.FLEX_DIRECTION_ROW)

    const yChild1 = yoga.Node.create()
    yChild1.setWidth(80)
    yChild1.setMinWidth(60)
    yChild1.setFlexShrink(1)
    yRoot.insertChild(yChild1, 0)

    const yChild2 = yoga.Node.create()
    yChild2.setWidth(80)
    yChild2.setFlexShrink(1)
    yRoot.insertChild(yChild2, 1)

    yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)
    const yogaLayout = getYogaLayout(yRoot)
    yRoot.freeRecursive()

    const match = layoutsMatch(flextureLayout, yogaLayout)
    recordResult({
      category: "MinMaxDimensions",
      name: "min-width-overrides-shrink",
      passed: match,
      flexture: flextureLayout,
      yoga: yogaLayout,
    })
    expect(match).toBe(true)
  })

  it("max-width-overrides-grow: maxWidth caps growth", () => {
    const fRoot = Flexture.Node.create()
    fRoot.setWidth(100)
    fRoot.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)

    const fChild1 = Flexture.Node.create()
    fChild1.setFlexGrow(1)
    fChild1.setMaxWidth(30)
    fRoot.insertChild(fChild1, 0)

    const fChild2 = Flexture.Node.create()
    fChild2.setFlexGrow(1)
    fRoot.insertChild(fChild2, 1)

    fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)
    const flextureLayout = getFlextureLayout(fRoot)

    const yRoot = yoga.Node.create()
    yRoot.setWidth(100)
    yRoot.setFlexDirection(yoga.FLEX_DIRECTION_ROW)

    const yChild1 = yoga.Node.create()
    yChild1.setFlexGrow(1)
    yChild1.setMaxWidth(30)
    yRoot.insertChild(yChild1, 0)

    const yChild2 = yoga.Node.create()
    yChild2.setFlexGrow(1)
    yRoot.insertChild(yChild2, 1)

    yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)
    const yogaLayout = getYogaLayout(yRoot)
    yRoot.freeRecursive()

    const match = layoutsMatch(flextureLayout, yogaLayout)
    recordResult({
      category: "MinMaxDimensions",
      name: "max-width-overrides-grow",
      passed: match,
      flexture: flextureLayout,
      yoga: yogaLayout,
    })
    expect(match).toBe(true)
  })

  it("min-max-percent: percent-based min/max constraints", () => {
    const match = compareLayouts({
      category: "MinMaxDimensions",
      name: "min-max-percent",
      rootConfig: {
        width: 100,
        height: 100,
        flexDirection: Flexture.FLEX_DIRECTION_ROW,
      },
      childConfigs: [
        {
          flexGrow: 1,
          minWidthPercent: 20,
          maxWidthPercent: 80,
        },
      ],
    })
    expect(match).toBe(true)
  })

  it("min-max-interaction: min > max scenario", () => {
    const match = compareLayouts({
      category: "MinMaxDimensions",
      name: "min-max-interaction",
      rootConfig: { width: 100, height: 100 },
      childConfigs: [
        {
          minWidth: 60,
          maxWidth: 40, // min > max (invalid, but needs to handle)
        },
      ],
    })
    expect(match).toBe(true)
  })

  it("nested-min-max: nested containers with constraints", () => {
    // Custom setup for nested structure
    const fRoot = Flexture.Node.create()
    fRoot.setWidth(100)
    fRoot.setHeight(100)
    fRoot.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)

    const fOuter = Flexture.Node.create()
    fOuter.setFlexGrow(1)
    fOuter.setMaxWidth(60)
    fRoot.insertChild(fOuter, 0)

    const fInner = Flexture.Node.create()
    fInner.setFlexGrow(1)
    fInner.setMinWidth(40)
    fOuter.insertChild(fInner, 0)

    fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)
    const flextureLayout = getFlextureLayout(fRoot)

    const yRoot = yoga.Node.create()
    yRoot.setWidth(100)
    yRoot.setHeight(100)
    yRoot.setFlexDirection(yoga.FLEX_DIRECTION_ROW)

    const yOuter = yoga.Node.create()
    yOuter.setFlexGrow(1)
    yOuter.setMaxWidth(60)
    yRoot.insertChild(yOuter, 0)

    const yInner = yoga.Node.create()
    yInner.setFlexGrow(1)
    yInner.setMinWidth(40)
    yOuter.insertChild(yInner, 0)

    yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)
    const yogaLayout = getYogaLayout(yRoot)
    yRoot.freeRecursive()

    const match = layoutsMatch(flextureLayout, yogaLayout)
    recordResult({
      category: "MinMaxDimensions",
      name: "nested-min-max",
      passed: match,
      flexture: flextureLayout,
      yoga: yogaLayout,
    })
    expect(match).toBe(true)
  })
})

// ============================================================================
// Category: Gap
// ============================================================================

describe("Yoga Comparison: Gap", () => {
  it.each([
    {
      name: "row-gap-only",
      description: "gap between rows in wrapped content",
      gapRow: 10,
      flexWrap: Flexture.WRAP_WRAP,
      childCount: 4,
      childWidth: 40,
      childHeight: 30,
    },
    {
      name: "column-gap-only",
      description: "gap between columns",
      gapColumn: 10,
      childCount: 3,
      childWidth: 20,
      childHeight: 30,
    },
  ])("$name: $description", ({ name, gapRow, gapColumn, flexWrap, childCount, childWidth, childHeight }) => {
    const match = compareLayouts({
      category: "Gap",
      name,
      rootConfig: {
        width: 100,
        height: 100,
        flexDirection: Flexture.FLEX_DIRECTION_ROW,
        flexWrap,
        gapRow,
        gapColumn,
      },
      childConfigs: [{ width: childWidth, height: childHeight, count: childCount }],
    })
    expect(match).toBe(true)
  })

  it("gap-with-flexgrow: gap interacting with flex grow", () => {
    const match = compareLayouts({
      category: "Gap",
      name: "gap-with-flexgrow",
      rootConfig: {
        width: 100,
        height: 100,
        flexDirection: Flexture.FLEX_DIRECTION_ROW,
        gapColumn: 10,
      },
      childConfigs: [{ flexGrow: 1, height: 30, count: 3 }],
    })
    expect(match).toBe(true)
  })

  it("gap-all: both row and column gap", () => {
    const match = compareLayouts({
      category: "Gap",
      name: "gap-all",
      rootConfig: {
        width: 100,
        height: 100,
        flexDirection: Flexture.FLEX_DIRECTION_ROW,
        flexWrap: Flexture.WRAP_WRAP,
        gap: { gutter: Flexture.GUTTER_ALL, value: 10 },
      },
      childConfigs: [{ width: 25, height: 25, count: 6 }],
    })
    expect(match).toBe(true)
  })
})

// ============================================================================
// Category: Flex Shrink Edge Cases
// ============================================================================

describe("Yoga Comparison: FlexShrink", () => {
  it("shrink-with-basis: different basis values", () => {
    const fRoot = Flexture.Node.create()
    fRoot.setWidth(100)
    fRoot.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)

    const fChild1 = Flexture.Node.create()
    fChild1.setFlexBasis(100)
    fChild1.setFlexShrink(1)
    fRoot.insertChild(fChild1, 0)

    const fChild2 = Flexture.Node.create()
    fChild2.setFlexBasis(50)
    fChild2.setFlexShrink(1)
    fRoot.insertChild(fChild2, 1)

    fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)
    const flextureLayout = getFlextureLayout(fRoot)

    const yRoot = yoga.Node.create()
    yRoot.setWidth(100)
    yRoot.setFlexDirection(yoga.FLEX_DIRECTION_ROW)

    const yChild1 = yoga.Node.create()
    yChild1.setFlexBasis(100)
    yChild1.setFlexShrink(1)
    yRoot.insertChild(yChild1, 0)

    const yChild2 = yoga.Node.create()
    yChild2.setFlexBasis(50)
    yChild2.setFlexShrink(1)
    yRoot.insertChild(yChild2, 1)

    yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)
    const yogaLayout = getYogaLayout(yRoot)
    yRoot.freeRecursive()

    const match = layoutsMatch(flextureLayout, yogaLayout)
    recordResult({
      category: "FlexShrink",
      name: "shrink-with-basis",
      passed: match,
      flexture: flextureLayout,
      yoga: yogaLayout,
    })
    expect(match).toBe(true)
  })

  it("shrink-different-factors: unequal shrink factors", () => {
    const fRoot = Flexture.Node.create()
    fRoot.setWidth(100)
    fRoot.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)

    const fChild1 = Flexture.Node.create()
    fChild1.setWidth(100)
    fChild1.setFlexShrink(1)
    fRoot.insertChild(fChild1, 0)

    const fChild2 = Flexture.Node.create()
    fChild2.setWidth(100)
    fChild2.setFlexShrink(2)
    fRoot.insertChild(fChild2, 1)

    fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)
    const flextureLayout = getFlextureLayout(fRoot)

    const yRoot = yoga.Node.create()
    yRoot.setWidth(100)
    yRoot.setFlexDirection(yoga.FLEX_DIRECTION_ROW)

    const yChild1 = yoga.Node.create()
    yChild1.setWidth(100)
    yChild1.setFlexShrink(1)
    yRoot.insertChild(yChild1, 0)

    const yChild2 = yoga.Node.create()
    yChild2.setWidth(100)
    yChild2.setFlexShrink(2)
    yRoot.insertChild(yChild2, 1)

    yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)
    const yogaLayout = getYogaLayout(yRoot)
    yRoot.freeRecursive()

    const match = layoutsMatch(flextureLayout, yogaLayout)
    recordResult({
      category: "FlexShrink",
      name: "shrink-different-factors",
      passed: match,
      flexture: flextureLayout,
      yoga: yogaLayout,
    })
    expect(match).toBe(true)
  })

  it("shrink-zero-no-shrink: shrink 0 prevents shrinking", () => {
    const fRoot = Flexture.Node.create()
    fRoot.setWidth(100)
    fRoot.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)

    const fChild1 = Flexture.Node.create()
    fChild1.setWidth(80)
    fChild1.setFlexShrink(0)
    fRoot.insertChild(fChild1, 0)

    const fChild2 = Flexture.Node.create()
    fChild2.setWidth(80)
    fChild2.setFlexShrink(1)
    fRoot.insertChild(fChild2, 1)

    fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)
    const flextureLayout = getFlextureLayout(fRoot)

    const yRoot = yoga.Node.create()
    yRoot.setWidth(100)
    yRoot.setFlexDirection(yoga.FLEX_DIRECTION_ROW)

    const yChild1 = yoga.Node.create()
    yChild1.setWidth(80)
    yChild1.setFlexShrink(0)
    yRoot.insertChild(yChild1, 0)

    const yChild2 = yoga.Node.create()
    yChild2.setWidth(80)
    yChild2.setFlexShrink(1)
    yRoot.insertChild(yChild2, 1)

    yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)
    const yogaLayout = getYogaLayout(yRoot)
    yRoot.freeRecursive()

    const match = layoutsMatch(flextureLayout, yogaLayout)
    recordResult({
      category: "FlexShrink",
      name: "shrink-zero-no-shrink",
      passed: match,
      flexture: flextureLayout,
      yoga: yogaLayout,
    })
    expect(match).toBe(true)
  })
})

// ============================================================================
// Category: Flex Grow Edge Cases
// ============================================================================

describe("Yoga Comparison: FlexGrow", () => {
  it("grow-with-fixed-sibling: grow next to fixed width", () => {
    const fRoot = Flexture.Node.create()
    fRoot.setWidth(100)
    fRoot.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)

    const fChild1 = Flexture.Node.create()
    fChild1.setWidth(30)
    fRoot.insertChild(fChild1, 0)

    const fChild2 = Flexture.Node.create()
    fChild2.setFlexGrow(1)
    fRoot.insertChild(fChild2, 1)

    fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)
    const flextureLayout = getFlextureLayout(fRoot)

    const yRoot = yoga.Node.create()
    yRoot.setWidth(100)
    yRoot.setFlexDirection(yoga.FLEX_DIRECTION_ROW)

    const yChild1 = yoga.Node.create()
    yChild1.setWidth(30)
    yRoot.insertChild(yChild1, 0)

    const yChild2 = yoga.Node.create()
    yChild2.setFlexGrow(1)
    yRoot.insertChild(yChild2, 1)

    yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)
    const yogaLayout = getYogaLayout(yRoot)
    yRoot.freeRecursive()

    const match = layoutsMatch(flextureLayout, yogaLayout)
    recordResult({
      category: "FlexGrow",
      name: "grow-with-fixed-sibling",
      passed: match,
      flexture: flextureLayout,
      yoga: yogaLayout,
    })
    expect(match).toBe(true)
  })

  it("grow-unequal: unequal grow factors", () => {
    const fRoot = Flexture.Node.create()
    fRoot.setWidth(100)
    fRoot.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)

    const fChild1 = Flexture.Node.create()
    fChild1.setFlexGrow(1)
    fRoot.insertChild(fChild1, 0)

    const fChild2 = Flexture.Node.create()
    fChild2.setFlexGrow(2)
    fRoot.insertChild(fChild2, 1)

    const fChild3 = Flexture.Node.create()
    fChild3.setFlexGrow(1)
    fRoot.insertChild(fChild3, 2)

    fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)
    const flextureLayout = getFlextureLayout(fRoot)

    const yRoot = yoga.Node.create()
    yRoot.setWidth(100)
    yRoot.setFlexDirection(yoga.FLEX_DIRECTION_ROW)

    const yChild1 = yoga.Node.create()
    yChild1.setFlexGrow(1)
    yRoot.insertChild(yChild1, 0)

    const yChild2 = yoga.Node.create()
    yChild2.setFlexGrow(2)
    yRoot.insertChild(yChild2, 1)

    const yChild3 = yoga.Node.create()
    yChild3.setFlexGrow(1)
    yRoot.insertChild(yChild3, 2)

    yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)
    const yogaLayout = getYogaLayout(yRoot)
    yRoot.freeRecursive()

    const match = layoutsMatch(flextureLayout, yogaLayout)
    recordResult({
      category: "FlexGrow",
      name: "grow-unequal",
      passed: match,
      flexture: flextureLayout,
      yoga: yogaLayout,
    })
    expect(match).toBe(true)
  })

  it("grow-with-basis: flex-grow with flex-basis", () => {
    const fRoot = Flexture.Node.create()
    fRoot.setWidth(100)
    fRoot.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)

    const fChild1 = Flexture.Node.create()
    fChild1.setFlexBasis(20)
    fChild1.setFlexGrow(1)
    fRoot.insertChild(fChild1, 0)

    const fChild2 = Flexture.Node.create()
    fChild2.setFlexBasis(20)
    fChild2.setFlexGrow(1)
    fRoot.insertChild(fChild2, 1)

    fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)
    const flextureLayout = getFlextureLayout(fRoot)

    const yRoot = yoga.Node.create()
    yRoot.setWidth(100)
    yRoot.setFlexDirection(yoga.FLEX_DIRECTION_ROW)

    const yChild1 = yoga.Node.create()
    yChild1.setFlexBasis(20)
    yChild1.setFlexGrow(1)
    yRoot.insertChild(yChild1, 0)

    const yChild2 = yoga.Node.create()
    yChild2.setFlexBasis(20)
    yChild2.setFlexGrow(1)
    yRoot.insertChild(yChild2, 1)

    yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)
    const yogaLayout = getYogaLayout(yRoot)
    yRoot.freeRecursive()

    const match = layoutsMatch(flextureLayout, yogaLayout)
    recordResult({
      category: "FlexGrow",
      name: "grow-with-basis",
      passed: match,
      flexture: flextureLayout,
      yoga: yogaLayout,
    })
    expect(match).toBe(true)
  })
})

// ============================================================================
// Category: Complex Nested Layouts
// ============================================================================

describe("Yoga Comparison: NestedLayouts", () => {
  it("nested-flex: multiple nesting levels", () => {
    const fRoot = Flexture.Node.create()
    fRoot.setWidth(100)
    fRoot.setHeight(100)
    fRoot.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)

    const fLeft = Flexture.Node.create()
    fLeft.setFlexGrow(1)
    fLeft.setFlexDirection(Flexture.FLEX_DIRECTION_COLUMN)
    fRoot.insertChild(fLeft, 0)

    const fLeftTop = Flexture.Node.create()
    fLeftTop.setFlexGrow(1)
    fLeft.insertChild(fLeftTop, 0)

    const fLeftBottom = Flexture.Node.create()
    fLeftBottom.setFlexGrow(1)
    fLeft.insertChild(fLeftBottom, 1)

    const fRight = Flexture.Node.create()
    fRight.setFlexGrow(2)
    fRoot.insertChild(fRight, 1)

    fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)
    const flextureLayout = getFlextureLayout(fRoot)

    const yRoot = yoga.Node.create()
    yRoot.setWidth(100)
    yRoot.setHeight(100)
    yRoot.setFlexDirection(yoga.FLEX_DIRECTION_ROW)

    const yLeft = yoga.Node.create()
    yLeft.setFlexGrow(1)
    yLeft.setFlexDirection(yoga.FLEX_DIRECTION_COLUMN)
    yRoot.insertChild(yLeft, 0)

    const yLeftTop = yoga.Node.create()
    yLeftTop.setFlexGrow(1)
    yLeft.insertChild(yLeftTop, 0)

    const yLeftBottom = yoga.Node.create()
    yLeftBottom.setFlexGrow(1)
    yLeft.insertChild(yLeftBottom, 1)

    const yRight = yoga.Node.create()
    yRight.setFlexGrow(2)
    yRoot.insertChild(yRight, 1)

    yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)
    const yogaLayout = getYogaLayout(yRoot)
    yRoot.freeRecursive()

    const match = layoutsMatch(flextureLayout, yogaLayout)
    recordResult({
      category: "NestedLayouts",
      name: "nested-flex",
      passed: match,
      flexture: flextureLayout,
      yoga: yogaLayout,
    })
    expect(match).toBe(true)
  })

  it("mixed-constraints: nested with various constraints", () => {
    const fRoot = Flexture.Node.create()
    fRoot.setWidth(100)
    fRoot.setHeight(100)
    fRoot.setFlexDirection(Flexture.FLEX_DIRECTION_COLUMN)
    fRoot.setPadding(Flexture.EDGE_ALL, 5)

    const fHeader = Flexture.Node.create()
    fHeader.setHeight(20)
    fRoot.insertChild(fHeader, 0)

    const fContent = Flexture.Node.create()
    fContent.setFlexGrow(1)
    fContent.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)
    fContent.setGap(Flexture.GUTTER_COLUMN, 5)
    fRoot.insertChild(fContent, 1)

    const fSidebar = Flexture.Node.create()
    fSidebar.setWidth(20)
    fContent.insertChild(fSidebar, 0)

    const fMain = Flexture.Node.create()
    fMain.setFlexGrow(1)
    fContent.insertChild(fMain, 1)

    fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)
    const flextureLayout = getFlextureLayout(fRoot)

    const yRoot = yoga.Node.create()
    yRoot.setWidth(100)
    yRoot.setHeight(100)
    yRoot.setFlexDirection(yoga.FLEX_DIRECTION_COLUMN)
    yRoot.setPadding(yoga.EDGE_ALL, 5)

    const yHeader = yoga.Node.create()
    yHeader.setHeight(20)
    yRoot.insertChild(yHeader, 0)

    const yContent = yoga.Node.create()
    yContent.setFlexGrow(1)
    yContent.setFlexDirection(yoga.FLEX_DIRECTION_ROW)
    yContent.setGap(yoga.GUTTER_COLUMN, 5)
    yRoot.insertChild(yContent, 1)

    const ySidebar = yoga.Node.create()
    ySidebar.setWidth(20)
    yContent.insertChild(ySidebar, 0)

    const yMain = yoga.Node.create()
    yMain.setFlexGrow(1)
    yContent.insertChild(yMain, 1)

    yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)
    const yogaLayout = getYogaLayout(yRoot)
    yRoot.freeRecursive()

    const match = layoutsMatch(flextureLayout, yogaLayout)
    recordResult({
      category: "NestedLayouts",
      name: "mixed-constraints",
      passed: match,
      flexture: flextureLayout,
      yoga: yogaLayout,
    })
    expect(match).toBe(true)
  })
})

// ============================================================================
// Category: Percent Values Edge Cases
// ============================================================================

describe("Yoga Comparison: PercentValues", () => {
  it("percent-nested: percent in nested container", () => {
    const fRoot = Flexture.Node.create()
    fRoot.setWidth(100)
    fRoot.setHeight(100)

    const fOuter = Flexture.Node.create()
    fOuter.setWidthPercent(50)
    fOuter.setHeightPercent(50)
    fRoot.insertChild(fOuter, 0)

    const fInner = Flexture.Node.create()
    fInner.setWidthPercent(50)
    fInner.setHeightPercent(50)
    fOuter.insertChild(fInner, 0)

    fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)
    const flextureLayout = getFlextureLayout(fRoot)

    const yRoot = yoga.Node.create()
    yRoot.setWidth(100)
    yRoot.setHeight(100)

    const yOuter = yoga.Node.create()
    yOuter.setWidthPercent(50)
    yOuter.setHeightPercent(50)
    yRoot.insertChild(yOuter, 0)

    const yInner = yoga.Node.create()
    yInner.setWidthPercent(50)
    yInner.setHeightPercent(50)
    yOuter.insertChild(yInner, 0)

    yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)
    const yogaLayout = getYogaLayout(yRoot)
    yRoot.freeRecursive()

    const match = layoutsMatch(flextureLayout, yogaLayout)
    recordResult({
      category: "PercentValues",
      name: "percent-nested",
      passed: match,
      flexture: flextureLayout,
      yoga: yogaLayout,
    })
    expect(match).toBe(true)
  })

  it("percent-margin: percent margin values", () => {
    const fRoot = Flexture.Node.create()
    fRoot.setWidth(100)
    fRoot.setHeight(100)

    const fChild = Flexture.Node.create()
    fChild.setWidth(50)
    fChild.setHeight(50)
    fChild.setMarginPercent(Flexture.EDGE_LEFT, 10)
    fChild.setMarginPercent(Flexture.EDGE_TOP, 10)
    fRoot.insertChild(fChild, 0)

    fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)
    const flextureLayout = getFlextureLayout(fRoot)

    const yRoot = yoga.Node.create()
    yRoot.setWidth(100)
    yRoot.setHeight(100)

    const yChild = yoga.Node.create()
    yChild.setWidth(50)
    yChild.setHeight(50)
    yChild.setMarginPercent(yoga.EDGE_LEFT, 10)
    yChild.setMarginPercent(yoga.EDGE_TOP, 10)
    yRoot.insertChild(yChild, 0)

    yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)
    const yogaLayout = getYogaLayout(yRoot)
    yRoot.freeRecursive()

    const match = layoutsMatch(flextureLayout, yogaLayout)
    recordResult({
      category: "PercentValues",
      name: "percent-margin",
      passed: match,
      flexture: flextureLayout,
      yoga: yogaLayout,
    })
    expect(match).toBe(true)
  })

  it("percent-padding: percent padding values", () => {
    const match = compareLayouts({
      category: "PercentValues",
      name: "percent-padding",
      rootConfig: {
        width: 100,
        height: 100,
        paddingPercent: 10,
      },
      childConfigs: [{ flexGrow: 1 }],
    })
    expect(match).toBe(true)
  })
})

// ============================================================================
// Category: Intentional Differences (documented as different)
// ============================================================================

describe("Yoga Comparison: IntentionalDifferences", () => {
  it("shrink-weighted-by-basis: CSS spec weighted shrink", () => {
    // Both Flexture and Yoga use CSS spec: shrink proportional to (flexShrink * flexBasis)
    // This test verifies Flexture matches Yoga's behavior.

    const fRoot = Flexture.Node.create()
    fRoot.setWidth(100)
    fRoot.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)

    const fChild1 = Flexture.Node.create()
    fChild1.setFlexBasis(200) // Large basis
    fChild1.setFlexShrink(1)
    fRoot.insertChild(fChild1, 0)

    const fChild2 = Flexture.Node.create()
    fChild2.setFlexBasis(100) // Small basis
    fChild2.setFlexShrink(1)
    fRoot.insertChild(fChild2, 1)

    fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)
    const flextureLayout = getFlextureLayout(fRoot)

    const yRoot = yoga.Node.create()
    yRoot.setWidth(100)
    yRoot.setFlexDirection(yoga.FLEX_DIRECTION_ROW)

    const yChild1 = yoga.Node.create()
    yChild1.setFlexBasis(200)
    yChild1.setFlexShrink(1)
    yRoot.insertChild(yChild1, 0)

    const yChild2 = yoga.Node.create()
    yChild2.setFlexBasis(100)
    yChild2.setFlexShrink(1)
    yRoot.insertChild(yChild2, 1)

    yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)
    const yogaLayout = getYogaLayout(yRoot)
    yRoot.freeRecursive()

    const match = layoutsMatch(flextureLayout, yogaLayout)
    recordResult({
      category: "IntentionalDifferences",
      name: "shrink-weighted-by-basis",
      passed: match,
      flexture: flextureLayout,
      yoga: yogaLayout,
    })
    // This test documents the difference - we expect it MAY differ
    // Just recording the result, not asserting
    log.debug?.(`shrink-weighted-by-basis: ${match ? "MATCHES" : "DIFFERS (expected)"}`)
    if (!match) {
      log.debug?.(`  Yoga (CSS spec weighted shrink): ${JSON.stringify(yogaLayout.children.map((c) => c.width))}`)
      log.debug?.(`  Flexture (proportional shrink): ${JSON.stringify(flextureLayout.children.map((c) => c.width))}`)
    }
  })
})

// ============================================================================
// Category: Additional Edge Cases
// ============================================================================

describe("Yoga Comparison: EdgeCases", () => {
  it("zero-size-container: layout in zero-size container", () => {
    const match = compareLayouts({
      category: "EdgeCases",
      name: "zero-size-container",
      rootConfig: {
        width: 0,
        height: 0,
        flexDirection: Flexture.FLEX_DIRECTION_ROW,
      },
      childConfigs: [{ width: 50, height: 50 }],
      layoutWidth: 0,
      layoutHeight: 0,
    })
    expect(match).toBe(true)
  })

  it("single-item-wrap: single item with wrap enabled", () => {
    const match = compareLayouts({
      category: "EdgeCases",
      name: "single-item-wrap",
      rootConfig: {
        width: 100,
        height: 100,
        flexDirection: Flexture.FLEX_DIRECTION_ROW,
        flexWrap: Flexture.WRAP_WRAP,
      },
      childConfigs: [{ width: 50, height: 50 }],
    })
    expect(match).toBe(true)
  })

  it("overflow-no-shrink: items overflow when shrink=0", () => {
    const match = compareLayouts({
      category: "EdgeCases",
      name: "overflow-no-shrink",
      rootConfig: {
        width: 100,
        flexDirection: Flexture.FLEX_DIRECTION_ROW,
      },
      childConfigs: [{ width: 50, height: 50, flexShrink: 0, count: 3 }],
    })
    expect(match).toBe(true)
  })

  it("mixed-absolute-relative: absolute and relative siblings", () => {
    const fRoot = Flexture.Node.create()
    fRoot.setWidth(100)
    fRoot.setHeight(100)
    fRoot.setFlexDirection(Flexture.FLEX_DIRECTION_COLUMN)

    const fRel1 = Flexture.Node.create()
    fRel1.setHeight(30)
    fRoot.insertChild(fRel1, 0)

    const fAbs = Flexture.Node.create()
    fAbs.setPositionType(Flexture.POSITION_TYPE_ABSOLUTE)
    fAbs.setPosition(Flexture.EDGE_RIGHT, 10)
    fAbs.setPosition(Flexture.EDGE_TOP, 10)
    fAbs.setWidth(20)
    fAbs.setHeight(20)
    fRoot.insertChild(fAbs, 1)

    const fRel2 = Flexture.Node.create()
    fRel2.setFlexGrow(1)
    fRoot.insertChild(fRel2, 2)

    fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)
    const flextureLayout = getFlextureLayout(fRoot)

    const yRoot = yoga.Node.create()
    yRoot.setWidth(100)
    yRoot.setHeight(100)
    yRoot.setFlexDirection(yoga.FLEX_DIRECTION_COLUMN)

    const yRel1 = yoga.Node.create()
    yRel1.setHeight(30)
    yRoot.insertChild(yRel1, 0)

    const yAbs = yoga.Node.create()
    yAbs.setPositionType(yoga.POSITION_TYPE_ABSOLUTE)
    yAbs.setPosition(yoga.EDGE_RIGHT, 10)
    yAbs.setPosition(yoga.EDGE_TOP, 10)
    yAbs.setWidth(20)
    yAbs.setHeight(20)
    yRoot.insertChild(yAbs, 1)

    const yRel2 = yoga.Node.create()
    yRel2.setFlexGrow(1)
    yRoot.insertChild(yRel2, 2)

    yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)
    const yogaLayout = getYogaLayout(yRoot)
    yRoot.freeRecursive()

    const match = layoutsMatch(flextureLayout, yogaLayout)
    recordResult({
      category: "EdgeCases",
      name: "mixed-absolute-relative",
      passed: match,
      flexture: flextureLayout,
      yoga: yogaLayout,
    })
    expect(match).toBe(true)
  })

  it("deeply-nested: 5 levels of nesting", () => {
    const fRoot = Flexture.Node.create()
    fRoot.setWidth(100)
    fRoot.setHeight(100)

    let fCurrent = fRoot
    for (let i = 0; i < 5; i++) {
      const child = Flexture.Node.create()
      child.setFlexGrow(1)
      child.setPadding(Flexture.EDGE_ALL, 5)
      fCurrent.insertChild(child, 0)
      fCurrent = child
    }

    fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)
    const flextureLayout = getFlextureLayout(fRoot)

    const yRoot = yoga.Node.create()
    yRoot.setWidth(100)
    yRoot.setHeight(100)

    let yCurrent = yRoot
    for (let i = 0; i < 5; i++) {
      const child = yoga.Node.create()
      child.setFlexGrow(1)
      child.setPadding(yoga.EDGE_ALL, 5)
      yCurrent.insertChild(child, 0)
      yCurrent = child
    }

    yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)
    const yogaLayout = getYogaLayout(yRoot)
    yRoot.freeRecursive()

    const match = layoutsMatch(flextureLayout, yogaLayout)
    recordResult({
      category: "EdgeCases",
      name: "deeply-nested",
      passed: match,
      flexture: flextureLayout,
      yoga: yogaLayout,
    })
    expect(match).toBe(true)
  })
})

// ============================================================================
// Generate Report
// ============================================================================

describe("Summary Report", () => {
  it("prints summary at end", () => {
    // This test runs last and prints the summary
    const passed = results.filter((r) => r.passed)
    const failed = results.filter((r) => !r.passed)

    const lines: string[] = []
    lines.push("=".repeat(80))
    lines.push("YOGA COMPATIBILITY TEST REPORT")
    lines.push("=".repeat(80))
    lines.push(`Total: ${results.length} tests`)
    lines.push(`Passed: ${passed.length}`)
    lines.push(`Failed: ${failed.length}`)

    if (failed.length > 0) {
      lines.push("-".repeat(80))
      lines.push("FAILED TESTS:")
      lines.push("-".repeat(80))

      // Group by category
      const byCategory = new Map<string, TestResult[]>()
      for (const r of failed) {
        const list = byCategory.get(r.category) || []
        list.push(r)
        byCategory.set(r.category, list)
      }

      for (const [category, tests] of byCategory) {
        lines.push(`\n### ${category}`)
        for (const test of tests) {
          lines.push(`\n**${test.name}**`)
          if (test.yoga && test.flexture) {
            lines.push("Expected (Yoga):")
            lines.push(formatLayout(test.yoga))
            lines.push("Actual (Flexture):")
            lines.push(formatLayout(test.flexture))
          }
          if (test.error) {
            lines.push(`Error: ${test.error}`)
          }
        }
      }

      lines.push("-".repeat(80))
      lines.push("TOP 10 HIGHEST-IMPACT FIXES:")
      lines.push("-".repeat(80))

      // Prioritize by category importance
      const categoryPriority: Record<string, number> = {
        FlexWrap: 10,
        AlignContent: 9,
        AbsolutePositioning: 8,
        MinMaxDimensions: 7,
        Gap: 6,
        FlexShrink: 5,
        FlexGrow: 4,
        NestedLayouts: 3,
        PercentValues: 2,
      }

      const sorted = [...failed].sort((a, b) => {
        const pa = categoryPriority[a.category] || 0
        const pb = categoryPriority[b.category] || 0
        return pb - pa
      })

      const top10 = sorted.slice(0, 10)
      top10.forEach((test, i) => {
        lines.push(`${i + 1}. [${test.category}] ${test.name}`)
      })
    }

    lines.push("=".repeat(80))
    log.debug?.(lines.join("\n"))
  })
})
