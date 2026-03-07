/**
 * Profile Flexture layout to identify hot spots.
 * Run: bun bench/profile.ts
 */

import { Node } from "../src/index.js"
import * as layout from "../src/layout-zero.js"

// Create a wide tree (like kanban board)
function createWideTree(cols: number, rows: number): Node {
  const root = new Node()
  root.setFlexDirection(0) // Row
  root.setWidth(800)
  root.setHeight(600)

  for (let c = 0; c < cols; c++) {
    const column = new Node()
    column.setFlexDirection(1) // Column
    column.setFlexGrow(1)

    for (let r = 0; r < rows; r++) {
      const item = new Node()
      item.setHeight(20)
      item.setMeasureFunc((w, wm, h, hm) => ({ width: 50, height: 20 }))
      column.insertChild(item, r)
    }
    root.insertChild(column, c)
  }
  return root
}

function countNodes(node: Node): number {
  let count = 1
  for (let i = 0; i < node.getChildCount(); i++) {
    count += countNodes(node.getChild(i)!)
  }
  return count
}

console.log("=== Flexture Layout Profiling ===\n")

// Warmup
const warmup = createWideTree(5, 10)
warmup.calculateLayout(800, 600, 0)

// Profile with different tree sizes
const sizes = [
  { cols: 5, rows: 20 }, // 105 nodes
  { cols: 10, rows: 50 }, // 511 nodes
  { cols: 10, rows: 100 }, // 1011 nodes
]

for (const { cols, rows } of sizes) {
  const root = createWideTree(cols, rows)
  const nodeCount = countNodes(root)

  // Run multiple times for accurate timing
  const iterations = 10
  const times: number[] = []

  // Single run with stats
  layout.resetLayoutStats()
  Node.resetMeasureStats()

  const start = performance.now()
  root.calculateLayout(800, 600, 0)
  const elapsed = performance.now() - start

  // Multiple runs for timing
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    root.calculateLayout(800, 600, 0)
    times.push(performance.now() - t0)
  }

  // Take median time (more stable than average)
  times.sort((a, b) => a - b)
  const median = times[Math.floor(times.length / 2)]!

  const usPerNode = ((elapsed * 1000) / nodeCount).toFixed(1)
  console.log(`${cols}x${rows} (${nodeCount} nodes):`)
  console.log(`  Time: ${elapsed.toFixed(2)}ms (${usPerNode}µs/node)`)
  console.log(`  layoutNode: ${layout.layoutNodeCalls} (${(layout.layoutNodeCalls / nodeCount).toFixed(1)}x/node)`)
  console.log(`  measureNode: ${layout.measureNodeCalls} (${(layout.measureNodeCalls / nodeCount).toFixed(1)}x/node)`)
  console.log(
    `  sizing: ${layout.layoutSizingCalls}, positioning: ${layout.layoutPositioningCalls}, cache: ${layout.layoutCacheHits}`,
  )
  console.log(
    `  measure: ${Node.measureCalls} calls, ${Node.measureCacheHits} hits (${Node.measureCalls > 0 ? ((100 * Node.measureCacheHits) / Node.measureCalls).toFixed(0) : 0}%)`,
  )
  console.log()
}

console.log("Key metrics to optimize:")
console.log("1. layoutNode calls per node (target: ~2x)")
console.log("2. µs per node (lower is better)")
console.log("3. measure cache hit rate (higher is better)")
