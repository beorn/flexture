# Intentional Divergences from Yoga

_Divergences verified against Yoga 3.x (`yoga-layout` npm) as of 2026-03._

Flexily is Yoga-compatible but intentionally diverges where Yoga deviates from the CSS spec. These are not bugs -- they are deliberate design decisions to follow browser behavior.

## Summary

| Behavior                                  | Yoga                               | Flexily                                                         | CSS Spec                                                    |
| ----------------------------------------- | ---------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| Default `flexDirection`                   | Column                             | **Row** (CSS default)                                           | Row                                                         |
| `overflow:hidden/scroll` + `flexShrink:0` | Item expands to content size       | **Item shrinks to fit parent**                                  | Section 4.5: `min-size: auto = 0` for overflow containers   |
| `aspect-ratio` + implicit `stretch`       | Stretch overrides AR on cross-axis | **AR fallback alignment = `flex-start`**                        | CSS Alignment: AR prevents implicit stretch                 |
| **Flex item default min-size**            | `0` (no auto floor)                | CSS preset: content-based minimum (auto rule); Yoga preset: `0` | Section 4.5: `min-block-size: auto = content-based minimum` |

## Divergence 1: Default Flex Direction

**Yoga**: Defaults to `column` (legacy from React Native's mobile-first layout).

**Flexily**: Defaults to `row`, matching CSS spec and browser behavior.

**When it matters**: If you're porting from Yoga and your layouts assume column as the default direction, you'll need to add explicit `setFlexDirection(FLEX_DIRECTION_COLUMN)` calls.

**Recommendation**: Always set `flexDirection` explicitly -- both for clarity and for portability between engines.

## Divergence 2: Overflow Containers and Shrinking

**The problem**: Yoga defaults `flexShrink` to 0 (unlike CSS's default of 1) and doesn't implement CSS Section 4.5's rule that overflow containers have `min-size: auto = 0`. This means in Yoga, an `overflow:hidden` child with 30 lines of content inside a height-10 parent will compute as height 30 -- defeating the purpose of overflow clipping.

**Flexily's behavior**: Overflow containers can always shrink (`flexShrink >= 1`), matching CSS browser behavior. A scrollable container inside a constrained parent will actually respect the parent's dimensions.

**When it matters**: Any time you use `overflow: hidden` or `overflow: scroll` to clip content. In Yoga, the clipped container may expand beyond its parent; in Flexily, it respects the constraint.

**Test coverage**: See `tests/yoga-overflow-compare.test.ts` for comparison tests demonstrating the difference.

```typescript
// Yoga: child computes as 30px tall (ignores parent constraint)
// Flexily: child computes as 10px tall (respects parent, matches browsers)
const parent = Node.create()
parent.setHeight(10)

const child = Node.create()
child.setOverflow(OVERFLOW_HIDDEN)
child.setFlexShrink(0) // Yoga won't shrink this; Flexily will

const content = Node.create()
content.setHeight(30) // 30 lines of content

child.insertChild(content, 0)
parent.insertChild(child, 0)
parent.calculateLayout(100, 10, DIRECTION_LTR)

// Flexily: child.getComputedHeight() === 10 (correct per CSS spec)
// Yoga:    child.getComputedHeight() === 30 (overflow defeats clipping)
```

## Divergence 3: Aspect Ratio and Implicit Stretch

**The problem**: Per CSS Alignment spec, when a flex item has `aspect-ratio` and its cross-axis dimension is auto, the fallback alignment should be `flex-start` (not `stretch`). This prevents `align-items: stretch` from overriding the aspect-ratio-derived dimension.

**Yoga's behavior**: Stretch overrides the aspect ratio on the cross-axis, so an item with `aspect-ratio: 2` in a stretch container may get a height that doesn't match the ratio.

**Flexily's behavior**: Implicit stretch (from `align-self: auto` inheriting `align-items: stretch`) does not override aspect ratio. The item uses `flex-start` alignment instead, preserving the AR-derived dimension.

**Exception**: Explicit `align-self: stretch` still stretches, even with aspect ratio. Only the implicit/inherited stretch is suppressed.

**When it matters**: If you rely on Yoga's behavior of stretching items with aspect ratios to fill the cross-axis, your layout will differ in Flexily. The Flexily behavior matches what browsers do.

**Test coverage**: See `tests/aspect-ratio.test.ts`.

## When These Divergences Matter

If you're **migrating from Yoga**, these are the cases to check:

1. **Layouts without explicit `flexDirection`** -- Add `FLEX_DIRECTION_COLUMN` if your code assumed Yoga's default.
2. **Overflow containers** -- Verify that clipped content areas size correctly. Flexily's behavior is likely what you wanted (matching browsers).
3. **Aspect-ratio items in stretch containers** -- If you relied on stretch overriding aspect ratio, add explicit `align-self: stretch` or remove the aspect ratio.

If you're **starting fresh**, Flexily's defaults match CSS spec and browser behavior, so you shouldn't encounter surprises.

## Divergence 4: Flex-Item Automatic Minimum Size (CSS §4.5, item-side rule)

CSS Flexbox §4.5 has **two complementary rules** about automatic minimum size:

1. **Container side** — overflow containers (`overflow: hidden/scroll/auto`) get `min-size: auto = 0`, so they can shrink to fit a constrained parent. Flexily implements this (see Divergence 2).
2. **Item side** — flex items get `min-block-size: auto = content-based minimum` (≈ `min-content`), so they can't shrink below their own intrinsic content size.

**Flexily's behavior** (under CSS preset): both rules are implemented. With `createFlexily({ defaults: "css" })` or `Node.create({ defaults: "css" })`, `minWidth`/`minHeight` default to `UNIT_AUTO`, which the layout algorithm interprets as content-based minimum on the main axis (or 0 if the item itself has non-visible overflow, per the spec). Yoga preset preserves the looser `min: undefined → 0` behavior for drop-in Yoga compatibility.

**Why this matters**: scroll containers, list rows, and any column flex layout where children should keep their intrinsic height work correctly under CSS preset out of the box. Items don't shrink to zero rows when the container is over-full; instead, content overflows and the scroll container handles it as expected. This is what browser flexbox does by default.

```typescript
// Under Yoga preset: items shrink to nothing when flexShrink:1 + container too small.
// Under CSS preset: items keep content height; container scrolls correctly.
const flex = createFlexily({ defaults: "css" })
const root = flex.createNode()
root.setFlexDirection(FLEX_DIRECTION_COLUMN)
root.setHeight(6)

for (let i = 0; i < 10; i++) {
  const item = flex.createNode()
  item.setHeight(1)
  root.insertChild(item, i)
}
flex.calculateLayout(root, 40, 6)
// Each item.getComputedHeight() === 1 — content preserved despite container
// being smaller than total content. Yoga preset would collapse each to 0.6.
```

**Implementation detail**: `contentMinSize` is derived alongside `baseSize` and used as the content-based minimum. When `flex-basis` is auto, `contentMinSize === baseSize`. When `flex-basis` is definite (e.g. `flex: 1 1 0`), `contentMinSize` is re-derived via `measureFunc` so auto-min doesn't collapse to 0.

**Remaining approximation gaps** (smaller, deferred):

- Wrapping row text: `contentMinSize` returns max-content from `measureFunc`, not min-content (longest unbreakable word). Items become more rigid horizontally than browsers would.
- Nodes-with-children with definite `flex-basis`: falls back to `baseSize` rather than re-running recursive layout for content-min.
- Aspect-ratio / replaced-element transferred-size suggestions: not folded in.

For the targeted scroll-container case (column layouts with rigid intrinsic items) and the `flex: 1 1 0` pattern with measureFunc text, the rule produces CSS-correct results.

**Test coverage**: See `tests/auto-min-size.test.ts`.

**Workaround when the gap matters**: set explicit `minHeight`/`minWidth` (or `minHeight: 0` to opt into shrinking, matching the canonical CSS escape hatch).

**Spec reference**: <https://www.w3.org/TR/css-flexbox-1/#min-size-auto>

## What's Intentional vs What's a Bug

The divergences listed in the Summary table are **intentional** and tested. Divergence 4 (flex-item auto min-size) ships gated on the CSS preset; the Yoga preset preserves Yoga-compatible behavior.

If Flexily produces different output from Yoga in a case not listed here, it may be a bug -- please [file an issue](https://github.com/beorn/flexily/issues).

The guiding principle: **follow the CSS spec, not Yoga's quirks**. Yoga has historical baggage from React Native's mobile layout model. Flexily targets the broader JavaScript ecosystem where CSS-spec behavior is the expected default.
