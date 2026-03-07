/**
 * Feature-specific Flexture vs Yoga benchmarks
 *
 * Targets specific flexbox features to identify performance differences.
 * Run: bun bench vendor/flexture/bench/features.bench.ts
 */

import { bench, describe, beforeAll } from "vitest"
import { Node } from "../src/index.js"
import initYoga, { type Yoga, type Node as YogaNode } from "yoga-wasm-web"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as C from "../src/constants.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const wasmPath = join(__dirname, "../node_modules/yoga-wasm-web/dist/yoga.wasm")

let yoga: Yoga

beforeAll(async () => {
  const wasmBuffer = readFileSync(wasmPath)
  yoga = await initYoga(wasmBuffer)
})

const BENCH_OPTS = { iterations: 1, warmupIterations: 0 }
const N = 100 // items per test

// ============================================================================
// Feature: FlexGrow
// ============================================================================

describe("Feature: FlexGrow", () => {
  bench(
    "flexture - flexGrow distribution",
    () => {
      const root = Node.create()
      root.setWidth(1000)
      root.setHeight(100)
      root.setFlexDirection(C.FLEX_DIRECTION_ROW)

      for (let i = 0; i < N; i++) {
        const child = Node.create()
        child.setFlexGrow(1)
        child.setHeight(50)
        root.insertChild(child, i)
      }

      root.calculateLayout(1000, 100)
      root.free()
    },
    BENCH_OPTS,
  )

  bench(
    "yoga - flexGrow distribution",
    () => {
      const root = yoga.Node.create()
      root.setWidth(1000)
      root.setHeight(100)
      root.setFlexDirection(yoga.FLEX_DIRECTION_ROW)

      for (let i = 0; i < N; i++) {
        const child = yoga.Node.create()
        child.setFlexGrow(1)
        child.setHeight(50)
        root.insertChild(child, i)
      }

      root.calculateLayout(1000, 100)
      root.freeRecursive()
    },
    BENCH_OPTS,
  )
})

// ============================================================================
// Feature: FlexShrink
// ============================================================================

describe("Feature: FlexShrink", () => {
  bench(
    "flexture - flexShrink overflow",
    () => {
      const root = Node.create()
      root.setWidth(500) // Container smaller than content
      root.setHeight(100)
      root.setFlexDirection(C.FLEX_DIRECTION_ROW)

      for (let i = 0; i < N; i++) {
        const child = Node.create()
        child.setWidth(20) // 100 * 20 = 2000 > 500
        child.setFlexShrink(1)
        child.setHeight(50)
        root.insertChild(child, i)
      }

      root.calculateLayout(500, 100)
      root.free()
    },
    BENCH_OPTS,
  )

  bench(
    "yoga - flexShrink overflow",
    () => {
      const root = yoga.Node.create()
      root.setWidth(500)
      root.setHeight(100)
      root.setFlexDirection(yoga.FLEX_DIRECTION_ROW)

      for (let i = 0; i < N; i++) {
        const child = yoga.Node.create()
        child.setWidth(20)
        child.setFlexShrink(1)
        child.setHeight(50)
        root.insertChild(child, i)
      }

      root.calculateLayout(500, 100)
      root.freeRecursive()
    },
    BENCH_OPTS,
  )
})

// ============================================================================
// Feature: FlexWrap
// ============================================================================

describe("Feature: FlexWrap", () => {
  bench(
    "flexture - wrap with many items",
    () => {
      const root = Node.create()
      root.setWidth(200)
      root.setFlexDirection(C.FLEX_DIRECTION_ROW)
      root.setFlexWrap(C.WRAP_WRAP)

      for (let i = 0; i < N; i++) {
        const child = Node.create()
        child.setWidth(50)
        child.setHeight(30)
        root.insertChild(child, i)
      }

      root.calculateLayout(200, undefined)
      root.free()
    },
    BENCH_OPTS,
  )

  bench(
    "yoga - wrap with many items",
    () => {
      const root = yoga.Node.create()
      root.setWidth(200)
      root.setFlexDirection(yoga.FLEX_DIRECTION_ROW)
      root.setFlexWrap(yoga.WRAP_WRAP)

      for (let i = 0; i < N; i++) {
        const child = yoga.Node.create()
        child.setWidth(50)
        child.setHeight(30)
        root.insertChild(child, i)
      }

      root.calculateLayout(200, undefined)
      root.freeRecursive()
    },
    BENCH_OPTS,
  )
})

