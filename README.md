# Flexture

**Pure JavaScript flexbox layout engine with Yoga-compatible API.**

[![npm version](https://img.shields.io/npm/v/flexture.svg)](https://www.npmjs.com/package/flexture)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

```typescript
import { Node, FLEX_DIRECTION_ROW, DIRECTION_LTR } from "@beorn/flexture"

const root = Node.create()
root.setWidth(100)
root.setFlexDirection(FLEX_DIRECTION_ROW)

const child = Node.create()
child.setFlexGrow(1)
root.insertChild(child, 0)

root.calculateLayout(100, 100, DIRECTION_LTR)
console.log(child.getComputedWidth()) // 100
```

## Why Flexture?

[Yoga](https://yogalayout.dev/) is the industry standard flexbox engine, used by React Native, Ink, and thousands of apps. It's mature and battle-tested. But it's C++ compiled to WASM, and that creates real problems for JavaScript applications:

**Async initialization.** Yoga requires `await Yoga.init()` before creating any nodes. No synchronous startup, no use at module load time, no use in config files or build scripts. For CLIs that should start instantly, this adds latency and complexity.

**WASM boundary crossing.** Every method call (`setWidth`, `setFlexGrow`, etc.) crosses the JS-to-WASM boundary. Node creation is ~8x more expensive than a JS object. For TUIs that rebuild layout trees per render, this dominates.

**Memory growth.** WASM linear memory grows but never shrinks. Yoga's yoga-wasm-web has a [known memory growth bug](https://github.com/nicolo-ribaudo/yoga-wasm-web/issues/1) where each node allocation permanently grows the WASM heap. In long-running apps, this caused [120GB RAM usage in Claude Code](https://github.com/anthropics/claude-code/issues/4953).

**Debugging opacity.** You can't step into WASM in a JS debugger. When layout is wrong, you get a computed number with no way to inspect the algorithm's intermediate state. Flexture is readable JS — set a breakpoint in `layout-zero.ts`.

**No tree-shaking.** The WASM binary is monolithic. You get the entire engine even if you use a fraction of the features.

Facebook's original pure-JS flexbox engine (`css-layout`) was abandoned when they moved to C++. [flexbox.js](https://github.com/Planning-nl/flexbox.js) exists but is unmaintained and missing features. Flexture fills the gap: full CSS flexbox spec, Yoga-compatible API, pure JS, zero WASM.

## Who Should Use Flexture

Most developers should use a framework built on Flexture, not Flexture directly. Flexture is for:

- **Framework authors** building a TUI or layout framework that needs a JS layout engine
- **Canvas/game developers** who need flexbox for non-DOM rendering
- **Specialized tools** where you need direct control over layout computation
- **Anyone replacing Yoga** who wants a drop-in pure-JS alternative

> **Building a terminal UI?** Use [hightea](https://github.com/beorn/hightea), which uses Flexture by default. You get React components, hooks, and layout feedback without touching the low-level API.

## Status

1368 tests passing, including 41/41 Yoga compatibility tests and 1200+ incremental re-layout fuzz tests. Used by [hightea](https://github.com/beorn/hightea) as its default layout engine.

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

## Installation

```bash
bun add @beorn/flexture
# or
npm install @beorn/flexture
```

## Performance

Flexture and Yoga each win in different scenarios:

| Scenario                | Winner       | Margin     | Tree Size        |
| ----------------------- | ------------ | ---------- | ---------------- |
| **Initial layout**      | Flexture     | 1.5-2.5x   | 64-969 nodes     |
| **No-change re-layout** | **Flexture** | **5.5x**   | 406-969 nodes    |
| **Single dirty leaf**   | Yoga         | 2.8-3.4x   | 406-969 nodes    |
| **Deep nesting (15+)**  | Yoga         | increasing | 1 node per level |

Benchmarks use TUI-realistic trees: columns × bordered cards with measure functions (e.g., 5 columns × 20 cards = ~406 nodes, 8×30 = ~969 nodes). Typical depth is 3-5 levels (column → card → content → text). See [docs/performance.md](docs/performance.md) for full methodology.

**Where Yoga wins — and why it matters less in practice.** Yoga is 2.8-3.4x faster in the single-dirty-leaf scenario: one node changes in a ~400-1000 node tree. WASM's per-node layout computation is genuinely faster than JS. But in interactive TUIs, most renders are no-change frames (cursor moved, selection changed) where Flexture is 5.5x faster. Initial layout (new screen, tab switch) also favors Flexture at 1.5-2.5x. The single-dirty-leaf case is a minority of frames in practice.

**Typical interactive TUI operation mix:**

| Operation             | Frequency     | Winner          | Why                                   |
| --------------------- | ------------- | --------------- | ------------------------------------- |
| Cursor/selection move | Very frequent | Flexture 5.5x   | No layout change → fingerprint cache  |
| Content edit          | Frequent      | Yoga 3x         | Single dirty leaf in existing tree    |
| Initial render        | Once          | Flexture 1.5-2x | JS node creation avoids WASM boundary |
| Window resize         | Occasional    | Yoga 2.7x       | Full re-layout of existing tree       |

Flexture's fingerprint cache makes no-change re-layout essentially free (27ns regardless of tree size). Initial layout wins come from JS node creation avoiding WASM boundary crossings (~8x cheaper per node). Most TUI apps have shallow nesting (3-5 levels) — well below the 15-level crossover where Yoga overtakes Flexture.

**Use Yoga instead when** your primary workload is frequent incremental re-layout of large pre-existing trees, you have deep nesting (15+ levels), or you're in the React Native ecosystem.

See [docs/performance.md](docs/performance.md) for detailed benchmarks including TUI-realistic trees with measure functions.

## Algorithm

Flexture provides two layout implementations that produce identical output and pass identical tests:

**Zero-allocation** (default, `@beorn/flexture`): Mutates `FlexInfo` structs on nodes instead of allocating temporary objects. Faster for flat/wide trees typical of TUI layouts. Not reentrant — a single layout pass must complete before another starts.

**Classic** (`@beorn/flexture/classic`): Allocates temporary objects during layout. Easier to read and debug. Use this when stepping through the algorithm or comparing behavior.

```typescript
import { Node } from "@beorn/flexture" // zero-allocation (default)
import { Node } from "@beorn/flexture/classic" // allocating (debugging)
```

Both implement CSS Flexbox spec Section 9.7 with iterative freeze for min/max constraints, Yoga-compatible edge-based rounding, weighted flex-shrink, auto margin absorption, and full RTL support.

## Correctness

Incremental re-layout (caching unchanged subtrees) is essential for performance but introduces subtle bugs — Chrome's Blink team experienced a "chain of ~10 bugs over a year" in their flexbox implementation. Flexture addresses this with layered testing:

| Layer              | Tests     | What it verifies                                               |
| ------------------ | --------- | -------------------------------------------------------------- |
| Yoga compatibility | 41        | Identical output to Yoga for every feature                     |
| Feature tests      | ~110      | Each flexbox feature in isolation                              |
| **Re-layout fuzz** | **1200+** | Incremental re-layout matches fresh layout across random trees |

The fuzz tests use a **differential oracle**: build a random tree, layout, mark nodes dirty, re-layout, then compare against a fresh layout of the identical tree. This has caught 3 distinct caching bugs that all 524 single-pass tests missed.

See [docs/testing.md](docs/testing.md) for methodology and [docs/incremental-layout-bugs.md](docs/incremental-layout-bugs.md) for the bug taxonomy.

## Bundle Size

|          | Yoga   | Flexture          | Savings              |
| -------- | ------ | ----------------- | -------------------- |
| Minified | 117 KB | 47 KB (35 KB[^1]) | **2.5-3.4x smaller** |
| Gzipped  | 39 KB  | 16 KB (11 KB[^1]) | **2.5-3.6x smaller** |

[^1]: 11 KB when bundlers tree-shake the optional `debug` dependency.

## API Compatibility

100% Yoga API compatibility (41/41 comparison tests passing). Drop-in replacement:

```typescript
// Yoga
import Yoga from "yoga-wasm-web"
const yoga = await Yoga.init() // Async!
const root = yoga.Node.create()

// Flexture
import { Node } from "@beorn/flexture"
const root = Node.create() // Sync!
```

Same constants, same method names, same behavior.

## Documentation

| Document                                                   | Description                         |
| ---------------------------------------------------------- | ----------------------------------- |
| [Getting Started](docs/getting-started.md)                 | Quick guide to building layouts     |
| [API Reference](docs/api.md)                               | Complete API documentation          |
| [Algorithm](docs/algorithm.md)                             | How the layout algorithm works      |
| [Performance](docs/performance.md)                         | Benchmarks and methodology          |
| [Yoga Comparison](docs/yoga-comparison.md)                 | Feature comparison with Yoga        |
| [Testing](docs/testing.md)                                 | Test infrastructure and methodology |
| [Incremental Layout Bugs](docs/incremental-layout-bugs.md) | Bug taxonomy and debugging guide    |

## Related Projects

| Project                                                 | Language   | Description                                                                                         |
| ------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| [Yoga](https://yogalayout.dev/)                         | C++/WASM   | Facebook's flexbox engine. Industry standard, used by React Native, Ink, Litho.                     |
| [Taffy](https://github.com/DioxusLabs/taffy)            | Rust       | High-performance layout library supporting Flexbox and CSS Grid. Used by Dioxus and Bevy.           |
| [flexbox.js](https://github.com/Planning-nl/flexbox.js) | JavaScript | Pure JS flexbox engine by Planning-nl. Reference implementation that inspired Flexture's algorithm. |
| [css-layout](https://www.npmjs.com/package/css-layout)  | JavaScript | Facebook's original pure-JS flexbox, predecessor to Yoga. Deprecated.                               |
| [hightea](https://github.com/beorn/hightea)             | TypeScript | React for CLIs with layout feedback. Uses Flexture by default.                                      |

## Code Structure

```
src/
├── index.ts        # Main export
├── node-zero.ts    # Node class with FlexInfo
├── layout-zero.ts  # Layout algorithm (~2300 lines)
├── constants.ts    # Flexbox constants (Yoga-compatible)
├── types.ts        # TypeScript interfaces
├── utils.ts        # Shared utilities
└── classic/        # Allocating algorithm (for debugging)
    ├── node.ts
    └── layout.ts
```

## License

MIT
