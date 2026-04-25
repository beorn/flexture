# Flexily - Pure JavaScript Flexbox Layout Engine

Yoga-compatible API, 1.5-2.5x faster initial layout, 5.5x faster no-change re-layout, 2.5-3.5x smaller, pure JavaScript (no WASM).

## Two API Levels

**Composable (recommended)**:

```typescript
import { createFlexily } from "flexily"
const flex = createFlexily()
const node = flex.createNode()
node.setTextContent("Hello world")
flex.calculateLayout(node, 80, 24)
```

**Low-level (Yoga-compatible)**:

```typescript
import { Node, DIRECTION_LTR } from "flexily"
const root = Node.create()
root.setWidth(80)
root.calculateLayout(80, 24, DIRECTION_LTR)
```

**Custom composition**:

```typescript
import { createBareFlexily, pipe, withTestMeasurer } from "flexily"
const flex = pipe(createBareFlexily(), withTestMeasurer())
```

## Commands

```bash
bun test              # Run all tests
bun bench             # Run performance benchmarks
bun run typecheck     # Type check
```

## Performance is Critical

Flexily's value proposition is **performance**. Any change that MAY impact performance requires benchmark verification:

```bash
# Check for CPU-heavy processes that would skew results
top -l 1 -n 5 -stats command,cpu | head -10

# BEFORE making changes
bun bench bench/yoga-compare-warmup.bench.ts > /tmp/bench-before.txt

# Make your changes...

# Check CPU load again (should match pre-change conditions)
top -l 1 -n 5 -stats command,cpu | head -10

# AFTER making changes
bun bench bench/yoga-compare-warmup.bench.ts > /tmp/bench-after.txt

# Compare results - look for regressions
diff /tmp/bench-before.txt /tmp/bench-after.txt
```

**Before each benchmark run**, verify no CPU-heavy processes (builds, other test suites, browsers, video encoding) are running. Inconsistent system load invalidates comparisons.

**Changes that require benchmarking:**

- Any modification to `src/layout-zero.ts` (the core algorithm)
- Any modification to `src/node-zero.ts` (Node class)
- Adding new features that affect layout calculation
- Refactoring hot paths

**Acceptable performance impact:**

- Regressions < 5% for minor features
- No regressions for refactoring (must be neutral or faster)
- Document any trade-offs in PR description

## Code Structure

```
src/
├── index.ts              # Main export (everything: createFlexily, Node, constants, plugins)
├── create-flexily.ts     # createFlexily, createBareFlexily, pipe, FlexilyNode mixin
├── text-layout.ts        # TextLayoutService, PreparedText interfaces
├── monospace-measurer.ts # Monospace text measurement (terminal: 1 char = 1 cell)
├── test-measurer.ts      # Deterministic test measurer (Latin 0.8, CJK 1.0, emoji 1.8)
├── pretext-measurer.ts   # Pretext proportional text plugin (peer dep)
├── node-zero.ts          # Node class with FlexInfo (hot path)
├── layout-zero.ts        # Core layout: computeLayout + layoutNode (hot path)
├── layout-helpers.ts     # Edge resolution: margins, padding, borders (hot path)
├── layout-flex-lines.ts  # Pre-alloc arrays, line breaking, flex distribution (hot path)
├── layout-measure.ts     # measureNode — intrinsic sizing (hot path)
├── layout-traversal.ts   # Tree traversal utilities
├── layout-stats.ts       # Debug/benchmark counters
├── constants.ts          # Flexbox constants (Yoga-compatible)
├── types.ts              # TypeScript interfaces
├── utils.ts              # Shared utilities
└── classic/              # Allocating algorithm (for debugging)
```

## Key Files

| File                                 | Purpose                                                      |
| ------------------------------------ | ------------------------------------------------------------ |
| `src/create-flexily.ts`              | createFlexily + createBareFlexily + pipe + FlexilyNode mixin |
| `src/text-layout.ts`                 | TextLayoutService, PreparedText interfaces                   |
| `src/layout-zero.ts`                 | Core layout: computeLayout + layoutNode - **most critical**  |
| `src/layout-helpers.ts`              | Edge resolution helpers (margins, padding, borders)          |
| `src/layout-flex-lines.ts`           | Pre-alloc arrays, line breaking, flex distribution           |
| `src/layout-measure.ts`              | measureNode - intrinsic sizing                               |
| `src/node-zero.ts`                   | Node class - **second most performance-critical**            |
| `bench/yoga-compare-warmup.bench.ts` | Main benchmark comparing Flexily vs Yoga                     |
| `tests/compose.test.ts`              | Compose API tests (33 tests)                                 |
| `tests/yoga-comparison.test.ts`      | Yoga compatibility tests (44 tests)                          |

## Architecture

- **Zero-allocation design** in layout-zero.ts - reuses FlexInfo objects
- **Yoga API compatibility** - same constants, same method names
- **Two algorithms**: zero (production) and classic (debugging)

## Intentional Divergences from Yoga

_Divergences verified against Yoga 3.x (yoga-layout npm) as of 2026-03._

Flexily is Yoga-compatible but follows CSS spec where Yoga doesn't:

| Behavior                                  | Yoga                                                     | Flexily                                                                  | CSS Spec                                             |
| ----------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| Default `flexDirection`                   | Column                                                   | Row (CSS default)                                                        | Row                                                  |
| `overflow:hidden/scroll` + `flexShrink:0` | Item expands to content size (ignores parent constraint) | Item shrinks to fit parent                                               | §4.5: automatic min-size = 0 for overflow containers |
| `aspect-ratio` + implicit `stretch`       | Stretch overrides AR on cross-axis                       | AR fallback alignment = `flex-start`                                     | CSS Alignment: AR prevents implicit stretch          |
| **Flex-item default min-size**            | `0` (no auto floor)                                      | CSS preset: content-based minimum (auto rule); Yoga preset: `0`          | §4.5: `min-block-size: auto = content-based minimum` |

**Flex-item auto min-size (CSS §4.5 item-side, shipped under CSS preset)**: CSS §4.5 has two complementary rules. Flexily now implements both — the *container* side (overflow containers can shrink to 0) and the *item* side (flex items default to a content-based minimum, not 0). Under Yoga preset (`flexShrink: 0` + `min: undefined → 0`) this is invisible because items never shrink. Under CSS preset (`flexShrink: 1` + `min: auto → content`), items keep their intrinsic content size when overflow is visible, and shrink to 0 when overflow is hidden/scroll/auto. See `tests/auto-min-size.test.ts`. **Known approximation gaps** (tracked by `km-flexily.auto-min-size-flex-items`): the rule uses `baseSize` as a proxy for content-based minimum, which collapses for `flex: 1 1 0` patterns and is too rigid for wrapping row text — these refinements are follow-ups.

## Defaults preset (`"css"` vs `"yoga"`)

Flexily exposes a defaults selector via `createFlexily({ defaults })` and
`Node.create({ defaults })`. The two presets toggle `flexShrink` and
`alignContent`:

| Preset   | `flexShrink` | `alignContent` | `flexDirection` |
| -------- | ------------ | -------------- | --------------- |
| `"yoga"` | `0`          | `flex-start`   | `row`           |
| `"css"`  | `1`          | `stretch`      | `row`           |

`DEFAULT_PRESET` is `"yoga"` today (drop-in replacement for yoga-layout).
Multi-target consumers (silvery, web, canvas) can opt into CSS-correct
defaults via `createFlexily({ defaults: "css" })`. No module-level state —
each engine captures its preset in a closure so multiple engines with
different presets coexist.

`flexDirection` stays `row` in both presets. Yoga's native default is
`column`, but flexily diverged to `row` (CSS-correct) before this preset
existed. Strict-Yoga consumers can call `setFlexDirection(COLUMN)` per-tree.

See `tests/defaults-preset.test.ts` for the full preset surface and bead
`km-silvery.flexshrink-default` for the migration plan.

**Overflow**: Yoga defaults `flexShrink` to 0 (unlike CSS's default of 1) and doesn't implement CSS §4.5's rule that overflow containers have `min-size: auto = 0`. This means in Yoga, an `overflow:hidden` child with 30 lines of content inside a height-10 parent will compute as height 30 — defeating the purpose of overflow clipping. Flexily ensures overflow containers can always shrink (`flexShrink >= 1`), matching CSS browser behavior. See `tests/yoga-overflow-compare.test.ts` for comparison tests.

**Aspect ratio + stretch**: Per CSS Alignment spec, when a flex item has `aspect-ratio` and its cross-axis dimension is auto, the fallback alignment is `flex-start` (not `stretch`). This prevents `align-items: stretch` from overriding the AR-derived dimension. Only applies to inherited stretch (`align-self: auto`); explicit `align-self: stretch` still stretches. See `tests/aspect-ratio.test.ts`.

## Testing

```bash
bun test                                              # All tests (1561)
bun test tests/yoga-comparison.test.ts tests/yoga-overflow-compare.test.ts  # Yoga compatibility (44)
bun test tests/layout.test.ts                         # Layout algorithm tests
bun test tests/relayout-consistency.test.ts  # Re-layout fuzz (1200+)
```

### Re-layout Consistency Tests

The most important test layer. 1200+ fuzz tests verify that incremental re-layout of partially-dirty trees matches fresh layout. Uses a differential oracle: build tree → layout → dirty → re-layout → compare against fresh. Has caught 3 distinct caching bugs invisible to single-pass tests.

**When fixing layout bugs**: Run `bun test tests/relayout-consistency.test.ts` — if it passes, the fix is likely correct. If a specific seed fails, use `-t "seed=N"` to isolate.

**Mutation testing**: `bun scripts/mutation-test.ts` verifies the fuzz suite catches 4 deliberate cache mutations (4 others are equivalent/defense-in-depth). Run after modifying cache logic.

**When modifying caching/fingerprint code**: Run the full suite. Any new failures indicate a correctness regression.

See `docs/guide/testing.md` for test methodology, `docs/guide/incremental-layout-bugs.md` for bug taxonomy and industry context.

## Aspect Ratio

`measureNode` correctly applies `minWidth`/`maxWidth`/`minHeight`/`maxHeight` constraints after computing aspect-ratio-derived dimensions.

## Anti-Patterns

- **Don't allocate in hot paths** - layout-zero.ts avoids `new` in layout loops
- **Don't add WASM** - pure JS is the point
- **Don't break Yoga API** - compatibility is a feature
