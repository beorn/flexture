# Pretext Integration

Flexily includes a text measurement plugin powered by [Pretext](https://github.com/chenglou/pretext), a text layout engine by [@chenglou](https://github.com/chenglou). Pretext provides word-wrap, hyphenation, and proportional font measurement — the same capabilities browsers use for text rendering, available outside the DOM.

::: warning Alpha
The Pretext integration is alpha. The API may change as Pretext itself evolves.
:::

## Why Pretext?

Flexily's default text measurement is monospace: every character is one cell wide. This is perfect for terminal UIs, where the terminal font is monospace by definition.

But when rendering to a canvas, a game engine, or a PDF, text is proportional — an "i" is narrower than an "m", words wrap at pixel boundaries, and long words can be hyphenated. Without accurate text measurement, flexbox layout produces wrong sizes for any node containing text.

Pretext solves this. It measures text using real font metrics, handles word-wrap and hyphenation, and reports the dimensions Flexily needs to compute correct layouts.

## Setup

Install both packages:

::: code-group

```bash [npm]
npm install flexily @chenglou/pretext
```

```bash [bun]
bun add flexily @chenglou/pretext
```

```bash [pnpm]
pnpm add flexily @chenglou/pretext
```

:::

Create a Flexily engine with Pretext measurement:

```typescript
import { createBareFlexily, pipe, withPretext } from "flexily"
import pretext from "@chenglou/pretext"

const flex = pipe(createBareFlexily(), withPretext(pretext))
```

`createBareFlexily()` creates an engine with no text measurement. `withPretext(pretext)` adds proportional font measurement. The `pipe()` function composes them.

## How It Works

Flexily's text measurement is pluggable via the `TextLayoutService` interface. Each backend implements two operations:

1. **Prepare** — parse the text and font into a reusable measurement object
2. **Layout** — given a max width, compute the text dimensions (width, height, line count)

The monospace backend is trivial: width = character count. The Pretext backend delegates to Pretext's layout engine, which handles variable-width glyphs, word boundaries, and hyphenation.

When you call `node.setTextContent("Hello world")`, Flexily:

1. Calls `pretext.prepare(text, fontShorthand)` to create a prepared text object
2. Installs a measure function on the node
3. During layout, the measure function calls `prepared.layout(maxWidth)` to get the text dimensions
4. Flexily uses those dimensions to compute the node's size within the flexbox algorithm

## Example: Canvas Rendering

A typical use case — computing layout for a canvas-based UI with proportional fonts:

```typescript
import { createBareFlexily, pipe, withPretext, FLEX_DIRECTION_COLUMN } from "flexily"
import pretext from "@chenglou/pretext"

const flex = pipe(createBareFlexily(), withPretext(pretext))

// Build a card layout
const card = flex.createNode()
card.setWidth(300)
card.setFlexDirection(FLEX_DIRECTION_COLUMN)
card.setPadding(0, 16) // EDGE_LEFT
card.setPadding(2, 16) // EDGE_RIGHT
card.setPadding(1, 12) // EDGE_TOP
card.setPadding(3, 12) // EDGE_BOTTOM

// Title in a larger font
const title = flex.createNode()
title.setTextContent("Getting Started with Flexily", {
  fontShorthand: "bold 18px Inter, sans-serif",
  fontFamily: "Inter, sans-serif",
  fontSize: 18,
  fontWeight: 700,
  fontStyle: "normal",
  lineHeight: 24,
})
card.insertChild(title, 0)

// Body text in a smaller font
const body = flex.createNode()
body.setTextContent(
  "Flexily is a pure JavaScript flexbox layout engine. " +
  "It provides the same API as Yoga without the WASM dependency.",
  {
    fontShorthand: "14px Inter, sans-serif",
    fontFamily: "Inter, sans-serif",
    fontSize: 14,
    fontWeight: 400,
    fontStyle: "normal",
    lineHeight: 20,
  },
)
card.insertChild(body, 1)

// Compute layout
flex.calculateLayout(card, 300, undefined)

// Read computed positions for canvas drawing
console.log(title.getComputedTop())    // 12 (top padding)
console.log(title.getComputedHeight()) // 24 (one line at lineHeight 24)
console.log(body.getComputedTop())     // 36 (after title)
console.log(body.getComputedHeight())  // 40 (two lines at lineHeight 20)
```

The key difference from monospace: the body text wraps based on actual pixel widths, not character count. An "i" takes fewer pixels than an "m", so more text fits per line.

## Text Style

`setTextContent` accepts an optional style object with font properties:

```typescript
interface ResolvedTextStyle {
  fontShorthand: string  // CSS font shorthand, e.g. "14px 'Inter', sans-serif"
  fontFamily: string     // Font family name
  fontSize: number       // Font size in pixels
  fontWeight: number     // 100-900
  fontStyle: string      // "normal" or "italic"
  lineHeight: number     // Line height in pixels
}
```

The `fontShorthand` is passed directly to Pretext for font matching. The other fields are used for fallback calculations (e.g., `lineHeight` determines line spacing when Pretext doesn't report it).

## Comparison with Other Backends

Flexily ships three text measurement backends:

| Backend | Plugin | Use Case | Word Wrap | Proportional |
| ------- | ------ | -------- | --------- | ------------ |
| Monospace | `createFlexily()` | Terminal UIs | No | No |
| Test | `withTestMeasurer()` | CI/tests | No | Simulated |
| **Pretext** | **`withPretext(pretext)`** | **Canvas, web, PDF** | **Yes** | **Yes** |

Choose the backend that matches your rendering target:

```typescript
import {
  createFlexily,
  createBareFlexily,
  pipe,
  withTestMeasurer,
  withPretext,
} from "flexily"

// Terminal (default) — 1 char = 1 cell
const termFlex = createFlexily()

// Tests/CI — deterministic, cross-platform identical
const testFlex = pipe(createBareFlexily(), withTestMeasurer())

// Canvas/web/PDF — real font metrics, word-wrap, hyphenation
import pretext from "@chenglou/pretext"
const canvasFlex = pipe(createBareFlexily(), withPretext(pretext))
```

## API Reference

### `withPretext(pretext)`

Plugin function. Pass the Pretext module and compose with `pipe()`.

```typescript
import { createBareFlexily, pipe, withPretext } from "flexily"
import pretext from "@chenglou/pretext"

const flex = pipe(createBareFlexily(), withPretext(pretext))
```

### `createPretextMeasurer(pretext)`

Lower-level factory. Creates a `TextLayoutService` directly, for use outside the composable API.

```typescript
import { createPretextMeasurer } from "flexily"
import pretext from "@chenglou/pretext"

const measurer = createPretextMeasurer(pretext)
const prepared = measurer.prepare({
  text: "Hello world",
  style: {
    fontShorthand: "14px Inter",
    fontFamily: "Inter",
    fontSize: 14,
    fontWeight: 400,
    fontStyle: "normal",
    lineHeight: 20,
  },
})

const sizes = prepared.intrinsicSizes()
console.log(sizes.minContentWidth) // width of longest word
console.log(sizes.maxContentWidth) // width of entire text on one line

const layout = prepared.layout({ maxWidth: 200 })
console.log(layout.width, layout.height, layout.lineCount)
```

### `PretextAPI` Interface

The shape Flexily expects from the Pretext module. Defined in Flexily to avoid a hard dependency:

```typescript
interface PretextAPI {
  prepare(text: string, font: string): PretextPrepared
}

interface PretextPrepared {
  layout(maxWidth: number, lineHeight?: number): PretextLayout
}

interface PretextLayout {
  width: number
  height: number
  lines?: Array<{ text: string; width: number }>
}
```

## Next Steps

- [Getting Started](/guide/getting-started) — Flexily basics and composable API
- [API Reference](/api/reference) — Complete API documentation including all text measurement plugins
- [Pretext on GitHub](https://github.com/chenglou/pretext) — Pretext source and documentation
