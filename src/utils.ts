/**
 * Flexily Utility Functions
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
      // UNIT_UNDEFINED, UNIT_AUTO, UNIT_FIT_CONTENT, UNIT_SNUG_CONTENT all
      // resolve to 0 here. Callers that need auto-rule semantics (CSS §4.5
      // flex-item main-axis auto min-size = content-based minimum) must
      // handle UNIT_AUTO explicitly before calling resolveValue. See
      // layout-zero.ts:587 for that special case.
      return 0
  }
}

/**
 * Apply min/max constraints to a size.
 *
 * CSS behavior:
 * - min: Floor constraint. Does NOT affect children's layout — the container expands
 *   after shrink-wrap. When size is NaN (auto-sized), min is NOT applied here;
 *   the post-shrink-wrap applyMinMax call (Phase 9) handles it.
 * - max: Ceiling constraint. DOES affect children's layout — content wraps/clips
 *   within the max. When size is NaN (auto-sized), max constrains the container
 *   so children are laid out within the max bound.
 *
 * Percent constraints that can't resolve (available is NaN) are skipped entirely,
 * since resolveValue returns 0 for percent-against-NaN, which would incorrectly
 * clamp sizes to 0.
 */
export function applyMinMax(size: number, min: Value, max: Value, available: number): number {
  let result = size

  // Apply max first, then min. CSS spec: when min > max, min wins.
  // By applying max before min, Math.max(result, minValue) ensures min dominates.

  if (max.unit !== C.UNIT_UNDEFINED) {
    // Skip percent max when available is NaN — can't resolve meaningfully
    if (max.unit === C.UNIT_PERCENT && Number.isNaN(available)) {
      // Skip: percent against NaN resolves to 0, which would be wrong
    } else {
      const maxValue = resolveValue(max, available)
      if (!Number.isNaN(maxValue)) {
        // Apply max as ceiling even when size is NaN (auto-sized).
        // This constrains children's layout to the max bound.
        // Phase 9 shrink-wrap may reduce it further; the post-shrink-wrap
        // applyMinMax call ensures max is still respected.
        if (Number.isNaN(result)) {
          // For auto-sized nodes, only apply finite max constraints.
          // Infinity means "no real constraint" (e.g., silvery sets
          // maxWidth=Infinity as default) and should not replace NaN.
          if (maxValue !== Infinity) {
            result = maxValue
          }
        } else {
          result = Math.min(result, maxValue)
        }
      }
    }
  }

  if (min.unit !== C.UNIT_UNDEFINED) {
    // Skip percent min when available is NaN — can't resolve meaningfully
    if (min.unit === C.UNIT_PERCENT && Number.isNaN(available)) {
      // Skip: percent against NaN resolves to 0, which would be wrong
    } else {
      const minValue = resolveValue(min, available)
      if (!Number.isNaN(minValue)) {
        // Only apply min to definite sizes. When size is NaN (auto-sized),
        // skip — the post-shrink-wrap applyMinMax call will floor it.
        if (!Number.isNaN(result)) {
          result = Math.max(result, minValue)
        }
      }
    }
  }

  return result
}
