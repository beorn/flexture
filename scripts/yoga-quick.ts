#!/usr/bin/env bun
import * as Flexture from "../src/index.js"
import initYoga from "yoga-wasm-web"
import { readFileSync } from "node:fs"

const wasmPath = "./node_modules/yoga-wasm-web/dist/yoga.wasm"
const wasmBuffer = readFileSync(wasmPath)
const yoga = await initYoga(wasmBuffer)

function bench(name: string, fn: () => void, iterations = 500): number {
  for (let i = 0; i < 50; i++) fn()
  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  const ms = performance.now() - start
  const ops = (iterations / ms) * 1000
  console.log(name + ": " + ops.toFixed(0) + " ops/sec")
  return ops
}

function flextureTree(cards: number) {
  const root = Flexture.Node.create()
  root.setWidth(120)
  root.setHeight(40)
  root.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)
  for (let col = 0; col < 3; col++) {
    const column = Flexture.Node.create()
    column.setFlexGrow(1)
    column.setFlexDirection(Flexture.FLEX_DIRECTION_COLUMN)
    for (let i = 0; i < cards; i++) {
      const card = Flexture.Node.create()
      card.setHeight(3)
      column.insertChild(card, i)
    }
    root.insertChild(column, col)
  }
  return root
}

function yogaTree(cards: number) {
  const root = yoga.Node.create()
  root.setWidth(120)
  root.setHeight(40)
  root.setFlexDirection(yoga.FLEX_DIRECTION_ROW)
  for (let col = 0; col < 3; col++) {
    const column = yoga.Node.create()
    column.setFlexGrow(1)
    column.setFlexDirection(yoga.FLEX_DIRECTION_COLUMN)
    for (let i = 0; i < cards; i++) {
      const card = yoga.Node.create()
      card.setHeight(3)
      column.insertChild(card, i)
    }
    root.insertChild(column, col)
  }
  return root
}

console.log("\n=== Flexture Zero vs Yoga (WASM) ===\n")

console.log("Create + Layout 50 cards:")
const flextureOps = bench("  Flexture", () => {
  const tree = flextureTree(50)
  tree.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
})
const yogaOps = bench("  Yoga", () => {
  const tree = yogaTree(50)
  tree.calculateLayout(120, 40, yoga.DIRECTION_LTR)
})
const ratio = yogaOps / flextureOps
if (ratio > 1) {
  console.log("  → Yoga is " + ratio.toFixed(1) + "x faster\n")
} else {
  console.log("  → Flexture is " + (1 / ratio).toFixed(1) + "x faster\n")
}

console.log("Layout Only (with markDirty):")
const flexturePre = flextureTree(50)
const yogaPre = yogaTree(50)
// First layout to initialize
flexturePre.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
yogaPre.calculateLayout(120, 40, yoga.DIRECTION_LTR)
const flextureDirty = bench("  Flexture (markDirty)", () => {
  flexturePre.markDirty()
  flexturePre.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
})
console.log("")

console.log("Layout Only (unchanged - fingerprint test):")
const flextureLayout = bench("  Flexture (cached)", () => {
  flexturePre.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
})
const yogaLayout = bench("  Yoga (cached)", () => {
  yogaPre.calculateLayout(120, 40, yoga.DIRECTION_LTR)
})
const layoutRatio = yogaLayout / flextureLayout
if (layoutRatio > 1) {
  console.log("  → Yoga is " + layoutRatio.toFixed(1) + "x faster\n")
} else {
  console.log("  → Flexture is " + (1 / layoutRatio).toFixed(1) + "x faster\n")
}
