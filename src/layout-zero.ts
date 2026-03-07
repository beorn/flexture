/**
 * Flexture Layout Algorithm — Main Entry Point
 *
 * Core flexbox layout computation. This file contains:
 * - computeLayout(): top-level entry point
 * - layoutNode(): recursive layout algorithm (11 phases)
 *
 * Helper modules (split for maintainability, zero-allocation preserved):
 * - layout-helpers.ts: Edge resolution (margins, padding, borders)
 * - layout-traversal.ts: Tree traversal (markSubtreeLayoutSeen, countNodes)
 * - layout-flex-lines.ts: Pre-allocated arrays, line breaking, flex distribution
 * - layout-measure.ts: Intrinsic sizing (measureNode)
 * - layout-stats.ts: Debug/benchmark counters
 *
 * Based on Planning-nl/flexbox.js reference implementation.
 */

import * as C from "./constants.js"
import type { Node } from "./node-zero.js"
import { resolveValue, applyMinMax } from "./utils.js"
import { log } from "./logger.js"
import { getTrace } from "./trace.js"

// Re-export helpers for backward compatibility
export {
  isRowDirection,
  isReverseDirection,
  resolveEdgeValue,
  isEdgeAuto,
  resolveEdgeBorderValue,
} from "./layout-helpers.js"

// Re-export traversal utilities for backward compatibility
export { markSubtreeLayoutSeen, countNodes } from "./layout-traversal.js"

// Re-export stats for backward compatibility
export {
  layoutNodeCalls,
  measureNodeCalls,
  resolveEdgeCalls,
  layoutSizingCalls,
  layoutPositioningCalls,
  layoutCacheHits,
  resetLayoutStats,
} from "./layout-stats.js"

// Re-export measureNode for backward compatibility
export { measureNode } from "./layout-measure.js"

// Import what we need internally
import {
  isRowDirection,
  isReverseDirection,
  resolveEdgeValue,
  isEdgeAuto,
  resolveEdgeBorderValue,
} from "./layout-helpers.js"
import { propagatePositionDelta } from "./layout-traversal.js"
import {
  resetLayoutStats,
  incLayoutNodeCalls,
  incLayoutSizingCalls,
  incLayoutPositioningCalls,
  incLayoutCacheHits,
} from "./layout-stats.js"
import { measureNode } from "./layout-measure.js"
import {
  MAX_FLEX_LINES,
  _lineCrossSizes,
  _lineCrossOffsets,
  _lineChildren,
  _lineJustifyStarts,
  _lineItemSpacings,
  breakIntoLines,
  distributeFlexSpaceForLine,
} from "./layout-flex-lines.js"

/**
 * Compute layout for a node tree.
 */
export function computeLayout(
  root: Node,
  availableWidth: number,
  availableHeight: number,
  direction: number = C.DIRECTION_LTR,
): void {
  resetLayoutStats()
  getTrace()?.resetCounter()
  // Clear layout cache from previous pass (important for correct layout after tree changes)
  root.resetLayoutCache()
  // Pass absolute position (0,0) for root node - used for Yoga-compatible edge rounding
  layoutNode(root, availableWidth, availableHeight, 0, 0, 0, 0, direction)
}

