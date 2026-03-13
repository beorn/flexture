/**
 * Test: Re-entrant calculateLayout corrupts global scratch state
 *
 * Bug: If a user measureFunc synchronously calls calculateLayout() on another
 * tree, the nested layout overwrites shared module-global arrays
 * (_lineCrossSizes, _lineChildren, traversalStack, etc.) while the outer
 * layout is mid-pass. This causes wrong layout in the outer pass.
 *
 * Strategy: Compare layout results with and without re-entrant calls.
 * Any difference proves corruption.
 */
import { describe, expect, it } from "vitest"
import {
  ALIGN_CENTER,
  DIRECTION_LTR,
  FLEX_DIRECTION_COLUMN,
  FLEX_DIRECTION_ROW,
  Node,
  WRAP_WRAP,
} from "../src/index.js"
import { getLayout } from "../src/testing.js"

/**
 * Build a non-trivial inner tree that exercises globals heavily.
 * Uses flex-wrap to write to _lineChildren, _lineCrossSizes, _lineCrossOffsets, etc.
 */
function buildInnerTree(): Node {
  const root = Node.create()
  root.setWidth(100)
  root.setHeight(200)
  root.setFlexDirection(FLEX_DIRECTION_ROW)
  root.setFlexWrap(WRAP_WRAP)

  // 5 children of width 40 => 2-3 lines in a 100-wide container
  for (let i = 0; i < 5; i++) {
    const child = Node.create()
    child.setWidth(40)
    child.setHeight(20 + i * 5)
    root.insertChild(child, i)
  }
  return root
}

/**
 * Build the outer tree. The measureFunc child can optionally trigger re-entrant layout.
 */
function buildOuterTree(reentrantTree: Node | null): {
  root: Node
  children: Node[]
} {
  const root = Node.create()
  root.setWidth(200)
  root.setHeight(300)
  root.setFlexDirection(FLEX_DIRECTION_ROW)
  root.setFlexWrap(WRAP_WRAP)
  // Use ALIGN_CENTER so _lineCrossOffsets[0] is non-zero
  root.setAlignContent(ALIGN_CENTER)

  const children: Node[] = []

  // child 0: 80px wide
  const child0 = Node.create()
  child0.setWidth(80)
  child0.setHeight(40)
  root.insertChild(child0, 0)
  children.push(child0)

  // child 1: measureFunc leaf — this is the corruption point
  const child1 = Node.create()
  child1.setMeasureFunc((_width: number, _widthMode: number, _height: number, _heightMode: number) => {
    if (reentrantTree) {
      // Force inner tree dirty so it actually re-layouts
      reentrantTree.markDirty()
      reentrantTree.calculateLayout(100, 200, DIRECTION_LTR)
    }
    return { width: 80, height: 40 }
  })
  root.insertChild(child1, 1)
  children.push(child1)

  // child 2: 80px wide — wraps to line 1 (80+80+80 > 200)
  const child2 = Node.create()
  child2.setWidth(80)
  child2.setHeight(40)
  root.insertChild(child2, 2)
  children.push(child2)

  // child 3: 80px wide — also on line 1
  const child3 = Node.create()
  child3.setWidth(80)
  child3.setHeight(40)
  root.insertChild(child3, 3)
  children.push(child3)

  // child 4: 80px wide — wraps to line 2
  const child4 = Node.create()
  child4.setWidth(80)
  child4.setHeight(50) // Different height to make cross sizes interesting
  root.insertChild(child4, 4)
  children.push(child4)

  return { root, children }
}

function collectLayouts(root: Node, children: Node[]) {
  return {
    root: getLayout(root),
    children: children.map((c) => getLayout(c)),
  }
}

