[![npm version](https://img.shields.io/npm/v/flexily.svg)](https://www.npmjs.com/package/flexily)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

# Flexily

**Pure JavaScript flexbox layout engine with Yoga-compatible API.**

**Composable API** (recommended):

```typescript
import { createFlexily, FLEX_DIRECTION_ROW } from "flexily"

const flex = createFlexily()
const root = flex.createNode()
root.setWidth(80)
root.setFlexDirection(FLEX_DIRECTION_ROW)

const label = flex.createNode()
label.setTextContent("Hello") // auto-measured: 5 wide

const content = flex.createNode()
content.setFlexGrow(1)
content.setTextContent("World")

root.insertChild(label, 0)
root.insertChild(content, 1)
flex.calculateLayout(root, 80, 1)
// label: 5 wide, content: 75 wide
```

**Low-level Yoga-compatible API:**

```typescript
import { Node, FLEX_DIRECTION_ROW, DIRECTION_LTR } from "flexily"

const root = Node.create()
root.setWidth(100)
root.setFlexDirection(FLEX_DIRECTION_ROW)

const child = Node.create()
child.setFlexGrow(1)
root.insertChild(child, 0)

root.calculateLayout(100, 100, DIRECTION_LTR)
console.log(child.getComputedWidth()) // 100
```

## Why Flexily?

[Yoga](https://yogalayout.dev/) is the industry standard flexbox engine, used by React Native, Ink, and thousands of apps. It's mature and battle-tested. But it's C++ compiled to WASM, and that creates real problems for JavaScript applications:

**Async initialization.** Yoga requires `await Yoga.init()` before creating any nodes. No synchronous startup, no use at module load time, no use in config files or build scripts. For CLIs that should start instantly, this adds latency and complexity.

**WASM boundary crossing.** Every method call (`setWidth`, `setFlexGrow`, etc.) crosses the JS-to-WASM boundary. Node creation is ~8x more expensive than a JS object. For TUIs that rebuild layout trees per render, this dominates.

**Memory growth.** WASM linear memory grows but never shrinks. Yoga's yoga-wasm-web has a [known memory growth bug](https://github.com/nicolo-ribaudo/yoga-wasm-web/issues/1) where each node allocation permanently grows the WASM heap. In long-running apps, this caused [120GB RAM usage in Claude Code](https://github.com/anthropics/claude-code/issues/4953).

**Debugging opacity.** You can't step into WASM in a JS debugger. When layout is wrong, you get a computed number with no way to inspect the algorithm's intermediate state. Flexily is readable JS — set a breakpoint in `layout-zero.ts`.

**No tree-shaking.** The WASM binary is monolithic. You get the entire engine even if you use a fraction of the features.

Facebook's original pure-JS flexbox engine (`css-layout`) was abandoned when they moved to C++. [flexbox.js](https://github.com/Planning-nl/flexbox.js) exists but is unmaintained and missing features. Flexily fills the gap: comprehensive CSS flexbox support, Yoga-compatible API, pure JS, zero WASM.

## Who Should Use Flexily

Most developers should use a framework built on Flexily, not Flexily directly. Flexily is for:

- **Framework authors** building a TUI or layout framework that needs a JS layout engine
- **Canvas/game developers** who need flexbox for non-DOM rendering
- **Specialized tools** where you need direct control over layout computation
- **Anyone replacing Yoga** who wants a drop-in pure-JS alternative

> **Building a terminal UI?** Use [silvery](https://silvery.dev), which uses Flexily by default. You get React components, hooks, and layout feedback without touching the low-level API.

## Composable API

Flexily v0.5+ includes a composable engine with built-in text measurement:

```typescript
import { createFlexily } from "flexily"

const flex = createFlexily()
const root = flex.createNode()
root.setWidth(80)
root.setFlexDirection(FLEX_DIRECTION_ROW)

const label = flex.createNode()
label.setTextContent("Hello")

const content = flex.createNode()
content.setFlexGrow(1)
content.setTextContent("World")

root.insertChild(label, 0)
root.insertChild(content, 1)
flex.calculateLayout(root, 80, 1)
// label: 5 wide, content: 75 wide
```

For custom text measurement, compose plugins with `pipe()`:

```typescript
import { createBareFlexily, pipe, withTestMeasurer } from "flexily"

const flex = pipe(createBareFlexily(), withTestMeasurer())
```

Text measurement backends:

- **`withMonospace()`** — terminal grids (1 char = 1 cell), default
- **`withTestMeasurer()`** — deterministic widths for CI (Latin 0.8, CJK 1.0, emoji 1.8)
- **`withPretext(pretext)`** — proportional fonts via [Pretext](https://github.com/chenglou/pretext)

## Status

1561 tests, including 44 Yoga compatibility tests and 1200+ incremental re-layout fuzz tests. Used by [silvery](https://silvery.dev) as its default layout engine.

| Feature                                       | Status   |
| --------------------------------------------- | -------- |
| Core flexbox (direction, grow, shrink, basis) | Complete |
| Alignment (justify-content, align-items)      | Complete |
| Spacing (gap, padding, margin, border)        | Complete |
| Constraints (min/max width/height)            | Complete |
| Measure functions (text sizing)               | Complete |
| Absolute positioning                          | Complete |
| Aspect ratio                                  | Complete |
| Flex-wrap (multi-line layouts)                | Complete |
| Logical edges (EDGE_START/END)                | Complete |
| RTL support                                   | Complete |
| Baseline alignment                            | Complete |
| Composable engine (createFlexily, pipe)       | Complete |
| Text measurement (monospace, proportional)    | Complete |

## Installation

```bash
npm install flexily
```

**Runtimes:** Bun >= 1.0, Node.js >= 23.6. Pure JavaScript — no native or WASM dependencies.

## Performance

Flexily and Yoga each win in different scenarios:

| Scenario                | Winner      | Margin     | Tree Size        |
| ----------------------- | ----------- | ---------- | ---------------- |
| **Initial layout**      | Flexily     | 1.5-2.5x   | 64-969 nodes     |
| **No-change re-layout** | **Flexily** | **5.5x**   | 406-969 nodes    |
| **Single dirty leaf**   | Yoga        | 2.8-3.4x   | 406-969 nodes    |
| **Deep nesting (15+)**  | Yoga        | increasing | 1 node per level |

Benchmarks use TUI-realistic trees: columns × bordered cards with measure functions (e.g., 5 columns × 20 cards = ~406 nodes, 8×30 = ~969 nodes). Typical depth is 3-5 levels (column → card → content → text). See [docs/guide/performance.md](docs/guide/performance.md) for full methodology.

**Where Yoga wins — and why it matters less in practice.** Yoga is 2.8-3.4x faster in the single-dirty-leaf scenario: one node changes in a ~400-1000 node tree. WASM's per-node layout computation is genuinely faster than JS. But in interactive TUIs, most renders are no-change frames (cursor moved, selection changed) where Flexily is 5.5x faster. Initial layout (new screen, tab switch) also favors Flexily at 1.5-2.5x. The single-dirty-leaf case is a minority of frames in practice.

**Typical interactive TUI operation mix:**

| Operation             | Frequency     | Winner         | Why                                   |
| --------------------- | ------------- | -------------- | ------------------------------------- |
| Cursor/selection move | Very frequent | Flexily 5.5x   | No layout change → fingerprint cache  |
| Content edit          | Frequent      | Yoga 3x        | Single dirty leaf in existing tree    |
| Initial render        | Once          | Flexily 1.5-2x | JS node creation avoids WASM boundary |
| Window resize         | Occasional    | Yoga 2.7x      | Full re-layout of existing tree       |

Flexily's fingerprint cache makes no-change re-layout essentially free (27ns regardless of tree size). Initial layout wins come from JS node creation avoiding WASM boundary crossings (~8x cheaper per node). Most TUI apps have shallow nesting (3-5 levels) — well below the 15-level crossover where Yoga overtakes Flexily.

**Use Yoga instead when** your primary workload is frequent incremental re-layout of large pre-existing trees, you have deep nesting (15+ levels), or you're in the React Native ecosystem.

See [docs/guide/performance.md](docs/guide/performance.md) for detailed benchmarks including TUI-realistic trees with measure functions.

## Algorithm

Flexily provides two layout implementations that produce identical output and pass identical tests:

**Zero-allocation** (default, `flexily`): Mutates `FlexInfo` structs on nodes instead of allocating temporary objects. Faster for flat/wide trees typical of TUI layouts. Re-entrant via save/restore of scratch arrays (supports nested `calculateLayout()` calls from measure/baseline functions).

**Classic** (`flexily/classic`): Allocates temporary objects during layout. Easier to read and debug. Use this when stepping through the algorithm or comparing behavior.

```typescript
import { Node } from "flexily" // zero-allocation (default)
import { Node } from "flexily/classic" // allocating (debugging)
```

Both implement CSS Flexbox spec Section 9.7 with iterative freeze for min/max constraints, Yoga-compatible edge-based rounding, weighted flex-shrink, auto margin absorption, and full RTL support.

## Correctness

Incremental re-layout (caching unchanged subtrees) is essential for performance but introduces subtle bugs — Chrome's Blink team experienced a "chain of ~10 bugs over a year" in their flexbox implementation. Flexily addresses this with layered testing:

| Layer              | Tests     | What it verifies                                               |
| ------------------ | --------- | -------------------------------------------------------------- |
| Yoga compatibility | 44        | Identical output to Yoga for every feature                     |
| Feature tests      | ~110      | Each flexbox feature in isolation                              |
| **Re-layout fuzz** | **1200+** | Incremental re-layout matches fresh layout across random trees |

The fuzz tests use a **differential oracle**: build a random tree, layout, mark nodes dirty, re-layout, then compare against a fresh layout of the identical tree. This has caught 3 distinct caching bugs that all 524 single-pass tests missed.

See [docs/guide/testing.md](docs/guide/testing.md) for methodology and [docs/guide/incremental-layout-bugs.md](docs/guide/incremental-layout-bugs.md) for the bug taxonomy.

## Bundle Size

|          | Yoga   | Flexily           | Savings              |
| -------- | ------ | ----------------- | -------------------- |
| Minified | 117 KB | 47 KB (35 KB[^1]) | **2.5-3.4x smaller** |
| Gzipped  | 39 KB  | 16 KB (11 KB[^1]) | **2.5-3.6x smaller** |

[^1]: 11 KB when bundlers tree-shake the optional `debug` dependency.

## API Compatibility

Yoga-compatible API (44 comparison tests passing). Near drop-in replacement for common use cases:

```typescript
// Yoga
import Yoga from "yoga-wasm-web"
const yoga = await Yoga.init() // Async!
const root = yoga.Node.create()

// Flexily
import { Node } from "flexily"
const root = Node.create() // Sync!
```

Same constants, same method names, same behavior.

## Documentation

| Document                                                         | Description                         |
| ---------------------------------------------------------------- | ----------------------------------- |
| [Getting Started](docs/guide/getting-started.md)                 | Quick guide to building layouts     |
| [API Reference](docs/api/reference.md)                           | Complete API documentation          |
| [Algorithm](docs/guide/algorithm.md)                             | How the layout algorithm works      |
| [Performance](docs/guide/performance.md)                         | Benchmarks and methodology          |
| [Yoga Comparison](docs/guide/yoga-comparison.md)                 | Feature comparison with Yoga        |
| [Testing](docs/guide/testing.md)                                 | Test infrastructure and methodology |
| [Incremental Layout Bugs](docs/guide/incremental-layout-bugs.md) | Bug taxonomy and debugging guide    |

## Related Projects

| Project                                                 | Language   | Description                                                                                        |
| ------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| [Yoga](https://yogalayout.dev/)                         | C++/WASM   | Facebook's flexbox engine. Industry standard, used by React Native, Ink, Litho.                    |
| [Taffy](https://github.com/DioxusLabs/taffy)            | Rust       | High-performance layout library supporting Flexbox and CSS Grid. Used by Dioxus and Bevy.          |
| [flexbox.js](https://github.com/Planning-nl/flexbox.js) | JavaScript | Pure JS flexbox engine by Planning-nl. Reference implementation that inspired Flexily's algorithm. |
| [css-layout](https://www.npmjs.com/package/css-layout)  | JavaScript | Facebook's original pure-JS flexbox, predecessor to Yoga. Deprecated.                              |
| [silvery](https://silvery.dev)                          | TypeScript | React for CLIs with layout feedback. Uses Flexily by default.                                      |

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
├── constants.ts          # Flexbox constants (Yoga-compatible)
├── types.ts              # TypeScript interfaces
├── utils.ts              # Shared utilities
└── classic/              # Allocating algorithm (for debugging)
```

## License

MIT
