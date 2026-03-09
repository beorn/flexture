---
layout: home

hero:
  name: "Flexily"
  text: "Pure JavaScript Flexbox Layout"
  tagline: "Yoga-compatible API. 1.5-2.5x faster initial layout. 5.5x faster re-layout. 2.5-3.5x smaller. No WASM."
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
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
    details: "100% API compatible. Same constants, same methods. 41/41 Yoga comparison tests pass. Just change the import."
  - icon: "\U0001F9EA"
    title: 1368 Tests
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

> **Building a terminal UI?** Use [Silvery](https://beorn.github.io/silvery/), which uses Flexily by default. You get React components, hooks, and layout feedback without touching the low-level API.
