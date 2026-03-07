/**
 * Flexture Node
 *
 * Yoga-compatible Node class for flexbox layout.
 */

import * as C from "../constants.js"
import { computeLayout, countNodes, markSubtreeLayoutSeen } from "./layout.js"
import {
  type BaselineFunc,
  type Layout,
  type MeasureFunc,
  type Style,
  type Value,
  createDefaultStyle,
} from "../types.js"
import { setEdgeValue, setEdgeBorder, getEdgeValue, getEdgeBorderValue } from "../utils.js"
import { log } from "../logger.js"

/**
 * A layout node in the flexbox tree.
 */
export class Node {
  // Tree structure
  private _parent: Node | null = null
  private _children: Node[] = []

  // Style
  private _style: Style = createDefaultStyle()

  // Measure function for intrinsic sizing
  private _measureFunc: MeasureFunc | null = null

  // Baseline function for baseline alignment
  private _baselineFunc: BaselineFunc | null = null

  // Computed layout
  private _layout: Layout = { left: 0, top: 0, width: 0, height: 0 }

  // Dirty flags
  private _isDirty = true
  private _hasNewLayout = false

  // ============================================================================
  // Static Factory
  // ============================================================================

  /**
   * Create a new layout node.
   *
   * @returns A new Node instance
   * @example
   * ```typescript
   * const root = Node.create();
   * root.setWidth(100);
   * root.setHeight(200);
   * ```
   */
  static create(): Node {
    return new Node()
  }

  // ============================================================================
  // Tree Operations
  // ============================================================================

  /**
   * Get the number of child nodes.
   *
   * @returns The number of children
   */
  getChildCount(): number {
    return this._children.length
  }

  /**
   * Get a child node by index.
   *
   * @param index - Zero-based child index
   * @returns The child node at the given index, or undefined if index is out of bounds
   */
  getChild(index: number): Node | undefined {
    return this._children[index]
  }

  /**
   * Get the parent node.
   *
   * @returns The parent node, or null if this is a root node
   */
  getParent(): Node | null {
    return this._parent
  }

  /**
   * Insert a child node at the specified index.
   * If the child already has a parent, it will be removed from that parent first.
   * Marks the node as dirty to trigger layout recalculation.
   *
   * @param child - The child node to insert
   * @param index - The index at which to insert the child
   * @example
   * ```typescript
   * const parent = Node.create();
   * const child1 = Node.create();
   * const child2 = Node.create();
   * parent.insertChild(child1, 0);
   * parent.insertChild(child2, 1);
   * ```
   */
  insertChild(child: Node, index: number): void {
    if (child._parent !== null) {
      child._parent.removeChild(child)
    }
    child._parent = this
    this._children.splice(index, 0, child)
    this.markDirty()
  }

  /**
   * Remove a child node from this node.
   * The child's parent reference will be cleared.
   * Marks the node as dirty to trigger layout recalculation.
   *
   * @param child - The child node to remove
   */
  removeChild(child: Node): void {
    const index = this._children.indexOf(child)
    if (index !== -1) {
      this._children.splice(index, 1)
      child._parent = null
      this.markDirty()
    }
  }

  /**
   * Free this node and clean up all references.
   * Removes the node from its parent, clears all children, and removes the measure function.
   * This does not recursively free child nodes.
   */
  free(): void {
    // Remove from parent
    if (this._parent !== null) {
      this._parent.removeChild(this)
    }
    // Clear children
    for (const child of this._children) {
      child._parent = null
    }
    this._children = []
    this._measureFunc = null
    this._baselineFunc = null
  }

  /**
   * Dispose the node (calls free)
   */
  [Symbol.dispose](): void {
    this.free()
  }

  // ============================================================================
  // Measure Function
  // ============================================================================

