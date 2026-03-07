/**
 * Rich Flexture vs Yoga Comparison Benchmarks
 *
 * Goes beyond flat/deep to test dimensions that matter for real applications:
 * - Measure functions (text nodes)
 * - Kanban/board shapes (wide + shallow depth)
 * - Incremental re-layout (dirty leaf → full tree)
 * - Re-layout with constraint change (the caching advantage)
 * - Property diversity (shrink, align, justify, wrap)
 * - TUI-realistic structure (columns × bordered cards × text)
 *
 * Run: bun bench bench/yoga-compare-rich.bench.ts
 */

import { bench, describe, beforeAll } from "vitest"
import * as Flexture from "../src/index.js"
import initYoga, { type Yoga } from "yoga-wasm-web"
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

  // Warmup JIT
  console.log("\n[Warmup] Running 500 iterations...")
  for (let i = 0; i < 500; i++) {
    const ft = flextureTuiTree(5, 10)
    ft.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
    const yt = yogaTuiTree(5, 10)
    yt.calculateLayout(120, 40, yoga.DIRECTION_LTR)
    yt.freeRecursive()
  }
  if (typeof globalThis.gc === "function") globalThis.gc()
  console.log("[Warmup] Complete\n")
})

const opts = { warmupIterations: 50, iterations: 500, time: 2000 }

// ============================================================================
// Shared text measure function (simulates wrapping text)
// ============================================================================

function textMeasure(textLen: number) {
  return (width: number, _wm: number, _height: number, _hm: number): { width: number; height: number } => {
    const maxW = Number.isNaN(width) ? Infinity : width
    const lines = Math.ceil(textLen / Math.max(1, maxW))
    return { width: Math.min(textLen, maxW), height: lines }
  }
}

// ============================================================================
// Tree: TUI-realistic (columns × bordered cards × icon + text)
// Mirrors the actual km TUI structure
// ============================================================================

function flextureTuiTree(cols: number, cardsPerCol: number): Flexture.Node {
  const root = Flexture.Node.create()
  root.setWidth(120)
  root.setHeight(40)
  root.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)
  root.setGap(Flexture.GUTTER_ALL, 1)

  for (let c = 0; c < cols; c++) {
    const col = Flexture.Node.create()
    col.setFlexGrow(1)
    col.setFlexShrink(1)
    col.setFlexDirection(Flexture.FLEX_DIRECTION_COLUMN)

    // Column header
    const header = Flexture.Node.create()
    header.setHeight(1)
    col.insertChild(header, 0)

    for (let i = 0; i < cardsPerCol; i++) {
      // Card border container
      const card = Flexture.Node.create()
      card.setFlexDirection(Flexture.FLEX_DIRECTION_COLUMN)
      card.setBorder(Flexture.EDGE_ALL, 1)
      card.setPadding(Flexture.EDGE_RIGHT, 1)

      // Card row: icon + text
      const row = Flexture.Node.create()
      row.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)

      const icon = Flexture.Node.create()
      icon.setWidth(3)
      row.insertChild(icon, 0)

      const text = Flexture.Node.create()
      text.setFlexGrow(1)
      text.setFlexShrink(1)
      text.setMeasureFunc(textMeasure(15 + (i % 20)))
      row.insertChild(text, 1)

      card.insertChild(row, 0)
      col.insertChild(card, i + 1)
    }
    root.insertChild(col, c)
  }
  return root
}

function yogaTuiTree(cols: number, cardsPerCol: number) {
  const root = yoga.Node.create()
  root.setWidth(120)
  root.setHeight(40)
  root.setFlexDirection(yoga.FLEX_DIRECTION_ROW)
  root.setGap(yoga.GUTTER_ALL, 1)

  for (let c = 0; c < cols; c++) {
    const col = yoga.Node.create()
    col.setFlexGrow(1)
    col.setFlexShrink(1)
    col.setFlexDirection(yoga.FLEX_DIRECTION_COLUMN)

    const header = yoga.Node.create()
    header.setHeight(1)
    col.insertChild(header, 0)

    for (let i = 0; i < cardsPerCol; i++) {
      const card = yoga.Node.create()
      card.setFlexDirection(yoga.FLEX_DIRECTION_COLUMN)
      card.setBorder(yoga.EDGE_ALL, 1)
      card.setPadding(yoga.EDGE_RIGHT, 1)

      const row = yoga.Node.create()
      row.setFlexDirection(yoga.FLEX_DIRECTION_ROW)

      const icon = yoga.Node.create()
      icon.setWidth(3)
      row.insertChild(icon, 0)

      const text = yoga.Node.create()
      text.setFlexGrow(1)
      text.setFlexShrink(1)
      text.setMeasureFunc(textMeasure(15 + (i % 20)))
      row.insertChild(text, 1)

      card.insertChild(row, 0)
      col.insertChild(card, i + 1)
    }
    root.insertChild(col, c)
  }
  return root
}

