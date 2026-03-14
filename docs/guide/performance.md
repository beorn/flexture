# Flexily Performance

Flexily and Yoga each win in different scenarios. The right choice depends on your workload.

## Performance Profile

Flexily's pure JavaScript architecture creates a distinctive performance profile compared to Yoga's WASM:

| Scenario                                                    | Winner  | Margin     | Why                                                   |
| ----------------------------------------------------------- | ------- | ---------- | ----------------------------------------------------- |
| **Initial layout** (create + layout)                        | Flexily | 1.5-2.5x   | JS node creation is cheap; no WASM boundary crossings |
| **No-change re-layout**                                     | Flexily | **5.5x**   | Fingerprint cache catches unchanged trees at the root |
| **Incremental re-layout** (single dirty leaf)               | Yoga    | 2.8-3.4x   | WASM per-node computation is faster                   |
| **Full re-layout** (constraint change on pre-existing tree) | Yoga    | 2.7x       | Same reason — WASM layout computation is faster       |
| **Deep nesting** (15+ levels)                               | Yoga    | increasing | Flexily's function call overhead compounds at depth   |

**Key insight**: Flexily wins at node creation and cache hits. Yoga wins at raw layout computation. The "2x faster" initial-layout advantage comes from JS node creation being ~8x cheaper than WASM node creation, which more than compensates for Yoga's faster layout algorithm.

## Why These Trade-offs Exist

### JS/WASM Interop: Flexily's Initial Layout Advantage

Yoga's WASM module is fast internally, but every interaction crosses the JS/WASM boundary:

```
JS                          WASM
│                           │
├─ node.setWidth(100) ──────┼─► Write to linear memory
├─ node.setFlexGrow(1) ─────┼─► Write to linear memory
├─ node.insertChild() ──────┼─► Update pointers in memory
├─ calculateLayout() ───────┼─► Run layout algorithm
├─ node.getComputedWidth() ─┼─► Read from linear memory
│                           │
```

Each boundary crossing involves type conversion, memory read/write, and function call overhead. For a 100-node layout, that's 400+ crossings. This makes Yoga's node creation ~8x slower than Flexily's pure-JS creation, which dominates initial layout benchmarks.

### WASM Computation: Yoga's Re-layout Advantage

When re-laying out a pre-existing tree, node creation is amortized away. The benchmark becomes pure layout computation, where WASM's compiled code outperforms JIT-compiled JavaScript. Flexily's per-node overhead (5-field fingerprint comparison, cache management) is more expensive than Yoga's simpler dirty-flag check.

### Fingerprint Cache: Flexily's No-Change Advantage

Flexily stores a 5-field fingerprint per node: `(availableWidth, availableHeight, direction, offsetX, offsetY)`. When `calculateLayout()` is called with unchanged constraints on a clean tree, Flexily checks the fingerprint at the root and returns immediately — **zero tree traversal**. Yoga must still walk the tree to verify nothing changed.

This makes Flexily **5.5x faster** for the common case of cursor movement, selection changes, and other UI updates that don't affect layout.

### Zero-Allocation Design

The layout algorithm eliminates temporary allocations during layout:

1. **FlexInfo structs on nodes** — Mutated in place, not reallocated each pass
2. **Pre-allocated typed arrays** — For flex-line tracking
3. **Inline iteration** — No `filter()` calls that allocate intermediate arrays

This reduces GC pressure for high-frequency renders.

See [zero-allocation.md](zero-allocation.md) for implementation details.

## Benchmark Results

All benchmarks on Apple M-series, Bun 1.2, macOS (February 2026), with JIT warmup. Times are mean per operation.

### Initial Layout (Create + Layout)

The primary benchmark. Includes tree creation + `calculateLayout()`.

#### Flat Layouts

| Nodes | Flexily | Yoga     | Ratio        |
| ----- | ------- | -------- | ------------ |
| 100   | 74 µs   | 157 µs   | Flexily 2.1x |
| 500   | 371 µs  | 835 µs   | Flexily 2.3x |
| 1000  | 767 µs  | 1797 µs  | Flexily 2.3x |
| 2000  | 1497 µs | 3937 µs  | Flexily 2.6x |
| 5000  | 4929 µs | 12496 µs | Flexily 2.5x |

