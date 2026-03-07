#!/usr/bin/env bun
/**
 * Quick Classic vs Zero-alloc benchmark for algorithm analysis
 * Run: bun vendor/flexture/scripts/quick-bench.ts
 */

import * as Classic from "../src/index.js"
import * as Zero from "../src/index.js"

function bench(name: string, fn: () => void, iterations = 1000): number {
  // Warmup
  for (let i = 0; i < 100; i++) fn()

  // Measure
  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  const end = performance.now()

  const ms = end - start
  const opsPerSec = (iterations / ms) * 1000
  console.log(`  ${name}: ${opsPerSec.toFixed(0)} ops/sec (${ms.toFixed(2)}ms)`)
  return opsPerSec
}

function createFlatTree(engine: "classic" | "zero", nodeCount: number): Classic.Node | Zero.Node {
  const Node = engine === "classic" ? Classic.Node : Zero.Node
  const FLEX_DIRECTION_COLUMN = engine === "classic" ? Classic.FLEX_DIRECTION_COLUMN : Zero.FLEX_DIRECTION_COLUMN

  const root = Node.create()
  root.setWidth(1000)
  root.setHeight(1000)
  root.setFlexDirection(FLEX_DIRECTION_COLUMN)

  for (let i = 0; i < nodeCount; i++) {
    const child = Node.create()
    child.setHeight(10)
    child.setFlexGrow(1)
    root.insertChild(child, i)
  }

  return root
}

function createDeepTree(engine: "classic" | "zero", depth: number): Classic.Node | Zero.Node {
  const Node = engine === "classic" ? Classic.Node : Zero.Node
  const EDGE_LEFT = engine === "classic" ? Classic.EDGE_LEFT : Zero.EDGE_LEFT

  const root = Node.create()
  root.setWidth(1000)
  root.setHeight(1000)

  let current = root
  for (let i = 0; i < depth; i++) {
    const child = Node.create()
    child.setFlexGrow(1)
    child.setPadding(EDGE_LEFT, 1)
    current.insertChild(child, 0)
    current = child
  }

  return root
}

function createKanbanTree(engine: "classic" | "zero", cardsPerColumn: number): Classic.Node | Zero.Node {
  const Node = engine === "classic" ? Classic.Node : Zero.Node
  const FLEX_DIRECTION_ROW = engine === "classic" ? Classic.FLEX_DIRECTION_ROW : Zero.FLEX_DIRECTION_ROW
  const FLEX_DIRECTION_COLUMN = engine === "classic" ? Classic.FLEX_DIRECTION_COLUMN : Zero.FLEX_DIRECTION_COLUMN
  const GUTTER_ALL = engine === "classic" ? Classic.GUTTER_ALL : Zero.GUTTER_ALL
  const EDGE_LEFT = engine === "classic" ? Classic.EDGE_LEFT : Zero.EDGE_LEFT

  const root = Node.create()
  root.setWidth(120)
  root.setHeight(40)
  root.setFlexDirection(FLEX_DIRECTION_ROW)
  root.setGap(GUTTER_ALL, 1)

  for (let col = 0; col < 3; col++) {
    const column = Node.create()
    column.setFlexGrow(1)
    column.setFlexDirection(FLEX_DIRECTION_COLUMN)
    column.setGap(GUTTER_ALL, 1)

    const header = Node.create()
    header.setHeight(1)
    column.insertChild(header, 0)

    for (let card = 0; card < cardsPerColumn; card++) {
      const cardNode = Node.create()
      cardNode.setHeight(3)
      cardNode.setPadding(EDGE_LEFT, 1)
      column.insertChild(cardNode, card + 1)
    }

    root.insertChild(column, col)
  }

  return root
}

console.log("\n=== Flexture Classic vs Zero-alloc Algorithm Comparison ===\n")

// Flat hierarchy
console.log("Flat Hierarchy (list-like):")
for (const n of [100, 500, 1000]) {
  const classic = bench(`Classic ${n} nodes`, () => {
    const tree = createFlatTree("classic", n)
    tree.calculateLayout(1000, 1000, Classic.DIRECTION_LTR)
  })
  const zero = bench(`Zero ${n} nodes`, () => {
    const tree = createFlatTree("zero", n)
    tree.calculateLayout(1000, 1000, Zero.DIRECTION_LTR)
  })
  const ratio = zero / classic
  console.log(`  → Zero is ${ratio > 1 ? ratio.toFixed(2) + "x faster" : (1 / ratio).toFixed(2) + "x slower"}\n`)
}

// Deep hierarchy
console.log("\nDeep Hierarchy (nested containers):")
for (const d of [20, 50, 100]) {
  const classic = bench(`Classic ${d} deep`, () => {
    const tree = createDeepTree("classic", d)
    tree.calculateLayout(1000, 1000, Classic.DIRECTION_LTR)
  }, 500)
  const zero = bench(`Zero ${d} deep`, () => {
    const tree = createDeepTree("zero", d)
    tree.calculateLayout(1000, 1000, Zero.DIRECTION_LTR)
  }, 500)
  const ratio = zero / classic
  console.log(`  → Zero is ${ratio > 1 ? ratio.toFixed(2) + "x faster" : (1 / ratio).toFixed(2) + "x slower"}\n`)
}

// TUI patterns (most relevant for km)
console.log("\nKanban TUI (realistic pattern):")
for (const cards of [10, 50, 100]) {
  const classic = bench(`Classic 3x${cards}`, () => {
    const tree = createKanbanTree("classic", cards)
    tree.calculateLayout(120, 40, Classic.DIRECTION_LTR)
  })
  const zero = bench(`Zero 3x${cards}`, () => {
    const tree = createKanbanTree("zero", cards)
    tree.calculateLayout(120, 40, Zero.DIRECTION_LTR)
  })
  const ratio = zero / classic
  console.log(`  → Zero is ${ratio > 1 ? ratio.toFixed(2) + "x faster" : (1 / ratio).toFixed(2) + "x slower"}\n`)
}

// Layout-only (pre-created trees, no allocation)
console.log("\nLayout Only (no tree creation):")
const classicKanban = createKanbanTree("classic", 50) as Classic.Node
const zeroKanban = createKanbanTree("zero", 50) as Zero.Node

const classicLayout = bench("Classic layout-only", () => {
  classicKanban.markDirty()
  classicKanban.calculateLayout(120, 40, Classic.DIRECTION_LTR)
})
const zeroLayout = bench("Zero layout-only", () => {
  zeroKanban.markDirty()
  zeroKanban.calculateLayout(120, 40, Zero.DIRECTION_LTR)
})
const layoutRatio = zeroLayout / classicLayout
console.log(
  `  → Zero is ${layoutRatio > 1 ? layoutRatio.toFixed(2) + "x faster" : (1 / layoutRatio).toFixed(2) + "x slower"}\n`,
)

console.log("\n=== Summary ===")
console.log("Classic: Full features (RTL, baseline), more mature")
console.log("Zero: Optimized for no allocations, missing RTL/baseline")
console.log("\nRecommendation: See km-flexture-analysis bead for details")