  /**
   * Set a measure function for intrinsic sizing.
   * The measure function is called during layout to determine the node's natural size.
   * Typically used for text nodes or other content that has an intrinsic size.
   * Marks the node as dirty to trigger layout recalculation.
   *
   * @param measureFunc - Function that returns width and height given available space and constraints
   * @example
   * ```typescript
   * const textNode = Node.create();
   * textNode.setMeasureFunc((width, widthMode, height, heightMode) => {
   *   // Measure text and return dimensions
   *   return { width: 50, height: 20 };
   * });
   * ```
   */
  setMeasureFunc(measureFunc: MeasureFunc): void {
    this._measureFunc = measureFunc
    this.markDirty()
  }

  /**
   * Remove the measure function from this node.
   * Marks the node as dirty to trigger layout recalculation.
   */
  unsetMeasureFunc(): void {
    this._measureFunc = null
    this.markDirty()
  }

  /**
   * Check if this node has a measure function.
   *
   * @returns True if a measure function is set
   */
  hasMeasureFunc(): boolean {
    return this._measureFunc !== null
  }

  // ============================================================================
  // Baseline Function
  // ============================================================================

  /**
   * Set a baseline function to determine where this node's text baseline is.
   * Used for ALIGN_BASELINE to align text across siblings with different heights.
   *
   * @param baselineFunc - Function that returns baseline offset from top given width and height
   * @example
   * ```typescript
   * textNode.setBaselineFunc((width, height) => {
   *   // For a text node, baseline might be at 80% of height
   *   return height * 0.8;
   * });
   * ```
   */
  setBaselineFunc(baselineFunc: BaselineFunc): void {
    this._baselineFunc = baselineFunc
    this.markDirty()
  }

  /**
   * Remove the baseline function from this node.
   * Marks the node as dirty to trigger layout recalculation.
   */
  unsetBaselineFunc(): void {
    this._baselineFunc = null
    this.markDirty()
  }

  /**
   * Check if this node has a baseline function.
   *
   * @returns True if a baseline function is set
   */
  hasBaselineFunc(): boolean {
    return this._baselineFunc !== null
  }

  // ============================================================================
  // Dirty Tracking
  // ============================================================================

  /**
   * Check if this node needs layout recalculation.
   *
   * @returns True if the node is dirty and needs layout
   */
  isDirty(): boolean {
    return this._isDirty
  }

  /**
   * Mark this node and all ancestors as dirty.
   * A dirty node needs layout recalculation.
   * This is automatically called by all style setters and tree operations.
   */
  markDirty(): void {
    this._isDirty = true
    if (this._parent !== null) {
      this._parent.markDirty()
    }
  }

  /**
   * Check if this node has new layout results since the last check.
   *
   * @returns True if layout was recalculated since the last call to markLayoutSeen
   */
  hasNewLayout(): boolean {
    return this._hasNewLayout
  }

  /**
   * Mark that the current layout has been seen/processed.
   * Clears the hasNewLayout flag.
   */
  markLayoutSeen(): void {
    this._hasNewLayout = false
  }

  // ============================================================================
  // Layout Calculation
  // ============================================================================

  /**
   * Calculate layout for this node and all descendants.
   * This runs the flexbox layout algorithm to compute positions and sizes.
   * Only recalculates if the node is marked as dirty.
   *
   * @param width - Available width for layout
   * @param height - Available height for layout
   * @param _direction - Text direction (LTR or RTL), defaults to LTR
   * @example
   * ```typescript
   * const root = Node.create();
   * root.setFlexDirection(FLEX_DIRECTION_ROW);
   * root.setWidth(100);
   * root.setHeight(50);
   *
   * const child = Node.create();
   * child.setFlexGrow(1);
   * root.insertChild(child, 0);
   *
   * root.calculateLayout(100, 50, DIRECTION_LTR);
   *
   * // Now you can read computed layout
   * console.log(child.getComputedWidth());
   * ```
   */
  calculateLayout(width?: number, height?: number, _direction: number = C.DIRECTION_LTR): void {
    if (!this._isDirty) {
      log.debug?.("layout skip (not dirty)")
      return
    }

    const start = Date.now()
    const nodeCount = countNodes(this)

    // Treat undefined as unconstrained (NaN signals content-based sizing)
    const availableWidth = width ?? NaN
    const availableHeight = height ?? NaN

    // Run the layout algorithm
    computeLayout(this, availableWidth, availableHeight, _direction)

    // Mark layout computed
    this._isDirty = false
    this._hasNewLayout = true
    markSubtreeLayoutSeen(this)

    log.debug?.("layout: %dx%d, %d nodes in %dms", width, height, nodeCount, Date.now() - start)
  }