#### TUI Board (columns × bordered cards with measure functions)

This mirrors real terminal UI structure: columns with headers, bordered card containers, icon + text rows, text nodes with measure functions.

| Structure | ~Nodes | Flexily | Yoga    | Ratio        |
| --------- | ------ | ------- | ------- | ------------ |
| 3×5       | 64     | 124 µs  | 191 µs  | Flexily 1.5x |
| 5×10      | 206    | 367 µs  | 619 µs  | Flexily 1.7x |
| 5×20      | 406    | 605 µs  | 1234 µs | Flexily 2.0x |
| 8×30      | 969    | 1479 µs | 3015 µs | Flexily 2.0x |

#### Property-Rich (shrink, align, justify, wrap)

Trees using diverse flex properties (justifyContent, alignItems, alignSelf, flexWrap, flexShrink, margin).

| Nodes | Flexily | Yoga    | Ratio        |
| ----- | ------- | ------- | ------------ |
| ~100  | 228 µs  | 284 µs  | Flexily 1.2x |
| ~300  | 635 µs  | 861 µs  | Flexily 1.4x |
| ~600  | 1348 µs | 1762 µs | Flexily 1.3x |

#### Deep Nesting

| Depth | Flexily | Yoga   | Ratio        |
| ----- | ------- | ------ | ------------ |
| 1     | 1.4 µs  | 3.1 µs | Flexily 2.2x |
| 5     | 7.3 µs  | 11 µs  | Flexily 1.5x |
| 10    | 19 µs   | 21 µs  | Flexily 1.1x |
| 15    | 39 µs   | 31 µs  | Yoga 1.3x    |
| 20    | 53 µs   | 41 µs  | Yoga 1.3x    |
| 50    | 255 µs  | 101 µs | Yoga 2.5x    |

Flexily wins at shallow nesting but Yoga overtakes at 15+ levels.

### Re-layout (Pre-existing Tree)

For applications that create the tree once and re-layout repeatedly (React UIs, TUI apps).

#### No-Change Re-layout