// ============================================================================
// Feature: Gap
// ============================================================================

describe("Feature: Gap", () => {
  bench(
    "flexture - gap between items",
    () => {
      const root = Node.create()
      root.setWidth(1000)
      root.setHeight(100)
      root.setFlexDirection(C.FLEX_DIRECTION_ROW)
      root.setGap(C.GUTTER_ALL, 10)

      for (let i = 0; i < N; i++) {
        const child = Node.create()
        child.setWidth(20)
        child.setHeight(50)
        root.insertChild(child, i)
      }

      root.calculateLayout(1000, 100)
      root.free()
    },
    BENCH_OPTS,
  )

  bench(
    "yoga - gap between items",
    () => {
      const root = yoga.Node.create()
      root.setWidth(1000)
      root.setHeight(100)
      root.setFlexDirection(yoga.FLEX_DIRECTION_ROW)
      root.setGap(yoga.GUTTER_ALL, 10)

      for (let i = 0; i < N; i++) {
        const child = yoga.Node.create()
        child.setWidth(20)
        child.setHeight(50)
        root.insertChild(child, i)
      }

      root.calculateLayout(1000, 100)
      root.freeRecursive()
    },
    BENCH_OPTS,
  )
})

// ============================================================================
// Feature: Absolute Positioning
// ============================================================================

describe("Feature: AbsolutePositioning", () => {
  bench(
    "flexture - absolute children",
    () => {
      const root = Node.create()
      root.setWidth(500)
      root.setHeight(500)

      for (let i = 0; i < N; i++) {
        const child = Node.create()
        child.setPositionType(C.POSITION_TYPE_ABSOLUTE)
        child.setPosition(C.EDGE_LEFT, i * 5)
        child.setPosition(C.EDGE_TOP, i * 5)
        child.setWidth(50)
        child.setHeight(50)
        root.insertChild(child, i)
      }

      root.calculateLayout(500, 500)
      root.free()
    },
    BENCH_OPTS,
  )

  bench(
    "yoga - absolute children",
    () => {
      const root = yoga.Node.create()
      root.setWidth(500)
      root.setHeight(500)

      for (let i = 0; i < N; i++) {
        const child = yoga.Node.create()
        child.setPositionType(yoga.POSITION_TYPE_ABSOLUTE)
        child.setPosition(yoga.EDGE_LEFT, i * 5)
        child.setPosition(yoga.EDGE_TOP, i * 5)
        child.setWidth(50)
        child.setHeight(50)
        root.insertChild(child, i)
      }

      root.calculateLayout(500, 500)
      root.freeRecursive()
    },
    BENCH_OPTS,
  )
})

// ============================================================================
// Feature: Nested Layouts
// ============================================================================

describe("Feature: NestedLayouts", () => {
  bench(
    "flexture - deep nesting (10 levels)",
    () => {
      const root = Node.create()
      root.setWidth(500)
      root.setHeight(500)
      root.setFlexDirection(C.FLEX_DIRECTION_COLUMN)

      let current = root
      for (let i = 0; i < 10; i++) {
        const child = Node.create()
        child.setFlexGrow(1)
        child.setPadding(C.EDGE_ALL, 5)
        current.insertChild(child, 0)
        current = child
      }

      // Add leaves at bottom
      for (let i = 0; i < 20; i++) {
        const leaf = Node.create()
        leaf.setWidth(30)
        leaf.setHeight(20)
        current.insertChild(leaf, i)
      }

      root.calculateLayout(500, 500)
      root.free()
    },
    BENCH_OPTS,
  )

  bench(
    "yoga - deep nesting (10 levels)",
    () => {
      const root = yoga.Node.create()
      root.setWidth(500)
      root.setHeight(500)
      root.setFlexDirection(yoga.FLEX_DIRECTION_COLUMN)

      let current = root
      for (let i = 0; i < 10; i++) {
        const child = yoga.Node.create()
        child.setFlexGrow(1)
        child.setPadding(yoga.EDGE_ALL, 5)
        current.insertChild(child, 0)
        current = child
      }

      for (let i = 0; i < 20; i++) {
        const leaf = yoga.Node.create()
        leaf.setWidth(30)
        leaf.setHeight(20)
        current.insertChild(leaf, i)
      }

      root.calculateLayout(500, 500)
      root.freeRecursive()
    },
    BENCH_OPTS,
  )
})

