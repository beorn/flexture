# Zero-Allocation Layout Engine

This document describes the zero-allocation optimization in Flexture and its trade-offs.

## Motivation

High-frequency TUI rendering (60+ fps) creates significant GC pressure from temporary objects allocated during each layout pass. The classic algorithm allocates:

- `ChildLayout` objects for each child during flex distribution
- `FlexLine[]` arrays for flex-wrap support
- Temporary arrays during filtered iteration

These allocations trigger frequent garbage collection, causing frame drops and latency spikes.

## Design

### FlexInfo on Nodes

Each Node stores a 25-field `FlexInfo` struct that is mutated (not reallocated) each layout pass. See `src/types.ts` for the full interface. Key field groups:

```typescript
interface FlexInfo {
  // Flex distribution state (Phase 5-6)
  mainSize: number // Current main-axis size
  baseSize: number // Original base size (for weighted shrink)
  mainMargin: number // Total main-axis margin (non-auto only)
  flexGrow: number // Cached flex-grow value
  flexShrink: number // Cached flex-shrink value
  minMain: number // Min main-axis constraint
  maxMain: number // Max main-axis constraint
  frozen: boolean // Frozen during flex distribution
  lineIndex: number // Which flex line this child belongs to
  relativeIndex: number // Position among relative children (-1 if absolute/hidden)
  baseline: number // Computed baseline offset for ALIGN_BASELINE
  // Auto margin tracking
  mainStartMarginAuto: boolean
  mainEndMarginAuto: boolean
  mainStartMarginValue: number
  mainEndMarginValue: number
  // Cached resolved margins
  marginL: number
  marginT: number
  marginR: number
  marginB: number
  // Constraint fingerprinting (layout caching)
  lastAvailW: number
  lastAvailH: number
  lastOffsetX: number
  lastOffsetY: number
  lastDir: number
  layoutValid: boolean
}
```

### Pre-allocated Line Arrays

Module-level typed arrays store per-line metrics:

```typescript
let _lineCrossSizes = new Float64Array(32);    // Cross size per line
let _lineCrossOffsets = new Float64Array(32);  // Cross offset per line
let _lineLengths = new Uint16Array(32);        // Children count per line
let _lineChildren: Node[][] = [...];           // Children per line (grows if needed)
let _lineJustifyStarts = new Float64Array(32); // Per-line justify start offset
let _lineItemSpacings = new Float64Array(32);  // Per-line item spacing
```

Memory usage: ~1,344 bytes total (4 Float64Arrays × 256 bytes + 1 Uint16Array × 64 bytes + array overhead; covers 32 flex lines — virtually all real layouts).

### Filtered Iteration

The `relativeIndex` field enables skipping absolute/hidden children without `filter()`:

```typescript
// Classic (allocates filtered array):
const relative = children.filter((c) => !isAbsolute(c) && !isHidden(c))

// Zero-alloc (skips inline):
for (const child of children) {
  if (child.flex.relativeIndex < 0) continue
  // Process child...
}
```

## Benchmark Results

| Scenario       | Flexture Classic | Flexture Zero-alloc | Yoga WASM   |
| -------------- | ------------- | ---------------- | ----------- |
| Flat 500 nodes | 1x            | 1.75-2x faster   | ~0.5x       |
| Deep 50 levels | 1x            | ~1x (similar)    | 1.2x faster |
| Kanban TUI     | 1x            | ~1.1x faster     | ~0.9x       |

**Key insight**: Zero-alloc excels at flat, wide layouts (the typical TUI structure).

## Trade-offs

### Advantages

- Eliminates temporary object allocation during layout
- Faster for flat, wide layouts (typical TUI structure)
- Cache-friendly contiguous memory access
- Reduces GC pause frequency

### Disadvantages

- Not reentrant (single layout calculation at a time)
- Higher memory per node (FlexInfo struct)
- More complex code than classic algorithm

## Feature Parity

Both algorithms now have complete feature parity:

| Feature            | Classic | Zero-alloc |
| ------------------ | ------- | ---------- |
| RTL direction      | ✅      | ✅         |
| EDGE_START/END     | ✅      | ✅         |
| Baseline alignment | ✅      | ✅         |
| All Yoga tests     | 41/41   | 41/41      |

## Usage

```typescript
// Default: Zero-allocation algorithm (recommended)
import { Node } from "@beorn/flexture"

// Classic algorithm (for debugging or comparison)
import { Node } from "@beorn/flexture/classic"
```

Both exports have identical APIs - only the internal algorithm differs.

## Files

| File                    | Description                |
| ----------------------- | -------------------------- |
| `src/layout-zero.ts`    | Layout algorithm (default) |
| `src/node-zero.ts`      | Node class with FlexInfo   |
| `src/index.ts`          | Default export             |
| `src/classic/layout.ts` | Classic layout algorithm   |
| `src/classic/node.ts`   | Classic Node class         |
| `src/index-classic.ts`  | Classic export             |

## Implemented Optimizations

### Dirty-flag Incremental Layout ✅

Nodes track dirty state and propagate up to root. `calculateLayout()` returns early if clean:

```typescript
// Already implemented in node-zero.ts
markDirty() {
  this._isDirty = true;
  this._flex.layoutValid = false;
  // Clear measure cache
  this._m0 = this._m1 = this._m2 = this._m3 = undefined;
  this._parent?.markDirty();
}

calculateLayout() {
  if (!this._isDirty) return; // Skip if clean
  // ... layout
  this._isDirty = false;
}
```

### Measure Result Caching ✅

4-entry LRU cache per node stores `(w, wm, h, hm) → (width, height)`. Cache cleared on `markDirty()`.

### Single-child Fast Path ✅

Skip flex distribution iteration for single-child containers - direct size assignment:

```typescript
// In distributeFlexSpaceForLine()
if (childCount === 1) {
  const flex = lineChildren[0].flex
  const canFlex = isGrowing ? flex.flexGrow > 0 : flex.flexShrink > 0
  if (canFlex) {
    const target = flex.baseSize + initialFreeSpace
    flex.mainSize = Math.max(flex.minMain, Math.min(flex.maxMain, target))
  }
  return
}
```
