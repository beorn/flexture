/**
 * Flexture Classic - Allocating Layout Engine
 *
 * The classic (allocating) variant of Flexture. Use for debugging, comparison,
 * or when you need reentrancy (concurrent layouts).
 *
 * The main export 'flexture' uses the faster zero-allocation algorithm.
 *
 * @example
 * ```typescript
 * import { Node, FLEX_DIRECTION_ROW, DIRECTION_LTR } from 'flexture/classic';
 *
 * const root = Node.create();
 * root.setWidth(80);
 * root.setFlexDirection(FLEX_DIRECTION_ROW);
 *
 * const child = Node.create();
 * child.setFlexGrow(1);
 * root.insertChild(child, 0);
 *
 * root.calculateLayout(80, 24, DIRECTION_LTR);
 * console.log(child.getComputedWidth()); // 80
 * ```
 */

// Node class (classic allocating variant)
export { Node } from "./classic/node.js"

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
} from "./constants.js"

// Types
export type { BaselineFunc, Layout, MeasureFunc, Style, Value } from "./types.js"

// Utility functions
export { createDefaultStyle, createValue } from "./types.js"

// Layout stats (for debugging/benchmarking)
export {
  layoutNodeCalls,
  resolveEdgeCalls,
  layoutSizingCalls,
  layoutPositioningCalls,
  layoutCacheHits,
  resetLayoutStats,
} from "./classic/layout.js"
