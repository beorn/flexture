/**
 * Flex Line Breaking and Space Distribution
 *
 * Pre-allocated arrays for zero-allocation flex-wrap layout,
 * plus the line-breaking and flex-distribution algorithms.
 *
 * Re-entrancy: A user measureFunc or baselineFunc may synchronously call
 * calculateLayout() on a separate tree. saveLineState/restoreLineState
 * bracket such nested calls to protect the outer pass's scratch arrays.
 */

import * as C from "./constants.js"
import type { Node } from "./node-zero.js"

// ============================================================================
// Pre-allocated Arrays for Zero-Allocation Layout
// ============================================================================
//
// These module-level typed arrays enable zero-allocation flex-wrap layout.
// They store per-line metrics that would otherwise require FlexLine[] allocation.
//
// Trade-offs:
// - Pro: No heap allocation during layout passes (eliminates GC pressure)
// - Pro: Cache-friendly contiguous memory access
// - Con: Fixed maximum lines (grows dynamically if exceeded, rare allocation)
// - Con: Not reentrant (single layout calculation at a time)
//
// Memory usage: ~768 bytes total (32 lines x 8 bytes x 2 + 32 x 2 bytes)

/**
 * Maximum number of flex lines supported without dynamic allocation.
 * If a layout exceeds this, arrays grow automatically (rare edge case).
 * 32 lines covers virtually all real-world layouts while using minimal memory.
 */
export let MAX_FLEX_LINES = 32

/**
 * Pre-allocated array for line cross sizes (reused across layout passes).
 * Stores the computed cross-axis size of each flex line.
 */
export let _lineCrossSizes = new Float64Array(MAX_FLEX_LINES)

/**
 * Pre-allocated array for line cross offsets (reused across layout passes).
 * Stores the cross-axis position offset for each flex line.
 */
export let _lineCrossOffsets = new Float64Array(MAX_FLEX_LINES)

/**
 * Pre-allocated array for line lengths (number of children per line).
 * Uint16 supports up to 65535 children per line (more than sufficient).
 */
export let _lineLengths = new Uint16Array(MAX_FLEX_LINES)

/**
 * Pre-allocated 2D array for children per line.
 * Avoids O(n*m) iteration when processing multi-line flex layouts.
 * Each slot holds array of Node references for that line.
 */
export let _lineChildren: Node[][] = Array.from({ length: MAX_FLEX_LINES }, () => [])

/**
 * Pre-allocated array for per-line justify-content start offsets.
 * Stores the main-axis starting position for each flex line.
 */
export let _lineJustifyStarts = new Float64Array(MAX_FLEX_LINES)

/**
 * Pre-allocated array for per-line item spacing (justify-content gaps).
 * Stores the spacing between items for each flex line.
 */
export let _lineItemSpacings = new Float64Array(MAX_FLEX_LINES)

/**
 * Grow pre-allocated line arrays if needed.
 * Called when a layout has more lines than current capacity.
 * This is rare (>32 lines) and acceptable as a one-time allocation.
 */
export function growLineArrays(needed: number): void {
  const newSize = Math.max(needed, MAX_FLEX_LINES * 2)
  MAX_FLEX_LINES = newSize
  _lineCrossSizes = new Float64Array(newSize)
  _lineCrossOffsets = new Float64Array(newSize)
  _lineLengths = new Uint16Array(newSize)
  _lineJustifyStarts = new Float64Array(newSize)
  _lineItemSpacings = new Float64Array(newSize)
  // Grow _lineChildren array
  while (_lineChildren.length < newSize) {
    _lineChildren.push([])
  }
}

// ============================================================================
// Re-entrancy Support
// ============================================================================
// When a measureFunc/baselineFunc synchronously calls calculateLayout() on
// another tree, we must save and restore the module-level scratch arrays so
// the outer pass resumes with its own data intact.