  // ============================================================================
  // Layout Results
  // ============================================================================

  /**
   * Get the computed left position after layout.
   *
   * @returns The left position in points
   */
  getComputedLeft(): number {
    return this._layout.left
  }

  /**
   * Get the computed top position after layout.
   *
   * @returns The top position in points
   */
  getComputedTop(): number {
    return this._layout.top
  }

  /**
   * Get the computed width after layout.
   *
   * @returns The width in points
   */
  getComputedWidth(): number {
    return this._layout.width
  }

  /**
   * Get the computed height after layout.
   *
   * @returns The height in points
   */
  getComputedHeight(): number {
    return this._layout.height
  }

  // ============================================================================
  // Internal Accessors (for layout algorithm)
  // ============================================================================

  get children(): readonly Node[] {
    return this._children
  }

  get style(): Style {
    return this._style
  }

  get layout(): Layout {
    return this._layout
  }

  get measureFunc(): MeasureFunc | null {
    return this._measureFunc
  }

  get baselineFunc(): BaselineFunc | null {
    return this._baselineFunc
  }

  // ============================================================================
  // Width Setters
  // ============================================================================

  /**
   * Set the width to a fixed value in points.
   *
   * @param value - Width in points
   */
  setWidth(value: number): void {
    // NaN means "auto" in Yoga API
    if (Number.isNaN(value)) {
      this._style.width = { value: 0, unit: C.UNIT_AUTO }
    } else {
      this._style.width = { value, unit: C.UNIT_POINT }
    }
    this.markDirty()
  }

  /**
   * Set the width as a percentage of the parent's width.
   *
   * @param value - Width as a percentage (0-100)
   */
  setWidthPercent(value: number): void {
    this._style.width = { value, unit: C.UNIT_PERCENT }
    this.markDirty()
  }

  /**
   * Set the width to auto (determined by layout algorithm).
   */
  setWidthAuto(): void {
    this._style.width = { value: 0, unit: C.UNIT_AUTO }
    this.markDirty()
  }

  // ============================================================================
  // Height Setters
  // ============================================================================

  /**
   * Set the height to a fixed value in points.
   *
   * @param value - Height in points
   */
  setHeight(value: number): void {
    // NaN means "auto" in Yoga API
    if (Number.isNaN(value)) {
      this._style.height = { value: 0, unit: C.UNIT_AUTO }
    } else {
      this._style.height = { value, unit: C.UNIT_POINT }
    }
    this.markDirty()
  }

  /**
   * Set the height as a percentage of the parent's height.
   *
   * @param value - Height as a percentage (0-100)
   */
  setHeightPercent(value: number): void {
    this._style.height = { value, unit: C.UNIT_PERCENT }
    this.markDirty()
  }

  /**
   * Set the height to auto (determined by layout algorithm).
   */
  setHeightAuto(): void {
    this._style.height = { value: 0, unit: C.UNIT_AUTO }
    this.markDirty()
  }

  // ============================================================================
  // Min/Max Size Setters
  // ============================================================================

  /**
   * Set the minimum width in points.
   *
   * @param value - Minimum width in points
   */
  setMinWidth(value: number): void {
    this._style.minWidth = { value, unit: C.UNIT_POINT }
    this.markDirty()
  }

