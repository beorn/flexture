---
layout: home

hero:
  name: "Flexily"
  text: "Pure JavaScript Flexbox Layout"
  tagline: "Need flexbox layout outside the browser? Yoga requires WASM, async init, and leaks memory in long-running apps. Flexily is a pure JavaScript drop-in replacement — 1.5-5.5x faster, 3x smaller, no WASM. Powers Silvery's terminal UI layout."
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Benchmarks
      link: /guide/performance
    - theme: alt
      text: View on GitHub
      link: https://github.com/beorn/flexily

features:
  - icon: "\u26A1"
    title: Faster Initial Layout
    details: "1.5-2.5x faster than Yoga for initial layout. JS node creation avoids WASM boundary crossings (~8x cheaper per node)."
  - icon: "\U0001F4A8"
    title: 5.5x Faster Re-layout
    details: "Fingerprint cache returns in 27 nanoseconds regardless of tree size. Zero tree traversal when nothing changed."
  - icon: "\U0001F4E6"
    title: 2.5-3.5x Smaller
    details: "47 KB minified (16 KB gzipped) vs Yoga's 117 KB. No WASM binary. Tree-shakeable."
  - icon: "\U0001F50C"
    title: Yoga Drop-in
    details: "Yoga-compatible API. Same constants, same methods. 44 Yoga comparison tests pass. Just change the import."
  - icon: "\U0001F4D0"
    title: Composable Text Measurement
    details: "Pluggable text measurement via createFlexily(). Monospace, deterministic test, and proportional backends. Just setTextContent() — no manual measure functions."
  - icon: "\U0001F4DD"
    title: Pretext Integration (alpha)
    details: "Rich text layout with word-wrap, hyphenation, and proportional fonts — powered by <a href='https://github.com/chenglou/pretext'>Pretext</a>. Enables browser-quality text rendering in terminal and canvas applications."
    link: /guide/pretext
    linkText: Learn more
  - icon: "\U0001F9EA"
    title: 1561 Tests
    details: "Includes 1200+ incremental re-layout fuzz tests using differential oracle. Catches bugs that single-pass tests miss."
  - icon: "\U0001F6E0\uFE0F"
    title: Pure JavaScript
    details: "No WASM, no async init, no memory leaks. Synchronous API. Set a breakpoint and step through the algorithm."
---

## Quick Start

::: code-group

```bash [npm]
npm install flexily
```

```bash [bun]
bun add flexily
```

```bash [pnpm]
pnpm add flexily
```

```bash [yarn]
yarn add flexily
```

:::

```typescript
import { createFlexily, FLEX_DIRECTION_ROW } from "flexily"

const flex = createFlexily()

const root = flex.createNode()
root.setWidth(100)
root.setFlexDirection(FLEX_DIRECTION_ROW)

const child = flex.createNode()
child.setFlexGrow(1)
root.insertChild(child, 0)

flex.calculateLayout(root, 100, 100)
console.log(child.getComputedWidth()) // 100
```

### Custom Composition

Build your own Flexily instance with only the plugins you need:

```typescript
import { createBareFlexily, pipe, withTestMeasurer } from "flexily"

const flex = pipe(createBareFlexily(), withTestMeasurer())
```

Available plugins: `withMonospaceMeasurer()` (terminal), `withTestMeasurer()` (deterministic), `withPretextMeasurer()` (proportional fonts via [Pretext](https://github.com/chenglou/pretext)).

### Low-Level API

For direct Yoga-compatible usage without the composable engine:

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

## Who Should Use Flexily

Most developers should use a framework built on Flexily, not Flexily directly. Flexily is for:

- **Framework authors** building a TUI or layout framework that needs a JS layout engine
- **Canvas/game developers** who need flexbox for non-DOM rendering
- **Specialized tools** where you need direct control over layout computation
- **Anyone replacing Yoga** who wants a drop-in pure-JS alternative

> **Building a terminal UI?** Use [Silvery](https://silvery.dev), which uses Flexily by default. You get React components, hooks, and layout feedback without touching the low-level API.
