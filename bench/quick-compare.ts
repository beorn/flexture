#!/usr/bin/env bun
/**
 * Quick Flexture vs Yoga comparison for iteration.
 * Run: bun bench/quick-compare.ts [nodeCount] [iterations]
 */

import * as Flexture from "../src/index.js"
import { layoutNodeCalls } from "../src/layout-zero.js"
import initYoga, { type Yoga } from "yoga-wasm-web"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const wasmPath = join(__dirname, "../node_modules/yoga-wasm-web/dist/yoga.wasm")

const nodeCount = parseInt(process.argv[2] || "1500", 10)
const iterations = parseInt(process.argv[3] || "3", 10)

console.log(`\nComparing Flexture vs Yoga: ${nodeCount} nodes, ${iterations} iterations\n`)

// Initialize Yoga
const wasmBuffer = readFileSync(wasmPath)
const yoga: Yoga = await initYoga(wasmBuffer)

// Tree with measure functions (simulates TUI text nodes)
function createFlextureTree(n: number): Flexture.Node {
  const root = Flexture.Node.create()
  root.setWidth(250)
  root.setHeight(120)
  root.setFlexDirection(Flexture.FLEX_DIRECTION_COLUMN)

  const cols = 5
  const itemsPerCol = Math.floor(n / cols / 2)

  for (let col = 0; col < cols; col++) {
    const column = Flexture.Node.create()
    column.setFlexGrow(1)
    column.setFlexDirection(Flexture.FLEX_DIRECTION_COLUMN)

    for (let item = 0; item < itemsPerCol; item++) {
      const itemNode = Flexture.Node.create()
      itemNode.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)
      itemNode.setPadding(Flexture.EDGE_LEFT, 1)

      const textNode = Flexture.Node.create()
      const text = `Item ${col}-${item} with some text content`
      textNode.setMeasureFunc((width, _wm, _h, _hm) => {
        const tw = text.length
        const maxW = Number.isNaN(width) ? Infinity : width
        return {
          width: Math.min(tw, maxW),
          height: Math.ceil(tw / Math.max(1, maxW)),
        }
      })
      itemNode.insertChild(textNode, 0)
      column.insertChild(itemNode, item)
    }
    root.insertChild(column, col)
  }
  return root
}

function createYogaTree(n: number) {
  const root = yoga.Node.create()
  root.setWidth(250)
  root.setHeight(120)
  root.setFlexDirection(yoga.FLEX_DIRECTION_COLUMN)

  const cols = 5
  const itemsPerCol = Math.floor(n / cols / 2)

  for (let col = 0; col < cols; col++) {
    const column = yoga.Node.create()
    column.setFlexGrow(1)
    column.setFlexDirection(yoga.FLEX_DIRECTION_COLUMN)

    for (let item = 0; item < itemsPerCol; item++) {
      const itemNode = yoga.Node.create()
      itemNode.setFlexDirection(yoga.FLEX_DIRECTION_ROW)
      itemNode.setPadding(yoga.EDGE_LEFT, 1)

      const textNode = yoga.Node.create()
      const text = `Item ${col}-${item} with some text content`
      textNode.setMeasureFunc((width, _wm, _h, _hm) => {
        const tw = text.length
        const maxW = Number.isNaN(width) ? Infinity : width
        return {
          width: Math.min(tw, maxW),
          height: Math.ceil(tw / Math.max(1, maxW)),
        }
      })
      itemNode.insertChild(textNode, 0)
      column.insertChild(itemNode, item)
    }
    root.insertChild(column, col)
  }
  return root
}

// Benchmark
const flextureTimes: number[] = []
const yogaTimes: number[] = []

for (let i = 0; i < iterations; i++) {
  // Flexture
  const ft = createFlextureTree(nodeCount)
  Flexture.Node.resetMeasureStats()
  const fs = performance.now()
  ft.calculateLayout(250, 120, Flexture.DIRECTION_LTR)
  flextureTimes.push(performance.now() - fs)

  // Yoga
  const yt = createYogaTree(nodeCount)
  const ys = performance.now()
  yt.calculateLayout(250, 120, yoga.DIRECTION_LTR)
  yogaTimes.push(performance.now() - ys)
  yt.freeRecursive()
}

const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
const flextureAvg = avg(flextureTimes)
const yogaAvg = avg(yogaTimes)

console.log(`Flexture: ${flextureAvg.toFixed(2)}ms avg (${flextureTimes.map((t) => t.toFixed(1)).join(", ")})`)
console.log(`       measure: calls=${Flexture.Node.measureCalls} hits=${Flexture.Node.measureCacheHits}`)
console.log(`       layoutNode: calls=${layoutNodeCalls}`)
console.log(`Yoga:  ${yogaAvg.toFixed(2)}ms avg (${yogaTimes.map((t) => t.toFixed(1)).join(", ")})`)
console.log(
  `\nRatio: Flexture is ${(flextureAvg / yogaAvg).toFixed(2)}x ${flextureAvg > yogaAvg ? "slower" : "faster"} than Yoga`,
)