/**
 * Saved snapshot of all module-level line arrays.
 * Allocated only on re-entrant calls (depth > 0).
 */
export interface LineStateSave {
  crossSizes: Float64Array<ArrayBuffer>
  crossOffsets: Float64Array<ArrayBuffer>
  lengths: Uint16Array<ArrayBuffer>
  justifyStarts: Float64Array<ArrayBuffer>
  itemSpacings: Float64Array<ArrayBuffer>
  children: Node[][]
  maxLines: number
}

/** Current re-entrancy depth. 0 = outermost (no save needed). */
let _layoutDepth = 0

/**
 * Enter a layout pass. If re-entrant (depth > 0), saves current line state.
 * @returns The saved state (to pass to restoreLineState), or null at depth 0.
 */
export function enterLayout(): LineStateSave | null {
  const depth = _layoutDepth++
  if (depth === 0) return null // Outermost — no save needed

  // Save current state (allocates only on re-entrant calls — rare)
  const saved: LineStateSave = {
    crossSizes: _lineCrossSizes.slice(),
    crossOffsets: _lineCrossOffsets.slice(),
    lengths: _lineLengths.slice(),
    justifyStarts: _lineJustifyStarts.slice(),
    itemSpacings: _lineItemSpacings.slice(),
    children: _lineChildren.map((arr) => arr.slice()),
    maxLines: MAX_FLEX_LINES,
  }
  return saved
}

/**
 * Exit a layout pass. If re-entrant, restores saved line state.
 * @param saved - The state returned by enterLayout (null at depth 0).
 */
export function exitLayout(saved: LineStateSave | null): void {
  _layoutDepth--
  if (!saved) return // Outermost — nothing to restore

  // Restore saved state
  MAX_FLEX_LINES = saved.maxLines
  _lineCrossSizes = saved.crossSizes
  _lineCrossOffsets = saved.crossOffsets
  _lineLengths = saved.lengths
  _lineJustifyStarts = saved.justifyStarts
  _lineItemSpacings = saved.itemSpacings
  _lineChildren = saved.children
}

/**
 * Epsilon value for floating point comparisons in flex distribution.
 * Used to determine when remaining space is negligible and iteration should stop.
 */
const EPSILON_FLOAT = 0.001

/**
 * Break children into flex lines based on available main-axis space.
 * Zero-allocation: Sets child.flex.lineIndex directly, uses pre-allocated _lineStarts/_lineLengths.
 *
 * @param parent - Parent node whose children to wrap
 * @param relativeCount - Number of relative children (those with flex.relativeIndex >= 0)
 * @param mainAxisSize - Available main-axis space (NaN for unconstrained)
 * @param mainGap - Gap between items on main axis
 * @param wrap - Wrap mode (WRAP_NO_WRAP, WRAP_WRAP, WRAP_WRAP_REVERSE)
 * @returns Number of lines created
 */
