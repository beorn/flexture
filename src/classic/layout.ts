/**
 * Flexture Layout Algorithm
 *
 * Core flexbox layout computation extracted from node.ts.
 * Based on Planning-nl/flexbox.js reference implementation.
 */

import * as C from "../constants.js"
import type { Node } from "./node.js"
import type { Value } from "../types.js"
import { resolveValue, applyMinMax } from "../utils.js"
import { log } from "../logger.js"

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if flex direction is row-oriented (horizontal main axis).
 */
export function isRowDirection(flexDirection: number): boolean {
  return flexDirection === C.FLEX_DIRECTION_ROW || flexDirection === C.FLEX_DIRECTION_ROW_REVERSE
}

/**
 * Check if flex direction is reversed.
 */
export function isReverseDirection(flexDirection: number): boolean {
  return flexDirection === C.FLEX_DIRECTION_ROW_REVERSE || flexDirection === C.FLEX_DIRECTION_COLUMN_REVERSE
}

/**
 * Get the logical edge value (START/END) for a given physical index.
 * Returns undefined if no logical value applies to this physical edge.
 *
 * The mapping depends on flex direction and text direction:
 * - Row LTR: START→left, END→right (swapped if reverse)
 * - Row RTL: START→right, END→left (swapped if reverse)
 * - Column: START→top, END→bottom (swapped if reverse)
 */
function getLogicalEdgeValue(
  arr: [Value, Value, Value, Value, Value, Value],
  physicalIndex: number,
  _flexDirection: number,
  direction: number = C.DIRECTION_LTR,
): Value | undefined {
  const isRTL = direction === C.DIRECTION_RTL

  // START/END always map to left/right (inline direction)
  if (physicalIndex === 0) {
    return isRTL ? arr[5] : arr[4] // Left: START (LTR) or END (RTL)
  } else if (physicalIndex === 2) {
    return isRTL ? arr[4] : arr[5] // Right: END (LTR) or START (RTL)
  }
  return undefined
}

/**
 * Resolve logical (START/END) margins/padding to physical values.
 * EDGE_START/EDGE_END always resolve along the inline (horizontal) axis:
 * - LTR: START→left, END→right
 * - RTL: START→right, END→left
 *
 * Physical edges (LEFT/RIGHT/TOP/BOTTOM) are used directly.
 * When both physical and logical are set, logical takes precedence.
 */
export function resolveEdgeValue(
  arr: [Value, Value, Value, Value, Value, Value],
  physicalIndex: number, // 0=left, 1=top, 2=right, 3=bottom
  flexDirection: number,
  availableSize: number,
  direction: number = C.DIRECTION_LTR,
): number {
  const logicalValue = getLogicalEdgeValue(arr, physicalIndex, flexDirection, direction)

  // Logical takes precedence if defined
  if (logicalValue && logicalValue.unit !== C.UNIT_UNDEFINED) {
    return resolveValue(logicalValue, availableSize)
  }

  // Fall back to physical
  return resolveValue(arr[physicalIndex]!, availableSize)
}

/**
 * Check if a logical edge margin is set to auto.
 */
export function isEdgeAuto(
  arr: [Value, Value, Value, Value, Value, Value],
  physicalIndex: number,
  flexDirection: number,
  direction: number = C.DIRECTION_LTR,
): boolean {
  const logicalValue = getLogicalEdgeValue(arr, physicalIndex, flexDirection, direction)

  // Check logical first
  if (logicalValue && logicalValue.unit !== C.UNIT_UNDEFINED) {
    return logicalValue.unit === C.UNIT_AUTO
  }

  // Fall back to physical
  return arr[physicalIndex]!.unit === C.UNIT_AUTO
}

/**
 * Resolve logical (START/END) border widths to physical values.
 * Border values are plain numbers (always points), so resolution is simpler
 * than for margin/padding. Uses NaN as the "not set" sentinel for logical slots.
 * When both physical and logical are set, logical takes precedence.
 */
export function resolveEdgeBorderValue(
  arr: [number, number, number, number, number, number],
  physicalIndex: number, // 0=left, 1=top, 2=right, 3=bottom
  _flexDirection: number,
  direction: number = C.DIRECTION_LTR,
): number {
  const isRTL = direction === C.DIRECTION_RTL

  // START/END always map to left/right (inline direction)
  let logicalSlot: number | undefined
  if (physicalIndex === 0) logicalSlot = isRTL ? 5 : 4
  else if (physicalIndex === 2) logicalSlot = isRTL ? 4 : 5

  // Logical takes precedence if set (NaN = not set)
  if (logicalSlot !== undefined && !Number.isNaN(arr[logicalSlot])) {
    return arr[logicalSlot]
  }
  return arr[physicalIndex]
}

export function markSubtreeLayoutSeen(node: Node): void {
  for (const child of node.children) {
    ;(child as Node)["_hasNewLayout"] = true
    markSubtreeLayoutSeen(child)
  }
}

export function countNodes(node: Node): number {
  let count = 1
  for (const child of node.children) {
    count += countNodes(child)
  }
  return count
}

// ============================================================================
// Layout Algorithm
// Based on Planning-nl/flexbox.js reference implementation
// ============================================================================

/**
 * Epsilon value for floating point comparisons in flex distribution.
 * Used to determine when remaining space is negligible and iteration should stop.
 */
const EPSILON_FLOAT = 0.001

/**
 * Child layout information for flex distribution.
 */
interface ChildLayout {
  node: Node
  mainSize: number
  baseSize: number // Original base size before flex distribution (for weighted shrink)
  mainMargin: number // Total main-axis margin (non-auto only)
  flexGrow: number
  flexShrink: number
  minMain: number
  maxMain: number
  // Auto margin tracking (main axis)
  mainStartMarginAuto: boolean
  mainEndMarginAuto: boolean
  mainStartMarginValue: number // Resolved or 0 if auto (will be computed later)
  mainEndMarginValue: number // Resolved or 0 if auto (will be computed later)
  // Frozen flag: set when item was clamped to min/max during hypothetical sizing
  frozen: boolean
}

/**
 * A flex line containing children and cross-axis sizing info.
 * Used for flex-wrap to group items that fit on one line.
 */
interface FlexLine {
  children: ChildLayout[]
  crossSize: number // Maximum cross size of items in this line
  crossStart: number // Computed cross-axis start position
}

/**
 * Break children into flex lines based on available main-axis space.
 *
 * @param children - All children to potentially wrap
 * @param mainAxisSize - Available main-axis space (NaN for unconstrained)
 * @param mainGap - Gap between items on main axis
 * @param wrap - Wrap mode (WRAP_NO_WRAP, WRAP_WRAP, WRAP_WRAP_REVERSE)
 * @returns Array of flex lines
 */
function breakIntoLines(children: ChildLayout[], mainAxisSize: number, mainGap: number, wrap: number): FlexLine[] {
  // No wrapping or unconstrained - all children on one line
  if (wrap === C.WRAP_NO_WRAP || Number.isNaN(mainAxisSize) || children.length === 0) {
    return [{ children, crossSize: 0, crossStart: 0 }]
  }

  const lines: FlexLine[] = []
  let currentLine: ChildLayout[] = []
  let lineMainSize = 0

  for (const child of children) {
    const childMainSize = child.baseSize + child.mainMargin
    const gapIfNotFirst = currentLine.length > 0 ? mainGap : 0

    // Check if child fits on current line
    if (currentLine.length > 0 && lineMainSize + gapIfNotFirst + childMainSize > mainAxisSize) {
      // Start a new line
      lines.push({ children: currentLine, crossSize: 0, crossStart: 0 })
      currentLine = [child]
      lineMainSize = childMainSize
    } else {
      // Add to current line
      currentLine.push(child)
      lineMainSize += gapIfNotFirst + childMainSize
    }
  }

  // Don't forget the last line
  if (currentLine.length > 0) {
    lines.push({ children: currentLine, crossSize: 0, crossStart: 0 })
  }

  // Reverse lines for wrap-reverse
  if (wrap === C.WRAP_WRAP_REVERSE) {
    lines.reverse()
  }

  return lines
}

/**
 * Distribute free space among flex children using grow or shrink factors.
 * Handles both positive (grow) and negative (shrink) free space.
 *
 * For shrinking, per CSS Flexbox spec, the shrink factor is weighted by the item's
 * base size: scaledShrinkFactor = flexShrink * baseSize
 *
 * @param children - Array of child layout info to distribute space among
 * @param freeSpace - Amount of space to distribute (positive for grow, negative for shrink)
 */
