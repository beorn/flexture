/**
 * Differential Fuzz Testing - Flexture vs Yoga
 *
 * Generates random tree structures with random styles and compares
 * layout output between Flexture and Yoga to find discrepancies.
 *
 * Uses seeded random generation for reproducibility.
 *
 * Run: bun test tests/differential-fuzz.fuzz.ts
 *
 * Known Differences (documented, not bugs):
 * - Some edge cases with deeply nested flex-wrap
 */

import { describe, expect, it, beforeAll } from "vitest"
import { createLogger } from "decant"

const log = createLogger("flexture:test:fuzz")
import * as Flexture from "../src/index.js"
import initYoga, { type Yoga, type Node as YogaNode, type FlexDirection, type Justify, type Align } from "yoga-wasm-web"
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
// Seeded Random Number Generator (Mulberry32)
// ============================================================================

function createRng(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ============================================================================
// Random Value Generators
// ============================================================================

interface RandomContext {
  rng: () => number
}

function randomInt(ctx: RandomContext, min: number, max: number): number {
  return Math.floor(ctx.rng() * (max - min + 1)) + min
}

function randomChoice<T>(ctx: RandomContext, options: T[]): T {
  return options[randomInt(ctx, 0, options.length - 1)]!
}

function randomBool(ctx: RandomContext, probability = 0.5): boolean {
  return ctx.rng() < probability
}

// ============================================================================
// Layout Result Types
// ============================================================================

interface NodeLayout {
  left: number
  top: number
  width: number
  height: number
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

// Tolerance for floating point comparisons
// 1px for most comparisons, but cumulative rounding can cause larger diffs with many children
const EPSILON = 1.0

// Larger tolerance for layouts with many children where rounding accumulates
// With 20+ children, each child can contribute up to 0.5px rounding error, accumulating to ~10px
const EPSILON_LARGE = 5.0

function layoutsMatch(
  a: NodeLayout,
  b: NodeLayout,
  path = "root",
  epsilon = EPSILON,
): { match: boolean; diff?: string } {
  const diffs: string[] = []

  if (Math.abs(a.left - b.left) > epsilon) {
    diffs.push(`${path}.left: flexture=${a.left.toFixed(2)} yoga=${b.left.toFixed(2)}`)
  }
  if (Math.abs(a.top - b.top) > epsilon) {
    diffs.push(`${path}.top: flexture=${a.top.toFixed(2)} yoga=${b.top.toFixed(2)}`)
  }
  if (Math.abs(a.width - b.width) > epsilon) {
    diffs.push(`${path}.width: flexture=${a.width.toFixed(2)} yoga=${b.width.toFixed(2)}`)
  }
  if (Math.abs(a.height - b.height) > epsilon) {
    diffs.push(`${path}.height: flexture=${a.height.toFixed(2)} yoga=${b.height.toFixed(2)}`)
  }

  if (a.children.length !== b.children.length) {
    return {
      match: false,
      diff: `${path}: child count mismatch (${a.children.length} vs ${b.children.length})`,
    }
  }

  for (let i = 0; i < a.children.length; i++) {
    const childResult = layoutsMatch(a.children[i]!, b.children[i]!, `${path}.children[${i}]`, epsilon)
    if (!childResult.match && childResult.diff) {
      diffs.push(childResult.diff)
    }
  }

  if (diffs.length > 0) {
    return { match: false, diff: diffs.join("\n") }
  }
  return { match: true }
}

// ============================================================================
// Tree Style Configuration
// ============================================================================

interface NodeStyle {
  width?: number
  height?: number
  flexDirection?: number
  flexGrow?: number
  flexShrink?: number
  justifyContent?: number
  alignItems?: number
  padding?: number
  margin?: number
  gap?: number
}

interface TreeSpec {
  style: NodeStyle
  children: TreeSpec[]
}

// ============================================================================
// Simple Random Tree Generation (for matching tests)
// ============================================================================

/**
 * Generates simple, flat layouts that should always match between Flexture and Yoga.
 * - All children have explicit dimensions OR flexGrow
 * - No complex constraint combinations
 * - No flex-wrap
 * - No reverse directions
 */
function generateSimpleTree(ctx: RandomContext, childCount: number): TreeSpec {
  const rootWidth = randomInt(ctx, 200, 400)
  const rootHeight = randomInt(ctx, 150, 300)
  const flexDirection = randomChoice(ctx, [Flexture.FLEX_DIRECTION_ROW, Flexture.FLEX_DIRECTION_COLUMN])

  const children: TreeSpec[] = []
  for (let i = 0; i < childCount; i++) {
    const useFlexGrow = randomBool(ctx, 0.5)
    const childStyle: NodeStyle = {}

    if (useFlexGrow) {
      childStyle.flexGrow = randomInt(ctx, 1, 3)
    } else {
      // Fixed dimensions - ensure they fit within parent
      if (flexDirection === Flexture.FLEX_DIRECTION_ROW) {
        childStyle.width = randomInt(ctx, 20, Math.floor(rootWidth / childCount) - 10)
        childStyle.height = randomInt(ctx, 20, rootHeight - 20)
      } else {
        childStyle.width = randomInt(ctx, 20, rootWidth - 20)
        childStyle.height = randomInt(ctx, 20, Math.floor(rootHeight / childCount) - 10)
      }
    }

    // Optional padding/margin (small values)
    if (randomBool(ctx, 0.3)) {
      childStyle.padding = randomInt(ctx, 1, 5)
    }
    if (randomBool(ctx, 0.3)) {
      childStyle.margin = randomInt(ctx, 1, 5)
    }

    children.push({ style: childStyle, children: [] })
  }

  const rootStyle: NodeStyle = {
    width: rootWidth,
    height: rootHeight,
    flexDirection,
  }

  // Optional gap
  if (randomBool(ctx, 0.3)) {
    rootStyle.gap = randomInt(ctx, 2, 10)
  }

  // Optional justify/align
  if (randomBool(ctx, 0.3)) {
    rootStyle.justifyContent = randomChoice(ctx, [
      Flexture.JUSTIFY_FLEX_START,
      Flexture.JUSTIFY_CENTER,
      Flexture.JUSTIFY_FLEX_END,
    ])
  }
  if (randomBool(ctx, 0.3)) {
    rootStyle.alignItems = randomChoice(ctx, [Flexture.ALIGN_FLEX_START, Flexture.ALIGN_CENTER, Flexture.ALIGN_STRETCH])
  }

  return { style: rootStyle, children }
}

/**
 * Generates nested layouts (2 levels) that should match.
 */
function generateNestedTree(ctx: RandomContext, outerChildCount: number, innerChildCount: number): TreeSpec {
  const rootWidth = randomInt(ctx, 300, 500)
  const rootHeight = randomInt(ctx, 200, 400)
  const rootDirection = randomChoice(ctx, [Flexture.FLEX_DIRECTION_ROW, Flexture.FLEX_DIRECTION_COLUMN])

  const children: TreeSpec[] = []
  for (let i = 0; i < outerChildCount; i++) {
    const innerDirection = randomChoice(ctx, [Flexture.FLEX_DIRECTION_ROW, Flexture.FLEX_DIRECTION_COLUMN])

    const innerChildren: TreeSpec[] = []
    for (let j = 0; j < innerChildCount; j++) {
      innerChildren.push({
        style: {
          flexGrow: 1,
          padding: randomBool(ctx, 0.2) ? randomInt(ctx, 1, 3) : undefined,
        },
        children: [],
      })
    }

    children.push({
      style: {
        flexGrow: 1,
        flexDirection: innerDirection,
        padding: randomBool(ctx, 0.3) ? randomInt(ctx, 2, 8) : undefined,
        gap: randomBool(ctx, 0.3) ? randomInt(ctx, 2, 6) : undefined,
      },
      children: innerChildren,
    })
  }

  return {
    style: {
      width: rootWidth,
      height: rootHeight,
      flexDirection: rootDirection,
      padding: randomBool(ctx, 0.3) ? randomInt(ctx, 5, 15) : undefined,
      gap: randomBool(ctx, 0.3) ? randomInt(ctx, 5, 10) : undefined,
    },
    children,
  }
}

// ============================================================================
// Tree Building
// ============================================================================

function applyStyleToFlextureNode(node: Flexture.Node, style: NodeStyle): void {
  if (style.width !== undefined) node.setWidth(style.width)
  if (style.height !== undefined) node.setHeight(style.height)
  if (style.flexDirection !== undefined) {
    node.setFlexDirection(style.flexDirection)
  }
  if (style.flexGrow !== undefined) node.setFlexGrow(style.flexGrow)
  if (style.flexShrink !== undefined) node.setFlexShrink(style.flexShrink)
  if (style.justifyContent !== undefined) {
    node.setJustifyContent(style.justifyContent)
  }
  if (style.alignItems !== undefined) node.setAlignItems(style.alignItems)
  if (style.padding !== undefined) {
    node.setPadding(Flexture.EDGE_ALL, style.padding)
  }
  if (style.margin !== undefined) node.setMargin(Flexture.EDGE_ALL, style.margin)
  if (style.gap !== undefined) node.setGap(Flexture.GUTTER_ALL, style.gap)
}

function applyStyleToYogaNode(node: YogaNode, style: NodeStyle): void {
  if (style.width !== undefined) node.setWidth(style.width)
  if (style.height !== undefined) node.setHeight(style.height)
  if (style.flexDirection !== undefined) {
    node.setFlexDirection(style.flexDirection as FlexDirection)
  }
  if (style.flexGrow !== undefined) node.setFlexGrow(style.flexGrow)
  if (style.flexShrink !== undefined) node.setFlexShrink(style.flexShrink)
  if (style.justifyContent !== undefined) {
    node.setJustifyContent(style.justifyContent as Justify)
  }
  if (style.alignItems !== undefined) {
    node.setAlignItems(style.alignItems as Align)
  }
  if (style.padding !== undefined) node.setPadding(yoga.EDGE_ALL, style.padding)
  if (style.margin !== undefined) node.setMargin(yoga.EDGE_ALL, style.margin)
  if (style.gap !== undefined) node.setGap(yoga.GUTTER_ALL, style.gap)
}

function buildFlextureTree(spec: TreeSpec): Flexture.Node {
  const node = Flexture.Node.create()
  applyStyleToFlextureNode(node, spec.style)
  for (let i = 0; i < spec.children.length; i++) {
    node.insertChild(buildFlextureTree(spec.children[i]!), i)
  }
  return node
}

function buildYogaTree(spec: TreeSpec): YogaNode {
  const node = yoga.Node.create()
  applyStyleToYogaNode(node, spec.style)
  for (let i = 0; i < spec.children.length; i++) {
    node.insertChild(buildYogaTree(spec.children[i]!), i)
  }
  return node
}

// ============================================================================
// Test Runner
// ============================================================================

function runSimpleTest(seed: number, childCount: number, epsilon = EPSILON): { passed: boolean; diff?: string } {
  const rng = createRng(seed)
  const ctx: RandomContext = { rng }
  const spec = generateSimpleTree(ctx, childCount)

  const flextureRoot = buildFlextureTree(spec)
  const yogaRoot = buildYogaTree(spec)

  const rootWidth = spec.style.width ?? 300
  const rootHeight = spec.style.height ?? 200

  flextureRoot.calculateLayout(rootWidth, rootHeight, Flexture.DIRECTION_LTR)
  yogaRoot.calculateLayout(rootWidth, rootHeight, yoga.DIRECTION_LTR)

  const flextureLayout = getFlextureLayout(flextureRoot)
  const yogaLayout = getYogaLayout(yogaRoot)
  yogaRoot.freeRecursive()

  const result = layoutsMatch(flextureLayout, yogaLayout, "root", epsilon)
  return { passed: result.match, diff: result.diff }
}

function runNestedTest(seed: number, outer: number, inner: number): { passed: boolean; diff?: string } {
  const rng = createRng(seed)
  const ctx: RandomContext = { rng }
  const spec = generateNestedTree(ctx, outer, inner)

  const flextureRoot = buildFlextureTree(spec)
  const yogaRoot = buildYogaTree(spec)

  const rootWidth = spec.style.width ?? 300
  const rootHeight = spec.style.height ?? 200

  flextureRoot.calculateLayout(rootWidth, rootHeight, Flexture.DIRECTION_LTR)
  yogaRoot.calculateLayout(rootWidth, rootHeight, yoga.DIRECTION_LTR)

  const flextureLayout = getFlextureLayout(flextureRoot)
  const yogaLayout = getYogaLayout(yogaRoot)
  yogaRoot.freeRecursive()

  const result = layoutsMatch(flextureLayout, yogaLayout)
  return { passed: result.match, diff: result.diff }
}

// ============================================================================
// Tests: Simple Flat Layouts
// ============================================================================

describe("Fuzz: Simple Flat Layouts", () => {
  // Small child counts (3-5 children)
  for (let seed = 1000; seed < 1050; seed++) {
    const childCount = 3 + (seed % 3)
    it(`seed=${seed} children=${childCount}`, () => {
      const result = runSimpleTest(seed, childCount)
      if (!result.passed) {
        log.debug?.(`Difference: ${result.diff}`)
      }
      expect(result.passed).toBe(true)
    })
  }
})

describe("Fuzz: Medium Flat Layouts", () => {
  // Medium child counts (6-10 children)
  for (let seed = 2000; seed < 2030; seed++) {
    const childCount = 6 + (seed % 5)
    it(`seed=${seed} children=${childCount}`, () => {
      const result = runSimpleTest(seed, childCount)
      expect(result.passed).toBe(true)
    })
  }
})

describe("Fuzz: Large Flat Layouts", () => {
  // Large child counts (15-25 children)
  // Use larger tolerance because rounding differences accumulate with many children
  for (let seed = 3000; seed < 3020; seed++) {
    const childCount = 15 + (seed % 11)
    it(`seed=${seed} children=${childCount}`, () => {
      const result = runSimpleTest(seed, childCount, EPSILON_LARGE)
      expect(result.passed).toBe(true)
    })
  }
})

// ============================================================================
// Tests: Nested Layouts
// ============================================================================

describe("Fuzz: Nested Layouts (2x2)", () => {
  for (let seed = 4000; seed < 4030; seed++) {
    it(`seed=${seed}`, () => {
      const result = runNestedTest(seed, 2, 2)
      expect(result.passed).toBe(true)
    })
  }
})

describe("Fuzz: Nested Layouts (3x3)", () => {
  for (let seed = 5000; seed < 5030; seed++) {
    it(`seed=${seed}`, () => {
      const result = runNestedTest(seed, 3, 3)
      expect(result.passed).toBe(true)
    })
  }
})

describe("Fuzz: Nested Layouts (4x4)", () => {
  for (let seed = 6000; seed < 6020; seed++) {
    it(`seed=${seed}`, () => {
      const result = runNestedTest(seed, 4, 4)
      expect(result.passed).toBe(true)
    })
  }
})

// ============================================================================
// Tests: Kanban-like Layouts (Common TUI Pattern)
// ============================================================================

describe("Fuzz: Kanban Layouts", () => {
  // Simulates a Kanban board: row of columns, each column has cards
  function generateKanbanTree(ctx: RandomContext, columnCount: number, cardCount: number): TreeSpec {
    const columns: TreeSpec[] = []
    for (let i = 0; i < columnCount; i++) {
      const cards: TreeSpec[] = []
      for (let j = 0; j < cardCount; j++) {
        cards.push({
          style: {
            height: randomInt(ctx, 30, 60),
            padding: randomBool(ctx, 0.5) ? randomInt(ctx, 2, 5) : undefined,
            margin: randomBool(ctx, 0.5) ? randomInt(ctx, 1, 3) : undefined,
          },
          children: [],
        })
      }
      columns.push({
        style: {
          flexGrow: 1,
          flexDirection: Flexture.FLEX_DIRECTION_COLUMN,
          padding: randomInt(ctx, 5, 10),
          gap: randomInt(ctx, 3, 8),
        },
        children: cards,
      })
    }

    return {
      style: {
        width: randomInt(ctx, 400, 600),
        height: randomInt(ctx, 300, 500),
        flexDirection: Flexture.FLEX_DIRECTION_ROW,
        gap: randomInt(ctx, 5, 15),
        padding: randomInt(ctx, 10, 20),
      },
      children: columns,
    }
  }

  function runKanbanTest(seed: number, columns: number, cards: number): { passed: boolean; diff?: string } {
    const rng = createRng(seed)
    const ctx: RandomContext = { rng }
    const spec = generateKanbanTree(ctx, columns, cards)

    const flextureRoot = buildFlextureTree(spec)
    const yogaRoot = buildYogaTree(spec)

    const rootWidth = spec.style.width ?? 500
    const rootHeight = spec.style.height ?? 400

    flextureRoot.calculateLayout(rootWidth, rootHeight, Flexture.DIRECTION_LTR)
    yogaRoot.calculateLayout(rootWidth, rootHeight, yoga.DIRECTION_LTR)

    const flextureLayout = getFlextureLayout(flextureRoot)
    const yogaLayout = getYogaLayout(yogaRoot)
    yogaRoot.freeRecursive()

    const result = layoutsMatch(flextureLayout, yogaLayout)
    return { passed: result.match, diff: result.diff }
  }

  for (let seed = 7000; seed < 7030; seed++) {
    const columns = 3 + (seed % 3)
    const cards = 3 + (seed % 5)
    it(`seed=${seed} ${columns}x${cards}`, () => {
      const result = runKanbanTest(seed, columns, cards)
      expect(result.passed).toBe(true)
    })
  }
})

// ============================================================================
// Tests: Dashboard Layouts (Header + Sidebar + Content)
// ============================================================================

describe("Fuzz: Dashboard Layouts", () => {
  function generateDashboardTree(ctx: RandomContext): TreeSpec {
    const headerHeight = randomInt(ctx, 30, 50)
    const sidebarWidth = randomInt(ctx, 80, 150)

    // Content widgets
    const widgets: TreeSpec[] = []
    const widgetCount = randomInt(ctx, 2, 4)
    for (let i = 0; i < widgetCount; i++) {
      widgets.push({
        style: {
          flexGrow: 1,
          padding: randomInt(ctx, 5, 10),
        },
        children: [],
      })
    }

    return {
      style: {
        width: randomInt(ctx, 400, 600),
        height: randomInt(ctx, 300, 500),
        flexDirection: Flexture.FLEX_DIRECTION_COLUMN,
      },
      children: [
        // Header
        {
          style: { height: headerHeight, padding: randomInt(ctx, 5, 10) },
          children: [],
        },
        // Body (sidebar + content)
        {
          style: {
            flexGrow: 1,
            flexDirection: Flexture.FLEX_DIRECTION_ROW,
          },
          children: [
            // Sidebar
            {
              style: { width: sidebarWidth, padding: randomInt(ctx, 5, 10) },
              children: [],
            },
            // Content area
            {
              style: {
                flexGrow: 1,
                flexDirection: Flexture.FLEX_DIRECTION_COLUMN,
                padding: randomInt(ctx, 5, 10),
                gap: randomInt(ctx, 5, 10),
              },
              children: widgets,
            },
          ],
        },
      ],
    }
  }

  function runDashboardTest(seed: number): { passed: boolean; diff?: string } {
    const rng = createRng(seed)
    const ctx: RandomContext = { rng }
    const spec = generateDashboardTree(ctx)

    const flextureRoot = buildFlextureTree(spec)
    const yogaRoot = buildYogaTree(spec)

    const rootWidth = spec.style.width ?? 500
    const rootHeight = spec.style.height ?? 400

    flextureRoot.calculateLayout(rootWidth, rootHeight, Flexture.DIRECTION_LTR)
    yogaRoot.calculateLayout(rootWidth, rootHeight, yoga.DIRECTION_LTR)

    const flextureLayout = getFlextureLayout(flextureRoot)
    const yogaLayout = getYogaLayout(yogaRoot)
    yogaRoot.freeRecursive()

    const result = layoutsMatch(flextureLayout, yogaLayout)
    return { passed: result.match, diff: result.diff }
  }

  for (let seed = 8000; seed < 8040; seed++) {
    it(`seed=${seed}`, () => {
      const result = runDashboardTest(seed)
      expect(result.passed).toBe(true)
    })
  }
})

// ============================================================================
// Tests: Stress Test - Many Random Seeds
// ============================================================================

describe("Fuzz: Stress Test (100 Simple)", () => {
  for (let i = 0; i < 100; i++) {
    const seed = 10000 + i * 97 // Prime multiplier for distribution
    const childCount = 3 + (i % 10)
    it(`stress-${i} seed=${seed}`, () => {
      const result = runSimpleTest(seed, childCount)
      expect(result.passed).toBe(true)
    })
  }
})

describe("Fuzz: Stress Test (50 Nested)", () => {
  for (let i = 0; i < 50; i++) {
    const seed = 20000 + i * 83
    const outer = 2 + (i % 3)
    const inner = 2 + (i % 4)
    it(`stress-${i} seed=${seed}`, () => {
      const result = runNestedTest(seed, outer, inner)
      expect(result.passed).toBe(true)
    })
  }
})

// ============================================================================
// Summary
// ============================================================================

describe("Differential Fuzz Summary", () => {
  it("prints summary", () => {
    log.debug?.(
      `\n${"=".repeat(60)}\nDIFFERENTIAL FUZZ TEST SUMMARY\n${"=".repeat(60)}\n\nThese tests generate random flexbox trees and compare Flexture vs Yoga.\nUse seed values to reproduce any failing cases.\n\nTest categories:\n- Simple Flat: Single level with fixed/flex children\n- Nested: Two-level layouts with flexGrow\n- Kanban: Column-based card layouts (TUI pattern)\n- Dashboard: Header + sidebar + content (TUI pattern)\n- Stress: Many random seeds for broad coverage\n\nTolerance: ${EPSILON}px (for rounding differences)\n\n${"=".repeat(60)}`,
    )
  })
})
