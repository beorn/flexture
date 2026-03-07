# Flexture vs Yoga: Layout Engine Comparison

Flexture is a pure JavaScript flexbox layout engine with a Yoga-compatible API.

**TL;DR:** Flexture is **1.5-2.5x faster for initial layout**, **5.5x faster for no-change re-layout**, and **2.5-3.5x smaller** than Yoga, with a synchronous API and pure JavaScript. Yoga is faster at per-node layout computation during incremental re-layout and deep nesting.

## Status

|                      | Yoga                                                 | Flexture                                |
| -------------------- | ---------------------------------------------------- | ------------------------------------ |
| **Maturity**         | Production, battle-tested (React Native, Ink, Litho) | Production-ready, fully tested       |
| **Test coverage**    | Extensive (auto-generated from Chrome)               | 1368 tests, 41/41 Yoga compatibility |
| **Real-world usage** | Millions of apps                                     | Used in production                   |

---

## Why Flexture Exists

| Concern            | Yoga                  | Flexture                  |
| ------------------ | --------------------- | ---------------------- |
| **Runtime**        | WebAssembly           | Pure JavaScript        |
| **Initialization** | Async (WASM load)     | Synchronous            |
| **Dependencies**   | WASM runtime required | `debug` (optional)     |
| **Debugging**      | WASM stack traces     | Native JS stack traces |

### Bundle Size

|              | Yoga                           | Flexture             | Savings              |
| ------------ | ------------------------------ | ----------------- | -------------------- |
| **Minified** | 117 KB (25 KB JS + 89 KB WASM) | 47 KB (35 KB[^1]) | **2.5-3.4x smaller** |
| **Gzipped**  | 39 KB (9 KB JS + 28 KB WASM)   | 16 KB (11 KB[^1]) | **2.5-3.6x smaller** |

[^1]: Without the optional `debug` dependency (tree-shaken by most bundlers).

Measured with `bun scripts/measure-bundle.ts` (Bun.build minified, zlib gzip).

Flexture is **2.5-3.5x smaller** than Yoga, which matters for:

- CLI tools where startup time matters
- Edge runtimes with size limits
- Bundlers that struggle with WASM

**Use Flexture when:**

- You want synchronous initialization (no async `await init()`)
- You're in an environment where WASM is awkward (older bundlers, edge runtimes)
- You want smaller bundles (2.5-3.5x) and simpler debugging
- You're building interactive TUIs where no-change re-layout (5.5x faster) dominates

**Use Yoga when:**

- Your primary workload is frequent incremental re-layout of large pre-existing trees
- You have deep nesting (15+ levels) as your primary use case
- You're already using React Native or another Yoga-based system
- You need the battle-tested stability of a mature project

---

## API Compatibility

Flexture is designed as a **drop-in replacement** for Yoga's JavaScript API:

```typescript
// Same constants
import { FLEX_DIRECTION_ROW, JUSTIFY_CENTER, ALIGN_STRETCH } from "@beorn/flexture"

// Same Node API
const root = Node.create()
root.setWidth(100)
root.setFlexDirection(FLEX_DIRECTION_ROW)
root.setJustifyContent(JUSTIFY_CENTER)

const child = Node.create()
child.setFlexGrow(1)
root.insertChild(child, 0)

root.calculateLayout(100, 100, DIRECTION_LTR)

console.log(child.getComputedWidth()) // Same output
```

**API coverage**: 100% of Yoga's commonly-used API is implemented with identical method signatures. 41/41 Yoga comparison tests pass.

---

## Flexbox Spec Compliance

| Feature                                   | Yoga | Flexture | Notes                     |
| ----------------------------------------- | ---- | ----- | ------------------------- |
| **flex-direction** (row, column, reverse) | ✅   | ✅    |                           |
| **flex-grow**                             | ✅   | ✅    |                           |
| **flex-shrink**                           | ✅   | ✅    | CSS-spec compliant        |
| **flex-basis**                            | ✅   | ✅    |                           |
| **justify-content** (6 values)            | ✅   | ✅    |                           |
| **align-items** (5 values)                | ✅   | ✅    |                           |
| **align-self**                            | ✅   | ✅    |                           |
| **align-content** (6 values)              | ✅   | ✅    |                           |
| **gap** (row/column)                      | ✅   | ✅    |                           |
| **padding** (per-edge)                    | ✅   | ✅    |                           |
| **margin** (per-edge)                     | ✅   | ✅    |                           |
| **border** (per-edge)                     | ✅   | ✅    |                           |
| **min/max width/height**                  | ✅   | ✅    |                           |
| **percent values**                        | ✅   | ✅    |                           |
| **absolute positioning**                  | ✅   | ✅    |                           |
| **measure functions**                     | ✅   | ✅    | For text nodes            |
| **flex-wrap**                             | ✅   | ✅    |                           |
| **baseline alignment**                    | ✅   | ✅    |                           |
| **RTL direction**                         | ✅   | ✅    |                           |
| **EDGE_START/END**                        | ✅   | ✅    | Full logical edge support |
| **aspect-ratio**                          | ✅   | ✅    |                           |

