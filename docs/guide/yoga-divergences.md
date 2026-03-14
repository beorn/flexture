# Intentional Divergences from Yoga

_Divergences verified against Yoga 3.x (`yoga-layout` npm) as of 2026-03._

Flexily is Yoga-compatible but intentionally diverges where Yoga deviates from the CSS spec. These are not bugs -- they are deliberate design decisions to follow browser behavior.

## Summary

| Behavior                                  | Yoga                               | Flexily                                  | CSS Spec                                                  |
| ----------------------------------------- | ---------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| Default `flexDirection`                   | Column                             | **Row** (CSS default)                    | Row                                                       |
| `overflow:hidden/scroll` + `flexShrink:0` | Item expands to content size       | **Item shrinks to fit parent**           | Section 4.5: `min-size: auto = 0` for overflow containers |
| `aspect-ratio` + implicit `stretch`       | Stretch overrides AR on cross-axis | **AR fallback alignment = `flex-start`** | CSS Alignment: AR prevents implicit stretch               |

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

## What's Intentional vs What's a Bug

Every divergence listed above is **intentional** and tested. If Flexily produces different output from Yoga in a case not listed here, it may be a bug -- please [file an issue](https://github.com/beorn/flexily/issues).

The guiding principle: **follow the CSS spec, not Yoga's quirks**. Yoga has historical baggage from React Native's mobile layout model. Flexily targets the broader JavaScript ecosystem where CSS-spec behavior is the expected default.
