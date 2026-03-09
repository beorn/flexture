# Getting Started with Flexily

> **Building a terminal UI?** Use [silvery](https://silvery.dev), which uses Flexily by default. You get React components, hooks, and layout feedback without touching the low-level API below.
>
> This guide is for developers who need the Flexily API directly — framework authors, canvas renderers, or anyone replacing Yoga.

## Installation

```bash
bun add @beorn/flexily
# or
npm install @beorn/flexily
```

## Your First Layout

Create a simple row with two children:

```typescript
import { Node, FLEX_DIRECTION_ROW, DIRECTION_LTR } from "@beorn/flexily"

// Create the root node
const root = Node.create()
root.setWidth(200)
root.setHeight(100)
root.setFlexDirection(FLEX_DIRECTION_ROW)

// Add two children that split the space
const left = Node.create()
left.setFlexGrow(1)
root.insertChild(left, 0)

const right = Node.create()
right.setFlexGrow(1)
root.insertChild(right, 1)

// Calculate layout
root.calculateLayout(200, 100, DIRECTION_LTR)

// Read results
console.log(left.getComputedWidth()) // 100
console.log(right.getComputedWidth()) // 100
console.log(left.getComputedLeft()) // 0
console.log(right.getComputedLeft()) // 100

// Clean up
root.freeRecursive()
```

## Adding Spacing

Use padding, margin, and gap for spacing:

```typescript
const root = Node.create()
root.setWidth(200)
root.setFlexDirection(FLEX_DIRECTION_ROW)
root.setPadding(EDGE_ALL, 10) // 10px padding on all sides
root.setGap(GAP_COLUMN, 8) // 8px gap between columns

const a = Node.create()
a.setFlexGrow(1)
root.insertChild(a, 0)

const b = Node.create()
b.setFlexGrow(1)
root.insertChild(b, 1)

root.calculateLayout(200, undefined, DIRECTION_LTR)

// Children are inside padding, separated by gap
console.log(a.getComputedLeft()) // 10
console.log(a.getComputedWidth()) // 86  (200 - 20 padding - 8 gap) / 2
console.log(b.getComputedLeft()) // 104 (10 + 86 + 8)
```

## Nested Layouts

Build complex layouts by nesting nodes:

```typescript
const root = Node.create()
root.setWidth(300)
root.setHeight(200)
root.setFlexDirection(FLEX_DIRECTION_ROW)

// Sidebar (fixed width)
const sidebar = Node.create()
sidebar.setWidth(80)
root.insertChild(sidebar, 0)

// Main content (fills remaining space)
const main = Node.create()
main.setFlexGrow(1)
main.setFlexDirection(FLEX_DIRECTION_COLUMN)
root.insertChild(main, 1)

// Header (fixed height)
const header = Node.create()
header.setHeight(30)
main.insertChild(header, 0)

// Body (fills remaining space)
const body = Node.create()
body.setFlexGrow(1)
main.insertChild(body, 1)

root.calculateLayout(300, 200, DIRECTION_LTR)

console.log(sidebar.getComputedWidth()) // 80
console.log(main.getComputedWidth()) // 220
console.log(header.getComputedHeight()) // 30
console.log(body.getComputedHeight()) // 170
```

## Measure Functions

For nodes that size based on content (like text), use measure functions:

```typescript
const root = Node.create()
root.setWidth(200)
root.setFlexDirection(FLEX_DIRECTION_ROW)

const textNode = Node.create()
textNode.setMeasureFunc((width, widthMode, height, heightMode) => {
  const text = "Hello, World!"
  const charWidth = 8 // assume 8px per character
  const lineHeight = 16

  if (widthMode === MEASURE_MODE_EXACTLY) {
    // Wrap text to fit exact width
    const charsPerLine = Math.floor(width / charWidth)
    const lines = Math.ceil(text.length / charsPerLine)
    return { width, height: lines * lineHeight }
  }

  // Measure natural size
  return { width: text.length * charWidth, height: lineHeight }
})

root.insertChild(textNode, 0)
root.calculateLayout(200, undefined, DIRECTION_LTR)
```

## Dirty Tracking

Flexily tracks which nodes have changed, so relayout only recalculates what's needed:

```typescript
root.calculateLayout(200, 100, DIRECTION_LTR) // Full calculation

// Modify one node
left.setWidth(50)
console.log(left.isDirty()) // true

root.calculateLayout(200, 100, DIRECTION_LTR) // Only recalculates dirty subtree
```

## Cleanup

Always free nodes when done:

```typescript
// Free entire tree
root.freeRecursive()

// Or free individual nodes (must remove children first)
root.removeChild(child)
child.free()
root.free()
```

## Next Steps

- [API Reference](api.md) -- Complete API documentation
- [Algorithm](algorithm.md) -- How the layout algorithm works
- [Performance](performance.md) -- Benchmarks and methodology
- [Yoga Comparison](yoga-comparison.md) -- Feature comparison with Yoga