describe("Re-entrant calculateLayout", () => {
  it("measureFunc calling calculateLayout on a separate tree must not corrupt outer layout", () => {
    // Step 1: Layout WITHOUT re-entrant call (baseline)
    const baseline = buildOuterTree(null)
    baseline.root.calculateLayout(200, 300, DIRECTION_LTR)
    const baselineLayouts = collectLayouts(baseline.root, baseline.children)

    // Step 2: Layout WITH re-entrant call
    const innerTree = buildInnerTree()
    const reentrant = buildOuterTree(innerTree)
    reentrant.root.calculateLayout(200, 300, DIRECTION_LTR)
    const reentrantLayouts = collectLayouts(reentrant.root, reentrant.children)

    // Step 3: Compare — any difference proves corruption
    expect(reentrantLayouts.root).toEqual(baselineLayouts.root)
    for (let i = 0; i < baselineLayouts.children.length; i++) {
      expect(reentrantLayouts.children[i], `child ${i} layout mismatch`).toEqual(baselineLayouts.children[i])
    }
  })

  it("re-entrant layout with column direction must not corrupt row outer tree", () => {
    // Inner tree is COLUMN direction — will use different main/cross axes
    const innerRoot = Node.create()
    innerRoot.setWidth(100)
    innerRoot.setHeight(300)
    innerRoot.setFlexDirection(FLEX_DIRECTION_COLUMN)
    innerRoot.setFlexWrap(WRAP_WRAP)
    for (let i = 0; i < 8; i++) {
      const child = Node.create()
      child.setWidth(30)
      child.setHeight(80 + i * 10)
      innerRoot.insertChild(child, i)
    }

    // Baseline: no re-entrancy
    const baseline = buildOuterTree(null)
    baseline.root.calculateLayout(200, 300, DIRECTION_LTR)
    const baselineLayouts = collectLayouts(baseline.root, baseline.children)

    // Re-entrant: measureFunc triggers column-direction wrapped layout
    const reentrant = buildOuterTree(innerRoot)
    reentrant.root.calculateLayout(200, 300, DIRECTION_LTR)
    const reentrantLayouts = collectLayouts(reentrant.root, reentrant.children)

    expect(reentrantLayouts.root).toEqual(baselineLayouts.root)
    for (let i = 0; i < baselineLayouts.children.length; i++) {
      expect(reentrantLayouts.children[i], `child ${i} layout mismatch`).toEqual(baselineLayouts.children[i])
    }
  })

  it("nested re-entrant layouts (3 levels) must not corrupt any tree", () => {
    // Level 3: deepest inner tree
    const level3 = Node.create()
    level3.setWidth(50)
    level3.setHeight(50)
    level3.setFlexDirection(FLEX_DIRECTION_ROW)
    level3.setFlexWrap(WRAP_WRAP)
    for (let i = 0; i < 4; i++) {
      const child = Node.create()
      child.setWidth(20)
      child.setHeight(15)
      level3.insertChild(child, i)
    }

    // Level 2: middle tree — its measureFunc triggers level 3 layout
    const level2 = Node.create()
    level2.setWidth(150)
    level2.setHeight(150)
    level2.setFlexDirection(FLEX_DIRECTION_ROW)
    level2.setFlexWrap(WRAP_WRAP)

    const l2child0 = Node.create()
    l2child0.setWidth(60)
    l2child0.setHeight(30)
    level2.insertChild(l2child0, 0)

    const l2child1 = Node.create()
    l2child1.setMeasureFunc(() => {
      level3.markDirty()
      level3.calculateLayout(50, 50, DIRECTION_LTR)
      return { width: 60, height: 30 }
    })
    level2.insertChild(l2child1, 1)

    const l2child2 = Node.create()
    l2child2.setWidth(60)
    l2child2.setHeight(30)
    level2.insertChild(l2child2, 2)

    // Level 1: outer tree — its measureFunc triggers level 2 layout
    const level1 = buildOuterTree(level2)

    // Baseline
    const baseline = buildOuterTree(null)
    baseline.root.calculateLayout(200, 300, DIRECTION_LTR)
    const baselineLayouts = collectLayouts(baseline.root, baseline.children)

    // Re-entrant (3 levels deep)
    level1.root.calculateLayout(200, 300, DIRECTION_LTR)
    const reentrantLayouts = collectLayouts(level1.root, level1.children)

    expect(reentrantLayouts.root).toEqual(baselineLayouts.root)
    for (let i = 0; i < baselineLayouts.children.length; i++) {
      expect(reentrantLayouts.children[i], `child ${i} layout mismatch`).toEqual(baselineLayouts.children[i])
    }
  })
})
