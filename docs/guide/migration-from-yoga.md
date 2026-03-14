# Migration from Yoga

A step-by-step guide to replacing Yoga with Flexily in your project.

## Step 1: Install

Remove Yoga and add Flexily:

::: code-group

```bash [npm]
npm uninstall yoga-wasm-web yoga-layout yoga-layout-prebuilt
npm install flexily
```

```bash [bun]
bun remove yoga-wasm-web yoga-layout yoga-layout-prebuilt
bun add flexily
```

```bash [pnpm]
pnpm remove yoga-wasm-web yoga-layout yoga-layout-prebuilt
pnpm add flexily
```

:::

## Step 2: Update Imports

The core API change: no async initialization.

```diff
- import Yoga from "yoga-wasm-web"
- const yoga = await Yoga.init()
- const root = yoga.Node.create()
+ import { Node } from "flexily"
+ const root = Node.create()  // Synchronous!
```

Constants import identically:

```diff
- import { FLEX_DIRECTION_ROW, JUSTIFY_CENTER, ALIGN_STRETCH } from "yoga-wasm-web"
+ import { FLEX_DIRECTION_ROW, JUSTIFY_CENTER, ALIGN_STRETCH } from "flexily"
```

## Step 3: Remove Async Init

The biggest simplification. Yoga requires async initialization before any nodes can be created:

```typescript
// Before (Yoga) -- async dance required
let yoga: YogaInstance
async function init() {
  yoga = await Yoga.init()
}
// Must await init() before creating any nodes

// After (Flexily) -- just use it
import { Node } from "flexily"
const root = Node.create() // Works immediately
```

This eliminates:

- Top-level `await` requirements
- Init-before-use guards
- Async module loading patterns
- Startup latency from WASM compilation

## Step 4: Check for Behavioral Differences

Most of the API is identical. Three areas differ intentionally:

### Default Flex Direction

Yoga defaults to `column`; Flexily defaults to `row` (matching CSS spec).

**Fix**: Add explicit `setFlexDirection(FLEX_DIRECTION_COLUMN)` wherever your code assumed column layout.

```typescript
const container = Node.create()
// If you relied on Yoga's column default, add this:
container.setFlexDirection(FLEX_DIRECTION_COLUMN)
```

### Overflow + Shrink

Flexily follows CSS Section 4.5: overflow containers have `min-size: auto = 0` and can shrink to fit their parent. Yoga ignores this.

**Fix**: Usually no fix needed -- Flexily's behavior is what browsers do and likely what you intended. If you specifically need Yoga's behavior (overflow container ignoring parent constraint), set explicit `minHeight` on the overflow child.

### Aspect Ratio + Stretch

Flexily follows CSS Alignment spec: implicit stretch doesn't override aspect ratio.

**Fix**: If you need stretch to override AR, use explicit `align-self: stretch` instead of relying on inherited stretch.

See [Yoga Divergences](yoga-divergences.md) for detailed explanations and examples.

## API Parity Reference

### Identical API (no changes needed)

| Category         | Methods                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| **Dimensions**   | `setWidth`, `setHeight`, `setWidthAuto`, `setHeightAuto`, `setWidthPercent`, `setHeightPercent` |
| **Min/Max**      | `setMinWidth`, `setMaxWidth`, `setMinHeight`, `setMaxHeight`                                    |
| **Flex**         | `setFlexGrow`, `setFlexShrink`, `setFlexBasis`, `setFlexDirection`, `setFlexWrap`               |
| **Alignment**    | `setJustifyContent`, `setAlignItems`, `setAlignSelf`, `setAlignContent`                         |
| **Spacing**      | `setPadding`, `setMargin`, `setMarginAuto`, `setBorder`, `setGap`                               |
| **Position**     | `setPositionType`, `setPosition`                                                                |
| **Display**      | `setDisplay`, `setOverflow`                                                                     |
| **Aspect Ratio** | `setAspectRatio`                                                                                |
| **Tree**         | `insertChild`, `removeChild`, `getChildCount`, `getChild`, `getParent`                          |
| **Measure**      | `setMeasureFunc`, `setBaselineFunc`, `markDirty`, `isDirty`                                     |
| **Layout**       | `calculateLayout`                                                                               |
| **Computed**     | `getComputedLeft`, `getComputedTop`, `getComputedWidth`, `getComputedHeight`, etc.              |
| **Lifecycle**    | `Node.create()`, `free()`                                                                       |

### Same Constants

All Yoga constants are exported with identical names and values:

```typescript
import {
  FLEX_DIRECTION_ROW,
  FLEX_DIRECTION_COLUMN,
  JUSTIFY_CENTER,
  JUSTIFY_SPACE_BETWEEN,
  ALIGN_STRETCH,
  ALIGN_BASELINE,
  EDGE_TOP,
  EDGE_LEFT,
  EDGE_ALL,
  GUTTER_ROW,
  GUTTER_COLUMN,
  DIRECTION_LTR,
  DIRECTION_RTL,
  MEASURE_MODE_EXACTLY,
  MEASURE_MODE_AT_MOST,
  POSITION_TYPE_ABSOLUTE,
  POSITION_TYPE_RELATIVE,
  OVERFLOW_HIDDEN,
  OVERFLOW_SCROLL,
  DISPLAY_FLEX,
  DISPLAY_NONE,
  WRAP_WRAP,
  WRAP_NO_WRAP,
} from "flexily"
```

### Not Yet Implemented

| Feature          | Notes                             |
| ---------------- | --------------------------------- |
| `order` property | Items laid out in insertion order |
| Writing modes    | Horizontal-tb only                |

These are advanced features that most projects don't use. If your project depends on them, Flexily is not yet a full replacement for your use case.

## Step 5: Run Your Tests

After the import swap, run your existing test suite. The 44 Yoga compatibility tests in Flexily verify identical behavior for all standard features. Any failures are likely from the three intentional divergences listed above.

## Step 6: Remove WASM Workarounds

With Yoga gone, you can clean up:

- **Async init patterns**: Remove `await Yoga.init()` and any init guards
- **Memory leak workarounds**: No more WASM linear memory growth issues
- **Bundler WASM config**: Remove any special WASM handling from your build pipeline (webpack WASM loaders, Vite WASM plugins, etc.)
- **Node.js `--experimental-wasm-*` flags**: No longer needed

## Two Algorithm Variants

Flexily ships two layout implementations:

```typescript
import { Node } from "flexily" // Zero-allocation (default, fast)
import { Node } from "flexily/classic" // Allocating (easier to debug)
```

Both produce identical output. Use `flexily/classic` when stepping through layout computation in a debugger.
