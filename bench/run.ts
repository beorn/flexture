#!/usr/bin/env bun
/**
 * Flexture Layout Benchmarks - Standalone Runner
 *
 * Run: bun bench/run.ts
 *
 * Outputs timing data in a readable format with actual microsecond measurements.
 */

import {
  Node,
  FLEX_DIRECTION_ROW,
  FLEX_DIRECTION_COLUMN,
  DIRECTION_LTR,
  JUSTIFY_SPACE_BETWEEN,
  ALIGN_CENTER,
  GUTTER_ALL,
} from "../src/index.js"
import os from "node:os"

// ============================================================================
// Benchmark Harness
// ============================================================================

interface BenchResult {
  name: string
  iterations: number
  totalMs: number
  avgUs: number
  minUs: number
  maxUs: number
  opsPerSec: number
}

function benchmark(name: string, fn: () => void, options: { iterations?: number; warmup?: number } = {}): BenchResult {
  const { iterations = 1000, warmup = 100 } = options

  // Warmup
  for (let i = 0; i < warmup; i++) {
    fn()
  }

  // Measure
  const times: number[] = []
  const start = performance.now()

  for (let i = 0; i < iterations; i++) {
    const iterStart = performance.now()
    fn()
    times.push(performance.now() - iterStart)
  }

  const totalMs = performance.now() - start
  const avgUs = (totalMs / iterations) * 1000
  const minUs = Math.min(...times) * 1000
  const maxUs = Math.max(...times) * 1000
  const opsPerSec = Math.round(iterations / (totalMs / 1000))

  return { name, iterations, totalMs, avgUs, minUs, maxUs, opsPerSec }
}

function formatResult(r: BenchResult): string {
  return `${r.name.padEnd(45)} ${r.avgUs.toFixed(2).padStart(10)} µs/op  (${r.opsPerSec.toLocaleString().padStart(10)} ops/sec)  min: ${r.minUs.toFixed(2)} µs  max: ${r.maxUs.toFixed(2)} µs`
}

// ============================================================================
// Test Case Generators
// ============================================================================

function createFlatTree(nodeCount: number): Node {
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

function createDeepTree(depth: number): Node {
  const root = Node.create()
  root.setWidth(1000)
  root.setHeight(1000)

  let current = root
  for (let i = 0; i < depth; i++) {
    const child = Node.create()
    child.setFlexGrow(1)
    child.setPadding(0, 1)
    current.insertChild(child, 0)
    current = child
  }

  return root
}

function createKanbanTree(cardsPerColumn: number): Node {
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
      cardNode.setPadding(0, 1)
      column.insertChild(cardNode, card + 1)
    }

    root.insertChild(column, col)
  }

  return root
}

// ============================================================================
// Main
// ============================================================================

console.log("# Flexture Layout Benchmarks")
console.log("")
console.log("## Hardware")
console.log(`- Platform: ${os.platform()} ${os.arch()}`)
console.log(`- CPU: ${os.cpus()[0]?.model || "Unknown"}`)
console.log(`- Cores: ${os.cpus().length}`)
console.log(`- Node/Bun: ${process.versions.bun || process.versions.node}`)
console.log(`- Date: ${new Date().toISOString().split("T")[0]}`)
console.log("")

const results: BenchResult[] = []

// Flat hierarchy
console.log("## Flat Hierarchy (list-like)")
console.log("")

const flat100 = createFlatTree(100)
const flat500 = createFlatTree(500)
const flat1000 = createFlatTree(1000)

results.push(
  benchmark("Flat 100 nodes - layout only", () => {
    flat100.markDirty()
    flat100.calculateLayout(1000, 1000, DIRECTION_LTR)
  }),
)
console.log(formatResult(results.at(-1)!))

results.push(
  benchmark("Flat 500 nodes - layout only", () => {
    flat500.markDirty()
    flat500.calculateLayout(1000, 1000, DIRECTION_LTR)
  }),
)
console.log(formatResult(results.at(-1)!))