  /**
   * Set the minimum width as a percentage of the parent's width.
   *
   * @param value - Minimum width as a percentage (0-100)
   */
  setMinWidthPercent(value: number): void {
    this._style.minWidth = { value, unit: C.UNIT_PERCENT }
    this.markDirty()
  }

  /**
   * Set the minimum height in points.
   *
   * @param value - Minimum height in points
   */
  setMinHeight(value: number): void {
    this._style.minHeight = { value, unit: C.UNIT_POINT }
    this.markDirty()
  }

  /**
   * Set the minimum height as a percentage of the parent's height.
   *
   * @param value - Minimum height as a percentage (0-100)
   */
  setMinHeightPercent(value: number): void {
    this._style.minHeight = { value, unit: C.UNIT_PERCENT }
    this.markDirty()
  }

  /**
   * Set the maximum width in points.
   *
   * @param value - Maximum width in points
   */
  setMaxWidth(value: number): void {
    this._style.maxWidth = { value, unit: C.UNIT_POINT }
    this.markDirty()
  }

  /**
   * Set the maximum width as a percentage of the parent's width.
   *
   * @param value - Maximum width as a percentage (0-100)
   */
  setMaxWidthPercent(value: number): void {
    this._style.maxWidth = { value, unit: C.UNIT_PERCENT }
    this.markDirty()
  }

  /**
   * Set the maximum height in points.
   *
   * @param value - Maximum height in points
   */
  setMaxHeight(value: number): void {
    this._style.maxHeight = { value, unit: C.UNIT_POINT }
    this.markDirty()
  }

  /**
   * Set the maximum height as a percentage of the parent's height.
   *
   * @param value - Maximum height as a percentage (0-100)
   */
  setMaxHeightPercent(value: number): void {
    this._style.maxHeight = { value, unit: C.UNIT_PERCENT }
    this.markDirty()
  }

  /**
   * Set the aspect ratio of the node.
   * When set, the node's width/height relationship is constrained.
   * If width is defined, height = width / aspectRatio.
   * If height is defined, width = height * aspectRatio.
   *
   * @param value - Aspect ratio (width/height). Use NaN to unset.
   */
  setAspectRatio(value: number): void {
    this._style.aspectRatio = value
    this.markDirty()
  }

  // ============================================================================
  // Flex Setters
  // ============================================================================

  /**
   * Set the flex grow factor.
   * Determines how much the node will grow relative to siblings when there is extra space.
   *
   * @param value - Flex grow factor (typically 0 or 1+)
   * @example
   * ```typescript
   * const child = Node.create();
   * child.setFlexGrow(1); // Will grow to fill available space
   * ```
   */
  setFlexGrow(value: number): void {
    this._style.flexGrow = value
    this.markDirty()
  }

  /**
   * Set the flex shrink factor.
   * Determines how much the node will shrink relative to siblings when there is insufficient space.
   *
   * @param value - Flex shrink factor (default is 1)
   */
  setFlexShrink(value: number): void {
    this._style.flexShrink = value
    this.markDirty()
  }

  /**
   * Set the flex basis to a fixed value in points.
   * The initial size of the node before flex grow/shrink is applied.
   *
   * @param value - Flex basis in points
   */
  setFlexBasis(value: number): void {
    this._style.flexBasis = { value, unit: C.UNIT_POINT }
    this.markDirty()
  }

  /**
   * Set the flex basis as a percentage of the parent's size.
   *
   * @param value - Flex basis as a percentage (0-100)
   */
  setFlexBasisPercent(value: number): void {
    this._style.flexBasis = { value, unit: C.UNIT_PERCENT }
    this.markDirty()
  }

  /**
   * Set the flex basis to auto (based on the node's width/height).
   */
  setFlexBasisAuto(): void {
    this._style.flexBasis = { value: 0, unit: C.UNIT_AUTO }
    this.markDirty()
  }

