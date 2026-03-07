# Flexture API Reference

## Node

### Creating Nodes

```typescript
import { Node } from "@beorn/flexture"

const node = Node.create()
```

Nodes form a tree. Each node represents a flexbox container or leaf.

### Tree Operations

```typescript
node.insertChild(child, index) // Insert child at index
node.removeChild(child) // Remove child
node.getChildCount() // Number of children
node.getChild(index) // Get child by index
node.getParent() // Get parent node (or null)
```

### Dimension Setters

```typescript
node.setWidth(100) // Fixed width
node.setHeight(50) // Fixed height
node.setWidthAuto() // Auto width
node.setHeightAuto() // Auto height
node.setWidthPercent(50) // 50% of parent
node.setHeightPercent(50) // 50% of parent
node.setMinWidth(10)
node.setMinHeight(10)
node.setMaxWidth(200)
node.setMaxHeight(200)
```

### Flex Properties

```typescript
import {
  FLEX_DIRECTION_ROW,
  FLEX_DIRECTION_COLUMN,
  FLEX_DIRECTION_ROW_REVERSE,
  FLEX_DIRECTION_COLUMN_REVERSE,
  WRAP_WRAP,
  WRAP_NO_WRAP,
  JUSTIFY_CENTER,
  JUSTIFY_FLEX_START,
  JUSTIFY_FLEX_END,
  JUSTIFY_SPACE_BETWEEN,
  JUSTIFY_SPACE_AROUND,
  JUSTIFY_SPACE_EVENLY,
  ALIGN_CENTER,
  ALIGN_FLEX_START,
  ALIGN_FLEX_END,
  ALIGN_STRETCH,
  ALIGN_BASELINE,
} from "@beorn/flexture"

node.setFlexDirection(FLEX_DIRECTION_ROW)
node.setFlexWrap(WRAP_WRAP)
node.setFlexGrow(1)
node.setFlexShrink(0)
node.setFlexBasis(100)
node.setJustifyContent(JUSTIFY_CENTER)
node.setAlignItems(ALIGN_CENTER)
node.setAlignSelf(ALIGN_FLEX_END)
node.setAlignContent(ALIGN_CENTER)
```

### Spacing

```typescript
import {
  EDGE_TOP,
  EDGE_RIGHT,
  EDGE_BOTTOM,
  EDGE_LEFT,
  EDGE_ALL,
  EDGE_START,
  EDGE_END,
  GUTTER_ALL,
  GUTTER_ROW,
  GUTTER_COLUMN,
} from "@beorn/flexture"

// Padding
node.setPadding(EDGE_ALL, 10)
node.setPadding(EDGE_TOP, 5)

// Margin
node.setMargin(EDGE_ALL, 10)
node.setMarginAuto(EDGE_LEFT)

// Border
node.setBorder(EDGE_ALL, 1)

// Gap
node.setGap(GUTTER_ALL, 10)
node.setGap(GUTTER_ROW, 5)
node.setGap(GUTTER_COLUMN, 5)
```

### Positioning

```typescript
import { POSITION_TYPE_ABSOLUTE, POSITION_TYPE_RELATIVE } from "@beorn/flexture"

node.setPositionType(POSITION_TYPE_ABSOLUTE)
node.setPosition(EDGE_TOP, 10)
node.setPosition(EDGE_LEFT, 20)
```

### Aspect Ratio

```typescript
node.setAspectRatio(16 / 9)
```

### Measure Functions

For leaf nodes that measure their own content (e.g., text):

```typescript
node.setMeasureFunc((width, widthMode, height, heightMode) => {
  // widthMode: MEASURE_MODE_EXACTLY | MEASURE_MODE_AT_MOST | MEASURE_MODE_UNDEFINED
  return { width: computedWidth, height: computedHeight }
})
```

### Baseline Functions

```typescript
node.setBaselineFunc((width, height) => {
  return baselineOffset // number
})
```

### Layout Calculation

```typescript
import { DIRECTION_LTR, DIRECTION_RTL } from "@beorn/flexture"

node.calculateLayout(availableWidth, availableHeight, DIRECTION_LTR)
```

### Reading Computed Values

After `calculateLayout()`:

```typescript
node.getComputedLeft()
node.getComputedTop()
node.getComputedRight()
node.getComputedBottom()
node.getComputedWidth()
node.getComputedHeight()
node.getComputedPadding(EDGE_TOP)
node.getComputedMargin(EDGE_LEFT)
node.getComputedBorder(EDGE_ALL)
```

### Dirty Tracking

```typescript
node.isDirty() // Has this node been modified since last layout?
node.markDirty() // Force recalculation
```

### Disposal

```typescript
node.free() // Release resources
node.freeRecursive() // Free this node and all children
```

## Constants

All constants are Yoga-compatible. Import from `@beorn/flexture`:

| Category       | Constants                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direction      | `DIRECTION_LTR`, `DIRECTION_RTL`, `DIRECTION_INHERIT`                                                                                              |
| Flex Direction | `FLEX_DIRECTION_ROW`, `FLEX_DIRECTION_COLUMN`, `FLEX_DIRECTION_ROW_REVERSE`, `FLEX_DIRECTION_COLUMN_REVERSE`                                       |
| Justify        | `JUSTIFY_FLEX_START`, `JUSTIFY_CENTER`, `JUSTIFY_FLEX_END`, `JUSTIFY_SPACE_BETWEEN`, `JUSTIFY_SPACE_AROUND`, `JUSTIFY_SPACE_EVENLY`                |
| Align          | `ALIGN_FLEX_START`, `ALIGN_CENTER`, `ALIGN_FLEX_END`, `ALIGN_STRETCH`, `ALIGN_BASELINE`, `ALIGN_AUTO`, `ALIGN_SPACE_BETWEEN`, `ALIGN_SPACE_AROUND` |
| Wrap           | `WRAP_NO_WRAP`, `WRAP_WRAP`, `WRAP_WRAP_REVERSE`                                                                                                   |
| Position       | `POSITION_TYPE_STATIC`, `POSITION_TYPE_RELATIVE`, `POSITION_TYPE_ABSOLUTE`                                                                         |
| Edge           | `EDGE_LEFT`, `EDGE_TOP`, `EDGE_RIGHT`, `EDGE_BOTTOM`, `EDGE_START`, `EDGE_END`, `EDGE_HORIZONTAL`, `EDGE_VERTICAL`, `EDGE_ALL`                     |
| Gap            | `GUTTER_COLUMN`, `GUTTER_ROW`, `GUTTER_ALL`                                                                                                        |
| Measure Mode   | `MEASURE_MODE_EXACTLY`, `MEASURE_MODE_AT_MOST`, `MEASURE_MODE_UNDEFINED`                                                                           |
| Overflow       | `OVERFLOW_VISIBLE`, `OVERFLOW_HIDDEN`, `OVERFLOW_SCROLL`                                                                                           |
| Display        | `DISPLAY_FLEX`, `DISPLAY_NONE`                                                                                                                     |