export function breakIntoLines(
  parent: Node,
  relativeCount: number,
  mainAxisSize: number,
  mainGap: number,
  wrap: number,
): number {
  // No wrapping or unconstrained - all children on one line
  if (wrap === C.WRAP_NO_WRAP || Number.isNaN(mainAxisSize) || relativeCount === 0) {
    // All relative children on line 0, populate _lineChildren for O(n) access
    // Use index-based assignment to avoid push() backing store growth
    const lineArr = _lineChildren[0]!
    let idx = 0
    for (const child of parent.children) {
      if (child.flex.relativeIndex >= 0) {
        child.flex.lineIndex = 0
        lineArr[idx++] = child
      }
    }
    lineArr.length = idx // Trim to actual size
    _lineLengths[0] = relativeCount
    _lineCrossSizes[0] = 0
    _lineCrossOffsets[0] = 0
    return 1
  }

  let lineIndex = 0
  let lineMainSize = 0
  let lineChildCount = 0
  let lineChildIdx = 0 // Index within current line array

  for (const child of parent.children) {
    if (child.flex.relativeIndex < 0) continue

    const flex = child.flex
    // CSS spec 9.3.4: line breaking uses the "hypothetical main size" which is
    // the flex base size clamped to min/max, not the unclamped base size.
    const hypotheticalMainSize = Math.max(flex.minMain, Math.min(flex.maxMain, flex.baseSize))
    const childMainSize = hypotheticalMainSize + flex.mainMargin
    const gapIfNotFirst = lineChildCount > 0 ? mainGap : 0

    // Check if child fits on current line
    if (lineChildCount > 0 && lineMainSize + gapIfNotFirst + childMainSize > mainAxisSize) {
      // Finalize current line: trim array to actual size
      _lineChildren[lineIndex]!.length = lineChildIdx
      _lineLengths[lineIndex] = lineChildCount
      lineIndex++
      if (lineIndex >= MAX_FLEX_LINES) {
        // Grow arrays dynamically (rare - only for >32 line layouts)
        growLineArrays(lineIndex + 16)
      }
      lineChildIdx = 0 // Reset index for new line
      lineMainSize = childMainSize
      lineChildCount = 1
    } else {
      lineMainSize += gapIfNotFirst + childMainSize
      lineChildCount++
    }
    flex.lineIndex = lineIndex
    // Use index-based assignment to avoid push() backing store growth
    _lineChildren[lineIndex]![lineChildIdx++] = child
  }

  // Finalize the last line
  if (lineChildCount > 0) {
    _lineChildren[lineIndex]!.length = lineChildIdx // Trim to actual size
    _lineLengths[lineIndex] = lineChildCount
    lineIndex++
  }

  const numLines = lineIndex

  // Initialize cross sizes/offsets
  for (let i = 0; i < numLines; i++) {
    _lineCrossSizes[i] = 0
    _lineCrossOffsets[i] = 0
  }

  // Handle wrap-reverse by reversing line CONTENTS (not references) to maintain pool stability
  // Swapping array references would corrupt the global _lineChildren pool across layout calls
  if (wrap === C.WRAP_WRAP_REVERSE && numLines > 1) {
    // Swap contents between symmetric line pairs (element-by-element, zero allocation)
    for (let i = 0; i < Math.floor(numLines / 2); i++) {
      const j = numLines - 1 - i
      const lineI = _lineChildren[i]!
      const lineJ = _lineChildren[j]!
      const lenI = lineI.length
      const lenJ = lineJ.length

      // Swap elements up to max length (JS arrays auto-extend on assignment)
      const maxLen = Math.max(lenI, lenJ)
      for (let k = 0; k < maxLen; k++) {
        const hasI = k < lenI
        const hasJ = k < lenJ
        const tmpI = hasI ? lineI[k] : null
        const tmpJ = hasJ ? lineJ[k] : null
        if (hasJ) lineI[k] = tmpJ!
        if (hasI) lineJ[k] = tmpI!
      }

      // Set correct lengths (truncates or maintains as needed)
      lineI.length = lenJ
      lineJ.length = lenI
    }
    // Update lineIndex on each child to match new positions
    for (let i = 0; i < numLines; i++) {
      const lc = _lineChildren[i]!
      for (let c = 0; c < lc.length; c++) {
        lc[c]!.flex.lineIndex = i
      }
    }
  }

  return numLines
}

/**
 * Distribute flex space for a single line of children.
 * Implements CSS Flexbox section 9.7: Resolving Flexible Lengths.
 *
 * Takes pre-collected children array to avoid O(n*m) iteration pattern.
 * Previously iterated through ALL parent.children 8 times per line.
 *
 * @param lineChildren - Pre-collected children for this line (from _lineChildren)
 * @param initialFreeSpace - Free space to distribute (positive=grow, negative=shrink)
 */