// ============================================================================
// Tree: Property-rich (uses diverse flex properties)
// ============================================================================

function flexturePropertyRichTree(nodeCount: number): Flexture.Node {
  const root = Flexture.Node.create()
  root.setWidth(200)
  root.setHeight(100)
  root.setFlexDirection(Flexture.FLEX_DIRECTION_COLUMN)
  root.setAlignItems(Flexture.ALIGN_STRETCH)

  const rows = Math.ceil(nodeCount / 5)
  for (let r = 0; r < rows; r++) {
    const row = Flexture.Node.create()
    row.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)
    row.setJustifyContent(
      r % 3 === 0 ? Flexture.JUSTIFY_FLEX_START : r % 3 === 1 ? Flexture.JUSTIFY_SPACE_BETWEEN : Flexture.JUSTIFY_CENTER,
    )
    row.setAlignItems(r % 2 === 0 ? Flexture.ALIGN_CENTER : Flexture.ALIGN_FLEX_END)
    row.setFlexWrap(r % 4 === 0 ? Flexture.WRAP_WRAP : Flexture.WRAP_NO_WRAP)
    row.setFlexGrow(1)

    for (let c = 0; c < 5; c++) {
      const child = Flexture.Node.create()
      child.setFlexGrow(c % 3 === 0 ? 1 : 0)
      child.setFlexShrink(c % 2 === 0 ? 1 : 0)
      child.setWidth(20 + c * 5)
      child.setHeight(5)
      child.setMargin(Flexture.EDGE_ALL, 1)
      if (c % 3 === 2) {
        child.setAlignSelf(Flexture.ALIGN_FLEX_START)
      }
      row.insertChild(child, c)
    }
    root.insertChild(row, r)
  }
  return root
}

function yogaPropertyRichTree(nodeCount: number) {
  const root = yoga.Node.create()
  root.setWidth(200)
  root.setHeight(100)
  root.setFlexDirection(yoga.FLEX_DIRECTION_COLUMN)
  root.setAlignItems(yoga.ALIGN_STRETCH)

  const rows = Math.ceil(nodeCount / 5)
  for (let r = 0; r < rows; r++) {
    const row = yoga.Node.create()
    row.setFlexDirection(yoga.FLEX_DIRECTION_ROW)
    row.setJustifyContent(
      r % 3 === 0 ? yoga.JUSTIFY_FLEX_START : r % 3 === 1 ? yoga.JUSTIFY_SPACE_BETWEEN : yoga.JUSTIFY_CENTER,
    )
    row.setAlignItems(r % 2 === 0 ? yoga.ALIGN_CENTER : yoga.ALIGN_FLEX_END)
    row.setFlexWrap(r % 4 === 0 ? yoga.WRAP_WRAP : yoga.WRAP_NO_WRAP)
    row.setFlexGrow(1)

    for (let c = 0; c < 5; c++) {
      const child = yoga.Node.create()
      child.setFlexGrow(c % 3 === 0 ? 1 : 0)
      child.setFlexShrink(c % 2 === 0 ? 1 : 0)
      child.setWidth(20 + c * 5)
      child.setHeight(5)
      child.setMargin(yoga.EDGE_ALL, 1)
      if (c % 3 === 2) {
        child.setAlignSelf(yoga.ALIGN_FLEX_START)
      }
      row.insertChild(child, c)
    }
    root.insertChild(row, r)
  }
  return root
}

// ============================================================================
// 1. TUI-Realistic: Create + Layout
// ============================================================================

describe("TUI Board (create + layout)", () => {
  for (const [cols, cards] of [
    [3, 5],
    [5, 10],
    [5, 20],
    [8, 30],
  ] as const) {
    const total = cols * (1 + cards * 4) + 1 // root + cols*(header + cards*(border+row+icon+text))
    bench(
      `Flexture: ${cols}×${cards} (~${total} nodes)`,
      () => {
        const tree = flextureTuiTree(cols, cards)
        tree.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
      },
      opts,
    )
    bench(
      `Yoga: ${cols}×${cards} (~${total} nodes)`,
      () => {
        const tree = yogaTuiTree(cols, cards)
        tree.calculateLayout(120, 40, yoga.DIRECTION_LTR)
        tree.freeRecursive()
      },
      opts,
    )
  }
})

// ============================================================================
// 2. Incremental Re-layout (single dirty leaf)
// ============================================================================