results.push(
  benchmark("Flat 1000 nodes - layout only", () => {
    flat1000.markDirty()
    flat1000.calculateLayout(1000, 1000, DIRECTION_LTR)
  }),
)
console.log(formatResult(results.at(-1)!))

results.push(
  benchmark(
    "Flat 100 nodes - create + layout",
    () => {
      const tree = createFlatTree(100)
      tree.calculateLayout(1000, 1000, DIRECTION_LTR)
    },
    { iterations: 500 },
  ),
)
console.log(formatResult(results.at(-1)!))

console.log("")

// Deep hierarchy
console.log("## Deep Hierarchy (nested containers)")
console.log("")

const deep50 = createDeepTree(50)
const deep100 = createDeepTree(100)
const deep200 = createDeepTree(200)

results.push(
  benchmark("Deep 50 levels - layout only", () => {
    deep50.markDirty()
    deep50.calculateLayout(1000, 1000, DIRECTION_LTR)
  }),
)
console.log(formatResult(results.at(-1)!))

results.push(
  benchmark("Deep 100 levels - layout only", () => {
    deep100.markDirty()
    deep100.calculateLayout(1000, 1000, DIRECTION_LTR)
  }),
)
console.log(formatResult(results.at(-1)!))

results.push(
  benchmark("Deep 200 levels - layout only", () => {
    deep200.markDirty()
    deep200.calculateLayout(1000, 1000, DIRECTION_LTR)
  }),
)
console.log(formatResult(results.at(-1)!))

console.log("")

// Terminal TUI patterns
console.log("## Terminal TUI Patterns")
console.log("")

const kanban30 = createKanbanTree(10) // 3 cols × 10 cards = ~33 nodes
const kanban150 = createKanbanTree(50) // 3 cols × 50 cards = ~153 nodes
const kanban300 = createKanbanTree(100) // 3 cols × 100 cards = ~303 nodes

results.push(
  benchmark("Kanban 3×10 (~33 nodes) - layout only", () => {
    kanban30.markDirty()
    kanban30.calculateLayout(120, 40, DIRECTION_LTR)
  }),
)
console.log(formatResult(results.at(-1)!))

results.push(
  benchmark("Kanban 3×50 (~153 nodes) - layout only", () => {
    kanban150.markDirty()
    kanban150.calculateLayout(120, 40, DIRECTION_LTR)
  }),
)
console.log(formatResult(results.at(-1)!))

results.push(
  benchmark("Kanban 3×100 (~303 nodes) - layout only", () => {
    kanban300.markDirty()
    kanban300.calculateLayout(120, 40, DIRECTION_LTR)
  }),
)
console.log(formatResult(results.at(-1)!))

results.push(
  benchmark(
    "Kanban 3×50 - create + layout",
    () => {
      const tree = createKanbanTree(50)
      tree.calculateLayout(120, 40, DIRECTION_LTR)
    },
    { iterations: 500 },
  ),
)
console.log(formatResult(results.at(-1)!))

console.log("")

// Incremental layout
console.log("## Incremental Layout (dirty tracking)")
console.log("")

const incrementalTree = createKanbanTree(50)
incrementalTree.calculateLayout(120, 40, DIRECTION_LTR)

results.push(
  benchmark("Clean tree re-layout (should skip)", () => {
    incrementalTree.calculateLayout(120, 40, DIRECTION_LTR)
  }),
)
console.log(formatResult(results.at(-1)!))

const col = incrementalTree.getChild(0)
results.push(
  benchmark("Single property change + re-layout", () => {
    if (col) {
      col.setWidth(35)
      incrementalTree.calculateLayout(120, 40, DIRECTION_LTR)
      col.setWidth(40)
    }
  }),
)
console.log(formatResult(results.at(-1)!))

console.log("")
console.log("## Summary")
console.log("")
console.log("For terminal UIs (typically <500 nodes), Flexture handles layout in <1ms.")
console.log("This is more than fast enough for 60fps rendering (16.67ms per frame).")
