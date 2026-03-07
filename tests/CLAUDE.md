# Flexture Tests

**Layer 0 — Layout Engine**: Pure JavaScript flexbox layout, Yoga-compatible API. Zero-allocation design.

## What to Test Here

- **Layout algorithm**: flexbox row/column, justify, align, wrap, gap, absolute positioning, display none
- **Yoga compatibility**: same inputs produce same outputs as Yoga WASM (41 comparison tests)
- **Caching correctness**: constraint fingerprinting edge cases — percent+wrap, shrink-wrap+min/max, stretch+aspect ratio, baseline
- **Re-layout consistency**: incremental dirty-tree re-layout matches fresh layout (1200+ fuzz tests)
- **Differential fuzz**: random tree structures compared Flexture vs Yoga to find discrepancies
- **Overflow divergence**: intentional CSS-spec-compliant overflow behavior vs Yoga
- **Measure callbacks**: intrinsic sizing with AT_MOST/EXACTLY modes
- **Border bottom false**: edge case with border bottom disabled
- **Row cross-axis remeasure**: children re-measured when cross-axis constraint changes
- **Trace**: layout debug tracing output

## What NOT to Test Here

- How layout integrates with inkx rendering — that's inkx tests
- Terminal output or ANSI codes — that's inkx or chalkx
- React component layout — that's inkx component tests

## Helpers

- `test-utils.ts`: `createAndLayoutRoot()`, `expectLayout()`, `expectWidth()`, `createChild()` for ergonomic layout assertions

## Patterns

```typescript
import { Node, FLEX_DIRECTION_ROW, DIRECTION_LTR } from "../src/index.js"
import { createChild, expectLayout } from "./test-utils.js"

test("row layout distributes width", () => {
  const root = Node.create()
  root.setWidth(100)
  root.setHeight(50)
  root.setFlexDirection(FLEX_DIRECTION_ROW)
  const child = createChild(root, { flexGrow: 1 })
  root.calculateLayout(100, 50, DIRECTION_LTR)
  expectLayout(child, { width: 100, height: 50 })
})
```

## Ad-Hoc Testing

```bash
bun vitest run vendor/flexture/tests/                          # All flexture tests
bun vitest run vendor/flexture/tests/layout.test.ts            # Core layout
bun vitest run vendor/flexture/tests/yoga-comparison.test.ts   # Yoga compat
bun vitest run vendor/flexture/tests/relayout-consistency.test.ts  # Fuzz re-layout
bun vitest run vendor/flexture/tests/cache-stress.test.ts      # Cache edge cases
```

## Efficiency

Layout tests are fast (~100ms). The `relayout-consistency` fuzz test runs 1200+ cases (~2s). The `differential-fuzz` test loads Yoga WASM (~500ms startup). The re-layout fuzz tests are the most important correctness guard — always run them after modifying cache/fingerprint code.

## See Also

- [Test layering philosophy](../../.claude/skills/tests/test-layers.md)