  /**
   * Set the flex direction (main axis direction).
   *
   * @param direction - FLEX_DIRECTION_ROW, FLEX_DIRECTION_COLUMN, FLEX_DIRECTION_ROW_REVERSE, or FLEX_DIRECTION_COLUMN_REVERSE
   * @example
   * ```typescript
   * const container = Node.create();
   * container.setFlexDirection(FLEX_DIRECTION_ROW); // Lay out children horizontally
   * ```
   */
  setFlexDirection(direction: number): void {
    this._style.flexDirection = direction
    this.markDirty()
  }

  /**
   * Set the flex wrap behavior.
   *
   * @param wrap - WRAP_NO_WRAP, WRAP_WRAP, or WRAP_WRAP_REVERSE
   */
  setFlexWrap(wrap: number): void {
    this._style.flexWrap = wrap
    this.markDirty()
  }

  // ============================================================================
  // Alignment Setters
  // ============================================================================

  /**
   * Set how children are aligned along the cross axis.
   *
   * @param align - ALIGN_FLEX_START, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_STRETCH, or ALIGN_BASELINE
   * @example
   * ```typescript
   * const container = Node.create();
   * container.setFlexDirection(FLEX_DIRECTION_ROW);
   * container.setAlignItems(ALIGN_CENTER); // Center children vertically
   * ```
   */
  setAlignItems(align: number): void {
    this._style.alignItems = align
    this.markDirty()
  }

  /**
   * Set how this node is aligned along the parent's cross axis.
   * Overrides the parent's alignItems for this specific child.
   *
   * @param align - ALIGN_AUTO, ALIGN_FLEX_START, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_STRETCH, or ALIGN_BASELINE
   */
  setAlignSelf(align: number): void {
    this._style.alignSelf = align
    this.markDirty()
  }

  /**
   * Set how lines are aligned in a multi-line flex container.
   * Only affects containers with wrap enabled and multiple lines.
   *
   * @param align - ALIGN_FLEX_START, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_STRETCH, ALIGN_SPACE_BETWEEN, or ALIGN_SPACE_AROUND
   */
  setAlignContent(align: number): void {
    this._style.alignContent = align
    this.markDirty()
  }

  /**
   * Set how children are distributed along the main axis.
   *
   * @param justify - JUSTIFY_FLEX_START, JUSTIFY_CENTER, JUSTIFY_FLEX_END, JUSTIFY_SPACE_BETWEEN, JUSTIFY_SPACE_AROUND, or JUSTIFY_SPACE_EVENLY
   * @example
   * ```typescript
   * const container = Node.create();
   * container.setJustifyContent(JUSTIFY_SPACE_BETWEEN); // Space children evenly with edges at start/end
   * ```
   */
  setJustifyContent(justify: number): void {
    this._style.justifyContent = justify
    this.markDirty()
  }

  // ============================================================================
  // Spacing Setters
  // ============================================================================

  /**
   * Set padding for one or more edges.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Padding in points
   * @example
   * ```typescript
   * node.setPadding(EDGE_ALL, 10); // Set 10pt padding on all edges
   * node.setPadding(EDGE_HORIZONTAL, 5); // Set 5pt padding on left and right
   * ```
   */
  setPadding(edge: number, value: number): void {
    setEdgeValue(this._style.padding, edge, value, C.UNIT_POINT)
    this.markDirty()
  }

  /**
   * Set padding as a percentage of the parent's width.
   * Per CSS spec, percentage padding always resolves against the containing block's width.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Padding as a percentage (0-100)
   */
  setPaddingPercent(edge: number, value: number): void {
    setEdgeValue(this._style.padding, edge, value, C.UNIT_PERCENT)
    this.markDirty()
  }

  /**
   * Set margin for one or more edges.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Margin in points
   * @example
   * ```typescript
   * node.setMargin(EDGE_ALL, 5); // Set 5pt margin on all edges
   * node.setMargin(EDGE_TOP, 10); // Set 10pt margin on top only
   * ```
   */
  setMargin(edge: number, value: number): void {
    setEdgeValue(this._style.margin, edge, value, C.UNIT_POINT)
    this.markDirty()
  }

