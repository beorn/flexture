/**
 * Flexture Classic vs Zero-Alloc Algorithm Comparison
 *
 * Compares layout performance between:
 * - Classic algorithm (layout.ts)
 * - Zero-allocation algorithm (layout-zero.ts)
 *
 * Run: bun bench bench/classic-vs-zero.bench.ts
 */

import { bench, describe, beforeAll } from "vitest"
import * as Classic from "../src/index.js"
import * as Zero from "../src/index.js"

// ============================================================================
// Tree Generators
// ============================================================================

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

// ============================================================================
// Benchmarks - Flat Hierarchy
// ============================================================================

describe("Classic vs Zero - Flat Hierarchy", () => {
  for (const nodeCount of [100, 500, 1000]) {
    bench(`Classic: ${nodeCount} nodes - create + layout`, () => {
      const tree = createFlatTree("classic", nodeCount)
      tree.calculateLayout(1000, 1000, Classic.DIRECTION_LTR)
    })

    bench(`Zero: ${nodeCount} nodes - create + layout`, () => {
      const tree = createFlatTree("zero", nodeCount)
      tree.calculateLayout(1000, 1000, Zero.DIRECTION_LTR)
    })
  }
})

// ============================================================================
// Benchmarks - Deep Hierarchy
// ============================================================================

describe("Classic vs Zero - Deep Hierarchy", () => {
  for (const depth of [20, 50, 100]) {
    bench(`Classic: ${depth} levels deep - create + layout`, () => {
      const tree = createDeepTree("classic", depth)
      tree.calculateLayout(1000, 1000, Classic.DIRECTION_LTR)
    })

    bench(`Zero: ${depth} levels deep - create + layout`, () => {
      const tree = createDeepTree("zero", depth)
      tree.calculateLayout(1000, 1000, Zero.DIRECTION_LTR)
    })
  }
})

// ============================================================================
// Benchmarks - TUI Patterns
// ============================================================================

describe("Classic vs Zero - Kanban TUI", () => {
  for (const cardsPerCol of [10, 50, 100]) {
    const totalNodes = 3 + 3 * (1 + cardsPerCol)

    bench(`Classic: Kanban 3×${cardsPerCol} (~${totalNodes} nodes)`, () => {
      const tree = createKanbanTree("classic", cardsPerCol)
      tree.calculateLayout(120, 40, Classic.DIRECTION_LTR)
    })

    bench(`Zero: Kanban 3×${cardsPerCol} (~${totalNodes} nodes)`, () => {
      const tree = createKanbanTree("zero", cardsPerCol)
      tree.calculateLayout(120, 40, Zero.DIRECTION_LTR)
    })
  }
})

// ============================================================================
// Benchmarks - Layout Only (pre-created trees)
// ============================================================================

describe("Classic vs Zero - Layout Only (no allocation)", () => {
  let classicTree: Classic.Node
  let zeroTree: Zero.Node

  beforeAll(() => {
    classicTree = createKanbanTree("classic", 50) as Classic.Node
    zeroTree = createKanbanTree("zero", 50) as Zero.Node
  })

  bench("Classic: Kanban 3×50 - layout only", () => {
    classicTree.markDirty()
    classicTree.calculateLayout(120, 40, Classic.DIRECTION_LTR)
  })

  bench("Zero: Kanban 3×50 - layout only", () => {
    zeroTree.markDirty()
    zeroTree.calculateLayout(120, 40, Zero.DIRECTION_LTR)
  })
})

// ============================================================================
// Benchmarks - Incremental Update
// ============================================================================

describe("Classic vs Zero - Incremental Update", () => {
  let classicTree: Classic.Node
  let classicLeaf: Classic.Node
  let zeroTree: Zero.Node
  let zeroLeaf: Zero.Node

  beforeAll(() => {
    classicTree = createKanbanTree("classic", 100) as Classic.Node
    zeroTree = createKanbanTree("zero", 100) as Zero.Node

    classicLeaf = classicTree.getChild(1)!.getChild(50)!
    zeroLeaf = zeroTree.getChild(1)!.getChild(50)! as Zero.Node

    classicTree.calculateLayout(120, 40, Classic.DIRECTION_LTR)
    zeroTree.calculateLayout(120, 40, Zero.DIRECTION_LTR)
  })

  bench("Classic: Single leaf dirty - relayout", () => {
    classicLeaf.markDirty()
    classicTree.calculateLayout(120, 40, Classic.DIRECTION_LTR)
  })

  bench("Zero: Single leaf dirty - relayout", () => {
    zeroLeaf.markDirty()
    zeroTree.calculateLayout(120, 40, Zero.DIRECTION_LTR)
  })
})

// ============================================================================
// Benchmarks - Large Scale TUI
// ============================================================================

describe("Classic vs Zero - Large Scale TUI", () => {
  function createLargeTUI(engine: "classic" | "zero", nodeCount: number): Classic.Node | Zero.Node {
    const Node = engine === "classic" ? Classic.Node : Zero.Node
    const FLEX_DIRECTION_ROW = engine === "classic" ? Classic.FLEX_DIRECTION_ROW : Zero.FLEX_DIRECTION_ROW
    const FLEX_DIRECTION_COLUMN = engine === "classic" ? Classic.FLEX_DIRECTION_COLUMN : Zero.FLEX_DIRECTION_COLUMN
    const GUTTER_ALL = engine === "classic" ? Classic.GUTTER_ALL : Zero.GUTTER_ALL

    const cols = 8
    const itemsPerCol = Math.floor(nodeCount / cols / 3)

    const root = Node.create()
    root.setWidth(250)
    root.setHeight(120)
    root.setFlexDirection(FLEX_DIRECTION_ROW)
    root.setGap(GUTTER_ALL, 1)

    for (let c = 0; c < cols; c++) {
      const col = Node.create()
      col.setFlexGrow(1)
      col.setFlexDirection(FLEX_DIRECTION_COLUMN)

      for (let i = 0; i < itemsPerCol; i++) {
        const item = Node.create()
        item.setFlexDirection(FLEX_DIRECTION_ROW)
        item.setHeight(1)

        const icon = Node.create()
        icon.setWidth(2)
        item.insertChild(icon, 0)

        const text = Node.create()
        text.setFlexGrow(1)
        item.insertChild(text, 1)

        col.insertChild(item, i)
      }
      root.insertChild(col, c)
    }
    return root
  }

  for (const nodeCount of [500, 1000, 1500, 2000]) {
    bench(`Classic: Large TUI ~${nodeCount} nodes`, () => {
      const tree = createLargeTUI("classic", nodeCount)
      tree.calculateLayout(250, 120, Classic.DIRECTION_LTR)
    })

    bench(`Zero: Large TUI ~${nodeCount} nodes`, () => {
      const tree = createLargeTUI("zero", nodeCount)
      tree.calculateLayout(250, 120, Zero.DIRECTION_LTR)
    })
  }
})