function distributeFlexSpace(children: ChildLayout[], initialFreeSpace: number): void {
  // CSS Flexbox spec section 9.7: Resolving Flexible Lengths
  // This implements the iterative algorithm where items are frozen when they hit constraints.
  //
  // Key insight: Items start at BASE size, not hypothetical. Free space was calculated from
  // hypothetical sizes. When distributing, items that hit min/max are frozen and we redistribute.

  const isGrowing = initialFreeSpace > 0
  if (initialFreeSpace === 0) return

  // Single-child fast path: skip iteration, direct assignment
  if (children.length === 1) {
    const child = children[0]!
    const canFlex = isGrowing ? child.flexGrow > 0 : child.flexShrink > 0
    if (canFlex) {
      const target = child.baseSize + initialFreeSpace
      child.mainSize = Math.max(child.minMain, Math.min(child.maxMain, target))
    }
    return
  }

  // Calculate container inner size from initial state (before any mutations)
  // freeSpace was computed from BASE sizes, so: container = freeSpace + sum(base)
  let totalBase = 0
  for (const childLayout of children) {
    totalBase += childLayout.baseSize
  }
  const containerInner = initialFreeSpace + totalBase

  // Initialize: all items start unfrozen
  for (const childLayout of children) {
    childLayout.frozen = false
  }

  // Track current free space (will be recalculated each iteration)
  let freeSpace = initialFreeSpace

  // Iterate until all items are frozen or free space is negligible
  let iterations = 0
  const maxIterations = children.length + 1 // Prevent infinite loops

  while (iterations++ < maxIterations) {
    // Calculate total flex factor for unfrozen items
    let totalFlex = 0
    for (const childLayout of children) {
      if (childLayout.frozen) continue
      if (isGrowing) {
        totalFlex += childLayout.flexGrow
      } else {
        // Shrink weighted by base size per CSS spec
        totalFlex += childLayout.flexShrink * childLayout.baseSize
      }
    }

    if (totalFlex === 0) break

    // CSS Flexbox spec: when total flex-grow is less than 1, only distribute that fraction
    let effectiveFreeSpace = freeSpace
    if (isGrowing && totalFlex < 1) {
      effectiveFreeSpace = freeSpace * totalFlex
    }

    // Calculate target sizes for unfrozen items
    let totalViolation = 0
    for (const childLayout of children) {
      if (childLayout.frozen) continue

      // Calculate target from base size + proportional free space
      const flexFactor = isGrowing ? childLayout.flexGrow : childLayout.flexShrink * childLayout.baseSize
      const ratio = totalFlex > 0 ? flexFactor / totalFlex : 0
      const target = childLayout.baseSize + effectiveFreeSpace * ratio

      // Clamp by min/max
      const clamped = Math.max(childLayout.minMain, Math.min(childLayout.maxMain, target))
      const violation = clamped - target
      totalViolation += violation

      // Store clamped target
      childLayout.mainSize = clamped
    }

    // Freeze items based on violations (CSS spec 9.7 step 9)
    let anyFrozen = false
    if (Math.abs(totalViolation) < EPSILON_FLOAT) {
      // No violations - freeze all remaining items and we're done
      for (const childLayout of children) {
        childLayout.frozen = true
      }
      break
    } else if (totalViolation > 0) {
      // Positive total violation: freeze items with positive violations (clamped UP to min)
      for (const childLayout of children) {
        if (childLayout.frozen) continue
        const target =
          childLayout.baseSize +
          ((isGrowing ? childLayout.flexGrow : childLayout.flexShrink * childLayout.baseSize) / totalFlex) *
            effectiveFreeSpace
        if (childLayout.mainSize > target + EPSILON_FLOAT) {
          childLayout.frozen = true
          anyFrozen = true
        }
      }
    } else {
      // Negative total violation: freeze items with negative violations (clamped DOWN to max)
      for (const childLayout of children) {
        if (childLayout.frozen) continue
        const flexFactor = isGrowing ? childLayout.flexGrow : childLayout.flexShrink * childLayout.baseSize
        const target = childLayout.baseSize + (flexFactor / totalFlex) * effectiveFreeSpace
        if (childLayout.mainSize < target - EPSILON_FLOAT) {
          childLayout.frozen = true
          anyFrozen = true
        }
      }
    }

    if (!anyFrozen) break

    // Recalculate free space for next iteration
    // After freezing, available = container - frozen sizes
    // Free space = available - sum of unfrozen BASE sizes
    let frozenSpace = 0
    let unfrozenBase = 0
    for (const childLayout of children) {
      if (childLayout.frozen) {
        frozenSpace += childLayout.mainSize
      } else {
        unfrozenBase += childLayout.baseSize
      }
    }
    // New free space = container - frozen - unfrozen base sizes
    freeSpace = containerInner - frozenSpace - unfrozenBase
  }
}

/**
 * Compute layout for a node tree.
 *
 * @param root - Root node of the tree
 * @param availableWidth - Available width for layout
 * @param availableHeight - Available height for layout
 * @param direction - Text direction (LTR or RTL), affects horizontal edge resolution
 */
export function computeLayout(
  root: Node,
  availableWidth: number,
  availableHeight: number,
  direction: number = C.DIRECTION_LTR,
): void {
  // Pass absolute position (0,0) for root node - used for Yoga-compatible edge rounding
  layoutNode(root, availableWidth, availableHeight, 0, 0, 0, 0, direction)
}

/**
 * Layout a node and its children.
 *
 * @param absX - Absolute X position from document root (for Yoga-compatible edge rounding)
 * @param absY - Absolute Y position from document root (for Yoga-compatible edge rounding)
 * @param direction - Text direction (LTR or RTL), affects horizontal edge resolution
 */