Flexture implements CSS spec's basis-weighted shrink (`flexShrink × flexBasis`).

---

## Algorithm Differences

### Shrink Calculation

Both use CSS spec's basis-weighted shrink: items shrink proportionally to `flex-shrink × flex-basis`.

### Grow/Shrink Iteration

Both engines iterate to handle min/max constraints:

1. Calculate proportional distribution
2. Cap items that hit min/max limits
3. Redistribute remaining space
4. Repeat until space is fully allocated

---

## Performance

See [performance.md](performance.md) for detailed benchmarks, methodology, and technical explanation.

**Summary:** Each engine wins in different scenarios. Both handle terminal UIs (<500 nodes) in under 1ms.

| Scenario                            | Winner    | Margin     | Why                                              |
| ----------------------------------- | --------- | ---------- | ------------------------------------------------ |
| Initial layout (create + calculate) | Flexture     | 1.5-2.5x   | JS node creation avoids WASM boundary crossings  |
| **No-change re-layout**             | **Flexture** | **5.5x**   | Fingerprint cache — 27ns regardless of tree size |
| Incremental re-layout (dirty leaf)  | Yoga      | 2.8-3.4x   | WASM per-node computation is faster              |
| Full re-layout (constraint change)  | Yoga      | 2.7x       | Same — WASM layout is faster                     |
| Deep nesting (15+ levels)           | Yoga      | increasing | Flexture overhead compounds at depth                |

**Key insight**: Flexture wins at node creation and cache hits. Yoga wins at raw layout computation. For interactive TUIs where most keystrokes don't change layout, Flexture's fingerprint cache is the key advantage.

Run benchmarks:

```bash
bun bench bench/yoga-compare-rich.bench.ts    # TUI boards, measure funcs
bun bench bench/incremental.bench.ts          # No-change, dirty leaf, resize
```

---

## Known Limitations

### Intentional Simplifications

1. **No `order` property** — Items laid out in insertion order
2. **No writing modes** — Horizontal-tb only

---

## Migration Guide

### From Yoga to Flexture

```diff
- import Yoga from 'yoga-wasm-web';
- const yoga = await Yoga.init();
- const root = yoga.Node.create();
+ import { Node } from '@beorn/flexture';
+ const root = Node.create();  // Synchronous!

// Rest of the API is identical
root.setWidth(100);
root.setFlexDirection(FLEX_DIRECTION_ROW);
// ...
```

### Key Changes

1. **No async init** — Remove `await Yoga.init()`
2. **Import from package** — `import { Node, FLEX_DIRECTION_ROW } from '@beorn/flexture'`

---

## Test Coverage

Flexture includes 1368 tests covering:

- ✅ Basic layout (single node, column, row)
- ✅ Flex grow distribution
- ✅ Flex shrink with constraints
- ✅ Gap between items
- ✅ Absolute positioning
- ✅ Padding and border
- ✅ Justify content (all 6 values)
- ✅ Align items and align-content
- ✅ Measure functions (text sizing)
- ✅ Min/max constraints
- ✅ Percent values
- ✅ RTL direction with EDGE_START/END
- ✅ Baseline alignment
- ✅ Dirty tracking
- ✅ Node lifecycle (create, insert, remove, free)
- ✅ Style getters/setters
- ✅ Differential fuzz tests (401 tests comparing vs Yoga)
- ✅ Cache stress tests

---

## References

- [Yoga Layout](https://yogalayout.dev/) — Facebook's flexbox implementation
- [Taffy](https://github.com/DioxusLabs/taffy) — Rust flexbox/grid engine
- [CSS Flexbox Spec](https://www.w3.org/TR/css-flexbox-1/) — W3C specification
- [Planning-nl/flexbox.js](https://github.com/Planning-nl/flexbox.js) — Algorithm reference