When nothing changed — tests the fingerprint cache (Flexily's key innovation).

| Structure             | Flexily  | Yoga    | Ratio            |
| --------------------- | -------- | ------- | ---------------- |
| 5×20 TUI (~406 nodes) | 0.027 µs | 0.15 µs | **Flexily 5.5x** |
| 8×30 TUI (~969 nodes) | 0.026 µs | 0.14 µs | **Flexily 5.5x** |

Flexily returns in **27 nanoseconds** regardless of tree size — fingerprint check at root, zero traversal.

#### Single Leaf Dirty (Incremental)

One text node marked dirty, full tree re-laid out. The most common update pattern.

| Structure             | Flexily | Yoga  | Ratio     |
| --------------------- | ------- | ----- | --------- |
| 5×20 TUI (~406 nodes) | 123 µs  | 37 µs | Yoga 3.4x |
| 8×30 TUI (~969 nodes) | 244 µs  | 87 µs | Yoga 2.8x |

#### Width Change Cycle (120→80→120)

Full constraint change requiring complete re-layout.

| Structure             | Flexily            | Yoga               | Ratio     |
| --------------------- | ------------------ | ------------------ | --------- |
| 5×20 TUI (~406 nodes) | 955 µs (2 layouts) | 353 µs (2 layouts) | Yoga 2.7x |

### Feature-Specific Benchmarks

| Feature             | Winner  | Margin |
| ------------------- | ------- | ------ |
| AbsolutePositioning | Flexily | 3.5x   |
| FlexShrink          | Flexily | 2.7x   |
| AlignContent        | Flexily | 2.3x   |
| FlexGrow            | Flexily | 1.9x   |
| Gap                 | Flexily | 1.5x   |
| MeasureFunc         | Flexily | 1.4x   |
| FlexWrap            | Flexily | 1.2x   |
| PercentValues       | ~Equal  | -      |

These are initial layout benchmarks (create + layout), where Flexily's node creation advantage dominates.

## Real-World Performance Mix

For a terminal UI app (our primary target), the operation mix is roughly:

| Operation                          | Frequency     | Winner           |
| ---------------------------------- | ------------- | ---------------- |
| Initial render                     | Once          | Flexily 1.5-2x   |
| Cursor movement (no layout change) | Very frequent | **Flexily 5.5x** |
| Content edit (single node dirty)   | Frequent      | Yoga 3x          |
| Window resize                      | Occasional    | Yoga 2.7x        |

The no-change case dominates in interactive TUIs (most keystrokes don't change layout). Flexily's fingerprint cache makes this essentially free.

## Benchmark Variance

| Engine  | Cold RME | Warm RME |
| ------- | -------- | -------- |
| Flexily | ±5-12%   | ±1-3%    |
| Yoga    | ±0.3-1%  | ±0.3-1%  |

WASM is AOT-compiled with manual memory management, so it's consistent from the first run. JavaScript needs JIT warmup. For sustained rendering, both stabilize.

## Benchmark Methodology

### How Benchmarks Were Run

All benchmarks were run on Apple M-series (ARM64), macOS, Bun 1.2, February-March 2026. Each benchmark uses Vitest's `bench()` with JIT warmup iterations to ensure stable numbers. Times reported are mean per operation after warmup.

**Before each run**, system load was verified with `top` -- no CPU-heavy processes (builds, browsers, video encoding) running concurrently. Benchmarks were run multiple times and results checked for consistency within the RME (relative margin of error) ranges listed above.

### Caveats About the Yoga Comparison

These benchmarks compare **fundamentally different execution models** (pure JS vs WASM), which means apples-to-apples comparison is inherently limited:

1. **Initial layout benchmarks include node creation.** Flexily's advantage (1.5-2.5x) is dominated by JS object creation being ~8x cheaper than WASM node creation. If you create the tree once and re-layout many times, this advantage is amortized away.

2. **WASM per-node computation is genuinely faster.** For incremental re-layout of pre-existing trees, Yoga wins (2.8-3.4x) because compiled C++ outperforms JIT-compiled JavaScript at the per-node level. This is a fundamental characteristic, not an implementation gap.

3. **Fingerprint cache advantage is workload-dependent.** Flexily's 5.5x no-change advantage is dramatic but only applies when the layout inputs are identical between frames. If every frame changes something, this cache doesn't help.

4. **Deep nesting compounds JS overhead.** Flexily's recursive JS function calls get increasingly expensive at 15+ levels of nesting. Most TUI apps have 3-5 levels of nesting, well below this crossover point, but document renderers or deeply nested component trees may hit it.

5. **Bun's JIT differs from V8/Node.** Benchmark numbers may differ on Node.js (V8) vs Bun (JavaScriptCore). WASM performance is more consistent across runtimes.

### Source Code

All benchmark source code is in the `bench/` directory:

| File                                                                                                                  | What it measures                                  |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [`bench/yoga-compare-warmup.bench.ts`](https://github.com/beorn/flexily/tree/main/bench/yoga-compare-warmup.bench.ts) | Flat + deep initial layout with JIT warmup        |
| [`bench/yoga-compare-rich.bench.ts`](https://github.com/beorn/flexily/tree/main/bench/yoga-compare-rich.bench.ts)     | TUI boards, measure functions, property diversity |
| [`bench/incremental.bench.ts`](https://github.com/beorn/flexily/tree/main/bench/incremental.bench.ts)                 | No-change, dirty leaf, resize re-layout           |
| [`bench/features.bench.ts`](https://github.com/beorn/flexily/tree/main/bench/features.bench.ts)                       | Per-feature comparison (grow, shrink, wrap, etc.) |

### Running Benchmarks

```bash
# Quick comparison (flat + deep, with warmup)
bun bench bench/yoga-compare-warmup.bench.ts

# Real-world scenarios (TUI boards, measure functions, property diversity)
bun bench bench/yoga-compare-rich.bench.ts

# Incremental re-layout (no-change, dirty leaf, resize)
bun bench bench/incremental.bench.ts

# Feature-specific
bun bench bench/features.bench.ts
```

## When to Use Yoga Instead

- **Frequent incremental re-layout** — If your primary workload is single-node updates on large pre-existing trees, Yoga's WASM layout computation is 2-3x faster
- **Deep nesting (15+ levels)** — Yoga's per-node overhead is lower
- **React Native ecosystem** — Yoga is the native choice
- **Cold single-shot layouts** — No warmup benefit for Flexily