describe("Incremental re-layout (single leaf dirty)", () => {
  for (const [cols, cards] of [
    [5, 10],
    [5, 20],
    [8, 30],
  ] as const) {
    let flextureTree: Flexture.Node
    let flextureLeaf: Flexture.Node
    let yogaTree: ReturnType<typeof yoga.Node.create>
    let yogaLeaf: ReturnType<typeof yoga.Node.create>

    beforeAll(() => {
      flextureTree = flextureTuiTree(cols, cards)
      flextureTree.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
      // Get a text leaf node in the middle column
      const midCol = Math.floor(cols / 2)
      const midCard = Math.floor(cards / 2)
      flextureLeaf = flextureTree
        .getChild(midCol)!
        .getChild(midCard + 1)!
        .getChild(0)!
        .getChild(1)! // text node

      yogaTree = yogaTuiTree(cols, cards)
      yogaTree.calculateLayout(120, 40, yoga.DIRECTION_LTR)
      yogaLeaf = yogaTree
        .getChild(midCol)!
        .getChild(midCard + 1)!
        .getChild(0)!
        .getChild(1)! // text node
    })

    bench(
      `Flexture: ${cols}×${cards} leaf dirty`,
      () => {
        flextureLeaf.markDirty()
        flextureTree.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
      },
      opts,
    )
    bench(
      `Yoga: ${cols}×${cards} leaf dirty`,
      () => {
        yogaLeaf.markDirty()
        yogaTree.calculateLayout(120, 40, yoga.DIRECTION_LTR)
      },
      opts,
    )
  }
})

// ============================================================================
// 3. Re-layout with constraint change (exercises fingerprint cache)
// ============================================================================

describe("Re-layout with width change", () => {
  for (const [cols, cards] of [
    [5, 10],
    [5, 20],
  ] as const) {
    let flextureTree: Flexture.Node
    let yogaTree: ReturnType<typeof yoga.Node.create>

    beforeAll(() => {
      flextureTree = flextureTuiTree(cols, cards)
      flextureTree.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
      yogaTree = yogaTuiTree(cols, cards)
      yogaTree.calculateLayout(120, 40, yoga.DIRECTION_LTR)
    })

    bench(
      `Flexture: ${cols}×${cards} width 120→80`,
      () => {
        flextureTree.setWidth(80)
        flextureTree.calculateLayout(80, 40, Flexture.DIRECTION_LTR)
        flextureTree.setWidth(120)
        flextureTree.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
      },
      opts,
    )
    bench(
      `Yoga: ${cols}×${cards} width 120→80`,
      () => {
        yogaTree.setWidth(80)
        yogaTree.calculateLayout(80, 40, yoga.DIRECTION_LTR)
        yogaTree.setWidth(120)
        yogaTree.calculateLayout(120, 40, yoga.DIRECTION_LTR)
      },
      opts,
    )
  }
})

// ============================================================================
// 4. Property diversity
// ============================================================================

describe("Property-rich trees (shrink, align, justify, wrap)", () => {
  for (const nodeCount of [100, 300, 600]) {
    bench(
      `Flexture: ~${nodeCount} nodes`,
      () => {
        const tree = flexturePropertyRichTree(nodeCount)
        tree.calculateLayout(200, 100, Flexture.DIRECTION_LTR)
      },
      opts,
    )
    bench(
      `Yoga: ~${nodeCount} nodes`,
      () => {
        const tree = yogaPropertyRichTree(nodeCount)
        tree.calculateLayout(200, 100, yoga.DIRECTION_LTR)
        tree.freeRecursive()
      },
      opts,
    )
  }
})

// ============================================================================
// 5. No-change re-layout (best case for Flexture fingerprint cache)
// ============================================================================

describe("No-change re-layout (fingerprint cache hit)", () => {
  for (const [cols, cards] of [
    [5, 10],
    [5, 20],
    [8, 30],
  ] as const) {
    let flextureTree: Flexture.Node
    let yogaTree: ReturnType<typeof yoga.Node.create>

    beforeAll(() => {
      flextureTree = flextureTuiTree(cols, cards)
      flextureTree.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
      yogaTree = yogaTuiTree(cols, cards)
      yogaTree.calculateLayout(120, 40, yoga.DIRECTION_LTR)
    })

    bench(
      `Flexture: ${cols}×${cards} no-change`,
      () => {
        flextureTree.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
      },
      opts,
    )
    bench(
      `Yoga: ${cols}×${cards} no-change`,
      () => {
        yogaTree.calculateLayout(120, 40, yoga.DIRECTION_LTR)
      },
      opts,
    )
  }
})