// ============================================================================
// Feature: Percent Values
// ============================================================================

describe("Feature: PercentValues", () => {
  bench(
    "flexture - percent dimensions",
    () => {
      const root = Node.create()
      root.setWidth(1000)
      root.setHeight(500)
      root.setFlexDirection(C.FLEX_DIRECTION_ROW)
      root.setFlexWrap(C.WRAP_WRAP)

      for (let i = 0; i < N; i++) {
        const child = Node.create()
        child.setWidthPercent(20) // 5 per row
        child.setHeightPercent(10) // 10% of parent
        root.insertChild(child, i)
      }

      root.calculateLayout(1000, 500)
      root.free()
    },
    BENCH_OPTS,
  )

  bench(
    "yoga - percent dimensions",
    () => {
      const root = yoga.Node.create()
      root.setWidth(1000)
      root.setHeight(500)
      root.setFlexDirection(yoga.FLEX_DIRECTION_ROW)
      root.setFlexWrap(yoga.WRAP_WRAP)

      for (let i = 0; i < N; i++) {
        const child = yoga.Node.create()
        child.setWidthPercent(20)
        child.setHeightPercent(10)
        root.insertChild(child, i)
      }

      root.calculateLayout(1000, 500)
      root.freeRecursive()
    },
    BENCH_OPTS,
  )
})

// ============================================================================
// Feature: AlignContent
// ============================================================================

describe("Feature: AlignContent", () => {
  bench(
    "flexture - alignContent space-between",
    () => {
      const root = Node.create()
      root.setWidth(200)
      root.setHeight(400)
      root.setFlexDirection(C.FLEX_DIRECTION_ROW)
      root.setFlexWrap(C.WRAP_WRAP)
      root.setAlignContent(C.ALIGN_SPACE_BETWEEN)

      for (let i = 0; i < N; i++) {
        const child = Node.create()
        child.setWidth(50)
        child.setHeight(30)
        root.insertChild(child, i)
      }

      root.calculateLayout(200, 400)
      root.free()
    },
    BENCH_OPTS,
  )

  bench(
    "yoga - alignContent space-between",
    () => {
      const root = yoga.Node.create()
      root.setWidth(200)
      root.setHeight(400)
      root.setFlexDirection(yoga.FLEX_DIRECTION_ROW)
      root.setFlexWrap(yoga.WRAP_WRAP)
      root.setAlignContent(yoga.ALIGN_SPACE_BETWEEN)

      for (let i = 0; i < N; i++) {
        const child = yoga.Node.create()
        child.setWidth(50)
        child.setHeight(30)
        root.insertChild(child, i)
      }

      root.calculateLayout(200, 400)
      root.freeRecursive()
    },
    BENCH_OPTS,
  )
})

// ============================================================================
// Feature: MeasureFunc (Text nodes)
// ============================================================================

describe("Feature: MeasureFunc", () => {
  bench(
    "flexture - measure functions",
    () => {
      const root = Node.create()
      root.setWidth(500)
      root.setFlexDirection(C.FLEX_DIRECTION_COLUMN)

      for (let i = 0; i < N; i++) {
        const child = Node.create()
        child.setMeasureFunc((w, wm, h, hm) => ({ width: 100, height: 20 }))
        root.insertChild(child, i)
      }

      root.calculateLayout(500, undefined)
      root.free()
    },
    BENCH_OPTS,
  )

  bench(
    "yoga - measure functions",
    () => {
      const root = yoga.Node.create()
      root.setWidth(500)
      root.setFlexDirection(yoga.FLEX_DIRECTION_COLUMN)

      for (let i = 0; i < N; i++) {
        const child = yoga.Node.create()
        child.setMeasureFunc((w, wm, h, hm) => ({ width: 100, height: 20 }))
        root.insertChild(child, i)
      }

      root.calculateLayout(500, undefined)
      root.freeRecursive()
    },
    BENCH_OPTS,
  )
})