function layoutNode(
  node: Node,
  availableWidth: number,
  availableHeight: number,
  offsetX: number,
  offsetY: number,
  absX: number,
  absY: number,
  direction: number = C.DIRECTION_LTR,
): void {
  log.debug?.(
    "layoutNode called: availW=%d, availH=%d, offsetX=%d, offsetY=%d, absX=%d, absY=%d, children=%d",
    availableWidth,
    availableHeight,
    offsetX,
    offsetY,
    absX,
    absY,
    node.children.length,
  )
  const style = node.style
  const layout = node.layout

  // Handle display: none
  if (style.display === C.DISPLAY_NONE) {
    layout.left = 0
    layout.top = 0
    layout.width = 0
    layout.height = 0
    return
  }

  // Calculate spacing
  // CSS spec: percentage margins AND padding resolve against containing block's WIDTH only
  // Use resolveEdgeValue to respect logical EDGE_START/END
  const marginLeft = resolveEdgeValue(style.margin, 0, style.flexDirection, availableWidth, direction)
  const marginTop = resolveEdgeValue(style.margin, 1, style.flexDirection, availableWidth, direction)
  const marginRight = resolveEdgeValue(style.margin, 2, style.flexDirection, availableWidth, direction)
  const marginBottom = resolveEdgeValue(style.margin, 3, style.flexDirection, availableWidth, direction)

  const paddingLeft = resolveEdgeValue(style.padding, 0, style.flexDirection, availableWidth, direction)
  const paddingTop = resolveEdgeValue(style.padding, 1, style.flexDirection, availableWidth, direction)
  const paddingRight = resolveEdgeValue(style.padding, 2, style.flexDirection, availableWidth, direction)
  const paddingBottom = resolveEdgeValue(style.padding, 3, style.flexDirection, availableWidth, direction)

  const borderLeft = resolveEdgeBorderValue(style.border, 0, style.flexDirection, direction)
  const borderTop = resolveEdgeBorderValue(style.border, 1, style.flexDirection, direction)
  const borderRight = resolveEdgeBorderValue(style.border, 2, style.flexDirection, direction)
  const borderBottom = resolveEdgeBorderValue(style.border, 3, style.flexDirection, direction)

  // Calculate node dimensions
  // When available dimension is NaN (unconstrained), auto-sized nodes use NaN
  // and will be sized by shrink-wrap logic based on children
  let nodeWidth: number
  if (style.width.unit === C.UNIT_POINT) {
    nodeWidth = style.width.value
  } else if (style.width.unit === C.UNIT_PERCENT) {
    // Percentage against NaN (auto-sized parent) resolves to 0 via resolveValue
    nodeWidth = resolveValue(style.width, availableWidth)
  } else if (Number.isNaN(availableWidth)) {
    // Unconstrained: use NaN to signal shrink-wrap (will be computed from children)
    nodeWidth = NaN
  } else {
    nodeWidth = availableWidth - marginLeft - marginRight
  }
  // Apply min/max constraints (works even with NaN available for point-based constraints)
  nodeWidth = applyMinMax(nodeWidth, style.minWidth, style.maxWidth, availableWidth)

  let nodeHeight: number
  if (style.height.unit === C.UNIT_POINT) {
    nodeHeight = style.height.value
  } else if (style.height.unit === C.UNIT_PERCENT) {
    // Percentage against NaN (auto-sized parent) resolves to 0 via resolveValue
    nodeHeight = resolveValue(style.height, availableHeight)
  } else if (Number.isNaN(availableHeight)) {
    // Unconstrained: use NaN to signal shrink-wrap (will be computed from children)
    nodeHeight = NaN
  } else {
    nodeHeight = availableHeight - marginTop - marginBottom
  }

  // Apply aspect ratio constraint
  // If aspectRatio is set and one dimension is auto (NaN), derive it from the other
  const aspectRatio = style.aspectRatio
  if (!Number.isNaN(aspectRatio) && aspectRatio > 0) {
    const widthIsAuto = Number.isNaN(nodeWidth) || style.width.unit === C.UNIT_AUTO
    const heightIsAuto = Number.isNaN(nodeHeight) || style.height.unit === C.UNIT_AUTO

    if (widthIsAuto && !heightIsAuto && !Number.isNaN(nodeHeight)) {
      // Height is defined, width is auto: width = height * aspectRatio
      nodeWidth = nodeHeight * aspectRatio
    } else if (heightIsAuto && !widthIsAuto && !Number.isNaN(nodeWidth)) {
      // Width is defined, height is auto: height = width / aspectRatio
      nodeHeight = nodeWidth / aspectRatio
    }
    // If both are defined or both are auto, aspectRatio doesn't apply at this stage
  }

  // Apply min/max constraints (works even with NaN available for point-based constraints)
  nodeHeight = applyMinMax(nodeHeight, style.minHeight, style.maxHeight, availableHeight)

  // Content area (inside border and padding)
  // When node dimensions are NaN (unconstrained), content dimensions are also NaN
  const innerLeft = borderLeft + paddingLeft
  const innerTop = borderTop + paddingTop
  const innerRight = borderRight + paddingRight
  const innerBottom = borderBottom + paddingBottom

  // Enforce box model constraint: minimum size = padding + border
  const minInnerWidth = innerLeft + innerRight
  const minInnerHeight = innerTop + innerBottom
  if (!Number.isNaN(nodeWidth) && nodeWidth < minInnerWidth) {
    nodeWidth = minInnerWidth
  }
  if (!Number.isNaN(nodeHeight) && nodeHeight < minInnerHeight) {
    nodeHeight = minInnerHeight
  }

  const contentWidth = Number.isNaN(nodeWidth) ? NaN : Math.max(0, nodeWidth - innerLeft - innerRight)
  const contentHeight = Number.isNaN(nodeHeight) ? NaN : Math.max(0, nodeHeight - innerTop - innerBottom)

  // Compute position offsets early (needed for children's absolute position calculation)
  // This ensures children's absolute positions include parent's position offset
  let parentPosOffsetX = 0
  let parentPosOffsetY = 0
  if (style.positionType === C.POSITION_TYPE_STATIC || style.positionType === C.POSITION_TYPE_RELATIVE) {
    const leftPos = style.position[0]
    const topPos = style.position[1]
    const rightPos = style.position[2]
    const bottomPos = style.position[3]

    if (leftPos.unit !== C.UNIT_UNDEFINED) {
      parentPosOffsetX = resolveValue(leftPos, availableWidth)
    } else if (rightPos.unit !== C.UNIT_UNDEFINED) {
      parentPosOffsetX = -resolveValue(rightPos, availableWidth)
    }

    if (topPos.unit !== C.UNIT_UNDEFINED) {
      parentPosOffsetY = resolveValue(topPos, availableHeight)
    } else if (bottomPos.unit !== C.UNIT_UNDEFINED) {
      parentPosOffsetY = -resolveValue(bottomPos, availableHeight)
    }
  }

  // Handle measure function (text nodes)
  if (node.hasMeasureFunc() && node.children.length === 0) {
    const measureFunc = node.measureFunc!
    // For unconstrained dimensions (NaN), treat as auto-sizing
    const widthIsAuto =
      style.width.unit === C.UNIT_AUTO || style.width.unit === C.UNIT_UNDEFINED || Number.isNaN(nodeWidth)
    const heightIsAuto =
      style.height.unit === C.UNIT_AUTO || style.height.unit === C.UNIT_UNDEFINED || Number.isNaN(nodeHeight)
    const widthMode = widthIsAuto ? C.MEASURE_MODE_AT_MOST : C.MEASURE_MODE_EXACTLY
    const heightMode = heightIsAuto ? C.MEASURE_MODE_UNDEFINED : C.MEASURE_MODE_EXACTLY

    // For unconstrained width, use a large value; measureFunc should return intrinsic size
    const measureWidth = Number.isNaN(contentWidth) ? Infinity : contentWidth
    const measureHeight = Number.isNaN(contentHeight) ? Infinity : contentHeight

    const measured = measureFunc(measureWidth, widthMode, measureHeight, heightMode)

    if (widthIsAuto) {
      nodeWidth = measured.width + innerLeft + innerRight
    }
    if (heightIsAuto) {
      nodeHeight = measured.height + innerTop + innerBottom
    }

    layout.width = Math.round(nodeWidth)
    layout.height = Math.round(nodeHeight)
    layout.left = Math.round(offsetX + marginLeft)
    layout.top = Math.round(offsetY + marginTop)
    return
  }

  // Handle leaf nodes without measureFunc - when unconstrained, use padding+border as intrinsic size
  if (node.children.length === 0) {
    // For leaf nodes without measureFunc, intrinsic size is just padding+border
    if (Number.isNaN(nodeWidth)) {
      nodeWidth = innerLeft + innerRight
    }
    if (Number.isNaN(nodeHeight)) {
      nodeHeight = innerTop + innerBottom
    }
    layout.width = Math.round(nodeWidth)
    layout.height = Math.round(nodeHeight)
    layout.left = Math.round(offsetX + marginLeft)
    layout.top = Math.round(offsetY + marginTop)
    return
  }

  // Separate relative and absolute children
  // Filter out display:none children - they don't participate in layout at all
  const relativeChildren = node.children.filter(
    (c) => c.style.positionType !== C.POSITION_TYPE_ABSOLUTE && c.style.display !== C.DISPLAY_NONE,
  )
  const absoluteChildren = node.children.filter(
    (c) => c.style.positionType === C.POSITION_TYPE_ABSOLUTE && c.style.display !== C.DISPLAY_NONE,
  )

  // Flex layout for relative children
  log.debug?.(
    "layoutNode: node.children=%d, relativeChildren=%d, absolute=%d",
    node.children.length,
    relativeChildren.length,
    absoluteChildren.length,
  )
  if (relativeChildren.length > 0) {
    const isRow = isRowDirection(style.flexDirection)
    const isReverse = isReverseDirection(style.flexDirection)

    const mainAxisSize = isRow ? contentWidth : contentHeight
    const crossAxisSize = isRow ? contentHeight : contentWidth
    const mainGap = isRow ? style.gap[0] : style.gap[1]

    // Prepare child layout info

    const children: ChildLayout[] = []
    let totalBaseMain = 0

    for (const child of relativeChildren) {
      const childStyle = child.style

      // Check for auto margins on main axis
      // Physical indices depend on axis and reverse direction:
      // - Row: main-start=left(0), main-end=right(2)
      // - Row-reverse: main-start=right(2), main-end=left(0)
      // - Column: main-start=top(1), main-end=bottom(3)
      // - Column-reverse: main-start=bottom(3), main-end=top(1)
      const mainStartIndex = isRow ? (isReverse ? 2 : 0) : isReverse ? 3 : 1
      const mainEndIndex = isRow ? (isReverse ? 0 : 2) : isReverse ? 1 : 3
      const mainStartMarginAuto = isEdgeAuto(childStyle.margin, mainStartIndex, style.flexDirection)
      const mainEndMarginAuto = isEdgeAuto(childStyle.margin, mainEndIndex, style.flexDirection)

      // Resolve non-auto margins (auto margins resolve to 0 initially)
      // CSS spec: percentage margins resolve against containing block's WIDTH only
      // For row: mainAxisSize is contentWidth; for column: crossAxisSize is contentWidth
      const parentWidth = isRow ? mainAxisSize : crossAxisSize
      const mainStartMarginValue = mainStartMarginAuto
        ? 0
        : resolveEdgeValue(childStyle.margin, mainStartIndex, style.flexDirection, parentWidth, direction)
      const mainEndMarginValue = mainEndMarginAuto
        ? 0
        : resolveEdgeValue(childStyle.margin, mainEndIndex, style.flexDirection, parentWidth, direction)

      // Total non-auto margin for flex calculations
      const mainMargin = mainStartMarginValue + mainEndMarginValue

      // Determine base size (flex-basis or explicit size)
      let baseSize = 0
      if (childStyle.flexBasis.unit === C.UNIT_POINT) {
        baseSize = childStyle.flexBasis.value
      } else if (childStyle.flexBasis.unit === C.UNIT_PERCENT) {
        baseSize = mainAxisSize * (childStyle.flexBasis.value / 100)
      } else {
        const sizeVal = isRow ? childStyle.width : childStyle.height
        if (sizeVal.unit === C.UNIT_POINT) {
          baseSize = sizeVal.value
        } else if (sizeVal.unit === C.UNIT_PERCENT) {
          baseSize = mainAxisSize * (sizeVal.value / 100)
        } else if (child.hasMeasureFunc() && childStyle.flexGrow === 0) {
          // For auto-sized children with measureFunc but no flexGrow,
          // pre-measure to get intrinsic size for justify-content calculation
          // CSS spec: percentage margins resolve against containing block's WIDTH only
          // Use resolveEdgeValue to respect logical EDGE_START/END
          const crossMargin = isRow
            ? resolveEdgeValue(childStyle.margin, 1, style.flexDirection, contentWidth, direction) +
              resolveEdgeValue(childStyle.margin, 3, style.flexDirection, contentWidth, direction)
            : resolveEdgeValue(childStyle.margin, 0, style.flexDirection, contentWidth, direction) +
              resolveEdgeValue(childStyle.margin, 2, style.flexDirection, contentWidth, direction)
          const availCross = crossAxisSize - crossMargin
          const measured = child.measureFunc!(
            mainAxisSize,
            C.MEASURE_MODE_AT_MOST,
            availCross,
            C.MEASURE_MODE_UNDEFINED,
          )
          baseSize = isRow ? measured.width : measured.height
        } else if (child.children.length > 0) {
          // For auto-sized children WITH children but no measureFunc,
          // recursively compute intrinsic size by laying out with unconstrained main axis
          // Use 0,0 for absX/absY since this is just measurement, not final positioning
          layoutNode(child, isRow ? NaN : crossAxisSize, isRow ? crossAxisSize : NaN, 0, 0, 0, 0, direction)
          baseSize = isRow ? child.layout.width : child.layout.height
        } else {
          // For auto-sized LEAF children without measureFunc, use padding + border as minimum
          // This ensures elements with only padding still have proper size
          // CSS spec: percentage padding resolves against containing block's WIDTH only
          // Use resolveEdgeValue to respect logical EDGE_START/END
          // For row: mainAxisSize is contentWidth; for column: crossAxisSize is contentWidth
          const parentWidth = isRow ? mainAxisSize : crossAxisSize
          const childPadding = isRow
            ? resolveEdgeValue(childStyle.padding, 0, childStyle.flexDirection, parentWidth, direction) +
              resolveEdgeValue(childStyle.padding, 2, childStyle.flexDirection, parentWidth, direction)
            : resolveEdgeValue(childStyle.padding, 1, childStyle.flexDirection, parentWidth, direction) +
              resolveEdgeValue(childStyle.padding, 3, childStyle.flexDirection, parentWidth, direction)
          const childBorder = isRow
            ? resolveEdgeBorderValue(childStyle.border, 0, childStyle.flexDirection, direction) +
              resolveEdgeBorderValue(childStyle.border, 2, childStyle.flexDirection, direction)
            : resolveEdgeBorderValue(childStyle.border, 1, childStyle.flexDirection, direction) +
              resolveEdgeBorderValue(childStyle.border, 3, childStyle.flexDirection, direction)
          baseSize = childPadding + childBorder
        }
      }

      // Min/max on main axis
      const minVal = isRow ? childStyle.minWidth : childStyle.minHeight
      const maxVal = isRow ? childStyle.maxWidth : childStyle.maxHeight
      const minMain = minVal.unit !== C.UNIT_UNDEFINED ? resolveValue(minVal, mainAxisSize) : 0
      const maxMain = maxVal.unit !== C.UNIT_UNDEFINED ? resolveValue(maxVal, mainAxisSize) : Infinity

      // Clamp base size to get hypothetical size (CSS Flexbox spec)
      const hypotheticalSize = Math.max(minMain, Math.min(maxMain, baseSize))

      children.push({
        node: child,
        mainSize: baseSize, // Start from base size - distribution happens from here
        baseSize,
        mainMargin,
        flexGrow: childStyle.flexGrow,
        flexShrink: childStyle.flexShrink,
        minMain,
        maxMain,
        mainStartMarginAuto,
        mainEndMarginAuto,
        mainStartMarginValue,
        mainEndMarginValue,
        frozen: false, // Will be set during distribution
      })

      // Free space calculation uses BASE sizes (per Yoga/CSS spec algorithm)
      // The freeze loop handles min/max clamping iteratively
      totalBaseMain += baseSize + mainMargin
    }

    // Break children into flex lines for wrap support
    const lines = breakIntoLines(children, mainAxisSize, mainGap, style.flexWrap)
    const crossGap = isRow ? style.gap[1] : style.gap[0]

    // Process each line: distribute flex space
    for (const line of lines) {
      const lineChildren = line.children
      if (lineChildren.length === 0) continue

      // Calculate total base main and gaps for this line
      const lineTotalBaseMain = lineChildren.reduce((sum, c) => sum + c.baseSize + c.mainMargin, 0)
      const lineTotalGaps = lineChildren.length > 1 ? mainGap * (lineChildren.length - 1) : 0

      // Distribute free space using grow or shrink factors
      let effectiveMainSize = mainAxisSize
      if (Number.isNaN(mainAxisSize)) {
        // Shrink-wrap mode - check if max constraint applies
        const maxMainVal = isRow ? style.maxWidth : style.maxHeight
        if (maxMainVal.unit !== C.UNIT_UNDEFINED) {
          const maxMain = resolveValue(maxMainVal, isRow ? availableWidth : availableHeight)
          if (!Number.isNaN(maxMain) && lineTotalBaseMain + lineTotalGaps > maxMain) {
            const innerMain = isRow ? innerLeft + innerRight : innerTop + innerBottom
            effectiveMainSize = maxMain - innerMain
          }
        }
      }

      if (!Number.isNaN(effectiveMainSize)) {
        const adjustedFreeSpace = effectiveMainSize - lineTotalBaseMain - lineTotalGaps
        distributeFlexSpace(lineChildren, adjustedFreeSpace)
      }

      // Apply min/max constraints to final sizes
      for (const childLayout of lineChildren) {
        childLayout.mainSize = Math.max(childLayout.minMain, Math.min(childLayout.maxMain, childLayout.mainSize))
      }
    }

    // Calculate final used space and justify-content
    // For single-line, use all children; for multi-line, this applies per-line during positioning
    const totalGaps = children.length > 1 ? mainGap * (children.length - 1) : 0
    const usedMain = children.reduce((sum, c) => sum + c.mainSize + c.mainMargin, 0) + totalGaps
    // For auto-sized containers (NaN mainAxisSize), there's no remaining space to justify
    // Use NaN check instead of style check - handles minWidth/minHeight constraints properly
    const remainingSpace = Number.isNaN(mainAxisSize) ? 0 : mainAxisSize - usedMain

    // Handle auto margins on main axis
    // Auto margins absorb free space BEFORE justify-content
    const totalAutoMargins = children.reduce(
      (sum, c) => sum + (c.mainStartMarginAuto ? 1 : 0) + (c.mainEndMarginAuto ? 1 : 0),
      0,
    )
    let hasAutoMargins = totalAutoMargins > 0

    // Auto margins absorb ALL remaining space (including negative for overflow positioning)
    if (hasAutoMargins) {
      const autoMarginValue = remainingSpace / totalAutoMargins
      for (const childLayout of children) {
        if (childLayout.mainStartMarginAuto) {
          childLayout.mainStartMarginValue = autoMarginValue
        }
        if (childLayout.mainEndMarginAuto) {
          childLayout.mainEndMarginValue = autoMarginValue
        }
      }
    }
    // When space is negative or zero, auto margins stay at 0

    let startOffset = 0
    let itemSpacing = mainGap

    // justify-content is ignored when any auto margins exist
    if (!hasAutoMargins) {
      switch (style.justifyContent) {
        case C.JUSTIFY_FLEX_END:
          startOffset = remainingSpace
          break
        case C.JUSTIFY_CENTER:
          startOffset = remainingSpace / 2
          break
        case C.JUSTIFY_SPACE_BETWEEN:
          // Only apply space-between when remaining space is positive
          // With overflow (negative), fall back to flex-start behavior
          if (children.length > 1 && remainingSpace > 0) {
            itemSpacing = mainGap + remainingSpace / (children.length - 1)
          }
          break
        case C.JUSTIFY_SPACE_AROUND:
          if (children.length > 0) {
            const extraSpace = remainingSpace / children.length
            startOffset = extraSpace / 2
            itemSpacing = mainGap + extraSpace
          }
          break
        case C.JUSTIFY_SPACE_EVENLY:
          if (children.length > 0) {
            const extraSpace = remainingSpace / (children.length + 1)
            startOffset = extraSpace
            itemSpacing = mainGap + extraSpace
          }
          break
      }
    }

    // NOTE: We do NOT round sizes here. Instead, we use edge-based rounding below.
    // This ensures adjacent elements share exact boundaries without gaps.
    // The key insight: round(pos) gives the edge position, width = round(end) - round(start)

    // Compute baseline alignment info if needed
    // For ALIGN_BASELINE in row direction, we need to know the max baseline first
    let maxBaseline = 0
    const childBaselines: number[] = []
    const hasBaselineAlignment =
      style.alignItems === C.ALIGN_BASELINE || relativeChildren.some((c) => c.style.alignSelf === C.ALIGN_BASELINE)

    if (hasBaselineAlignment && isRow) {
      // First pass: compute each child's baseline and find the maximum
      for (let i = 0; i < children.length; i++) {
        const childLayout = children[i]!
        const child = childLayout.node
        const childStyle = child.style

        // Get cross-axis (top/bottom) margins for this child
        // Use resolveEdgeValue to respect logical EDGE_START/END
        const topMargin = resolveEdgeValue(childStyle.margin, 1, style.flexDirection, contentWidth, direction)

        // Compute child's dimensions - need to do a mini-layout or use the cached size
        let childWidth: number
        let childHeight: number
        const widthDim = childStyle.width
        const heightDim = childStyle.height

        if (widthDim.unit === C.UNIT_POINT) {
          childWidth = widthDim.value
        } else if (widthDim.unit === C.UNIT_PERCENT && !Number.isNaN(mainAxisSize)) {
          childWidth = mainAxisSize * (widthDim.value / 100)
        } else {
          childWidth = childLayout.mainSize
        }

        if (heightDim.unit === C.UNIT_POINT) {
          childHeight = heightDim.value
        } else if (heightDim.unit === C.UNIT_PERCENT && !Number.isNaN(crossAxisSize)) {
          childHeight = crossAxisSize * (heightDim.value / 100)
        } else {
          // Auto height - need to layout to get intrinsic size
          // For now, do a preliminary layout (measurement, not final positioning)
          layoutNode(child, childLayout.mainSize, NaN, 0, 0, 0, 0, direction)
          childWidth = child.layout.width
          childHeight = child.layout.height
        }

        // Compute baseline: use baselineFunc if available, otherwise use bottom of content box
        let baseline: number
        if (child.baselineFunc !== null) {
          // Custom baseline function provided (e.g., for text nodes)
          baseline = topMargin + child.baselineFunc(childWidth, childHeight)
        } else {
          // Fallback: bottom of content box (default for non-text elements)
          // Note: We don't recursively propagate first-child baselines to avoid O(n^depth) cost
          // This is a simplification from CSS spec but acceptable for TUI use cases
          baseline = topMargin + childHeight
        }
        childBaselines.push(baseline)
        maxBaseline = Math.max(maxBaseline, baseline)
      }
    }

    // Compute line cross-axis sizes and offsets for flex-wrap
    // Each child needs to know its line's cross offset
    const childLineIndex = new Map<ChildLayout, number>()
    const lineCrossOffsets: number[] = []
    let cumulativeCrossOffset = 0

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx]!
      lineCrossOffsets.push(cumulativeCrossOffset)

      // Calculate max cross size for this line
      let maxLineCross = 0
      for (const childLayout of line.children) {
        childLineIndex.set(childLayout, lineIdx)
        // Estimate child cross size (will be computed more precisely during layout)
        const childStyle = childLayout.node.style
        const crossDim = isRow ? childStyle.height : childStyle.width
        const crossMarginStart = isRow
          ? resolveEdgeValue(childStyle.margin, 1, style.flexDirection, contentWidth, direction)
          : resolveEdgeValue(childStyle.margin, 0, style.flexDirection, contentWidth, direction)
        const crossMarginEnd = isRow
          ? resolveEdgeValue(childStyle.margin, 3, style.flexDirection, contentWidth, direction)
          : resolveEdgeValue(childStyle.margin, 2, style.flexDirection, contentWidth, direction)

        let childCross = 0
        if (crossDim.unit === C.UNIT_POINT) {
          childCross = crossDim.value
        } else if (crossDim.unit === C.UNIT_PERCENT && !Number.isNaN(crossAxisSize)) {
          childCross = crossAxisSize * (crossDim.value / 100)
        } else {
          // Auto - use a default or measure. For now, use 0 and let stretch handle it.
          childCross = 0
        }
        maxLineCross = Math.max(maxLineCross, childCross + crossMarginStart + crossMarginEnd)
      }
      line.crossSize = maxLineCross > 0 ? maxLineCross : crossAxisSize / lines.length
      cumulativeCrossOffset += line.crossSize + crossGap
    }

    // Apply alignContent to distribute lines in the cross axis
    // This affects how multiple flex lines are positioned within the container
    const isWrapReverse = style.flexWrap === C.WRAP_WRAP_REVERSE
    const numLines = lines.length
    if (!Number.isNaN(crossAxisSize) && numLines > 0) {
      const totalLineCrossSize = cumulativeCrossOffset - crossGap // Remove trailing gap
      const freeSpace = crossAxisSize - totalLineCrossSize
      const alignContent = style.alignContent

      // Reset offsets based on alignContent
      if (freeSpace > 0 || alignContent === C.ALIGN_STRETCH) {
        switch (alignContent) {
          case C.ALIGN_FLEX_END:
            // Lines packed at end
            for (let i = 0; i < numLines; i++) {
              lineCrossOffsets[i]! += freeSpace
            }
            break

          case C.ALIGN_CENTER:
            // Lines centered
            const centerOffset = freeSpace / 2
            for (let i = 0; i < numLines; i++) {
              lineCrossOffsets[i]! += centerOffset
            }
            break

          case C.ALIGN_SPACE_BETWEEN:
            // First line at start, last at end, evenly distributed
            if (numLines > 1) {
              const gap = freeSpace / (numLines - 1)
              for (let i = 1; i < numLines; i++) {
                lineCrossOffsets[i]! += gap * i
              }
            }
            break

          case C.ALIGN_SPACE_AROUND:
            // Even spacing with half-space at edges
            const halfGap = freeSpace / (numLines * 2)
            for (let i = 0; i < numLines; i++) {
              lineCrossOffsets[i]! += halfGap + halfGap * 2 * i
            }
            break

          case C.ALIGN_STRETCH:
            // Distribute extra space evenly among lines
            if (freeSpace > 0 && numLines > 0) {
              const extraPerLine = freeSpace / numLines
              for (let i = 0; i < numLines; i++) {
                lines[i]!.crossSize += extraPerLine
                // Recalculate offset for subsequent lines
                if (i > 0) {
                  lineCrossOffsets[i] = lineCrossOffsets[i - 1]! + lines[i - 1]!.crossSize + crossGap
                }
              }
            }
            break

          // ALIGN_FLEX_START is the default - lines already at start
        }
      }

      // For wrap-reverse, lines should be positioned from the end of the cross axis
      // The lines are already in reversed order from breakIntoLines().
      // We just need to shift them so they align to the end instead of the start.
      if (isWrapReverse) {
        let totalLineCrossSize = 0
        for (let i = 0; i < numLines; i++) {
          totalLineCrossSize += lines[i]!.crossSize
        }
        totalLineCrossSize += crossGap * (numLines - 1)
        const crossStartOffset = crossAxisSize - totalLineCrossSize
        for (let i = 0; i < numLines; i++) {
          lineCrossOffsets[i]! += crossStartOffset
        }
      }
    }

    // Position and layout children
    // For reverse directions, start from the END of the container
    // For RTL row layouts, treat as reversed (children flow right-to-left)
    // RTL + reverse cancels out (XOR behavior)
    const isRTL = direction === C.DIRECTION_RTL
    const effectiveReverse = isRow ? isRTL !== isReverse : isReverse
    // Use fractional mainPos for edge-based rounding
    let mainPos = effectiveReverse ? mainAxisSize - startOffset : startOffset
    let currentLineIdx = -1

    log.debug?.(
      "positioning children: isRow=%s, startOffset=%d, relativeChildren=%d, isReverse=%s, lines=%d",
      isRow,
      startOffset,
      relativeChildren.length,
      isReverse,
      lines.length,
    )

    for (let i = 0; i < children.length; i++) {
      const childLayout = children[i]!
      const child = childLayout.node
      const childStyle = child.style

      // Check if we've moved to a new line (for flex-wrap)
      const childLineIdx = childLineIndex.get(childLayout) ?? 0
      if (childLineIdx !== currentLineIdx) {
        currentLineIdx = childLineIdx
        // Reset mainPos for new line
        mainPos = effectiveReverse ? mainAxisSize - startOffset : startOffset
      }

      // Get cross-axis offset for this child's line
      const lineCrossOffset = lineCrossOffsets[childLineIdx] ?? 0

      // For main-axis margins, use computed auto margin values
      // For cross-axis margins, resolve normally (auto margins on cross axis handled separately)
      let childMarginLeft: number
      let childMarginTop: number
      let childMarginRight: number
      let childMarginBottom: number

      // CSS spec: percentage margins resolve against containing block's WIDTH only
      // Use resolveEdgeValue to respect logical EDGE_START/END
      if (isRow) {
        // Row: main axis is horizontal
        // In row-reverse, mainStart=right(2), mainEnd=left(0)
        childMarginLeft =
          childLayout.mainStartMarginAuto && !isReverse
            ? childLayout.mainStartMarginValue
            : childLayout.mainEndMarginAuto && isReverse
              ? childLayout.mainEndMarginValue
              : resolveEdgeValue(childStyle.margin, 0, style.flexDirection, contentWidth, direction)
        childMarginRight =
          childLayout.mainEndMarginAuto && !isReverse
            ? childLayout.mainEndMarginValue
            : childLayout.mainStartMarginAuto && isReverse
              ? childLayout.mainStartMarginValue
              : resolveEdgeValue(childStyle.margin, 2, style.flexDirection, contentWidth, direction)
        childMarginTop = resolveEdgeValue(childStyle.margin, 1, style.flexDirection, contentWidth, direction)
        childMarginBottom = resolveEdgeValue(childStyle.margin, 3, style.flexDirection, contentWidth, direction)
      } else {
        // Column: main axis is vertical
        // In column-reverse, mainStart=bottom(3), mainEnd=top(1)
        childMarginTop =
          childLayout.mainStartMarginAuto && !isReverse
            ? childLayout.mainStartMarginValue
            : childLayout.mainEndMarginAuto && isReverse
              ? childLayout.mainEndMarginValue
              : resolveEdgeValue(childStyle.margin, 1, style.flexDirection, contentWidth, direction)
        childMarginBottom =
          childLayout.mainEndMarginAuto && !isReverse
            ? childLayout.mainEndMarginValue
            : childLayout.mainStartMarginAuto && isReverse
              ? childLayout.mainStartMarginValue
              : resolveEdgeValue(childStyle.margin, 3, style.flexDirection, contentWidth, direction)
        childMarginLeft = resolveEdgeValue(childStyle.margin, 0, style.flexDirection, contentWidth, direction)
        childMarginRight = resolveEdgeValue(childStyle.margin, 2, style.flexDirection, contentWidth, direction)
      }

      // Main axis size comes from flex algorithm (already rounded)
      const childMainSize = childLayout.mainSize

      // Cross axis: determine alignment mode
      let alignment = style.alignItems
      if (childStyle.alignSelf !== C.ALIGN_AUTO) {
        alignment = childStyle.alignSelf
      }

      // Cross axis size depends on alignment and child's explicit dimensions
      // IMPORTANT: Resolve percent against parent's cross axis, not child's available
      let childCrossSize: number
      const crossDim = isRow ? childStyle.height : childStyle.width
      const crossMargin = isRow ? childMarginTop + childMarginBottom : childMarginLeft + childMarginRight

      // Check if parent has definite cross-axis size
      // Parent can have definite cross from either:
      // 1. Explicit style (width/height in points or percent)
      // 2. Definite available space (crossAxisSize is not NaN)
      const parentCrossDim = isRow ? style.height : style.width
      const parentHasDefiniteCrossStyle = parentCrossDim.unit === C.UNIT_POINT || parentCrossDim.unit === C.UNIT_PERCENT
      // crossAxisSize comes from available space - if it's a real number, we have a constraint
      const parentHasDefiniteCross = parentHasDefiniteCrossStyle || !Number.isNaN(crossAxisSize)

      if (crossDim.unit === C.UNIT_POINT) {
        // Explicit cross size
        childCrossSize = crossDim.value
      } else if (crossDim.unit === C.UNIT_PERCENT) {
        // Percent of PARENT's cross axis (resolveValue handles NaN → 0)
        childCrossSize = resolveValue(crossDim, crossAxisSize)
      } else if (parentHasDefiniteCross && alignment === C.ALIGN_STRETCH) {
        // Stretch alignment with definite parent cross size - fill the cross axis
        childCrossSize = crossAxisSize - crossMargin
      } else {
        // Non-stretch alignment or no definite cross size - shrink-wrap to content
        childCrossSize = NaN
      }

      // Apply cross-axis min/max constraints
      const crossMinVal = isRow ? childStyle.minHeight : childStyle.minWidth
      const crossMaxVal = isRow ? childStyle.maxHeight : childStyle.maxWidth
      const crossMin = crossMinVal.unit !== C.UNIT_UNDEFINED ? resolveValue(crossMinVal, crossAxisSize) : 0
      const crossMax = crossMaxVal.unit !== C.UNIT_UNDEFINED ? resolveValue(crossMaxVal, crossAxisSize) : Infinity

      // Apply constraints - for NaN (shrink-wrap), use min as floor
      if (Number.isNaN(childCrossSize)) {
        // For shrink-wrap, min sets the floor - child will be at least this size
        if (crossMin > 0) {
          childCrossSize = crossMin
        }
      } else {
        childCrossSize = Math.max(crossMin, Math.min(crossMax, childCrossSize))
      }

      // Handle intrinsic sizing for auto-sized children
      // For auto main size children, use flex-computed size if flexGrow > 0,
      // otherwise pass remaining available space for shrink-wrap behavior
      const mainDim = isRow ? childStyle.width : childStyle.height
      const mainIsAuto = mainDim.unit === C.UNIT_AUTO || mainDim.unit === C.UNIT_UNDEFINED
      const hasFlexGrow = childLayout.flexGrow > 0
      // Check if parent has definite main-axis size
      const parentMainDim = isRow ? style.width : style.height
      const parentHasDefiniteMain = parentMainDim.unit === C.UNIT_POINT || parentMainDim.unit === C.UNIT_PERCENT
      // Use flex-computed mainSize for all cases - it includes padding/border as minimum
      // The flex algorithm already computed the proper size based on content/padding/border
      let effectiveMainSize: number
      if (hasFlexGrow) {
        effectiveMainSize = childMainSize
      } else if (mainIsAuto) {
        // Child is auto: use flex-computed size which includes padding/border minimum
        effectiveMainSize = childMainSize
      } else {
        effectiveMainSize = childMainSize
      }

      let childWidth = isRow ? effectiveMainSize : childCrossSize
      let childHeight = isRow ? childCrossSize : effectiveMainSize

      // Only use measure function for intrinsic sizing when flexGrow is NOT set
      // When flexGrow > 0, the flex algorithm determines size, not the content
      const shouldMeasure = child.hasMeasureFunc() && child.children.length === 0 && !hasFlexGrow
      if (shouldMeasure) {
        const widthAuto = childStyle.width.unit === C.UNIT_AUTO || childStyle.width.unit === C.UNIT_UNDEFINED
        const heightAuto = childStyle.height.unit === C.UNIT_AUTO || childStyle.height.unit === C.UNIT_UNDEFINED

        if (widthAuto || heightAuto) {
          // Call measure function with available space
          const widthMode = widthAuto ? C.MEASURE_MODE_AT_MOST : C.MEASURE_MODE_EXACTLY
          const heightMode = heightAuto ? C.MEASURE_MODE_UNDEFINED : C.MEASURE_MODE_EXACTLY

          // For unconstrained dimensions (NaN), use Infinity for measure func
          const rawAvailW = widthAuto
            ? isRow
              ? mainAxisSize - mainPos // Remaining space after previous children
              : crossAxisSize - crossMargin
            : childStyle.width.value
          const rawAvailH = heightAuto
            ? isRow
              ? crossAxisSize - crossMargin
              : mainAxisSize - mainPos // Remaining space for COLUMN
            : childStyle.height.value
          const availW = Number.isNaN(rawAvailW) ? Infinity : rawAvailW
          const availH = Number.isNaN(rawAvailH) ? Infinity : rawAvailH

          const measured = child.measureFunc!(availW, widthMode, availH, heightMode)

          // For measure function nodes without flexGrow, intrinsic size takes precedence
          if (widthAuto) {
            childWidth = measured.width
          }
          if (heightAuto) {
            childHeight = measured.height
          }
        }
      }

      // Child position within content area (fractional for edge-based rounding)
      // For reverse directions (including RTL for row), position from mainPos - childSize
      // IMPORTANT: In reverse, swap which margin is applied to which side
      // EDGE_START (margin[0]/[1]) becomes the trailing margin in reverse layout
      // EDGE_END (margin[2]/[3]) becomes the leading margin in reverse layout
      // For flex-wrap, add lineCrossOffset to cross-axis position
      let childX: number
      let childY: number
      if (effectiveReverse) {
        if (isRow) {
          // Row-reverse or RTL: items positioned from right
          // In RTL, EDGE_START is the right edge, so use childMarginRight as trailing margin
          // In row-reverse LTR, EDGE_END is the right edge, so use childMarginRight too
          childX = mainPos - childMainSize - childMarginRight
          childY = lineCrossOffset + childMarginTop
        } else {
          // Column-reverse: items positioned from bottom
          childX = lineCrossOffset + childMarginLeft
          childY = mainPos - childMainSize - childMarginTop
        }
      } else {
        childX = isRow ? mainPos + childMarginLeft : lineCrossOffset + childMarginLeft
        childY = isRow ? lineCrossOffset + childMarginTop : mainPos + childMarginTop
      }

      // Edge-based rounding using ABSOLUTE coordinates (Yoga-compatible)
      // This ensures adjacent elements share exact boundaries without gaps
      // Key insight: round absolute edges, derive sizes from differences
      const fractionalLeft = innerLeft + childX
      const fractionalTop = innerTop + childY

      // Compute position offsets for RELATIVE/STATIC positioned children
      // These must be included in the absolute position BEFORE rounding (Yoga-compatible)
      let posOffsetX = 0
      let posOffsetY = 0
      if (childStyle.positionType === C.POSITION_TYPE_RELATIVE || childStyle.positionType === C.POSITION_TYPE_STATIC) {
        const relLeftPos = childStyle.position[0]
        const relTopPos = childStyle.position[1]
        const relRightPos = childStyle.position[2]
        const relBottomPos = childStyle.position[3]

        // Left offset (takes precedence over right)
        if (relLeftPos.unit !== C.UNIT_UNDEFINED) {
          posOffsetX = resolveValue(relLeftPos, contentWidth)
        } else if (relRightPos.unit !== C.UNIT_UNDEFINED) {
          posOffsetX = -resolveValue(relRightPos, contentWidth)
        }

        // Top offset (takes precedence over bottom)
        if (relTopPos.unit !== C.UNIT_UNDEFINED) {
          posOffsetY = resolveValue(relTopPos, contentHeight)
        } else if (relBottomPos.unit !== C.UNIT_UNDEFINED) {
          posOffsetY = -resolveValue(relBottomPos, contentHeight)
        }
      }

      // Compute ABSOLUTE float positions for edge rounding (including position offsets)
      // absX/absY are the parent's absolute position from document root
      // Include BOTH parent's position offset and child's position offset
      const absChildLeft = absX + marginLeft + parentPosOffsetX + fractionalLeft + posOffsetX
      const absChildTop = absY + marginTop + parentPosOffsetY + fractionalTop + posOffsetY

      // For main axis: round ABSOLUTE edges and derive size
      // Only use edge-based rounding when childMainSize is valid (positive)
      let roundedAbsMainStart: number
      let roundedAbsMainEnd: number
      let edgeBasedMainSize: number
      const useEdgeBasedRounding = childMainSize > 0

      // Compute child's box model minimum early (needed for edge-based rounding)
      // Use resolveEdgeValue to respect logical EDGE_START/END for padding
      const childPaddingL = resolveEdgeValue(childStyle.padding, 0, childStyle.flexDirection, contentWidth, direction)
      const childPaddingT = resolveEdgeValue(childStyle.padding, 1, childStyle.flexDirection, contentWidth, direction)
      const childPaddingR = resolveEdgeValue(childStyle.padding, 2, childStyle.flexDirection, contentWidth, direction)
      const childPaddingB = resolveEdgeValue(childStyle.padding, 3, childStyle.flexDirection, contentWidth, direction)
      const childBorderL = resolveEdgeBorderValue(childStyle.border, 0, childStyle.flexDirection, direction)
      const childBorderT = resolveEdgeBorderValue(childStyle.border, 1, childStyle.flexDirection, direction)
      const childBorderR = resolveEdgeBorderValue(childStyle.border, 2, childStyle.flexDirection, direction)
      const childBorderB = resolveEdgeBorderValue(childStyle.border, 3, childStyle.flexDirection, direction)
      const childMinW = childPaddingL + childPaddingR + childBorderL + childBorderR
      const childMinH = childPaddingT + childPaddingB + childBorderT + childBorderB
      const childMinMain = isRow ? childMinW : childMinH

      // Apply box model constraint to childMainSize before edge rounding
      const constrainedMainSize = Math.max(childMainSize, childMinMain)

      if (useEdgeBasedRounding) {
        if (isRow) {
          roundedAbsMainStart = Math.round(absChildLeft)
          roundedAbsMainEnd = Math.round(absChildLeft + constrainedMainSize)
          edgeBasedMainSize = roundedAbsMainEnd - roundedAbsMainStart
        } else {
          roundedAbsMainStart = Math.round(absChildTop)
          roundedAbsMainEnd = Math.round(absChildTop + constrainedMainSize)
          edgeBasedMainSize = roundedAbsMainEnd - roundedAbsMainStart
        }
      } else {
        // For children without valid main size, use simple rounding
        roundedAbsMainStart = isRow ? Math.round(absChildLeft) : Math.round(absChildTop)
        edgeBasedMainSize = childMinMain // Use minimum size instead of 0
      }

      // Calculate child's RELATIVE position (stored in layout)
      // Yoga behavior: position is rounded locally, size uses absolute edge rounding
      // This ensures sizes are pixel-perfect at document level while positions remain intuitive
      const childLeft = Math.round(fractionalLeft + posOffsetX)
      const childTop = Math.round(fractionalTop + posOffsetY)

      // Check if cross axis is auto-sized (needed for deciding what to pass to layoutNode)
      const crossDimForLayoutCall = isRow ? childStyle.height : childStyle.width
      const crossIsAutoForLayoutCall =
        crossDimForLayoutCall.unit === C.UNIT_AUTO || crossDimForLayoutCall.unit === C.UNIT_UNDEFINED
      const mainDimForLayoutCall = isRow ? childStyle.width : childStyle.height

      // For auto-sized children (no flexGrow, no measureFunc), pass NaN to let them compute intrinsic size
      // Otherwise layoutNode would subtract margins from the available size
      // IMPORTANT: For percent-sized children, pass PARENT's content size so the child resolves its
      // percent against the correct containing block. This ensures grandchildren also resolve correctly.
      const mainIsPercent = mainDimForLayoutCall.unit === C.UNIT_PERCENT
      const crossIsPercent = crossDimForLayoutCall.unit === C.UNIT_PERCENT

      let passWidthToChild: number
      if (isRow && mainIsAuto && !hasFlexGrow) {
        passWidthToChild = NaN
      } else if (!isRow && crossIsAutoForLayoutCall && !parentHasDefiniteCross) {
        passWidthToChild = NaN
      } else if (isRow && mainIsPercent) {
        // Percent width (main axis in row): pass parent's content width
        passWidthToChild = contentWidth
      } else if (!isRow && crossIsPercent) {
        // Percent width (cross axis in column): pass parent's content width
        passWidthToChild = contentWidth
      } else {
        passWidthToChild = childWidth
      }

      let passHeightToChild: number
      if (!isRow && mainIsAuto && !hasFlexGrow) {
        passHeightToChild = NaN
      } else if (isRow && crossIsAutoForLayoutCall && !parentHasDefiniteCross) {
        passHeightToChild = NaN
      } else if (!isRow && mainIsPercent) {
        // Percent height (main axis in column): pass parent's content height
        passHeightToChild = contentHeight
      } else if (isRow && crossIsPercent) {
        // Percent height (cross axis in row): pass parent's content height
        passHeightToChild = contentHeight
      } else {
        passHeightToChild = childHeight
      }

      // Recurse to layout any grandchildren
      // Pass the child's FLOAT absolute position (margin box start, before child's own margin)
      // absChildLeft/Top include the child's margins, so subtract them to get margin box start
      const childAbsX = absChildLeft - childMarginLeft
      const childAbsY = absChildTop - childMarginTop
      layoutNode(child, passWidthToChild, passHeightToChild, childLeft, childTop, childAbsX, childAbsY, direction)

      // Enforce box model constraint: child can't be smaller than its padding + border
      // (using childMinW/childMinH computed earlier for edge-based rounding)
      if (childWidth < childMinW) childWidth = childMinW
      if (childHeight < childMinH) childHeight = childMinH

      // Set this child's layout - override what layoutNode computed
      // Override if any of:
      // - Child has explicit main dimension (not auto)
      // - Child has flexGrow > 0 (flex distribution applied)
      // - Child has measureFunc
      // - Parent did flex distribution (effectiveMainSize not NaN) - covers flex-shrink case
      const hasMeasure = child.hasMeasureFunc() && child.children.length === 0
      const parentDidFlexDistribution = !Number.isNaN(effectiveMainSize)
      if (!mainIsAuto || hasFlexGrow || hasMeasure || parentDidFlexDistribution) {
        // Use edge-based rounding: size = round(end_edge) - round(start_edge)
        if (isRow) {
          child.layout.width = edgeBasedMainSize
        } else {
          child.layout.height = edgeBasedMainSize
        }
      }
      // Cross axis: only override for explicit sizing or when we have a real constraint
      // For auto-sized children, let layoutNode determine the size
      const crossDimForCheck = isRow ? childStyle.height : childStyle.width
      const crossIsAuto = crossDimForCheck.unit === C.UNIT_AUTO || crossDimForCheck.unit === C.UNIT_UNDEFINED
      // Only override if child has explicit sizing OR parent has explicit cross size
      // When parent has auto cross size, let children shrink-wrap first
      // Note: parentCrossDim and parentHasDefiniteCross already computed above
      const parentCrossIsAuto = !parentHasDefiniteCross
      // Also check if childCrossSize was constrained by min/max - if so, we should override
      const hasCrossMinMax = crossMinVal.unit !== C.UNIT_UNDEFINED || crossMaxVal.unit !== C.UNIT_UNDEFINED
      const shouldOverrideCross =
        !crossIsAuto ||
        (!parentCrossIsAuto && alignment === C.ALIGN_STRETCH) ||
        (hasCrossMinMax && !Number.isNaN(childCrossSize))
      if (shouldOverrideCross) {
        if (isRow) {
          child.layout.height = Math.round(childHeight)
        } else {
          child.layout.width = Math.round(childWidth)
        }
      }
      // Store RELATIVE position (within parent's content area), not absolute
      // This matches Yoga's behavior where getComputedLeft/Top return relative positions
      // Position offsets are already included in childLeft/childTop via edge-based rounding
      child.layout.left = childLeft
      child.layout.top = childTop

      // Update childWidth/childHeight to match actual computed layout for mainPos calculation
      childWidth = child.layout.width
      childHeight = child.layout.height

      // Apply cross-axis alignment offset
      const finalCrossSize = isRow ? child.layout.height : child.layout.width
      let crossOffset = 0

      // Check for auto margins on cross axis - they override alignment
      const crossStartMargin = isRow ? childStyle.margin[1] : childStyle.margin[0] // top for row, left for column
      const crossEndMargin = isRow ? childStyle.margin[3] : childStyle.margin[2] // bottom for row, right for column
      const hasAutoStartMargin = crossStartMargin.unit === C.UNIT_AUTO
      const hasAutoEndMargin = crossEndMargin.unit === C.UNIT_AUTO
      const availableCrossSpace = crossAxisSize - finalCrossSize - crossMargin

      if (hasAutoStartMargin && hasAutoEndMargin) {
        // Both auto: center the item
        crossOffset = availableCrossSpace / 2
      } else if (hasAutoStartMargin) {
        // Auto start margin: push to end
        crossOffset = availableCrossSpace
      } else if (hasAutoEndMargin) {
        // Auto end margin: stay at start (crossOffset = 0)
        crossOffset = 0
      } else {
        // No auto margins: use alignment
        switch (alignment) {
          case C.ALIGN_FLEX_END:
            crossOffset = availableCrossSpace
            break
          case C.ALIGN_CENTER:
            crossOffset = availableCrossSpace / 2
            break
          case C.ALIGN_BASELINE:
            // Baseline alignment only applies to row direction
            // For column direction, it falls through to flex-start (default)
            if (isRow && childBaselines.length > 0) {
              crossOffset = maxBaseline - childBaselines[i]!
            }
            break
        }
      }

      if (crossOffset > 0) {
        if (isRow) {
          child.layout.top += Math.round(crossOffset)
        } else {
          child.layout.left += Math.round(crossOffset)
        }
      }

      // Advance main position using CONSTRAINED size for proper positioning
      // Use constrainedMainSize (box model minimum applied) instead of childLayout.mainSize
      const fractionalMainSize = constrainedMainSize
      // Use computed margin values (including auto margins)
      const totalMainMargin = childLayout.mainStartMarginValue + childLayout.mainEndMarginValue
      log.debug?.(
        "  child %d: mainPos=%d → top=%d (fractionalMainSize=%d, totalMainMargin=%d)",
        i,
        mainPos,
        child.layout.top,
        fractionalMainSize,
        totalMainMargin,
      )
      if (effectiveReverse) {
        mainPos -= fractionalMainSize + totalMainMargin
        if (i < children.length - 1) {
          mainPos -= itemSpacing
        }
      } else {
        mainPos += fractionalMainSize + totalMainMargin
        if (i < children.length - 1) {
          mainPos += itemSpacing
        }
      }
    }

    // For auto-sized containers (including root), shrink-wrap to content
    // Compute actual used main space from child layouts (not pre-computed childLayout.mainSize which may be 0)
    let actualUsedMain = 0
    for (const childLayout of children) {
      const childMainSize = isRow ? childLayout.node.layout.width : childLayout.node.layout.height
      const totalMainMargin = childLayout.mainStartMarginValue + childLayout.mainEndMarginValue
      actualUsedMain += childMainSize + totalMainMargin
    }
    actualUsedMain += totalGaps

    if (isRow && style.width.unit !== C.UNIT_POINT && style.width.unit !== C.UNIT_PERCENT) {
      // Auto-width row: shrink-wrap to content
      nodeWidth = actualUsedMain + innerLeft + innerRight
    }
    if (!isRow && style.height.unit !== C.UNIT_POINT && style.height.unit !== C.UNIT_PERCENT) {
      // Auto-height column: shrink-wrap to content
      nodeHeight = actualUsedMain + innerTop + innerBottom
    }
    // For cross axis, find the max child size
    // CSS spec: percentage margins resolve against containing block's WIDTH only
    // Use resolveEdgeValue to respect logical EDGE_START/END
    let maxCrossSize = 0
    for (const childLayout of children) {
      const childCross = isRow ? childLayout.node.layout.height : childLayout.node.layout.width
      const childMargin = isRow
        ? resolveEdgeValue(childLayout.node.style.margin, 1, style.flexDirection, contentWidth, direction) +
          resolveEdgeValue(childLayout.node.style.margin, 3, style.flexDirection, contentWidth, direction)
        : resolveEdgeValue(childLayout.node.style.margin, 0, style.flexDirection, contentWidth, direction) +
          resolveEdgeValue(childLayout.node.style.margin, 2, style.flexDirection, contentWidth, direction)
      maxCrossSize = Math.max(maxCrossSize, childCross + childMargin)
    }
    // Cross-axis shrink-wrap for auto-sized dimension
    // Only shrink-wrap if the original available size was truly unconstrained (NaN)
    // If a definite size was passed to calculateLayout, keep that size
    if (
      isRow &&
      style.height.unit !== C.UNIT_POINT &&
      style.height.unit !== C.UNIT_PERCENT &&
      Number.isNaN(availableHeight)
    ) {
      // Auto-height row with unconstrained height: shrink-wrap to max child height
      nodeHeight = maxCrossSize + innerTop + innerBottom
    }
    if (
      !isRow &&
      style.width.unit !== C.UNIT_POINT &&
      style.width.unit !== C.UNIT_PERCENT &&
      Number.isNaN(availableWidth)
    ) {
      // Auto-width column with unconstrained width: shrink-wrap to max child width
      nodeWidth = maxCrossSize + innerLeft + innerRight
    }
  }

  // Re-apply min/max constraints after any shrink-wrap adjustments
  // This ensures containers don't violate their constraints after auto-sizing
  nodeWidth = applyMinMax(nodeWidth, style.minWidth, style.maxWidth, availableWidth)
  nodeHeight = applyMinMax(nodeHeight, style.minHeight, style.maxHeight, availableHeight)

  // Re-enforce box model constraint: minimum size = padding + border
  // This must be applied AFTER applyMinMax since min/max can't reduce below padding+border
  if (!Number.isNaN(nodeWidth) && nodeWidth < minInnerWidth) {
    nodeWidth = minInnerWidth
  }
  if (!Number.isNaN(nodeHeight) && nodeHeight < minInnerHeight) {
    nodeHeight = minInnerHeight
  }

  // Set this node's layout using edge-based rounding (Yoga-compatible)
  // Use parentPosOffsetX/Y computed earlier (includes position offsets)
  // Compute absolute positions for edge-based rounding
  const absNodeLeft = absX + marginLeft + parentPosOffsetX
  const absNodeTop = absY + marginTop + parentPosOffsetY
  const absNodeRight = absNodeLeft + nodeWidth
  const absNodeBottom = absNodeTop + nodeHeight

  // Round edges and derive sizes (Yoga algorithm)
  const roundedAbsLeft = Math.round(absNodeLeft)
  const roundedAbsTop = Math.round(absNodeTop)
  const roundedAbsRight = Math.round(absNodeRight)
  const roundedAbsBottom = Math.round(absNodeBottom)

  layout.width = roundedAbsRight - roundedAbsLeft
  layout.height = roundedAbsBottom - roundedAbsTop
  // Position is relative to parent, derived from absolute rounding
  const roundedAbsParentLeft = Math.round(absX)
  const roundedAbsParentTop = Math.round(absY)
  layout.left = roundedAbsLeft - roundedAbsParentLeft
  layout.top = roundedAbsTop - roundedAbsParentTop

  // Layout absolute children - handle left/right/top/bottom offsets
  // Absolute positioning uses the PADDING BOX as the containing block
  // (inside border but INCLUDING padding, not the content box)
  const absInnerLeft = borderLeft
  const absInnerTop = borderTop
  const absInnerRight = borderRight
  const absInnerBottom = borderBottom
  const absPaddingBoxW = nodeWidth - absInnerLeft - absInnerRight
  const absPaddingBoxH = nodeHeight - absInnerTop - absInnerBottom
  // Content box dimensions for percentage resolution of absolute children
  const absContentBoxW = absPaddingBoxW - paddingLeft - paddingRight
  const absContentBoxH = absPaddingBoxH - paddingTop - paddingBottom

  for (const child of absoluteChildren) {
    const childStyle = child.style
    // CSS spec: percentage margins resolve against containing block's WIDTH only
    // Use resolveEdgeValue to respect logical EDGE_START/END
    const childMarginLeft = resolveEdgeValue(childStyle.margin, 0, style.flexDirection, nodeWidth, direction)
    const childMarginTop = resolveEdgeValue(childStyle.margin, 1, style.flexDirection, nodeWidth, direction)
    const childMarginRight = resolveEdgeValue(childStyle.margin, 2, style.flexDirection, nodeWidth, direction)
    const childMarginBottom = resolveEdgeValue(childStyle.margin, 3, style.flexDirection, nodeWidth, direction)

    // Position offsets from setPosition(edge, value)
    const leftPos = childStyle.position[0]
    const topPos = childStyle.position[1]
    const rightPos = childStyle.position[2]
    const bottomPos = childStyle.position[3]

    const hasLeft = leftPos.unit !== C.UNIT_UNDEFINED
    const hasRight = rightPos.unit !== C.UNIT_UNDEFINED
    const hasTop = topPos.unit !== C.UNIT_UNDEFINED
    const hasBottom = bottomPos.unit !== C.UNIT_UNDEFINED

    const leftOffset = resolveValue(leftPos, nodeWidth)
    const topOffset = resolveValue(topPos, nodeHeight)
    const rightOffset = resolveValue(rightPos, nodeWidth)
    const bottomOffset = resolveValue(bottomPos, nodeHeight)

    // Calculate available size for absolute child using padding box
    const contentW = absPaddingBoxW
    const contentH = absPaddingBoxH

    // Determine child width
    // - If both left and right set with auto width: stretch to fill
    // - If auto width but NOT both left and right: shrink to intrinsic (NaN)
    // - For percentage width: resolve against content box
    // - Otherwise (explicit width): use available width as constraint
    let childAvailWidth: number
    const widthIsAuto = childStyle.width.unit === C.UNIT_AUTO || childStyle.width.unit === C.UNIT_UNDEFINED
    const widthIsPercent = childStyle.width.unit === C.UNIT_PERCENT
    if (widthIsAuto && hasLeft && hasRight) {
      childAvailWidth = contentW - leftOffset - rightOffset - childMarginLeft - childMarginRight
    } else if (widthIsAuto) {
      childAvailWidth = NaN // Shrink to intrinsic size
    } else if (widthIsPercent) {
      // Percentage widths resolve against content box (inside padding)
      childAvailWidth = absContentBoxW
    } else {
      childAvailWidth = contentW
    }

    // Determine child height
    // - If both top and bottom set with auto height: stretch to fill
    // - If auto height but NOT both top and bottom: shrink to intrinsic (NaN)
    // - For percentage height: resolve against content box
    // - Otherwise (explicit height): use available height as constraint
    let childAvailHeight: number
    const heightIsAuto = childStyle.height.unit === C.UNIT_AUTO || childStyle.height.unit === C.UNIT_UNDEFINED
    const heightIsPercent = childStyle.height.unit === C.UNIT_PERCENT
    if (heightIsAuto && hasTop && hasBottom) {
      childAvailHeight = contentH - topOffset - bottomOffset - childMarginTop - childMarginBottom
    } else if (heightIsAuto) {
      childAvailHeight = NaN // Shrink to intrinsic size
    } else if (heightIsPercent) {
      // Percentage heights resolve against content box (inside padding)
      childAvailHeight = absContentBoxH
    } else {
      childAvailHeight = contentH
    }

    // Compute child position
    let childX = childMarginLeft + leftOffset
    let childY = childMarginTop + topOffset

    // First, layout the child to get its dimensions
    // Use padding box origin (absInnerLeft/Top = border only)
    // Compute child's absolute position (margin box start, before child's own margin)
    // Parent's padding box = absX + marginLeft + borderLeft = absX + marginLeft + absInnerLeft
    // Child's margin box = parent's padding box + leftOffset
    const childAbsX = absX + marginLeft + absInnerLeft + leftOffset
    const childAbsY = absY + marginTop + absInnerTop + topOffset
    // Preserve NaN for shrink-wrap mode - only clamp real numbers to 0
    const clampIfNumber = (v: number) => (Number.isNaN(v) ? NaN : Math.max(0, v))
    layoutNode(
      child,
      clampIfNumber(childAvailWidth),
      clampIfNumber(childAvailHeight),
      layout.left + absInnerLeft + childX,
      layout.top + absInnerTop + childY,
      childAbsX,
      childAbsY,
      direction,
    )

    // Now compute final position based on right/bottom if left/top not set
    const childWidth = child.layout.width
    const childHeight = child.layout.height

    // Apply alignment when no explicit position set
    // For absolute children, align-items/justify-content apply when no position offsets
    if (!hasLeft && !hasRight) {
      // No horizontal position - use align-items (for row) or justify-content (for column)
      // Default column direction: cross-axis is horizontal, use alignItems
      let alignment = style.alignItems
      if (childStyle.alignSelf !== C.ALIGN_AUTO) {
        alignment = childStyle.alignSelf
      }
      const freeSpaceX = contentW - childWidth - childMarginLeft - childMarginRight
      switch (alignment) {
        case C.ALIGN_CENTER:
          childX = childMarginLeft + freeSpaceX / 2
          break
        case C.ALIGN_FLEX_END:
          childX = childMarginLeft + freeSpaceX
          break
        case C.ALIGN_STRETCH:
          // Stretch: already handled by setting width to fill
          break
        default: // FLEX_START
          childX = childMarginLeft
          break
      }
    } else if (!hasLeft && hasRight) {
      // Position from right edge
      childX = contentW - rightOffset - childMarginRight - childWidth
    } else if (hasLeft && hasRight && widthIsAuto) {
      // Stretch width already handled above
      child.layout.width = Math.round(childAvailWidth)
    }

    if (!hasTop && !hasBottom) {
      // No vertical position - use justify-content (for row) or align-items (for column)
      // Default column direction: main-axis is vertical, use justifyContent
      const freeSpaceY = contentH - childHeight - childMarginTop - childMarginBottom
      switch (style.justifyContent) {
        case C.JUSTIFY_CENTER:
          childY = childMarginTop + freeSpaceY / 2
          break
        case C.JUSTIFY_FLEX_END:
          childY = childMarginTop + freeSpaceY
          break
        default: // FLEX_START
          childY = childMarginTop
          break
      }
    } else if (!hasTop && hasBottom) {
      // Position from bottom edge
      childY = contentH - bottomOffset - childMarginBottom - childHeight
    } else if (hasTop && hasBottom && heightIsAuto) {
      // Stretch height already handled above
      child.layout.height = Math.round(childAvailHeight)
    }

    // Set final position (relative to container padding box)
    child.layout.left = Math.round(absInnerLeft + childX)
    child.layout.top = Math.round(absInnerTop + childY)
  }
}

// ============================================================================
// Layout Stats (stubs for API compatibility with zero-alloc version)
// ============================================================================
// The classic algorithm doesn't track detailed stats, but we export stubs
// so the public API remains consistent between versions.

export let layoutNodeCalls = 0
export let resolveEdgeCalls = 0
export let layoutSizingCalls = 0
export let layoutPositioningCalls = 0
export let layoutCacheHits = 0

export function resetLayoutStats(): void {
  layoutNodeCalls = 0
  resolveEdgeCalls = 0
  layoutSizingCalls = 0
  layoutPositioningCalls = 0
  layoutCacheHits = 0
}
