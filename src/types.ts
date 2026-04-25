/**
 * Flexily Types
 *
 * TypeScript interfaces for the flexbox layout engine.
 */

import { type DefaultsPreset, DEFAULT_PRESET } from "./defaults.js"

/**
 * A value with a unit (point, percent, or auto).
 */
export interface Value {
  value: number
  unit: number // UNIT_UNDEFINED | UNIT_POINT | UNIT_PERCENT | UNIT_AUTO
}

/**
 * Measure function signature for intrinsic sizing.
 * Called by the layout algorithm to determine a node's natural size.
 */
export type MeasureFunc = (
  width: number,
  widthMode: number,
  height: number,
  heightMode: number,
) => { width: number; height: number }

/**
 * Baseline function signature for baseline alignment.
 * Called by the layout algorithm to determine a node's baseline offset from its top edge.
 * Used with ALIGN_BASELINE to align text baselines across siblings.
 *
 * @param width - The computed width of the node
 * @param height - The computed height of the node
 * @returns The baseline offset from the top of the node (in points)
 */
export type BaselineFunc = (width: number, height: number) => number

/**
 * Cache entry for measure results.
 * Stores input constraints (w, wm, h, hm) and output (rw, rh).
 */
export interface MeasureEntry {
  w: number
  wm: number
  h: number
  hm: number
  rw: number
  rh: number
}

/**
 * Cache entry for layout results.
 * Stores input available dimensions and computed size.
 * Used to avoid redundant recursive layout calls during a single pass.
 */
export interface LayoutCacheEntry {
  availW: number // Available width (may be NaN)
  availH: number // Available height (may be NaN)
  computedW: number // Computed width
  computedH: number // Computed height
}

/**
 * Per-node flex calculation state for zero-allocation layout.
 *
 * This interface enables the layout engine to avoid heap allocations during
 * layout passes by storing all intermediate calculation state directly on
 * each Node. Fields are mutated (not recreated) each pass.
 *
 * Design rationale:
 * - Eliminates ChildLayout object allocation (previously created per child per pass)
 * - Enables filtered iteration via relativeIndex (avoids temporary array allocation)
 * - Stores line membership for flex-wrap (avoids FlexLine[] allocation)
 *
 * All numeric fields use number (Float64 in V8) for precision. Boolean fields
 * track state that affects the CSS Flexbox algorithm's iterative distribution.
 *
 * @see layout.ts for usage in layoutNode() and distributeFlexSpaceForLine()
 */
export interface FlexInfo {
  /** Computed main-axis size after flex distribution */
  mainSize: number
  /** Original base size before flex distribution (used for weighted shrink) */
  baseSize: number
  /** Total main-axis margin (non-auto margins only) */
  mainMargin: number
  /** flex-grow factor from style */
  flexGrow: number
  /** flex-shrink factor from style */
  flexShrink: number
  /** Resolved min-width/height constraint on main axis */
  minMain: number
  /** Resolved max-width/height constraint on main axis (Infinity if none) */
  maxMain: number
  /** Whether main-start margin is auto (absorbs free space) */
  mainStartMarginAuto: boolean
  /** Whether main-end margin is auto (absorbs free space) */
  mainEndMarginAuto: boolean
  /** Resolved main-start margin value (0 if auto, computed later) */
  mainStartMarginValue: number
  /** Resolved main-end margin value (0 if auto, computed later) */
  mainEndMarginValue: number
  /** Cached resolved margin values [left, top, right, bottom] */
  marginL: number
  marginT: number
  marginR: number
  marginB: number
  /** Frozen in flex distribution (clamped to min/max constraint) */
  frozen: boolean
  /** Line index for flex-wrap (0-based, which line this child belongs to) */
  lineIndex: number
  /**
   * Relative index for filtered iteration.
   * -1 = absolute positioned or display:none (skip in flex layout)
   * 0+ = index among relative children (participates in flex layout)
   */
  relativeIndex: number
  /** Computed baseline offset for ALIGN_BASELINE (zero-alloc: avoids per-pass array) */
  baseline: number

  // Constraint fingerprinting for layout caching
  /** Last availableWidth passed to layoutNode */
  lastAvailW: number
  /** Last availableHeight passed to layoutNode */
  lastAvailH: number
  /** Last offsetX passed to layoutNode */
  lastOffsetX: number
  /** Last offsetY passed to layoutNode */
  lastOffsetY: number
  /** Last absX passed to layoutNode (affects edge-based rounding) */
  lastAbsX: number
  /** Last absY passed to layoutNode (affects edge-based rounding) */
  lastAbsY: number
  /** Whether cached layout is valid (fingerprint matched, not dirty) */
  layoutValid: boolean
  /** Last direction passed to layoutNode */
  lastDir: number
}

