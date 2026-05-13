/**
 * Flexily Constants
 *
 * Yoga-compatible constants for flexbox layout.
 * These match Yoga's enum values exactly for drop-in compatibility.
 */

// Flex Direction
export const FLEX_DIRECTION_COLUMN = 0
export const FLEX_DIRECTION_COLUMN_REVERSE = 1
export const FLEX_DIRECTION_ROW = 2
export const FLEX_DIRECTION_ROW_REVERSE = 3

// Wrap
export const WRAP_NO_WRAP = 0
export const WRAP_WRAP = 1
export const WRAP_WRAP_REVERSE = 2

// Align
export const ALIGN_AUTO = 0
export const ALIGN_FLEX_START = 1
export const ALIGN_CENTER = 2
export const ALIGN_FLEX_END = 3
export const ALIGN_STRETCH = 4
export const ALIGN_BASELINE = 5
export const ALIGN_SPACE_BETWEEN = 6
export const ALIGN_SPACE_AROUND = 7
export const ALIGN_SPACE_EVENLY = 8

// Justify
export const JUSTIFY_FLEX_START = 0
export const JUSTIFY_CENTER = 1
export const JUSTIFY_FLEX_END = 2
export const JUSTIFY_SPACE_BETWEEN = 3
export const JUSTIFY_SPACE_AROUND = 4
export const JUSTIFY_SPACE_EVENLY = 5

// Edge
export const EDGE_LEFT = 0
export const EDGE_TOP = 1
export const EDGE_RIGHT = 2
export const EDGE_BOTTOM = 3
export const EDGE_START = 4
export const EDGE_END = 5
export const EDGE_HORIZONTAL = 6
export const EDGE_VERTICAL = 7
export const EDGE_ALL = 8

// Gutter
export const GUTTER_COLUMN = 0
export const GUTTER_ROW = 1
export const GUTTER_ALL = 2

// Display
export const DISPLAY_FLEX = 0
export const DISPLAY_NONE = 1

// Position Type
export const POSITION_TYPE_STATIC = 0
export const POSITION_TYPE_RELATIVE = 1
export const POSITION_TYPE_ABSOLUTE = 2

// Overflow
export const OVERFLOW_VISIBLE = 0
export const OVERFLOW_HIDDEN = 1
export const OVERFLOW_SCROLL = 2

// Direction (LTR and RTL are both supported)
export const DIRECTION_INHERIT = 0
export const DIRECTION_LTR = 1
export const DIRECTION_RTL = 2

// Measure Mode (for measureFunc)
//
// Yoga-compatible modes (UNDEFINED/AT_MOST/EXACTLY) are stable. MIN_CONTENT
// is a flexily-only extension used by CSS §4.5 auto-min-size derivation —
// when the layout engine asks "what is your content-based minimum?" the
// measurer reports CSS min-content (longest unbreakable token for
// wrappable text; natural width for non-wrappable). Adapters that bridge
// flexily to other engines should translate MIN_CONTENT to AT_MOST with
// width=0 (or fail soft and return AT_MOST behavior) — measurers that
// don't know about MIN_CONTENT will degrade to over-conservative sizes
// rather than crash.
export const MEASURE_MODE_UNDEFINED = 0
export const MEASURE_MODE_EXACTLY = 1
export const MEASURE_MODE_AT_MOST = 2
export const MEASURE_MODE_MIN_CONTENT = 3

// Unit (for internal use)
export const UNIT_UNDEFINED = 0
export const UNIT_POINT = 1
export const UNIT_PERCENT = 2
export const UNIT_AUTO = 3
export const UNIT_FIT_CONTENT = 4
export const UNIT_SNUG_CONTENT = 5
// Container-query units (A0.1) — resolve against frozen query-container inline-size.
// Phase 1: inline-size only. cqi == "1% of nearest CQ ancestor's inline-size".
// cqmin in 1D (Phase 1) is identical to cqi — block-size resolution arrives in a later phase.
export const UNIT_CQI = 6
export const UNIT_CQMIN = 7
// CSS math-function value (A0.3). Value carries an `expr: MathExpr` payload;
// `resolveValue` recursively evaluates against the same availableSize +
// queryInlineSize as the leaf units. Late-bound per the contract in
// vendor/flexily/docs/two-phase-layout.md.
export const UNIT_CALC = 8

// Container type (A0.1) — declares a node as a container-query container.
// Maps to CSS `container-type`. Phase 1 supports `inline-size` only.
// CSS `container-type: size` requires block-size containment too (Phase 2+).
export const CONTAINER_TYPE_NORMAL = 0
export const CONTAINER_TYPE_INLINE_SIZE = 1
