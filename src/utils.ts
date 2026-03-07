/**
 * Flexture Utility Functions
 *
 * Helper functions for edge value manipulation and value resolution.
 */

import * as C from "./constants.js"
import type { Value } from "./types.js"

// ============================================================================
// Shared Traversal Stack
// ============================================================================
// Pre-allocated stack array for iterative tree traversal. Shared across all
// layout functions to avoid multiple allocations. Using a single stack is safe
// because layout operations are synchronous (no concurrent traversals).

/**
 * Shared traversal stack for iterative tree operations.
 * Avoids recursion (prevents stack overflow on deep trees) and avoids
 * allocation during layout passes.
 */
export const traversalStack: unknown[] = []

/**
 * Set a value on an edge array (supports all edge types including logical START/END).
 */
export function setEdgeValue(
  arr: [Value, Value, Value, Value, Value, Value],
  edge: number,
  value: number,
  unit: number,
): void {
  const v = { value, unit }
  switch (edge) {
    case C.EDGE_LEFT:
      arr[0] = v
      break
    case C.EDGE_TOP:
      arr[1] = v
      break
    case C.EDGE_RIGHT:
      arr[2] = v
      break
    case C.EDGE_BOTTOM:
      arr[3] = v
      break
    case C.EDGE_HORIZONTAL:
      arr[0] = v
      arr[2] = v
      break
    case C.EDGE_VERTICAL:
      arr[1] = v
      arr[3] = v
      break
    case C.EDGE_ALL:
      arr[0] = v
      arr[1] = v
      arr[2] = v
      arr[3] = v
      break
    case C.EDGE_START:
      // Store in logical START slot (resolved to physical at layout time)
      arr[4] = v
      break
    case C.EDGE_END:
      // Store in logical END slot (resolved to physical at layout time)
      arr[5] = v
      break
  }
}

/**
 * Set a border value on an edge array.
 */
export function setEdgeBorder(
  arr: [number, number, number, number, number, number],
  edge: number,
  value: number,
): void {
  switch (edge) {
    case C.EDGE_LEFT:
      arr[0] = value
      break
    case C.EDGE_TOP:
      arr[1] = value
      break
    case C.EDGE_RIGHT:
      arr[2] = value
      break
    case C.EDGE_BOTTOM:
      arr[3] = value
      break
    case C.EDGE_HORIZONTAL:
      arr[0] = value
      arr[2] = value
      break
    case C.EDGE_VERTICAL:
      arr[1] = value
      arr[3] = value
      break
    case C.EDGE_ALL:
      arr[0] = value
      arr[1] = value
      arr[2] = value
      arr[3] = value
      break
    case C.EDGE_START:
      // Store in logical START slot (resolved to physical at layout time)
      arr[4] = value
      break
    case C.EDGE_END:
      // Store in logical END slot (resolved to physical at layout time)
      arr[5] = value
      break
  }
}

/**
 * Get a value from an edge array.
 */
export function getEdgeValue(arr: [Value, Value, Value, Value, Value, Value], edge: number): Value {
  switch (edge) {
    case C.EDGE_LEFT:
      return arr[0]
    case C.EDGE_TOP:
      return arr[1]
    case C.EDGE_RIGHT:
      return arr[2]
    case C.EDGE_BOTTOM:
      return arr[3]
    case C.EDGE_START:
      return arr[4]
    case C.EDGE_END:
      return arr[5]
    default:
      return arr[0] // Default to left
  }
}

/**
 * Get a border value from an edge array.
 */
export function getEdgeBorderValue(arr: [number, number, number, number, number, number], edge: number): number {
  switch (edge) {
    case C.EDGE_LEFT:
      return arr[0]
    case C.EDGE_TOP:
      return arr[1]
    case C.EDGE_RIGHT:
      return arr[2]
    case C.EDGE_BOTTOM:
      return arr[3]
    case C.EDGE_START:
      return arr[4]
    case C.EDGE_END:
      return arr[5]
    default:
      return arr[0] // Default to left
  }
}

/**
 * Resolve a value (point or percent) to an absolute number.
 */
export function resolveValue(value: Value, availableSize: number): number {
  switch (value.unit) {
    case C.UNIT_POINT:
      return value.value
    case C.UNIT_PERCENT:
      // Percentage against NaN (auto-sized parent) resolves to 0
      if (Number.isNaN(availableSize)) {
        return 0
      }
      return availableSize * (value.value / 100)
    default:
      return 0
  }
}

/**
 * Apply min/max constraints to a size.
 *
 * When size is NaN (auto-sized), min constraints establish a floor.
 * This handles the case where a parent has minWidth/maxWidth but no explicit width -
 * children need to resolve percentages against the constrained size.
 */
export function applyMinMax(size: number, min: Value, max: Value, available: number): number {
  let result = size

  if (min.unit !== C.UNIT_UNDEFINED) {
    const minValue = resolveValue(min, available)
    // Only apply if minValue is valid (not NaN from percent with NaN available)
    if (!Number.isNaN(minValue)) {
      // When size is NaN (auto-sized), min establishes the floor
      if (Number.isNaN(result)) {
        result = minValue
      } else {
        result = Math.max(result, minValue)
      }
    }
  }

  if (max.unit !== C.UNIT_UNDEFINED) {
    const maxValue = resolveValue(max, available)
    // Only apply if maxValue is valid (not NaN from percent with NaN available)
    if (!Number.isNaN(maxValue)) {
      // When size is NaN (auto-sized), max alone doesn't set the size
      // (the element should shrink-wrap to content, then be capped by max)
      // Only apply max if we have a concrete size to constrain
      if (!Number.isNaN(result)) {
        result = Math.min(result, maxValue)
      }
    }
  }

  return result
}