/**
 * Layout a node and its children.
 *
 * @param absX - Absolute X position from document root (for Yoga-compatible edge rounding)
 * @param absY - Absolute Y position from document root (for Yoga-compatible edge rounding)
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
  incLayoutNodeCalls()
  // Track sizing vs positioning calls
  const isSizingPass = offsetX === 0 && offsetY === 0 && absX === 0 && absY === 0
  if (isSizingPass && node.children.length > 0) {
    incLayoutSizingCalls()
  } else {
    incLayoutPositioningCalls()
  }
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
  const _t = getTrace()
  const _tn = _t?.nextNode() ?? 0
  _t?.layoutEnter(_tn, availableWidth, availableHeight, node.isDirty(), node.children.length)
  const style = node.style
  const layout = node.layout

  // ============================================================================
  // PHASE 1: Early Exit Checks
  // ============================================================================

  // Handle display: none
  if (style.display === C.DISPLAY_NONE) {
    layout.left = 0
    layout.top = 0
    layout.width = 0
    layout.height = 0
    return
  }

  // Constraint fingerprinting: skip layout if constraints unchanged and node not dirty
  // Use Object.is() for NaN-safe comparison (NaN === NaN is false, Object.is(NaN, NaN) is true)
  const flex = node.flex
  if (
    flex.layoutValid &&
    !node.isDirty() &&
    Object.is(flex.lastAvailW, availableWidth) &&
    Object.is(flex.lastAvailH, availableHeight) &&
    flex.lastDir === direction
  ) {
    // Constraints unchanged - just update position based on offset delta
    _t?.fingerprintHit(_tn, availableWidth, availableHeight)
    const deltaX = offsetX - flex.lastOffsetX
    const deltaY = offsetY - flex.lastOffsetY
    if (deltaX !== 0 || deltaY !== 0) {
      layout.left += deltaX
      layout.top += deltaY
      flex.lastOffsetX = offsetX
      flex.lastOffsetY = offsetY
      // Propagate position delta to all children
      propagatePositionDelta(node, deltaX, deltaY)
    }
    return
  }
  _t?.fingerprintMiss(_tn, availableWidth, availableHeight, {
    layoutValid: flex.layoutValid,
    isDirty: node.isDirty(),
    sameW: Object.is(flex.lastAvailW, availableWidth),
    sameH: Object.is(flex.lastAvailH, availableHeight),
    sameDir: flex.lastDir === direction,
  })

  // ============================================================================
  // PHASE 2: Resolve Spacing (margins, padding, borders)
  // CSS spec: percentage margins AND padding resolve against containing block's WIDTH only
  // ============================================================================

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

  // ============================================================================
  // PHASE 3: Calculate Node Dimensions
  // When available dimension is NaN (unconstrained), auto-sized nodes use NaN
  // and will be sized by shrink-wrap logic based on children
  // ============================================================================

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

  // Apply aspect ratio constraint (CSS aspect-ratio spec)
  // If aspectRatio is set and one dimension is auto (NaN), derive it from the other.
  // Re-apply min/max constraints on the derived dimension to respect CSS box model.
  const aspectRatio = style.aspectRatio
  if (!Number.isNaN(aspectRatio) && aspectRatio > 0) {
    const widthIsAuto = Number.isNaN(nodeWidth) || style.width.unit === C.UNIT_AUTO
    const heightIsAuto = Number.isNaN(nodeHeight) || style.height.unit === C.UNIT_AUTO

    if (widthIsAuto && !heightIsAuto && !Number.isNaN(nodeHeight)) {
      // Height is defined, width is auto: width = height * aspectRatio
      nodeWidth = nodeHeight * aspectRatio
      // Re-apply min/max for derived width
      nodeWidth = applyMinMax(nodeWidth, style.minWidth, style.maxWidth, availableWidth)
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

  // =========================================================================
  // PHASE 4: Handle Leaf Nodes (nodes without children)
  // =========================================================================
  // Two cases:
  // - With measureFunc: Call measure to get intrinsic size (text nodes)
  // - Without measureFunc: Use padding+border as intrinsic size (empty boxes)

  // Handle measure function (text nodes)
  if (node.hasMeasureFunc() && node.children.length === 0) {
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

    // Use cached measure to avoid redundant calls within a layout pass
    const measured = node.cachedMeasure(measureWidth, widthMode, measureHeight, heightMode)!

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

  // =========================================================================
  // PHASE 5: Flex Layout - Collect Children and Compute Base Sizes
  // =========================================================================
  // Single pass over children:
  // - Skip absolute/hidden children (relativeIndex = -1)
  // - Cache resolved margins for each relative child
  // - Compute base main size from flex-basis, explicit size, or intrinsic size
  // - Track flex grow/shrink factors and min/max constraints
  // - Count auto margins for later distribution

  const isRow = isRowDirection(style.flexDirection)
  const isReverse = isReverseDirection(style.flexDirection)
  // For RTL, row direction is reversed (XOR with isReverse)
  const isRTL = direction === C.DIRECTION_RTL
  const effectiveReverse = isRow ? isRTL !== isReverse : isReverse

  const mainAxisSize = isRow ? contentWidth : contentHeight
  const crossAxisSize = isRow ? contentHeight : contentWidth
  const mainGap = isRow ? style.gap[0] : style.gap[1]

  // Prepare child flex info (stored on each child node - zero allocation)
  let totalBaseMain = 0
  let relativeCount = 0
  let totalAutoMargins = 0 // Count auto margins during this pass
  let hasBaselineAlignment = style.alignItems === C.ALIGN_BASELINE

  for (const child of node.children) {
    // Mark relativeIndex (-1 for absolute/hidden, 0+ for relative)
    if (child.style.display === C.DISPLAY_NONE || child.style.positionType === C.POSITION_TYPE_ABSOLUTE) {
      child.flex.relativeIndex = -1
      continue
    }
    child.flex.relativeIndex = relativeCount++
    const childStyle = child.style
    const cflex = child.flex

    // Check for auto margins on main axis
    // Physical indices depend on axis and effective reverse (including RTL):
    // - Row LTR: main-start=left(0), main-end=right(2)
    // - Row RTL: main-start=right(2), main-end=left(0)
    // - Row-reverse LTR: main-start=right(2), main-end=left(0)
    // - Row-reverse RTL: main-start=left(0), main-end=right(2)
    // - Column: main-start=top(1), main-end=bottom(3) (RTL doesn't affect column)
    // - Column-reverse: main-start=bottom(3), main-end=top(1)
    // For row layouts, use effectiveReverse (which XORs RTL with isReverse)
    const mainStartIndex = isRow ? (effectiveReverse ? 2 : 0) : isReverse ? 3 : 1
    const mainEndIndex = isRow ? (effectiveReverse ? 0 : 2) : isReverse ? 1 : 3
    cflex.mainStartMarginAuto = isEdgeAuto(childStyle.margin, mainStartIndex, style.flexDirection, direction)
    cflex.mainEndMarginAuto = isEdgeAuto(childStyle.margin, mainEndIndex, style.flexDirection, direction)

    // Cache all 4 resolved margins once (CSS spec: percentages resolve against containing block's WIDTH)
    // This avoids repeated resolveEdgeValue calls throughout the layout pass
    cflex.marginL = resolveEdgeValue(childStyle.margin, 0, style.flexDirection, contentWidth, direction)
    cflex.marginT = resolveEdgeValue(childStyle.margin, 1, style.flexDirection, contentWidth, direction)
    cflex.marginR = resolveEdgeValue(childStyle.margin, 2, style.flexDirection, contentWidth, direction)
    cflex.marginB = resolveEdgeValue(childStyle.margin, 3, style.flexDirection, contentWidth, direction)

    // Resolve non-auto margins (auto margins resolve to 0 initially)
    // Use effectiveReverse for row layouts (accounts for RTL)
    cflex.mainStartMarginValue = cflex.mainStartMarginAuto
      ? 0
      : isRow
        ? effectiveReverse
          ? cflex.marginR
          : cflex.marginL
        : isReverse
          ? cflex.marginB
          : cflex.marginT
    cflex.mainEndMarginValue = cflex.mainEndMarginAuto
      ? 0
      : isRow
        ? effectiveReverse
          ? cflex.marginL
          : cflex.marginR
        : isReverse
          ? cflex.marginT
          : cflex.marginB

    // Total non-auto margin for flex calculations
    cflex.mainMargin = cflex.mainStartMarginValue + cflex.mainEndMarginValue

    // Determine base size (flex-basis or explicit size)
    // Guard: percent against NaN (unconstrained) resolves to 0 (CSS/Yoga behavior)
    let baseSize = 0
    if (childStyle.flexBasis.unit === C.UNIT_POINT) {
      baseSize = childStyle.flexBasis.value
    } else if (childStyle.flexBasis.unit === C.UNIT_PERCENT) {
      baseSize = Number.isNaN(mainAxisSize) ? 0 : mainAxisSize * (childStyle.flexBasis.value / 100)
    } else {
      const sizeVal = isRow ? childStyle.width : childStyle.height
      if (sizeVal.unit === C.UNIT_POINT) {
        baseSize = sizeVal.value
      } else if (sizeVal.unit === C.UNIT_PERCENT) {
        baseSize = Number.isNaN(mainAxisSize) ? 0 : mainAxisSize * (sizeVal.value / 100)
      } else if (child.hasMeasureFunc() && childStyle.flexGrow === 0) {
        // For auto-sized children with measureFunc but no flexGrow,
        // pre-measure to get intrinsic size for justify-content calculation
        // Use cached margins
        const crossMargin = isRow ? cflex.marginT + cflex.marginB : cflex.marginL + cflex.marginR
        const availCross = crossAxisSize - crossMargin
        // Use cached measure to avoid redundant calls within a layout pass
        // Measure function takes PHYSICAL (width, height), not logical (main, cross).
        // For row: main=width, cross=height. For column: main=height, cross=width.
        const mW = isRow ? mainAxisSize : availCross
        const mH = isRow ? availCross : mainAxisSize
        const mWMode = isRow
          ? C.MEASURE_MODE_AT_MOST
          : Number.isNaN(availCross)
            ? C.MEASURE_MODE_UNDEFINED
            : C.MEASURE_MODE_AT_MOST
        const mHMode = isRow ? C.MEASURE_MODE_UNDEFINED : C.MEASURE_MODE_AT_MOST
        const measured = child.cachedMeasure(
          Number.isNaN(mW) ? Infinity : mW,
          mWMode,
          Number.isNaN(mH) ? Infinity : mH,
          mHMode,
        )!
        baseSize = isRow ? measured.width : measured.height
      } else if (child.children.length > 0) {
        // For auto-sized children WITH children but no measureFunc,
        // recursively compute intrinsic size by laying out with unconstrained main axis
        // Check cache first to avoid redundant recursive calls
        const sizingW = isRow ? NaN : crossAxisSize
        const sizingH = isRow ? crossAxisSize : NaN
        const cached = child.getCachedLayout(sizingW, sizingH)
        if (cached) {
          incLayoutCacheHits()
          baseSize = isRow ? cached.width : cached.height
        } else {
          // Use measureNode for sizing-only pass (faster than full layoutNode)
          // Save layout before measureNode — it overwrites node.layout.width/height
          // with intrinsic measurements (unconstrained widths -> text doesn't wrap ->
          // shorter height). Without save/restore, layoutNode's fingerprint check
          // in Phase 9 would skip re-computation and preserve the corrupted values.
          const savedW = child.layout.width
          const savedH = child.layout.height
          measureNode(child, sizingW, sizingH)
          const measuredW = child.layout.width
          const measuredH = child.layout.height
          child.layout.width = savedW
          child.layout.height = savedH
          baseSize = isRow ? measuredW : measuredH
          // Cache the result for potential reuse
          child.setCachedLayout(sizingW, sizingH, measuredW, measuredH)
        }
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
    cflex.minMain = minVal.unit !== C.UNIT_UNDEFINED ? resolveValue(minVal, mainAxisSize) : 0
    cflex.maxMain = maxVal.unit !== C.UNIT_UNDEFINED ? resolveValue(maxVal, mainAxisSize) : Infinity

    // Store flex factors from style
    cflex.flexGrow = childStyle.flexGrow
    // CSS spec 4.5: overflow containers have automatic min-size = 0 and can shrink
    // below content size. Yoga defaults flexShrink to 0, preventing this. For
    // overflow:hidden/scroll children, ensure flexShrink >= 1 so they participate
    // in negative free space distribution (matching CSS behavior).
    cflex.flexShrink =
      childStyle.overflow !== C.OVERFLOW_VISIBLE ? Math.max(childStyle.flexShrink, 1) : childStyle.flexShrink

    // Store base and main size (start from base size - distribution happens from here)
    cflex.baseSize = baseSize
    cflex.mainSize = baseSize
    cflex.frozen = false // Will be set during distribution

    // Free space calculation uses BASE sizes (per Yoga/CSS spec algorithm)
    // The freeze loop handles min/max clamping iteratively
    totalBaseMain += baseSize + cflex.mainMargin

    // Count auto margins for later distribution
    if (cflex.mainStartMarginAuto) totalAutoMargins++
    if (cflex.mainEndMarginAuto) totalAutoMargins++

    // Check for baseline alignment
    if (!hasBaselineAlignment && childStyle.alignSelf === C.ALIGN_BASELINE) {
      hasBaselineAlignment = true
    }
  }

  log.debug?.("layoutNode: node.children=%d, relativeCount=%d", node.children.length, relativeCount)
  if (relativeCount > 0) {
    // -----------------------------------------------------------------------
    // PHASE 6a: Flex Line Breaking and Space Distribution
    // -----------------------------------------------------------------------
    // Break children into lines (for flex-wrap).
    // Distribute free space using grow/shrink factors.
    // Apply min/max constraints.

    // Break children into flex lines for wrap support (zero allocation - sets child.flex.lineIndex)
    const numLines = breakIntoLines(node, relativeCount, mainAxisSize, mainGap, style.flexWrap)
    const crossGap = isRow ? style.gap[1] : style.gap[0]

    // Process each line: distribute flex space
    // Uses pre-collected _lineChildren to avoid O(n*m) iteration
    for (let lineIdx = 0; lineIdx < numLines; lineIdx++) {
      const lineChildren = _lineChildren[lineIdx]!
      const lineLength = lineChildren.length
      if (lineLength === 0) continue

      // Calculate total base main and gaps for this line
      let lineTotalBaseMain = 0
      for (let i = 0; i < lineLength; i++) {
        const c = lineChildren[i]!
        lineTotalBaseMain += c.flex.baseSize + c.flex.mainMargin
      }
      const lineTotalGaps = lineLength > 1 ? mainGap * (lineLength - 1) : 0

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
        distributeFlexSpaceForLine(lineChildren, adjustedFreeSpace)
      }

      // Apply min/max constraints to final sizes
      for (let i = 0; i < lineLength; i++) {
        const f = lineChildren[i]!.flex
        f.mainSize = Math.max(f.minMain, Math.min(f.maxMain, f.mainSize))
      }
    }

    // -----------------------------------------------------------------------
    // PHASE 6b: Justify-Content and Auto Margins (Per-Line)
    // -----------------------------------------------------------------------
    // Distribute remaining free space on main axis PER LINE.
    // Auto margins absorb space first, then justify-content applies.
    // This fixes multi-line wrap layouts to match CSS spec behavior.

    // Compute per-line justify-content and auto margins
    for (let lineIdx = 0; lineIdx < numLines; lineIdx++) {
      const lineChildren = _lineChildren[lineIdx]!
      const lineLength = lineChildren.length
      if (lineLength === 0) {
        _lineJustifyStarts[lineIdx] = 0
        _lineItemSpacings[lineIdx] = mainGap
        continue
      }

      // Calculate used main axis space for this line
      let lineUsedMain = 0
      let lineAutoMargins = 0
      for (let i = 0; i < lineLength; i++) {
        const c = lineChildren[i]!
        lineUsedMain += c.flex.mainSize + c.flex.mainMargin
        if (c.flex.mainStartMarginAuto) lineAutoMargins++
        if (c.flex.mainEndMarginAuto) lineAutoMargins++
      }
      const lineGaps = lineLength > 1 ? mainGap * (lineLength - 1) : 0
      lineUsedMain += lineGaps

      // For auto-sized containers (NaN mainAxisSize), there's no remaining space to justify
      const lineRemainingSpace = Number.isNaN(mainAxisSize) ? 0 : mainAxisSize - lineUsedMain

      // Handle auto margins on main axis (per-line)
      // Auto margins absorb free space BEFORE justify-content
      const lineHasAutoMargins = lineAutoMargins > 0

      if (lineHasAutoMargins) {
        // Auto margins absorb remaining space for this line
        // CSS spec: auto margins don't absorb negative free space (overflow case)
        const positiveRemaining = Math.max(0, lineRemainingSpace)
        const autoMarginValue = positiveRemaining / lineAutoMargins
        for (let i = 0; i < lineLength; i++) {
          const child = lineChildren[i]!
          if (child.flex.mainStartMarginAuto) {
            child.flex.mainStartMarginValue = autoMarginValue
          }
          if (child.flex.mainEndMarginAuto) {
            child.flex.mainEndMarginValue = autoMarginValue
          }
        }
      }

      // Calculate justify-content offset and spacing for this line
      let lineStartOffset = 0
      let lineItemSpacing = mainGap

      // justify-content is ignored when any auto margins exist on this line
      if (!lineHasAutoMargins) {
        // CSS spec behavior for overflow (negative remaining space):
        // - flex-end/center: allow negative offset (items can overflow at start)
        // - space-between/around/evenly: fall back to flex-start (no negative spacing)
        switch (style.justifyContent) {
          case C.JUSTIFY_FLEX_END:
            // Allow negative offset for overflow (matches Yoga/CSS behavior)
            lineStartOffset = lineRemainingSpace
            break
          case C.JUSTIFY_CENTER:
            // Allow negative offset for overflow (matches Yoga/CSS behavior)
            lineStartOffset = lineRemainingSpace / 2
            break
          case C.JUSTIFY_SPACE_BETWEEN:
            // Only apply space-between when remaining space is positive
            if (lineLength > 1 && lineRemainingSpace > 0) {
              lineItemSpacing = mainGap + lineRemainingSpace / (lineLength - 1)
            }
            break
          case C.JUSTIFY_SPACE_AROUND:
            // Only apply space-around when remaining space is positive
            if (lineLength > 0 && lineRemainingSpace > 0) {
              const extraSpace = lineRemainingSpace / lineLength
              lineStartOffset = extraSpace / 2
              lineItemSpacing = mainGap + extraSpace
            }
            break
          case C.JUSTIFY_SPACE_EVENLY:
            // Only apply space-evenly when remaining space is positive
            if (lineLength > 0 && lineRemainingSpace > 0) {
              const extraSpace = lineRemainingSpace / (lineLength + 1)
              lineStartOffset = extraSpace
              lineItemSpacing = mainGap + extraSpace
            }
            break
        }
      }

      _lineJustifyStarts[lineIdx] = lineStartOffset
      _lineItemSpacings[lineIdx] = lineItemSpacing
    }

    // For backwards compatibility, set global values for single-line case
    const startOffset = _lineJustifyStarts[0]
    const itemSpacing = _lineItemSpacings[0]

    // NOTE: We do NOT round sizes here. Instead, we use edge-based rounding below.
    // This ensures adjacent elements share exact boundaries without gaps.
    // The key insight: round(pos) gives the edge position, width = round(end) - round(start)

    // -----------------------------------------------------------------------
    // PHASE 6c: Baseline Alignment (Pre-computation)
    // -----------------------------------------------------------------------
    // For align-items: baseline, compute each child's baseline and find max.
    // Uses baselineFunc if provided, otherwise falls back to content box bottom.

    // Compute baseline alignment info if needed (hasBaselineAlignment computed in flex info pass)
    // For ALIGN_BASELINE in row direction, we need to know the max baseline first
    // Zero-alloc: store baseline in child.flex.baseline, not a temporary array
    let maxBaseline = 0

    if (hasBaselineAlignment && isRow) {
      // First pass: compute each child's baseline and find the maximum
      for (const child of node.children) {
        if (child.flex.relativeIndex < 0) continue
        const childStyle = child.style

        // Get cross-axis (top) margin for this child - use cached value
        const topMargin = child.flex.marginT

        // Compute child's dimensions - need to do a mini-layout or use the cached size
        // For children with explicit dimensions, use those
        // For auto-sized children, we need to layout them first
        let childWidth: number
        let childHeight: number
        const widthDim = childStyle.width
        const heightDim = childStyle.height

        // Get width for baseline function
        if (widthDim.unit === C.UNIT_POINT) {
          childWidth = widthDim.value
        } else if (widthDim.unit === C.UNIT_PERCENT && !Number.isNaN(mainAxisSize)) {
          childWidth = mainAxisSize * (widthDim.value / 100)
        } else {
          childWidth = child.flex.mainSize
        }

        // Get height for baseline
        if (heightDim.unit === C.UNIT_POINT) {
          childHeight = heightDim.value
        } else if (heightDim.unit === C.UNIT_PERCENT && !Number.isNaN(crossAxisSize)) {
          childHeight = crossAxisSize * (heightDim.value / 100)
        } else {
          // Auto height - need to layout to get intrinsic size
          // Check cache first to avoid redundant recursive calls
          const cached = child.getCachedLayout(child.flex.mainSize, NaN)
          if (cached) {
            incLayoutCacheHits()
            childWidth = cached.width
            childHeight = cached.height
          } else {
            // Use measureNode for sizing-only pass (faster than full layoutNode)
            // Save layout before measureNode — it overwrites node.layout.width/height
            // with intrinsic measurements. Without save/restore, layoutNode's fingerprint
            // check in Phase 9 would skip re-computation and preserve corrupted values.
            const savedW = child.layout.width
            const savedH = child.layout.height
            measureNode(child, child.flex.mainSize, NaN)
            childWidth = child.layout.width
            childHeight = child.layout.height
            child.layout.width = savedW
            child.layout.height = savedH
            child.setCachedLayout(child.flex.mainSize, NaN, childWidth, childHeight)
          }
        }

        // Compute baseline: use baselineFunc if available, otherwise use bottom of content box
        // Store directly in child.flex.baseline (zero-alloc)
        if (child.baselineFunc !== null) {
          // Custom baseline function provided (e.g., for text nodes)
          child.flex.baseline = topMargin + child.baselineFunc(childWidth, childHeight)
        } else {
          // Fallback: bottom of content box (default for non-text elements)
          // Note: We don't recursively propagate first-child baselines to avoid O(n^depth) cost
          // This is a simplification from CSS spec but acceptable for TUI use cases
          child.flex.baseline = topMargin + childHeight
        }
        maxBaseline = Math.max(maxBaseline, child.flex.baseline)
      }
    }

    // -----------------------------------------------------------------------
    // PHASE 7a: Estimate Flex Line Cross-Axis Sizes (Tentative)
    // -----------------------------------------------------------------------
    // Estimate cross-axis size of each flex line from definite child dimensions.
    // Auto-sized children use 0 here; actual sizes computed during Phase 8.
    // These are tentative values used for alignContent distribution.

    // Compute line cross-axis sizes and offsets for flex-wrap
    // Each child already has lineIndex set by breakIntoLines
    // Use pre-allocated _lineCrossOffsets and _lineCrossSizes arrays
    let cumulativeCrossOffset = 0
    const isWrapReverse = style.flexWrap === C.WRAP_WRAP_REVERSE

    for (let lineIdx = 0; lineIdx < numLines; lineIdx++) {
      _lineCrossOffsets[lineIdx] = cumulativeCrossOffset

      // Calculate max cross size for this line using pre-collected _lineChildren
      const lineChildren = _lineChildren[lineIdx]!
      const lineLength = lineChildren.length
      let maxLineCross = 0
      for (let i = 0; i < lineLength; i++) {
        const child = lineChildren[i]!
        // Estimate child cross size (will be computed more precisely during layout)
        const childStyle = child.style
        const crossDim = isRow ? childStyle.height : childStyle.width
        // Use cached margins
        const crossMarginStart = isRow ? child.flex.marginT : child.flex.marginL
        const crossMarginEnd = isRow ? child.flex.marginB : child.flex.marginR

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
      // Fallback cross size: use measured max, or divide available space among lines
      // Guard against NaN/division-by-zero: if crossAxisSize is NaN or numLines is 0, use 0
      const fallbackCross = numLines > 0 && !Number.isNaN(crossAxisSize) ? crossAxisSize / numLines : 0
      const lineCrossSize = maxLineCross > 0 ? maxLineCross : fallbackCross
      _lineCrossSizes[lineIdx] = lineCrossSize
      cumulativeCrossOffset += lineCrossSize + crossGap
    }

    // -----------------------------------------------------------------------
    // PHASE 7b: Apply alignContent
    // -----------------------------------------------------------------------
    // Distribute flex lines within the container's cross-axis.
    // Only applies when flex-wrap creates multiple lines.

    // Apply alignContent to distribute lines in the cross axis
    // Note: While CSS spec says alignContent only applies to multi-line containers,
    // Yoga applies ALIGN_STRETCH to single-line layouts as well. We match Yoga behavior.
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
              _lineCrossOffsets[i]! += freeSpace
            }
            break

          case C.ALIGN_CENTER:
            // Lines centered
            {
              const centerOffset = freeSpace / 2
              for (let i = 0; i < numLines; i++) {
                _lineCrossOffsets[i]! += centerOffset
              }
            }
            break

          case C.ALIGN_SPACE_BETWEEN:
            // First line at start, last at end, evenly distributed
            if (numLines > 1) {
              const gap = freeSpace / (numLines - 1)
              for (let i = 1; i < numLines; i++) {
                _lineCrossOffsets[i]! += gap * i
              }
            }
            break

          case C.ALIGN_SPACE_AROUND:
            // Even spacing with half-space at edges
            {
              const halfGap = freeSpace / (numLines * 2)
              for (let i = 0; i < numLines; i++) {
                _lineCrossOffsets[i]! += halfGap + halfGap * 2 * i
              }
            }
            break

          case C.ALIGN_STRETCH:
            // Distribute extra space evenly among lines
            if (freeSpace > 0 && numLines > 0) {
              const extraPerLine = freeSpace / numLines
              for (let i = 0; i < numLines; i++) {
                _lineCrossSizes[i]! += extraPerLine
                // Recalculate offset for subsequent lines
                if (i > 0) {
                  _lineCrossOffsets[i] = _lineCrossOffsets[i - 1]! + _lineCrossSizes[i - 1]! + crossGap
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
          totalLineCrossSize += _lineCrossSizes[i]!
        }
        totalLineCrossSize += crossGap * (numLines - 1)
        const crossStartOffset = crossAxisSize - totalLineCrossSize
        for (let i = 0; i < numLines; i++) {
          _lineCrossOffsets[i]! += crossStartOffset
        }
      }
    }

    // -----------------------------------------------------------------------
    // PHASE 8: Position and Layout Children
    // -----------------------------------------------------------------------
    // Calculate each child's position in the container.
    // Apply cross-axis alignment (align-items, align-self).
    // Recursively layout grandchildren.

    // Position and layout children
    // For reverse directions (including RTL for row), start from the END of the container
    // RTL + reverse cancels out (XOR behavior)
    // For shrink-wrap containers, compute effective main size first
    let effectiveMainAxisSize = mainAxisSize
    const mainIsAuto = isRow
      ? style.width.unit !== C.UNIT_POINT && style.width.unit !== C.UNIT_PERCENT
      : style.height.unit !== C.UNIT_POINT && style.height.unit !== C.UNIT_PERCENT

    // Calculate total gaps for all children (used for shrink-wrap sizing)
    const totalGaps = relativeCount > 1 ? mainGap * (relativeCount - 1) : 0

    if (effectiveReverse && mainIsAuto) {
      // For reverse with auto size, compute total content size for positioning
      let totalContent = 0
      for (const child of node.children) {
        if (child.flex.relativeIndex < 0) continue
        totalContent += child.flex.mainSize + child.flex.mainStartMarginValue + child.flex.mainEndMarginValue
      }
      totalContent += totalGaps
      effectiveMainAxisSize = totalContent
    }

    // Use fractional mainPos for edge-based rounding
    // Initialize with first line's startOffset (may be overridden when processing lines)
    let mainPos = effectiveReverse ? effectiveMainAxisSize - startOffset! : startOffset!
    let currentLineIdx = -1
    let relIdx = 0 // Track relative child index globally
    let lineChildIdx = 0 // Track position within current line (for gap handling)
    let currentLineLength = 0 // Length of current line
    let currentItemSpacing = itemSpacing // Track current line's item spacing

    log.debug?.(
      "positioning children: isRow=%s, startOffset=%d, relativeCount=%d, effectiveReverse=%s, numLines=%d",
      isRow,
      startOffset,
      relativeCount,
      effectiveReverse,
      numLines,
    )

    for (const child of node.children) {
      if (child.flex.relativeIndex < 0) continue
      const cflex = child.flex
      const childStyle = child.style

      // Check if we've moved to a new line (for flex-wrap)
      const childLineIdx = cflex.lineIndex
      if (childLineIdx !== currentLineIdx) {
        currentLineIdx = childLineIdx
        lineChildIdx = 0 // Reset position within line
        currentLineLength = _lineChildren[childLineIdx]!.length
        // Reset mainPos for new line using line-specific justify offset
        const lineOffset = _lineJustifyStarts[childLineIdx]!
        currentItemSpacing = _lineItemSpacings[childLineIdx]!
        mainPos = effectiveReverse ? effectiveMainAxisSize - lineOffset : lineOffset
      }

      // Get cross-axis offset for this child's line (from pre-allocated array)
      const lineCrossOffset = childLineIdx < MAX_FLEX_LINES ? _lineCrossOffsets[childLineIdx] : 0

      // For main-axis margins, use computed auto margin values
      // For cross-axis margins, use cached values (auto margins on cross axis handled separately)
      let childMarginLeft: number
      let childMarginTop: number
      let childMarginRight: number
      let childMarginBottom: number

      // Use cached margins, with auto margin override for main axis
      // For row layouts, use effectiveReverse (accounts for RTL)
      if (isRow) {
        // Row: main axis is horizontal
        // effectiveReverse handles both row-reverse AND RTL
        childMarginLeft =
          cflex.mainStartMarginAuto && !effectiveReverse
            ? cflex.mainStartMarginValue
            : cflex.mainEndMarginAuto && effectiveReverse
              ? cflex.mainEndMarginValue
              : cflex.marginL
        childMarginRight =
          cflex.mainEndMarginAuto && !effectiveReverse
            ? cflex.mainEndMarginValue
            : cflex.mainStartMarginAuto && effectiveReverse
              ? cflex.mainStartMarginValue
              : cflex.marginR
        childMarginTop = cflex.marginT
        childMarginBottom = cflex.marginB
      } else {
        // Column: main axis is vertical (RTL doesn't affect column)
        // In column-reverse, mainStart=bottom(3), mainEnd=top(1)
        childMarginTop =
          cflex.mainStartMarginAuto && !isReverse
            ? cflex.mainStartMarginValue
            : cflex.mainEndMarginAuto && isReverse
              ? cflex.mainEndMarginValue
              : cflex.marginT
        childMarginBottom =
          cflex.mainEndMarginAuto && !isReverse
            ? cflex.mainEndMarginValue
            : cflex.mainStartMarginAuto && isReverse
              ? cflex.mainStartMarginValue
              : cflex.marginB
        childMarginLeft = cflex.marginL
        childMarginRight = cflex.marginR
      }

      // Main axis size comes from flex algorithm (already rounded)
      const childMainSize = cflex.mainSize

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
        // Percent of PARENT's cross axis (resolveValue handles NaN -> 0)
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
      const mainIsAutoChild = mainDim.unit === C.UNIT_AUTO || mainDim.unit === C.UNIT_UNDEFINED
      const hasFlexGrow = cflex.flexGrow > 0
      // Use flex-computed mainSize for all cases - it includes padding/border as minimum
      // The flex algorithm already computed the proper size based on content/padding/border
      const effectiveMainSize = childMainSize

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
              ? mainAxisSize - mainPos! // Remaining space after previous children
              : crossAxisSize - crossMargin
            : childStyle.width.value
          const rawAvailH = heightAuto
            ? isRow
              ? crossAxisSize - crossMargin
              : mainAxisSize - mainPos! // Remaining space for COLUMN
            : childStyle.height.value
          const availW = Number.isNaN(rawAvailW) ? Infinity : rawAvailW
          const availH = Number.isNaN(rawAvailH) ? Infinity : rawAvailH

          // Use cached measure to avoid redundant calls within a layout pass
          const measured = child.cachedMeasure(availW, widthMode, availH, heightMode)!

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
      // For RTL row: items flow right-to-left, so right margin becomes trailing
      // For flex-wrap, add lineCrossOffset to cross-axis position
      let childX: number
      let childY: number
      if (effectiveReverse) {
        if (isRow) {
          // Row-reverse or RTL: items positioned from right
          // In RTL/reverse, use right margin as trailing margin
          childX = mainPos! - childMainSize - childMarginRight
          childY = lineCrossOffset! + childMarginTop
        } else {
          // Column-reverse: items positioned from bottom
          childX = lineCrossOffset! + childMarginLeft
          childY = mainPos! - childMainSize - childMarginTop
        }
      } else {
        childX = isRow ? mainPos! + childMarginLeft : lineCrossOffset! + childMarginLeft
        childY = isRow ? lineCrossOffset! + childMarginTop : mainPos! + childMarginTop
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
      const mainIsPercentForLayoutCall = mainDimForLayoutCall.unit === C.UNIT_PERCENT
      const crossIsPercentForLayoutCall = crossDimForLayoutCall.unit === C.UNIT_PERCENT

      // For auto-sized children (no flexGrow, no measureFunc), pass NaN to let them compute intrinsic size
      // Otherwise layoutNode would subtract margins from the available size
      // IMPORTANT: For percent-sized children, pass parent's content size (not child's computed size)
      // so that grandchildren's percents resolve correctly against the child's actual dimensions.
      // The child will resolve its own percent against this value, getting the same result the parent computed.
      //
      // CRITICAL: When flex distribution changed the child's size (shrinkage/growth applied),
      // pass the actual childWidth instead of NaN. This ensures layoutNode's fingerprint check
      // detects the change — otherwise NaN===NaN matches across passes with different flex
      // distributions, preserving stale overridden dimensions from the previous pass.
      //
      // CRITICAL: Measure-func leaf nodes (text) must receive the actual constraint, not NaN.
      // Their cross-axis size (e.g. height in a row) depends on the main-axis constraint
      // (e.g. text wrapping width). Passing NaN causes them to measure unconstrained,
      // producing height=1 instead of the correct wrapped height. The parent's Phase 8
      // shouldMeasure path computes the correct childWidth/childHeight, but layoutNode
      // would recompute with NaN and get a different result.
      const flexDistChanged = child.flex.mainSize !== child.flex.baseSize
      const hasMeasureLeaf = child.hasMeasureFunc() && child.children.length === 0
      const passWidthToChild =
        isRow && mainIsAutoChild && !hasFlexGrow && !flexDistChanged && !hasMeasureLeaf
          ? NaN
          : !isRow && crossIsAutoForLayoutCall && !parentHasDefiniteCross
            ? NaN
            : isRow && mainIsPercentForLayoutCall
              ? mainAxisSize
              : !isRow && crossIsPercentForLayoutCall
                ? crossAxisSize
                : childWidth
      const passHeightToChild =
        !isRow && mainIsAutoChild && !hasFlexGrow && !flexDistChanged && !hasMeasureLeaf
          ? NaN
          : isRow && crossIsAutoForLayoutCall && !parentHasDefiniteCross
            ? NaN
            : !isRow && mainIsPercentForLayoutCall
              ? mainAxisSize
              : isRow && crossIsPercentForLayoutCall
                ? crossAxisSize
                : childHeight

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
      // - Child has explicit main dimension AND parent has explicit main dimension (edge-based rounding)
      // - Child has flexGrow > 0 (flex distribution applied)
      // - Child has measureFunc (leaf text node)
      // - Flex distribution actually changed the size (grow or shrink)
      //
      // IMPORTANT: Don't override auto-sized containers when flex distribution
      // didn't change their size. The pre-measurement (Phase 5) computes intrinsic
      // size at unconstrained main axis, but layoutNode recomputes with actual
      // cross-axis constraints. For containers with children that wrap text,
      // layoutNode's result is correct because it accounts for the actual width
      // after flex distribution of grandchildren. The Phase 5 measureNode pass
      // measures row children with NaN main width, so text doesn't wrap —
      // producing height=1 instead of the correct wrapped height.
      const hasMeasure = child.hasMeasureFunc() && child.children.length === 0
      const flexDistributionChangedSize = child.flex.mainSize !== child.flex.baseSize
      if ((!mainIsAuto && !mainIsAutoChild) || hasFlexGrow || hasMeasure || flexDistributionChangedSize) {
        // Use edge-based rounding: size = round(end_edge) - round(start_edge)
        if (isRow) {
          _t?.parentOverride(_tn, "main", child.layout.width, edgeBasedMainSize)
          child.layout.width = edgeBasedMainSize
        } else {
          _t?.parentOverride(_tn, "main", child.layout.height, edgeBasedMainSize)
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
      // Use isEdgeAuto to correctly respect logical EDGE_START/END margins
      const crossStartIndex = isRow ? 1 : 0 // top for row, left for column
      const crossEndIndex = isRow ? 3 : 2 // bottom for row, right for column
      const hasAutoStartMargin = isEdgeAuto(childStyle.margin, crossStartIndex, style.flexDirection, direction)
      const hasAutoEndMargin = isEdgeAuto(childStyle.margin, crossEndIndex, style.flexDirection, direction)
      const availableCrossSpace = crossAxisSize - finalCrossSize - crossMargin

      if (hasAutoStartMargin && hasAutoEndMargin) {
        // Both auto: center the item
        // CSS spec: auto margins don't absorb negative free space (clamp to 0)
        crossOffset = Math.max(0, availableCrossSpace) / 2
      } else if (hasAutoStartMargin) {
        // Auto start margin: push to end
        // CSS spec: auto margins don't absorb negative free space (clamp to 0)
        crossOffset = Math.max(0, availableCrossSpace)
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
            if (isRow && hasBaselineAlignment) {
              // Use pre-computed baseline from Phase 6c (stored in child.flex.baseline)
              crossOffset = maxBaseline - child.flex.baseline
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

      // Position advancement: use the right size depending on Phase 8 behavior.
      // - Phase 8 overrode (explicit size, flexGrow, measure, or flex distribution changed):
      //   Use constrainedMainSize (float) for precise gap/position calculations.
      //   child.layout is edge-rounded (integer), which causes rounding drift in gaps.
      // - Phase 8 did NOT override (auto-sized container, no grow, no measure):
      //   Use child.layout (from layoutNode), which reflects actual content size.
      //   constrainedMainSize is a stale pre-layout estimate from unconstrained measurement.
      const phaseEightOverrode =
        (!mainIsAuto && !mainIsAutoChild) || hasFlexGrow || hasMeasure || flexDistributionChangedSize
      const fractionalMainSize = phaseEightOverrode
        ? constrainedMainSize
        : isRow
          ? child.layout.width
          : child.layout.height
      // Use computed margin values (including auto margins)
      const totalMainMargin = cflex.mainStartMarginValue + cflex.mainEndMarginValue
      log.debug?.(
        "  child %d: mainPos=%d -> top=%d (fractionalMainSize=%d, totalMainMargin=%d)",
        relIdx,
        mainPos,
        child.layout.top,
        fractionalMainSize,
        totalMainMargin,
      )
      if (effectiveReverse) {
        mainPos! -= fractionalMainSize + totalMainMargin
        // Add spacing only between items on the SAME LINE (not across line breaks)
        if (lineChildIdx < currentLineLength - 1) {
          mainPos! -= currentItemSpacing!
        }
      } else {
        mainPos! += fractionalMainSize + totalMainMargin
        // Add spacing only between items on the SAME LINE (not across line breaks)
        if (lineChildIdx < currentLineLength - 1) {
          mainPos! += currentItemSpacing!
        }
      }
      relIdx++
      lineChildIdx++
    }

    // -----------------------------------------------------------------------
    // PHASE 9: Shrink-Wrap Auto-Sized Containers
    // -----------------------------------------------------------------------
    // For containers without explicit size, compute intrinsic size from children.

    // For auto-sized containers (including root), shrink-wrap to content
    // Compute actual used main space from child layouts (not pre-computed flex.mainSize which may be 0)
    let actualUsedMain = 0
    for (const child of node.children) {
      if (child.flex.relativeIndex < 0) continue
      const childMainSize = isRow ? child.layout.width : child.layout.height
      const totalMainMargin = child.flex.mainStartMarginValue + child.flex.mainEndMarginValue
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
    for (const child of node.children) {
      if (child.flex.relativeIndex < 0) continue
      const childCross = isRow ? child.layout.height : child.layout.width
      const childMargin = isRow
        ? resolveEdgeValue(child.style.margin, 1, style.flexDirection, contentWidth, direction) +
          resolveEdgeValue(child.style.margin, 3, style.flexDirection, contentWidth, direction)
        : resolveEdgeValue(child.style.margin, 0, style.flexDirection, contentWidth, direction) +
          resolveEdgeValue(child.style.margin, 2, style.flexDirection, contentWidth, direction)
      maxCrossSize = Math.max(maxCrossSize, childCross + childMargin)
    }
    // Cross-axis shrink-wrap for auto-sized dimension
    // Only shrink-wrap when the available dimension is NaN (unconstrained)
    // When availableHeight/Width is defined, Yoga uses it for AUTO-sized root nodes
    if (
      isRow &&
      style.height.unit !== C.UNIT_POINT &&
      style.height.unit !== C.UNIT_PERCENT &&
      Number.isNaN(availableHeight)
    ) {
      // Auto-height row: shrink-wrap to max child height
      nodeHeight = maxCrossSize + innerTop + innerBottom
    }
    if (
      !isRow &&
      style.width.unit !== C.UNIT_POINT &&
      style.width.unit !== C.UNIT_PERCENT &&
      Number.isNaN(availableWidth)
    ) {
      // Auto-width column: shrink-wrap to max child width
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

  // =========================================================================
  // PHASE 10: Final Output - Set Node Layout
  // =========================================================================
  // Use edge-based rounding (Yoga-compatible): round absolute edges and derive sizes.
  // This ensures adjacent elements share exact boundaries without pixel gaps.

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

  // =========================================================================
  // PHASE 11: Layout Absolute Children
  // =========================================================================
  // Absolute children are positioned relative to the padding box, not content box.
  // They don't participate in flex layout - they're laid out independently.

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

  // Layout absolute positioned children (relativeIndex === -1 but not display:none)
  for (const child of node.children) {
    if (child.style.display === C.DISPLAY_NONE) continue
    if (child.style.positionType !== C.POSITION_TYPE_ABSOLUTE) continue
    const childStyle = child.style
    // CSS spec: percentage margins resolve against containing block's WIDTH only
    // Use resolveEdgeValue to respect logical EDGE_START/END
    // Note: Auto margins will resolve to 0 here, we handle them separately below
    const childMarginLeft = resolveEdgeValue(childStyle.margin, 0, style.flexDirection, nodeWidth, direction)
    const childMarginTop = resolveEdgeValue(childStyle.margin, 1, style.flexDirection, nodeWidth, direction)
    const childMarginRight = resolveEdgeValue(childStyle.margin, 2, style.flexDirection, nodeWidth, direction)
    const childMarginBottom = resolveEdgeValue(childStyle.margin, 3, style.flexDirection, nodeWidth, direction)

    // Check for auto margins (used for centering absolute children)
    const hasAutoMarginLeft = isEdgeAuto(childStyle.margin, 0, style.flexDirection, direction)
    const hasAutoMarginRight = isEdgeAuto(childStyle.margin, 2, style.flexDirection, direction)
    const hasAutoMarginTop = isEdgeAuto(childStyle.margin, 1, style.flexDirection, direction)
    const hasAutoMarginBottom = isEdgeAuto(childStyle.margin, 3, style.flexDirection, direction)

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
    } else if (hasLeft && hasRight) {
      // Both left and right are set
      if (widthIsAuto) {
        // Stretch width already handled above
        child.layout.width = Math.round(childAvailWidth)
      } else if (hasAutoMarginLeft || hasAutoMarginRight) {
        // Auto margins absorb remaining space for centering
        // CSS spec: auto margins don't absorb negative free space (clamp to 0)
        const freeSpace = Math.max(0, contentW - leftOffset - rightOffset - childWidth)
        if (hasAutoMarginLeft && hasAutoMarginRight) {
          // Both auto: center
          childX = leftOffset + freeSpace / 2
        } else if (hasAutoMarginLeft) {
          // Only left auto: push to right
          childX = leftOffset + freeSpace
        }
        // Only right auto: childX already set to leftOffset + childMarginLeft
      }
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
    } else if (hasTop && hasBottom) {
      // Both top and bottom are set
      if (heightIsAuto) {
        // Stretch height already handled above
        child.layout.height = Math.round(childAvailHeight)
      } else if (hasAutoMarginTop || hasAutoMarginBottom) {
        // Auto margins absorb remaining space for centering
        // CSS spec: auto margins don't absorb negative free space (clamp to 0)
        const freeSpace = Math.max(0, contentH - topOffset - bottomOffset - childHeight)
        if (hasAutoMarginTop && hasAutoMarginBottom) {
          // Both auto: center
          childY = topOffset + freeSpace / 2
        } else if (hasAutoMarginTop) {
          // Only top auto: push to bottom
          childY = topOffset + freeSpace
        }
        // Only bottom auto: childY already set to topOffset + childMarginTop
      }
    }

    // Set final position (relative to container padding box)
    child.layout.left = Math.round(absInnerLeft + childX)
    child.layout.top = Math.round(absInnerTop + childY)
  }

  // Update constraint fingerprint - layout is now valid for these constraints
  flex.lastAvailW = availableWidth
  flex.lastAvailH = availableHeight
  flex.lastOffsetX = offsetX
  flex.lastOffsetY = offsetY
  flex.lastDir = direction
  flex.layoutValid = true
  _t?.layoutExit(_tn, layout.width, layout.height)
}
