/**
 * Flexily Node
 *
 * Yoga-compatible Node class for flexbox layout.
 */

import * as C from "./constants.js"
import { computeLayout, countNodes, markSubtreeLayoutSeen } from "./layout-zero.js"
import {
  type BaselineFunc,
  type FlexInfo,
  type Layout,
  type LayoutCacheEntry,
  type MeasureEntry,
  type MeasureFunc,
  type Style,
  type Value,
  createDefaultStyle,
} from "./types.js"
import { setEdgeValue, setEdgeBorder, getEdgeValue, getEdgeBorderValue, traversalStack } from "./utils.js"
import { log } from "./logger.js"
import { getTrace } from "./trace.js"

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

  // Measure cache - 4-entry numeric cache (faster than Map<string,...>)
  // Each entry stores: w, wm, h, hm, rw, rh
  // Cleared when markDirty() is called since content may have changed
  private _m0?: MeasureEntry
  private _m1?: MeasureEntry
  private _m2?: MeasureEntry
  private _m3?: MeasureEntry

  // Layout cache - 2-entry cache for sizing pass (availW, availH -> computedW, computedH)
  // Cleared at start of each calculateLayout pass via resetLayoutCache()
  // This avoids redundant recursive layout calls during intrinsic sizing
  private _lc0?: LayoutCacheEntry
  private _lc1?: LayoutCacheEntry

  // Stable result objects for zero-allocation cache returns
  // These are mutated in place instead of creating new objects on each cache hit
  private _measureResult: { width: number; height: number } = {
    width: 0,
    height: 0,
  }
  private _layoutResult: { width: number; height: number } = {
    width: 0,
    height: 0,
  }

  // Static counters for cache statistics (reset per layout pass)
  static measureCalls = 0
  static measureCacheHits = 0

  /**
   * Reset measure statistics (call before calculateLayout).
   */
  static resetMeasureStats(): void {
    Node.measureCalls = 0
    Node.measureCacheHits = 0
  }

  // Computed layout
  private _layout: Layout = { left: 0, top: 0, width: 0, height: 0 }

  // Per-node flex calculation state (reused across layout passes to avoid allocation)
  private _flex: FlexInfo = {
    mainSize: 0,
    baseSize: 0,
    mainMargin: 0,
    flexGrow: 0,
    flexShrink: 0,
    minMain: 0,
    maxMain: Infinity,
    mainStartMarginAuto: false,
    mainEndMarginAuto: false,
    mainStartMarginValue: 0,
    mainEndMarginValue: 0,
    marginL: 0,
    marginT: 0,
    marginR: 0,
    marginB: 0,
    frozen: false,
    lineIndex: 0,
    relativeIndex: -1,
    baseline: 0,
    // Constraint fingerprinting
    lastAvailW: NaN,
    lastAvailH: NaN,
    lastOffsetX: NaN,
    lastOffsetY: NaN,
    lastAbsX: NaN,
    lastAbsY: NaN,
    layoutValid: false,
    lastDir: 0,
  }

  // Dirty flags
  private _isDirty = true
  private _hasNewLayout = false

  // Last calculateLayout() inputs (for constraint-aware skip)
  private _lastCalcW: number = NaN
  private _lastCalcH: number = NaN
  private _lastCalcDir: number = 0

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
    // Cycle guard: prevent self-insertion or insertion of an ancestor (would create infinite loop)
    if (child === this) {
      throw new Error("Cannot insert a node as a child of itself")
    }
    let ancestor: Node | null = this._parent
    while (ancestor !== null) {
      if (ancestor === child) {
        throw new Error("Cannot insert an ancestor as a child (would create a cycle)")
      }
      ancestor = ancestor._parent
    }

    if (child._parent !== null) {
      child._parent.removeChild(child)
    }
    child._parent = this
    // Clamp index to valid range to ensure deterministic behavior
    const clampedIndex = Math.max(0, Math.min(index, this._children.length))
    this._children.splice(clampedIndex, 0, child)
    // Invalidate layoutValid for siblings after the insertion point
    // Their positions may change due to the insertion
    for (let i = clampedIndex + 1; i < this._children.length; i++) {
      this._children[i]!._flex.layoutValid = false
    }
    this.markDirty()
  }

  /**
   * Remove a child node from this node.
   * The child's parent reference will be cleared.
   * Marks the node as dirty to trigger layout recalculation.
   * Invalidates layout validity of remaining siblings whose positions may change.
   *
   * @param child - The child node to remove
   */
  removeChild(child: Node): void {
    const index = this._children.indexOf(child)
    if (index !== -1) {
      this._children.splice(index, 1)
      child._parent = null
      // Invalidate layoutValid for remaining siblings after the removal point
      // Their positions may change due to the removal
      for (let i = index; i < this._children.length; i++) {
        this._children[i]!._flex.layoutValid = false
      }
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
   * Free this node and all descendants recursively.
   * Each node is detached from its parent and cleaned up.
   * Uses iterative traversal to avoid stack overflow on deep trees.
   */
  freeRecursive(): void {
    // Collect all descendants first (iterative to avoid stack overflow)
    const nodes: Node[] = []
    traversalStack.length = 0
    traversalStack.push(this)
    while (traversalStack.length > 0) {
      const current = traversalStack.pop() as Node
      nodes.push(current)
      for (const child of current._children) {
        traversalStack.push(child)
      }
    }
    // Free in reverse order (leaves first) to avoid parent.removeChild on already-freed nodes
    for (let i = nodes.length - 1; i >= 0; i--) {
      nodes[i]!.free()
    }
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

  /**
   * Call the measure function with caching.
   * Uses a 4-entry numeric cache for fast lookup without allocations.
   * Cache is cleared when markDirty() is called.
   *
   * @returns Measured dimensions or null if no measure function
   */
  cachedMeasure(w: number, wm: number, h: number, hm: number): { width: number; height: number } | null {
    if (!this._measureFunc) return null

    Node.measureCalls++

    // Check 4-entry cache (most recent first)
    // Returns stable _measureResult object to avoid allocation on cache hit
    const m0 = this._m0
    if (m0 && m0.w === w && m0.wm === wm && m0.h === h && m0.hm === hm) {
      Node.measureCacheHits++
      this._measureResult.width = m0.rw
      this._measureResult.height = m0.rh
      getTrace()?.measureCacheHit(0, w, h, m0.rw, m0.rh)
      return this._measureResult
    }
    const m1 = this._m1
    if (m1 && m1.w === w && m1.wm === wm && m1.h === h && m1.hm === hm) {
      Node.measureCacheHits++
      this._measureResult.width = m1.rw
      this._measureResult.height = m1.rh
      getTrace()?.measureCacheHit(0, w, h, m1.rw, m1.rh)
      return this._measureResult
    }
    const m2 = this._m2
    if (m2 && m2.w === w && m2.wm === wm && m2.h === h && m2.hm === hm) {
      Node.measureCacheHits++
      this._measureResult.width = m2.rw
      this._measureResult.height = m2.rh
      getTrace()?.measureCacheHit(0, w, h, m2.rw, m2.rh)
      return this._measureResult
    }
    const m3 = this._m3
    if (m3 && m3.w === w && m3.wm === wm && m3.h === h && m3.hm === hm) {
      Node.measureCacheHits++
      this._measureResult.width = m3.rw
      this._measureResult.height = m3.rh
      getTrace()?.measureCacheHit(0, w, h, m3.rw, m3.rh)
      return this._measureResult
    }

    // Cache miss
    getTrace()?.measureCacheMiss(0, w, h)

    // Call actual measure function
    const result = this._measureFunc(w, wm, h, hm)

    // Zero-allocation: rotate entries by copying values, lazily allocate on first use
    // Rotate: m3 <- m2 <- m1 <- m0 <- new values
    if (this._m2) {
      if (!this._m3) this._m3 = { w: 0, wm: 0, h: 0, hm: 0, rw: 0, rh: 0 }
      this._m3.w = this._m2.w
      this._m3.wm = this._m2.wm
      this._m3.h = this._m2.h
      this._m3.hm = this._m2.hm
      this._m3.rw = this._m2.rw
      this._m3.rh = this._m2.rh
    }
    if (this._m1) {
      if (!this._m2) this._m2 = { w: 0, wm: 0, h: 0, hm: 0, rw: 0, rh: 0 }
      this._m2.w = this._m1.w
      this._m2.wm = this._m1.wm
      this._m2.h = this._m1.h
      this._m2.hm = this._m1.hm
      this._m2.rw = this._m1.rw
      this._m2.rh = this._m1.rh
    }
    if (this._m0) {
      if (!this._m1) this._m1 = { w: 0, wm: 0, h: 0, hm: 0, rw: 0, rh: 0 }
      this._m1.w = this._m0.w
      this._m1.wm = this._m0.wm
      this._m1.h = this._m0.h
      this._m1.hm = this._m0.hm
      this._m1.rw = this._m0.rw
      this._m1.rh = this._m0.rh
    }
    if (!this._m0) this._m0 = { w: 0, wm: 0, h: 0, hm: 0, rw: 0, rh: 0 }
    this._m0.w = w
    this._m0.wm = wm
    this._m0.h = h
    this._m0.hm = hm
    this._m0.rw = result.width
    this._m0.rh = result.height

    // Return stable result object (same as cache hits)
    this._measureResult.width = result.width
    this._measureResult.height = result.height
    return this._measureResult
  }

  // ============================================================================
  // Layout Caching (for intrinsic sizing pass)
  // ============================================================================

  /**
   * Check layout cache for a previously computed size with same available dimensions.
   * Returns cached (width, height) or null if not found.
   *
   * NaN dimensions are handled specially via Object.is (NaN === NaN is false, but Object.is(NaN, NaN) is true).
   */
  getCachedLayout(availW: number, availH: number): { width: number; height: number } | null {
    // Never return cached layout for dirty nodes - content may have changed
    if (this._isDirty) {
      return null
    }
    // Returns stable _layoutResult object to avoid allocation on cache hit
    const lc0 = this._lc0
    if (lc0 && Object.is(lc0.availW, availW) && Object.is(lc0.availH, availH)) {
      this._layoutResult.width = lc0.computedW
      this._layoutResult.height = lc0.computedH
      return this._layoutResult
    }
    const lc1 = this._lc1
    if (lc1 && Object.is(lc1.availW, availW) && Object.is(lc1.availH, availH)) {
      this._layoutResult.width = lc1.computedW
      this._layoutResult.height = lc1.computedH
      return this._layoutResult
    }
    return null
  }

  /**
   * Cache a computed layout result for the given available dimensions.
   * Zero-allocation: lazily allocates cache entries once, then reuses.
   */
  setCachedLayout(availW: number, availH: number, computedW: number, computedH: number): void {
    // Rotate entries: copy _lc0 values to _lc1, then update _lc0
    if (this._lc0) {
      // Lazily allocate _lc1 on first rotation
      if (!this._lc1) {
        this._lc1 = { availW: NaN, availH: NaN, computedW: 0, computedH: 0 }
      }
      this._lc1.availW = this._lc0.availW
      this._lc1.availH = this._lc0.availH
      this._lc1.computedW = this._lc0.computedW
      this._lc1.computedH = this._lc0.computedH
    }
    // Lazily allocate _lc0 on first use
    if (!this._lc0) {
      this._lc0 = { availW: 0, availH: 0, computedW: 0, computedH: 0 }
    }
    this._lc0.availW = availW
    this._lc0.availH = availH
    this._lc0.computedW = computedW
    this._lc0.computedH = computedH
  }

  /**
   * Clear layout cache for this node and all descendants.
   * Called at the start of each calculateLayout pass.
   * Zero-allocation: invalidates entries (availW = NaN) rather than deallocating.
   * Uses iterative traversal to avoid stack overflow on deep trees.
   */
  resetLayoutCache(): void {
    traversalStack.length = 0
    traversalStack.push(this)
    while (traversalStack.length > 0) {
      const node = traversalStack.pop() as Node
      // Invalidate using -1 sentinel (not NaN — NaN is a legitimate "unconstrained" query
      // value and Object.is(NaN, NaN) === true would cause false cache hits)
      if (node._lc0) node._lc0.availW = -1
      if (node._lc1) node._lc1.availW = -1
      for (const child of node._children) {
        traversalStack.push(child)
      }
    }
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
   * Uses iterative approach to avoid stack overflow on deep trees.
   */
  markDirty(): void {
    let current: Node | null = this
    while (current !== null) {
      // Always clear caches - even if already dirty, a child's content change
      // may invalidate cached layout results that used the old child size
      current._m0 = current._m1 = current._m2 = current._m3 = undefined
      current._lc0 = current._lc1 = undefined
      // Skip setting dirty flag if already dirty (but still cleared caches above)
      if (current._isDirty) break
      current._isDirty = true
      // Invalidate layout fingerprint
      current._flex.layoutValid = false
      current = current._parent
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
  calculateLayout(width?: number, height?: number, direction: number = C.DIRECTION_LTR): void {
    // Treat undefined as unconstrained (NaN signals content-based sizing)
    const availableWidth = width ?? NaN
    const availableHeight = height ?? NaN

    // Skip if not dirty AND constraints unchanged (use Object.is for NaN equality)
    if (
      !this._isDirty &&
      Object.is(this._lastCalcW, availableWidth) &&
      Object.is(this._lastCalcH, availableHeight) &&
      this._lastCalcDir === direction
    ) {
      log.debug?.("layout skip (not dirty, constraints unchanged)")
      return
    }

    // Track constraints for future skip check
    this._lastCalcW = availableWidth
    this._lastCalcH = availableHeight
    this._lastCalcDir = direction

    // Only compute debug stats when debug logging is enabled (avoid O(n) traversal in production)
    const start = log.debug ? Date.now() : 0
    const nodeCount = log.debug ? countNodes(this) : 0

    // Reset measure statistics for this layout pass
    Node.resetMeasureStats()

    // Run the layout algorithm
    computeLayout(this, availableWidth, availableHeight, direction)

    // Mark layout computed
    this._isDirty = false
    this._hasNewLayout = true
    markSubtreeLayoutSeen(this)

    log.debug?.(
      "layout: %dx%d, %d nodes in %dms (measure: calls=%d hits=%d)",
      width,
      height,
      nodeCount,
      Date.now() - start,
      Node.measureCalls,
      Node.measureCacheHits,
    )
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

  /**
   * Get the computed right edge position after layout (left + width).
   *
   * @returns The right edge position in points
   */
  getComputedRight(): number {
    return this._layout.left + this._layout.width
  }

  /**
   * Get the computed bottom edge position after layout (top + height).
   *
   * @returns The bottom edge position in points
   */
  getComputedBottom(): number {
    return this._layout.top + this._layout.height
  }

  /**
   * Get the computed padding for a specific edge after layout.
   * Returns the resolved padding value (percentage and logical edges resolved).
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Padding value in points
   */
  getComputedPadding(edge: number): number {
    return getEdgeValue(this._style.padding, edge).value
  }

  /**
   * Get the computed margin for a specific edge after layout.
   * Returns the resolved margin value (percentage and logical edges resolved).
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Margin value in points
   */
  getComputedMargin(edge: number): number {
    return getEdgeValue(this._style.margin, edge).value
  }

  /**
   * Get the computed border width for a specific edge after layout.
   *
   * @param edge - EDGE_LEFT, EDGE_TOP, EDGE_RIGHT, or EDGE_BOTTOM
   * @returns Border width in points
   */
  getComputedBorder(edge: number): number {
    return getEdgeBorderValue(this._style.border, edge)
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

  get flex(): FlexInfo {
    return this._flex
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
