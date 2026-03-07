/**
 * Incremental re-layout benchmarks
 * Tests caching/fingerprint advantage for pre-created trees
 */
import { bench, describe, beforeAll } from "vitest"
import * as Flexture from "../src/index.js"
import initYoga, { type Yoga } from "yoga-wasm-web"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

let yoga: Yoga

const __dirname = dirname(fileURLToPath(import.meta.url))
const wasmPath = join(__dirname, "../node_modules/yoga-wasm-web/dist/yoga.wasm")

function textMeasure(textLen: number) {
  return (width: number, _wm: number, _h: number, _hm: number) => {
    const maxW = Number.isNaN(width) ? Infinity : width
    const lines = Math.ceil(textLen / Math.max(1, maxW))
    return { width: Math.min(textLen, maxW), height: lines }
  }
}

function flextureTree(cols: number, cards: number): Flexture.Node {
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
    const h = Flexture.Node.create()
    h.setHeight(1)
    col.insertChild(h, 0)
    for (let i = 0; i < cards; i++) {
      const card = Flexture.Node.create()
      card.setFlexDirection(Flexture.FLEX_DIRECTION_COLUMN)
      card.setBorder(Flexture.EDGE_ALL, 1)
      card.setPadding(Flexture.EDGE_RIGHT, 1)
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

function yogaTree(cols: number, cards: number) {
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
    const h = yoga.Node.create()
    h.setHeight(1)
    col.insertChild(h, 0)
    for (let i = 0; i < cards; i++) {
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

// Pre-created trees (initialized in beforeAll)
let ft: Flexture.Node, ftLeaf: Flexture.Node
let yt: ReturnType<typeof yoga.Node.create>, ytLeaf: ReturnType<typeof yoga.Node.create>
let ftBig: Flexture.Node, ftBigLeaf: Flexture.Node
let ytBig: ReturnType<typeof yoga.Node.create>, ytBigLeaf: ReturnType<typeof yoga.Node.create>

beforeAll(async () => {
  const wasmBuffer = readFileSync(wasmPath)
  yoga = await initYoga(wasmBuffer)

  ft = flextureTree(5, 20)
  ft.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
  ftLeaf = ft.getChild(2)!.getChild(10)!.getChild(0)!.getChild(1)!

  yt = yogaTree(5, 20)
  yt.calculateLayout(120, 40, yoga.DIRECTION_LTR)
  ytLeaf = yt.getChild(2)!.getChild(10)!.getChild(0)!.getChild(1)!

  ftBig = flextureTree(8, 30)
  ftBig.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
  ftBigLeaf = ftBig.getChild(4)!.getChild(15)!.getChild(0)!.getChild(1)!

  ytBig = yogaTree(8, 30)
  ytBig.calculateLayout(120, 40, yoga.DIRECTION_LTR)
  ytBigLeaf = ytBig.getChild(4)!.getChild(15)!.getChild(0)!.getChild(1)!

  // warmup
  for (let i = 0; i < 500; i++) {
    ftLeaf.markDirty()
    ft.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
    ytLeaf.markDirty()
    yt.calculateLayout(120, 40, yoga.DIRECTION_LTR)
  }
})

const opts = { warmupIterations: 100, iterations: 1000, time: 2000 }

describe("No-change re-layout (fingerprint cache)", () => {
  bench(
    "Flexture: 5×20 no-change",
    () => {
      ft.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
    },
    opts,
  )
  bench(
    "Yoga: 5×20 no-change",
    () => {
      yt.calculateLayout(120, 40, yoga.DIRECTION_LTR)
    },
    opts,
  )
  bench(
    "Flexture: 8×30 no-change",
    () => {
      ftBig.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
    },
    opts,
  )
  bench(
    "Yoga: 8×30 no-change",
    () => {
      ytBig.calculateLayout(120, 40, yoga.DIRECTION_LTR)
    },
    opts,
  )
})

describe("Single leaf dirty (incremental re-layout)", () => {
  bench(
    "Flexture: 5×20 leaf dirty",
    () => {
      ftLeaf.markDirty()
      ft.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
    },
    opts,
  )
  bench(
    "Yoga: 5×20 leaf dirty",
    () => {
      ytLeaf.markDirty()
      yt.calculateLayout(120, 40, yoga.DIRECTION_LTR)
    },
    opts,
  )
  bench(
    "Flexture: 8×30 leaf dirty",
    () => {
      ftBigLeaf.markDirty()
      ftBig.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
    },
    opts,
  )
  bench(
    "Yoga: 8×30 leaf dirty",
    () => {
      ytBigLeaf.markDirty()
      ytBig.calculateLayout(120, 40, yoga.DIRECTION_LTR)
    },
    opts,
  )
})

describe("Width change cycle (120→80→120)", () => {
  bench(
    "Flexture: 5×20 resize cycle",
    () => {
      ft.setWidth(80)
      ft.calculateLayout(80, 40, Flexture.DIRECTION_LTR)
      ft.setWidth(120)
      ft.calculateLayout(120, 40, Flexture.DIRECTION_LTR)
    },
    opts,
  )
  bench(
    "Yoga: 5×20 resize cycle",
    () => {
      yt.setWidth(80)
      yt.calculateLayout(80, 40, yoga.DIRECTION_LTR)
      yt.setWidth(120)
      yt.calculateLayout(120, 40, yoga.DIRECTION_LTR)
    },
    opts,
  )
})
