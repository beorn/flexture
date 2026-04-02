# Flexily Testing Infrastructure

Flexily uses a multi-layered testing strategy to ensure both initial layout correctness and incremental re-layout consistency. The test suite has caught 3 distinct caching/invalidation bugs that passed all single-pass tests.

## Test Categories

### 1. Yoga Compatibility Tests (44 tests)

Direct comparison against Yoga's WASM implementation. Both engines process the same node tree and must produce identical computed layouts.

```bash
bun test tests/yoga-compat/
```

### 2. Layout Feature Tests (~105 tests)

Traditional example-based tests for each flexbox feature: grow, shrink, wrap, alignment, absolute positioning, aspect ratio, measure functions, etc.

```bash
bun test tests/layout/
```

### 3. Re-layout Consistency Tests (~1200 tests)

The most sophisticated test layer. These test **incremental re-layout** — the scenario where `calculateLayout()` is called on a tree that was previously laid out, with some nodes marked dirty.

**Why this matters**: Flexily uses caching (fingerprints, layout cache, measure cache) to skip recomputing unchanged subtrees. These caches are essential for performance but create subtle correctness risks. All 3 bugs found in Flexily were invisible to single-pass tests.

```bash
bun test tests/relayout-consistency.test.ts
```

#### Differential Oracle Pattern