export function distributeFlexSpaceForLine(lineChildren: Node[], initialFreeSpace: number): void {
  const isGrowing = initialFreeSpace > 0
  if (initialFreeSpace === 0) return

  const childCount = lineChildren.length
  if (childCount === 0) return

  // Single-child fast path: skip iteration, direct assignment
  if (childCount === 1) {
    const flex = lineChildren[0]!.flex
    const canFlex = isGrowing ? flex.flexGrow > 0 : flex.flexShrink > 0
    if (canFlex) {
      // Target = base + all free space, clamped by min/max
      const target = flex.baseSize + initialFreeSpace
      flex.mainSize = Math.max(flex.minMain, Math.min(flex.maxMain, target))
    }
    // If can't flex, mainSize stays at baseSize (already set)
    return
  }

  // Calculate container inner size
  let totalBase = 0
  for (let i = 0; i < childCount; i++) {
    totalBase += lineChildren[i]!.flex.baseSize
  }

  const containerInner = initialFreeSpace + totalBase

  // Initialize: all items start unfrozen
  for (let i = 0; i < childCount; i++) {
    lineChildren[i]!.flex.frozen = false
  }

  let freeSpace = initialFreeSpace
  let iterations = 0
  const maxIterations = childCount + 1

  while (iterations++ < maxIterations) {
    let totalFlex = 0
    for (let i = 0; i < childCount; i++) {
      const flex = lineChildren[i]!.flex
      if (flex.frozen) continue
      if (isGrowing) {
        totalFlex += flex.flexGrow
      } else {
        totalFlex += flex.flexShrink * flex.baseSize
      }
    }

    if (totalFlex === 0) break

    let effectiveFreeSpace = freeSpace
    if (isGrowing && totalFlex < 1) {
      effectiveFreeSpace = freeSpace * totalFlex
    }

    let totalViolation = 0
    for (let i = 0; i < childCount; i++) {
      const flex = lineChildren[i]!.flex
      if (flex.frozen) continue

      const flexFactor = isGrowing ? flex.flexGrow : flex.flexShrink * flex.baseSize
      const ratio = totalFlex > 0 ? flexFactor / totalFlex : 0
      const target = flex.baseSize + effectiveFreeSpace * ratio
      const clamped = Math.max(flex.minMain, Math.min(flex.maxMain, target))
      totalViolation += clamped - target
      flex.mainSize = clamped
    }

    let anyFrozen = false
    if (Math.abs(totalViolation) < EPSILON_FLOAT) {
      for (let i = 0; i < childCount; i++) {
        lineChildren[i]!.flex.frozen = true
      }
      break
    } else if (totalViolation > 0) {
      for (let i = 0; i < childCount; i++) {
        const flex = lineChildren[i]!.flex
        if (flex.frozen) continue
        const target =
          flex.baseSize +
          ((isGrowing ? flex.flexGrow : flex.flexShrink * flex.baseSize) / totalFlex) * effectiveFreeSpace
        if (flex.mainSize > target + EPSILON_FLOAT) {
          flex.frozen = true
          anyFrozen = true
        }
      }
    } else {
      for (let i = 0; i < childCount; i++) {
        const flex = lineChildren[i]!.flex
        if (flex.frozen) continue
        const flexFactor = isGrowing ? flex.flexGrow : flex.flexShrink * flex.baseSize
        const target = flex.baseSize + (flexFactor / totalFlex) * effectiveFreeSpace
        if (flex.mainSize < target - EPSILON_FLOAT) {
          flex.frozen = true
          anyFrozen = true
        }
      }
    }

    if (!anyFrozen) break

    let frozenSpace = 0
    let unfrozenBase = 0
    for (let i = 0; i < childCount; i++) {
      const flex = lineChildren[i]!.flex
      if (flex.frozen) {
        frozenSpace += flex.mainSize
      } else {
        unfrozenBase += flex.baseSize
      }
    }
    freeSpace = containerInner - frozenSpace - unfrozenBase
  }
}