  /**
   * Set margin as a percentage of the parent's size.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Margin as a percentage (0-100)
   */
  setMarginPercent(edge: number, value: number): void {
    setEdgeValue(this._style.margin, edge, value, C.UNIT_PERCENT)
    this.markDirty()
  }

  /**
   * Set margin to auto (for centering items with margin: auto).
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   */
  setMarginAuto(edge: number): void {
    setEdgeValue(this._style.margin, edge, 0, C.UNIT_AUTO)
    this.markDirty()
  }

  /**
   * Set border width for one or more edges.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Border width in points
   */
  setBorder(edge: number, value: number): void {
    setEdgeBorder(this._style.border, edge, value)
    this.markDirty()
  }

  /**
   * Set gap between flex items.
   *
   * @param gutter - GUTTER_COLUMN (horizontal gap), GUTTER_ROW (vertical gap), or GUTTER_ALL (both)
   * @param value - Gap size in points
   * @example
   * ```typescript
   * container.setGap(GUTTER_ALL, 8); // Set 8pt gap between all items
   * container.setGap(GUTTER_COLUMN, 10); // Set 10pt horizontal gap only
   * ```
   */
  setGap(gutter: number, value: number): void {
    if (gutter === C.GUTTER_COLUMN) {
      this._style.gap[0] = value
    } else if (gutter === C.GUTTER_ROW) {
      this._style.gap[1] = value
    } else if (gutter === C.GUTTER_ALL) {
      this._style.gap[0] = value
      this._style.gap[1] = value
    }
    this.markDirty()
  }

  // ============================================================================
  // Position Setters
  // ============================================================================

  /**
   * Set the position type.
   *
   * @param positionType - POSITION_TYPE_STATIC, POSITION_TYPE_RELATIVE, or POSITION_TYPE_ABSOLUTE
   * @example
   * ```typescript
   * node.setPositionType(POSITION_TYPE_ABSOLUTE);
   * node.setPosition(EDGE_LEFT, 10);
   * node.setPosition(EDGE_TOP, 20);
   * ```
   */
  setPositionType(positionType: number): void {
    this._style.positionType = positionType
    this.markDirty()
  }

  /**
   * Set position offset for one or more edges.
   * Only applies when position type is ABSOLUTE or RELATIVE.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Position offset in points
   */
  setPosition(edge: number, value: number): void {
    // NaN means "auto" (unset) in Yoga API
    if (Number.isNaN(value)) {
      setEdgeValue(this._style.position, edge, 0, C.UNIT_UNDEFINED)
    } else {
      setEdgeValue(this._style.position, edge, value, C.UNIT_POINT)
    }
    this.markDirty()
  }

  /**
   * Set position offset as a percentage.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_HORIZONTAL, EDGE_VERTICAL, or EDGE_ALL
   * @param value - Position offset as a percentage of parent's corresponding dimension
   */
  setPositionPercent(edge: number, value: number): void {
    setEdgeValue(this._style.position, edge, value, C.UNIT_PERCENT)
    this.markDirty()
  }

  // ============================================================================
  // Other Setters
  // ============================================================================

  /**
   * Set the display type.
   *
   * @param display - DISPLAY_FLEX or DISPLAY_NONE
   */
  setDisplay(display: number): void {
    this._style.display = display
    this.markDirty()
  }

  /**
   * Set the overflow behavior.
   *
   * @param overflow - OVERFLOW_VISIBLE, OVERFLOW_HIDDEN, or OVERFLOW_SCROLL
   */
  setOverflow(overflow: number): void {
    this._style.overflow = overflow
    this.markDirty()
  }

  // ============================================================================
  // Style Getters
  // ============================================================================

  /**
   * Get the width style value.
   *
   * @returns Width value with unit (points, percent, or auto)
   */
  getWidth(): Value {
    return this._style.width
  }