The core testing technique: build a tree, layout, mark dirty, re-layout → compare against a fresh layout of an identical tree. The fresh layout is a trivially correct reference (it can't have stale cached values).

```typescript
function expectRelayoutMatchesFresh(buildTree, width, height) {
  // Incremental: build → layout → dirty → re-layout
  const { root, dirtyTargets } = buildTree()
  root.calculateLayout(width, height, DIRECTION_LTR)
  for (const t of dirtyTargets) t.markDirty()
  root.calculateLayout(width, height, DIRECTION_LTR)
  const incremental = getLayout(root)

  // Fresh reference: identical tree, single layout
  const fresh = buildTree()
  fresh.root.calculateLayout(width, height, DIRECTION_LTR)
  const reference = getLayout(fresh.root)

  expect(incremental).toEqual(reference)
}
```

#### Test Groups

| Group                             | Seeds | What it tests                                                                                                  |
| --------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------- |
| Targeted scenarios                | 6     | Specific bug reproductions (10-material card, bordered card, deep tree, content change, kanban, tree mutation) |
| measureNode invariant             | 1     | layout.width/height unchanged for clean nodes after re-layout                                                  |
| Snapshot regression               | 2     | Idempotency and exact geometry for known card structure                                                        |
| Resize stability                  | 2     | Width sweep round-trip and column measure height constraint                                                    |
| Fuzz: re-layout vs fresh          | 500   | Random trees + random dirty marking, compare incremental vs fresh                                              |
| Fuzz: cache invalidation stress   | 100   | Same tree re-laid out at multiple widths (60→80→100→80), then dirty+re-layout                                  |
| Fuzz: idempotency                 | 200   | Layout twice with identical constraints — results must match                                                   |
| Fuzz: resize round-trip           | 200   | Layout at W1→W2→W1, compare final vs fresh at W1                                                               |
| Fuzz: multi-step constraint sweep | 100   | Full lifecycle: 3 random widths → dirty → random final width → compare vs fresh                                |
| Content change (targeted)         | 3     | Mutable measure functions: text grows, text shrinks, content change + resize combined                          |
| Fuzz: content change              | 100   | Random trees with mutable measure functions — change content + markDirty, compare vs fresh                     |

#### Random Tree Generation

Fuzz tests use Mulberry32 seeded PRNG to generate reproducible random trees:

- **3-10 nodes** per tree
- **Mixed flex directions** (ROW/COLUMN)
- **~40% leaf nodes** have measure functions (simulating text)
- **~20% non-leaf nodes** have borders
- **Random flex properties**: flexGrow (40%), flexShrink (30%), explicit width (50%), explicit height (30%)
- **1-3 dirty targets** per test

When a fuzz test fails, the seed uniquely identifies the tree structure for reproduction and debugging.

### 4. Differential Fuzz Tests (100 seeds)

Separate from relayout-consistency, these fuzz tests compare Flexily's zero-allocation and classic algorithms against each other, ensuring both produce identical results.

```bash
bun test tests/differential-fuzz.fuzz.ts
```

## Public Testing API (`flexily/testing`)

Flexily exports diagnostic helpers for downstream consumers (silvery, application code):

```typescript
import {
  getLayout,
  formatLayout,
  diffLayouts,
  textMeasure,
  assertLayoutSanity,
  expectRelayoutMatchesFresh,
  expectIdempotent,
  expectResizeRoundTrip,
} from "flexily/testing"
```

| Export                                        | Description                                          |
| --------------------------------------------- | ---------------------------------------------------- |
| `getLayout(node)`                             | Recursively extract computed layout as plain objects |
| `formatLayout(layout)`                        | Pretty-print a layout tree for debugging             |
| `diffLayouts(a, b)`                           | Node-by-node diff with NaN-safe comparison           |
| `textMeasure(width)`                          | Factory for wrapping text measure functions          |
| `assertLayoutSanity(node)`                    | Validate dimensions are finite and non-negative      |
| `expectRelayoutMatchesFresh(buildTree, w, h)` | Differential oracle: incremental must match fresh    |
| `expectIdempotent(buildTree, w, h)`           | Two identical layouts must produce same result       |
| `expectResizeRoundTrip(buildTree, widths)`    | Resize sequence must match fresh at final width      |

## Diagnostic Helpers

### `diffLayouts(a, b)`

Compares two layout trees node-by-node and returns a list of differences. Uses `Object.is()` for NaN-safe comparison (critical because `NaN !== NaN` in JavaScript, but `NaN` is a legitimate layout value for unconstrained dimensions).

```typescript
const diffs = diffLayouts(reference, incremental)
// => ["root[0][1]: width 60 vs 80", "root[0][1]: height 2 vs 1"]
```

### `assertLayoutSanity(node)`

Validates structural invariants: widths are finite and non-negative, positions are finite. Applied after every fuzz iteration.

### `formatLayout(layout)`

Pretty-prints a layout tree for debugging output:

```
{ left: 0, top: 0, width: 80, height: 4 } [
  { left: 0, top: 0, width: 80, height: 4 } [
    { left: 1, top: 1, width: 3, height: 1 },
    { left: 4, top: 1, width: 73, height: 2 }
  ]
]
```

### 5. Mutation Testing (8 mutations)

Verifies that the test suite detects deliberate code changes. Each mutation injects a known-wrong value into cache/invalidation logic, then runs the re-layout fuzz suite.

```bash
cd vendor/flexily && bun scripts/mutation-test.ts
```

**Results**: 4 caught (real bugs), 4 equivalent (defense-in-depth layers that are redundant with other mechanisms):

| Mutation                      | Status     | Why                                                        |
| ----------------------------- | ---------- | ---------------------------------------------------------- |
| skip-markDirty-propagation    | Caught     | Ancestors don't learn children changed                     |
| skip-save-restore-measureNode | Caught     | layout.width/height corrupted by intrinsic measurements    |
| wrong-cache-sentinel (NaN)    | Caught     | False cache hits for unconstrained queries                 |
| skip-flexDist-guard           | Caught     | Stale NaN fingerprint matches across flex passes           |
| skip-resetLayoutCache         | Equivalent | markDirty() already clears caches for dirty-path nodes     |
| always-return-cached-layout   | Equivalent | markDirty() sets \_lc0=\_lc1=undefined, so no cache to hit |
| skip-fingerprint-check        | Equivalent | Disables optimization, doesn't affect correctness          |
| skip-layoutValid-set          | Equivalent | Forces recompute, doesn't affect correctness               |

The 4 equivalent mutations confirm the **defense-in-depth** design: multiple cache invalidation layers (markDirty, resetLayoutCache, dirty check) are individually redundant but collectively protect against future code changes breaking any single layer.

## Properties Tested

The test suite verifies these properties across random trees:

| Property                     | Description                                             | What it catches                        |
| ---------------------------- | ------------------------------------------------------- | -------------------------------------- |
| **Differential correctness** | Incremental re-layout = fresh layout                    | All caching bugs                       |
| **Idempotency**              | Layout twice with no changes = same result              | Non-determinism, state corruption      |
| **Resize stability**         | Layout at W1→W2→W1 = fresh at W1                        | Stale cache entries across constraints |
| **Lifecycle correctness**    | Multiple resizes + dirty marking = fresh at final state | Combined cache/fingerprint issues      |
| **Structural sanity**        | All dimensions finite, non-negative                     | Uninitialized state, overflow          |

## Running Tests

```bash
# All flexily tests
bun test

# Just re-layout consistency (most thorough)
bun test tests/relayout-consistency.test.ts

# Quick smoke test (targeted scenarios only)
bun vitest run tests/relayout-consistency.test.ts -t "targeted"

# Specific fuzz seed for debugging
bun vitest run tests/relayout-consistency.test.ts -t "seed=73"
```

## Investigating Failures

When a fuzz test fails:

1. **Note the seed**: `seed=73: re-layout matches fresh` → seed is 73
2. **Run in isolation**: `bun vitest run tests/relayout-consistency.test.ts -t "seed=73"`
3. **Read the diff output**: The test reports exact node paths and value differences
4. **Create a debug script**: Build the same tree manually in `/tmp/debug-<name>.ts`, add `console.log` to trace the layout steps
5. **Check the bug taxonomy**: See [incremental-layout-bugs.md](incremental-layout-bugs.md) for known bug patterns

## Adding New Tests

When fixing a bug:

1. Add a **targeted test** in Group 1 that reproduces the exact scenario
2. Verify the **fuzz suite** covers the bug class (it usually already does)
3. If not, add a new fuzz group with appropriate properties

When adding new caching or optimization code:

1. Run the full fuzz suite first (baseline)
2. Make changes
3. Run again — any new failures indicate a correctness regression
4. Consider adding a targeted test for the specific optimization's edge cases
