/**
 * Flexture Layout Benchmarks
 *
 * Methodology (following Taffy's approach):
 * - Isolate layout computation from tree creation
 * - Test at terminal-relevant scales (100-1000 nodes)
 * - Document hardware for reproducibility
 *
 * Run: bun run bench
 *
 * Hardware: [Document your machine here when reporting results]
 */

import { bench, describe, beforeAll } from "vitest"
import {
  Node,
  FLEX_DIRECTION_ROW,
  FLEX_DIRECTION_COLUMN,
  DIRECTION_LTR,
  JUSTIFY_SPACE_BETWEEN,
  ALIGN_CENTER,
  GUTTER_ALL,
} from "../src/index.js"

// ============================================================================
// Test Case Generators (Yoga-compatible structures)
// ============================================================================

/**
 * Flat hierarchy - all children direct descendants of root
 * Common in simple list UIs
 */
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

/**
 * Deep hierarchy - single chain of nodes
 * Stress test for tree traversal
 */
function createDeepTree(depth: number): Node {
  const root = Node.create()
  root.setWidth(1000)
  root.setHeight(1000)

  let current = root
  for (let i = 0; i < depth; i++) {
    const child = Node.create()
    child.setFlexGrow(1)
    child.setPadding(0, 1) // EDGE_LEFT
    current.insertChild(child, 0)
    current = child
  }

  return root
}

/**
 * Kanban board - typical terminal TUI structure
 * 3 columns with N cards each
 */
function createKanbanTree(cardsPerColumn: number): Node {
  const root = Node.create()
  root.setWidth(120) // Terminal width
  root.setHeight(40) // Terminal height
  root.setFlexDirection(FLEX_DIRECTION_ROW)
  root.setGap(GUTTER_ALL, 1)

  for (let col = 0; col < 3; col++) {
    const column = Node.create()
    column.setFlexGrow(1)
    column.setFlexDirection(FLEX_DIRECTION_COLUMN)
    column.setGap(GUTTER_ALL, 1)

    // Header
    const header = Node.create()
    header.setHeight(1)
    column.insertChild(header, 0)

    // Cards
    for (let card = 0; card < cardsPerColumn; card++) {
      const cardNode = Node.create()
      cardNode.setHeight(3)
      cardNode.setPadding(0, 1) // EDGE_LEFT
      column.insertChild(cardNode, card + 1)
    }

    root.insertChild(column, col)
  }

  return root
}

/**
 * Dashboard - mixed fixed and flex items
 * Typical app layout pattern
 */
function createDashboardTree(): Node {
  const root = Node.create()
  root.setWidth(120)
  root.setHeight(40)
  root.setFlexDirection(FLEX_DIRECTION_COLUMN)

  // Header (fixed)
  const header = Node.create()
  header.setHeight(1)
  root.insertChild(header, 0)

  // Main content (flex row)
  const main = Node.create()
  main.setFlexGrow(1)
  main.setFlexDirection(FLEX_DIRECTION_ROW)
  main.setGap(GUTTER_ALL, 1)

  // Sidebar (fixed width)
  const sidebar = Node.create()
  sidebar.setWidth(20)
  main.insertChild(sidebar, 0)

  // Content area (flex)
  const content = Node.create()
  content.setFlexGrow(1)
  content.setFlexDirection(FLEX_DIRECTION_COLUMN)

  // Add some widgets
  for (let i = 0; i < 5; i++) {
    const widget = Node.create()
    widget.setFlexGrow(1)
    widget.setJustifyContent(JUSTIFY_SPACE_BETWEEN)
    widget.setAlignItems(ALIGN_CENTER)
    content.insertChild(widget, i)
  }

  main.insertChild(content, 1)
  root.insertChild(main, 1)

  // Footer (fixed)
  const footer = Node.create()
  footer.setHeight(1)
  root.insertChild(footer, 2)

  return root
}