  /**
   * Get the height style value.
   *
   * @returns Height value with unit (points, percent, or auto)
   */
  getHeight(): Value {
    return this._style.height
  }

  /**
   * Get the minimum width style value.
   *
   * @returns Minimum width value with unit
   */
  getMinWidth(): Value {
    return this._style.minWidth
  }

  /**
   * Get the minimum height style value.
   *
   * @returns Minimum height value with unit
   */
  getMinHeight(): Value {
    return this._style.minHeight
  }

  /**
   * Get the maximum width style value.
   *
   * @returns Maximum width value with unit
   */
  getMaxWidth(): Value {
    return this._style.maxWidth
  }

  /**
   * Get the maximum height style value.
   *
   * @returns Maximum height value with unit
   */
  getMaxHeight(): Value {
    return this._style.maxHeight
  }

  /**
   * Get the aspect ratio.
   *
   * @returns Aspect ratio value (NaN if not set)
   */
  getAspectRatio(): number {
    return this._style.aspectRatio
  }

  /**
   * Get the flex grow factor.
   *
   * @returns Flex grow value
   */
  getFlexGrow(): number {
    return this._style.flexGrow
  }

  /**
   * Get the flex shrink factor.
   *
   * @returns Flex shrink value
   */
  getFlexShrink(): number {
    return this._style.flexShrink
  }

  /**
   * Get the flex basis style value.
   *
   * @returns Flex basis value with unit
   */
  getFlexBasis(): Value {
    return this._style.flexBasis
  }

  /**
   * Get the flex direction.
   *
   * @returns Flex direction constant
   */
  getFlexDirection(): number {
    return this._style.flexDirection
  }

  /**
   * Get the flex wrap setting.
   *
   * @returns Flex wrap constant
   */
  getFlexWrap(): number {
    return this._style.flexWrap
  }

  /**
   * Get the align items setting.
   *
   * @returns Align items constant
   */
  getAlignItems(): number {
    return this._style.alignItems
  }

  /**
   * Get the align self setting.
   *
   * @returns Align self constant
   */
  getAlignSelf(): number {
    return this._style.alignSelf
  }

  /**
   * Get the align content setting.
   *
   * @returns Align content constant
   */
  getAlignContent(): number {
    return this._style.alignContent
  }

  /**
   * Get the justify content setting.
   *
   * @returns Justify content constant
   */
  getJustifyContent(): number {
    return this._style.justifyContent
  }

  /**
   * Get the padding for a specific edge.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Padding value with unit
   */
  getPadding(edge: number): Value {
    return getEdgeValue(this._style.padding, edge)
  }

  /**
   * Get the margin for a specific edge.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Margin value with unit
   */
  getMargin(edge: number): Value {
    return getEdgeValue(this._style.margin, edge)
  }

  /**
   * Get the border width for a specific edge.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Border width in points
   */
  getBorder(edge: number): number {
    return getEdgeBorderValue(this._style.border, edge)
  }

  /**
   * Get the position offset for a specific edge.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Position value with unit
   */
  getPosition(edge: number): Value {
    return getEdgeValue(this._style.position, edge)
  }

  /**
   * Get the position type.
   *
   * @returns Position type constant
   */
  getPositionType(): number {
    return this._style.positionType
  }

  /**
   * Get the display type.
   *
   * @returns Display constant
   */
  getDisplay(): number {
    return this._style.display
  }

  /**
   * Get the overflow setting.
   *
   * @returns Overflow constant
   */
  getOverflow(): number {
    return this._style.overflow
  }

  /**
   * Get the gap for column or row.
   *
   * @param gutter - GUTTER_COLUMN or GUTTER_ROW
   * @returns Gap size in points
   */
  getGap(gutter: number): number {
    if (gutter === C.GUTTER_COLUMN) {
      return this._style.gap[0]
    } else if (gutter === C.GUTTER_ROW) {
      return this._style.gap[1]
    }
    return this._style.gap[0] // Default to column gap
  }
}