/**
 * Computed layout result for a node.
 */
export interface Layout {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Internal style properties for a node.
 */
export interface Style {
  // Display
  display: number

  // Position
  positionType: number
  position: [Value, Value, Value, Value, Value, Value] // [left, top, right, bottom, start, end]

  // Flex
  flexDirection: number
  flexWrap: number
  flexGrow: number
  flexShrink: number
  flexBasis: Value

  // Alignment
  alignItems: number
  alignSelf: number
  alignContent: number
  justifyContent: number

  // Size
  width: Value
  height: Value
  minWidth: Value
  minHeight: Value
  maxWidth: Value
  maxHeight: Value
  aspectRatio: number // NaN = undefined, otherwise width/height ratio

  // Spacing (per-edge: left, top, right, bottom, start, end)
  // Physical edges: [0]=left, [1]=top, [2]=right, [3]=bottom
  // Logical edges: [4]=start, [5]=end (resolved based on flex direction)
  margin: [Value, Value, Value, Value, Value, Value]
  padding: [Value, Value, Value, Value, Value, Value]
  border: [number, number, number, number, number, number] // Border widths (always points, [4,5] = logical start/end)

  // Gap
  gap: [number, number] // [column, row]

  // Overflow
  overflow: number
}

/**
 * Create a default Value (undefined).
 */
export function createValue(value = 0, unit = 0): Value {
  return { value, unit }
}

/**
 * Create default style.
 *
 * Two presets:
 * - `"css"` — `flexShrink: 1`, `alignContent: stretch` (browser-correct, multi-target).
 * - `"yoga"` — `flexShrink: 0`, `alignContent: flex-start` (drop-in for yoga-layout).
 *
 * `flexDirection` is `row` in both presets. Yoga's native default is `column`,
 * but flexily diverged to `row` (CSS-correct) before this preset system existed
 * and consumers have built around that. The "yoga" preset preserves Yoga's
 * `flexShrink: 0` + `alignContent: flex-start` divergences without flipping
 * direction. Strict-Yoga consumers can call `setFlexDirection(COLUMN)` per-tree.
 *
 * If `preset` is omitted, the module-level current preset is used (set via
 * `setDefaultsPreset()` or `createFlexily({ defaults })`). Default is `"yoga"`.
 */
export function createDefaultStyle(preset: DefaultsPreset = DEFAULT_PRESET): Style {
  const isCss = preset === "css"
  return {
    display: 0, // DISPLAY_FLEX (same in CSS and Yoga)
    positionType: 1, // POSITION_TYPE_RELATIVE (same in CSS and Yoga)
    position: [createValue(), createValue(), createValue(), createValue(), createValue(), createValue()],
    flexDirection: 2, // FLEX_DIRECTION_ROW — CSS default; Yoga defaults to COLUMN
    flexWrap: 0, // WRAP_NO_WRAP (same in CSS and Yoga)
    flexGrow: 0, // (same in CSS and Yoga)
    flexShrink: isCss ? 1 : 0, // CSS: 1 — Yoga: 0
    flexBasis: createValue(0, 3), // AUTO (same in CSS and Yoga)
    alignItems: 4, // ALIGN_STRETCH (same in CSS and Yoga)
    alignSelf: 0, // ALIGN_AUTO (same in CSS and Yoga)
    alignContent: isCss ? 4 : 1, // CSS: STRETCH — Yoga: FLEX_START
    justifyContent: 0, // JUSTIFY_FLEX_START (same in CSS and Yoga)
    width: createValue(0, 3), // AUTO (same in CSS and Yoga)
    height: createValue(0, 3), // AUTO (same in CSS and Yoga)
    // CSS §4.5: flex items default to `min-block-size: auto` and `min-inline-size: auto`.
    // The auto value resolves to a content-based minimum on the main axis (visible-
    // overflow items only) — see layout-zero.ts. Yoga preset preserves UNIT_UNDEFINED
    // (treated as 0) for drop-in compat with yoga-layout's looser semantics.
    minWidth: isCss ? createValue(0, 3) : createValue(), // CSS: AUTO — Yoga: undefined
    minHeight: isCss ? createValue(0, 3) : createValue(), // CSS: AUTO — Yoga: undefined
    maxWidth: createValue(),
    maxHeight: createValue(),
    aspectRatio: NaN, // undefined by default (same in CSS and Yoga)
    margin: [createValue(), createValue(), createValue(), createValue(), createValue(), createValue()],
    padding: [createValue(), createValue(), createValue(), createValue(), createValue(), createValue()],
    border: [0, 0, 0, 0, NaN, NaN],
    gap: [0, 0],
    overflow: 0, // OVERFLOW_VISIBLE (same in CSS and Yoga)
  }
}