// ============================================================================
// Benchmarks
// ============================================================================

describe("Flexture Layout Benchmarks", () => {
  describe("Flat Hierarchy (list-like)", () => {
    let tree100: Node
    let tree500: Node
    let tree1000: Node

    beforeAll(() => {
      tree100 = createFlatTree(100)
      tree500 = createFlatTree(500)
      tree1000 = createFlatTree(1000)
    })

    bench("100 nodes - layout only", () => {
      tree100.markDirty()
      tree100.calculateLayout(1000, 1000, DIRECTION_LTR)
    })

    bench("500 nodes - layout only", () => {
      tree500.markDirty()
      tree500.calculateLayout(1000, 1000, DIRECTION_LTR)
    })

    bench("1000 nodes - layout only", () => {
      tree1000.markDirty()
      tree1000.calculateLayout(1000, 1000, DIRECTION_LTR)
    })

    bench("100 nodes - create + layout", () => {
      const tree = createFlatTree(100)
      tree.calculateLayout(1000, 1000, DIRECTION_LTR)
    })
  })

  describe("Deep Hierarchy (nested containers)", () => {
    let tree50: Node
    let tree100: Node
    let tree200: Node

    beforeAll(() => {
      tree50 = createDeepTree(50)
      tree100 = createDeepTree(100)
      tree200 = createDeepTree(200)
    })

    bench("50 levels deep - layout only", () => {
      tree50.markDirty()
      tree50.calculateLayout(1000, 1000, DIRECTION_LTR)
    })

    bench("100 levels deep - layout only", () => {
      tree100.markDirty()
      tree100.calculateLayout(1000, 1000, DIRECTION_LTR)
    })

    bench("200 levels deep - layout only", () => {
      tree200.markDirty()
      tree200.calculateLayout(1000, 1000, DIRECTION_LTR)
    })
  })

  describe("Terminal TUI Patterns", () => {
    let kanban10: Node
    let kanban50: Node
    let kanban100: Node
    let dashboard: Node

    beforeAll(() => {
      kanban10 = createKanbanTree(10) // 30 cards total
      kanban50 = createKanbanTree(50) // 150 cards total
      kanban100 = createKanbanTree(100) // 300 cards total
      dashboard = createDashboardTree()
    })

    bench("Kanban 3x10 (30 cards) - layout only", () => {
      kanban10.markDirty()
      kanban10.calculateLayout(120, 40, DIRECTION_LTR)
    })

    bench("Kanban 3x50 (150 cards) - layout only", () => {
      kanban50.markDirty()
      kanban50.calculateLayout(120, 40, DIRECTION_LTR)
    })

    bench("Kanban 3x100 (300 cards) - layout only", () => {
      kanban100.markDirty()
      kanban100.calculateLayout(120, 40, DIRECTION_LTR)
    })

    bench("Dashboard layout - layout only", () => {
      dashboard.markDirty()
      dashboard.calculateLayout(120, 40, DIRECTION_LTR)
    })

    bench("Kanban 3x50 - create + layout", () => {
      const tree = createKanbanTree(50)
      tree.calculateLayout(120, 40, DIRECTION_LTR)
    })
  })

  describe("Incremental Layout (dirty tracking)", () => {
    let tree: Node

    beforeAll(() => {
      tree = createKanbanTree(50)
      tree.calculateLayout(120, 40, DIRECTION_LTR)
    })

    bench("Re-layout unchanged tree (should skip)", () => {
      // Tree is clean, should be fast
      tree.calculateLayout(120, 40, DIRECTION_LTR)
    })

    bench("Re-layout after single property change", () => {
      // Mark a single node dirty
      const col = tree.getChild(0)
      if (col) {
        col.setWidth(35) // Change triggers dirty
        tree.calculateLayout(120, 40, DIRECTION_LTR)
        col.setWidth(40) // Reset for next iteration
      }
    })
  })
})
