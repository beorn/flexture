/**
 * Flexily - Pure JavaScript Flexbox Layout Engine
 *
 * A Yoga-compatible layout engine for terminal UIs and other environments
 * where WebAssembly is not available or desirable.
 *
 * Two API levels:
 *
 * 1. Composable (recommended):
 * ```typescript
 * import { createFlexily } from "flexily"
 * const flex = createFlexily()
 * const node = flex.createNode()
 * node.setTextContent("Hello world")
 * flex.calculateLayout(node, 80, 24)
 * ```
 *
 * 2. Low-level (Yoga-compatible):
 * ```typescript
 * import { Node, DIRECTION_LTR } from "flexily"
 * const root = Node.create()
 * root.setWidth(80)
 * root.calculateLayout(80, 24, DIRECTION_LTR)
 * ```
 */

// Composable API
export { createFlexily, createBareFlexily, pipe } from "./create-flexily.js"
export type { FlexilyEngine, FlexilyNode, FlexilyPlugin } from "./create-flexily.js"

// Text measurement plugins
export { createMonospaceMeasurer, withMonospace } from "./monospace-measurer.js"
export { createTestMeasurer, withTestMeasurer } from "./test-measurer.js"
export { createPretextMeasurer, withPretext } from "./pretext-measurer.js"
export type { PretextAPI, PretextPrepared, PretextLayout } from "./pretext-measurer.js"

// Text layout service types
export type {
  TextLayoutService,
  PreparedText,
  TextLayout,
  TextLine,
  TextConstraints,
  IntrinsicSizes,
  ResolvedTextStyle,
  TextPrepareInput,
} from "./text-layout.js"

// Node class (zero-alloc version) — low-level Yoga-compatible API
export { Node } from "./node-zero.js"

// All constants (Yoga-compatible)
export {
  // Flex Direction
  FLEX_DIRECTION_COLUMN,
  FLEX_DIRECTION_COLUMN_REVERSE,
  FLEX_DIRECTION_ROW,
  FLEX_DIRECTION_ROW_REVERSE,
  // Wrap
  WRAP_NO_WRAP,
  WRAP_WRAP,
  WRAP_WRAP_REVERSE,
  // Align
  ALIGN_AUTO,
  ALIGN_FLEX_START,
  ALIGN_CENTER,
  ALIGN_FLEX_END,
  ALIGN_STRETCH,
  ALIGN_BASELINE,
  ALIGN_SPACE_BETWEEN,
  ALIGN_SPACE_AROUND,
  ALIGN_SPACE_EVENLY,
  // Justify
  JUSTIFY_FLEX_START,
  JUSTIFY_CENTER,
  JUSTIFY_FLEX_END,
  JUSTIFY_SPACE_BETWEEN,
  JUSTIFY_SPACE_AROUND,
  JUSTIFY_SPACE_EVENLY,
  // Edge
  EDGE_LEFT,
  EDGE_TOP,
  EDGE_RIGHT,
  EDGE_BOTTOM,
  EDGE_START,
  EDGE_END,
  EDGE_HORIZONTAL,
  EDGE_VERTICAL,
  EDGE_ALL,
  // Gutter
  GUTTER_COLUMN,
  GUTTER_ROW,
  GUTTER_ALL,
  // Display
  DISPLAY_FLEX,
  DISPLAY_NONE,
  // Position Type
  POSITION_TYPE_STATIC,
  POSITION_TYPE_RELATIVE,
  POSITION_TYPE_ABSOLUTE,
  // Overflow
  OVERFLOW_VISIBLE,
  OVERFLOW_HIDDEN,
  OVERFLOW_SCROLL,
  // Direction
  DIRECTION_INHERIT,
  DIRECTION_LTR,
  DIRECTION_RTL,
  // Measure Mode
  MEASURE_MODE_UNDEFINED,
  MEASURE_MODE_EXACTLY,
  MEASURE_MODE_AT_MOST,
  // Unit (internal, but exported for advanced use)
  UNIT_UNDEFINED,
  UNIT_POINT,
  UNIT_PERCENT,
  UNIT_AUTO,
  UNIT_FIT_CONTENT,
  UNIT_SNUG_CONTENT,
} from "./constants.js"

// Types
export type { BaselineFunc, Layout, MeasureFunc, Style, Value } from "./types.js"

// Utility functions
export { createDefaultStyle, createValue } from "./types.js"

// Layout stats (for debugging/benchmarking)
export {
  layoutNodeCalls,
  layoutSizingCalls,
  layoutPositioningCalls,
  layoutCacheHits,
  resetLayoutStats,
} from "./layout-zero.js"
