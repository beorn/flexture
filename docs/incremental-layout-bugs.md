# Incremental Layout: Correctness Challenges

A knowledge base on the correctness challenges of incremental layout in flexbox engines — drawing from Chrome's LayoutNG, Yoga, PanGui, and Flexture's own experience.

## The Fundamental Tension

Flexbox layout is expensive for deep trees. Without caching, a layout pass can trigger exponential reflows as parent-child constraints cascade. But caching introduces a new class of bugs: **stale values surviving across layout passes**.

Every mature layout engine has struggled with this. The challenge isn't writing a correct single-pass layout — it's ensuring that every subsequent re-layout on a partially-dirty tree produces the same result as a fresh layout from scratch.

## Industry Experience

### Chrome Blink → LayoutNG (2016-2019)

Chrome's original Blink flexbox implementation accumulated a **"chain of ~10 bugs over a year, where each fix caused another issue"** in their incremental layout system. The fixes were interrelated — patching one stale-value path exposed another. This was during the ~2015-2017 era when Blink's layout system was under heavy development.

The Blink team ultimately concluded that the incremental layout model had become too complex to patch and began **LayoutNG** around 2016-2017 — a ground-up rewrite with clearer algorithms and more principled caching. LayoutNG shipped in Chrome 76 (July 2019), making flex layout more consistent and predictable, reducing the cascade of interdependent bugs.

**Lesson**: Incremental layout bugs compound. Each fix can expose new edge cases because the caching logic interacts with every other part of the algorithm. A principled caching model (clear invariants, conservative invalidation) is more maintainable than ad-hoc fixes.

_Source: [developer.chrome.com/docs/chromium/layoutng](https://developer.chrome.com/docs/chromium/layoutng)_

### Facebook Yoga (2016-present)

Yoga was open-sourced by Facebook in 2016 as a cross-platform flexbox engine for React Native, Litho, and ComponentKit. It takes a **conservative invalidation** approach. When any node is marked dirty, `markDirtyAndPropagate()` walks up the entire ancestor chain to the root, ensuring all ancestors will recalculate:

```cpp
void Node::markDirtyAndPropagate() {
  if (!isDirty_) {
    setDirty(true);
    setLayoutComputedFlexBasis(YGFloatOptional());
    if (owner_) {
      owner_->markDirtyAndPropagate();
    }
  }
}
```

Yoga also invalidates cached measurements whenever a node's style or `configVersion` changes, erring on the side of recomputing more than strictly necessary. This trades some performance for safety.

**Lesson**: Conservative invalidation (propagate dirty to root, invalidate on any ambiguous change) is safer than precise invalidation. The performance cost of occasional unnecessary recomputation is low; the correctness cost of a missed invalidation is high.

_Source: [Yoga Node.cpp](https://fossies.org/linux/react-native/packages/react-native/ReactCommon/yoga/yoga/node/Node.cpp)_

### PanGui (2024-2025)

PanGui is a newer Rust-based UI framework. It chose the opposite extreme: **no incremental layout at all**. If any node is dirty, the entire tree is recomputed from scratch:

> "If anything is dirty, we recompute the entire tree. For now, we consider the simplicity of full recomputation worth the performance trade-off."

This eliminates all stale-value bugs by construction. For moderate UI sizes on modern hardware, full recomputation is "fast enough." PanGui's developers explicitly value determinism and simplicity over the last bit of performance.

**Lesson**: Full recomputation is a valid strategy for smaller UIs. The absence of incremental bugs can be worth more than the performance gain from caching — especially during early development.

_Source: [pangui.io/blog/05-layout-rework-and-benchmarks](https://www.pangui.io/blog/05-layout-rework-and-benchmarks)_

### "How Browsers Work" — Garsiel (2009-2011)

Tali Garsiel's landmark deep dive (originally published ~2009, updated 2011) explains that browsers attempt incremental layout (reflow) of just the affected subtree, but in practice often must walk up to the root because layout can be interdependent. Layout changes in one subtree can affect sibling positions, parent sizes, and even unrelated subtrees through shared constraints.

**Lesson**: "Just recompute the dirty subtree" sounds simple but is deceptively hard. Parent-child interactions in flexbox mean a child's final size depends on sibling sizes, parent constraints, and flex distribution — all of which may change when any node in the tree changes.

_Source: [taligarsiel.com/Projects/howbrowserswork.htm](https://taligarsiel.com/Projects/howbrowserswork.htm)_

## Bug Taxonomy

From studying these engines (and Flexture's own bugs), incremental layout bugs fall into a few categories:

### 1. Sentinel Value Collisions

Cache invalidation uses a special value to mark entries as "stale." If that value collides with a legitimate domain value, the cache falsely reports a hit.

**Example**: Using `NaN` to mean "invalidated" in a system where `NaN` also means "unconstrained dimension." `Object.is(NaN, NaN) === true` in JavaScript, so the invalidated entry matches real queries.

**Prevention**: Use sentinel values outside the legitimate domain (e.g., `-1` for a non-negative dimension field).

### 2. Fingerprint Incompleteness

The cache key (fingerprint) captures the inputs to a layout call: available width, available height, direction. If the fingerprint is missing an input that affects the result, the cache returns stale values when that input changes.

**Example**: A child's `layoutNode` receives `NaN` (unconstrained) as width in both passes. The fingerprint matches. But the parent overrides the child's final width based on flex distribution (shrinkage), and the distribution changed between passes. The fingerprint doesn't capture "parent's flex distribution."

**Prevention**: Include all inputs that affect the final result in the cache key. If a parent can override a child's dimensions post-layout, that override must be detectable by the fingerprint.

### 3. Measurement Side Effects

Measuring a node's intrinsic size (for flex-basis calculation) may write to shared state. If the measurement runs on a node that won't be re-laid-out (because it's clean), the written state persists incorrectly.

**Example**: `measureNode()` writes to `node.layout.width/height` as a side effect. When called on a clean node during partial re-layout, it overwrites correct values with intrinsic measurements. The subsequent fingerprint check skips the node, preserving the corruption.

**Prevention**: Measurement functions should not have side effects on layout state, or should save/restore any state they modify.

### 4. Two-Pass Interaction

Flexbox is inherently two-pass: measure children (determine flex basis), distribute space (grow/shrink), then re-measure affected children. The first pass may set state that the second pass assumes is still valid, but dirty marking between passes can invalidate that assumption.

**Prevention**: Ensure that state set in pass 1 is either recalculated in pass 2 or that the cache correctly invalidates when pass-1 state becomes stale.

## Testing Strategies

### Differential Oracle (strongest)

Compare incremental re-layout against a fresh layout of an identical tree. The fresh layout is trivially correct (no caching involved). Any difference is a bug.

This is the gold standard for testing cache correctness. It requires:

- A deterministic tree builder (seeded RNG for fuzz testing)
- A way to extract full layout results for comparison
- NaN-safe comparison (`Object.is`, not `===`)

### Property-Based Testing

Define invariants that must hold for every layout:

- **Idempotency**: Layout twice with no changes → same result
- **Resize stability**: Layout at W1→W2→W1 → matches fresh at W1
- **Structural sanity**: All dimensions finite and non-negative

Pierre Felgines (2019) describes applying property-based testing to layouts, checking invariants like "no child overlaps a sibling" and "no child overflows parent" for every random input.

_Source: [felginep.github.io/2019-03-20/property-based-testing](https://felginep.github.io/2019-03-20/property-based-testing)_

### Cache Stress Testing

Use the same tree instance across multiple `calculateLayout()` calls with varying constraints. This exercises cache rotation (entries from width=60 must not leak into width=80 queries) and sentinel correctness.

### Mutation Testing

Deliberately inject known-wrong values into cache logic (flip a `<=` to `<`, swap a sentinel value). If no test fails, that indicates a coverage gap. Useful for verifying that the fuzz suite actually exercises both "cache hit" and "cache miss" paths.

## Flexture's Approach

Flexture combines aggressive caching with extensive correctness testing:

**Caching layers:**

- **Per-node fingerprint** — 5-field check (availW, availH, direction, offsetX, offsetY) enables skipping entire subtrees when constraints are unchanged. No other JS layout engine does this.
- **Two-entry LRU layout cache** — Stores results for two recent constraint sets per node
- **Four-entry measure cache** — Caches measure function results
- **Position-only updates** — When fingerprint matches, propagates position deltas without re-computing layout

**Correctness safeguards:**

- **1100+ fuzz tests** using the differential oracle across 5 test dimensions
- **Conservative dirty propagation** (Yoga-style: walk to root on any `markDirty`)
- **Domain-safe sentinels** (`-1`, not `NaN`)
- **Side-effect isolation** (save/restore layout state in measurement)
- **Flex distribution guard** — Detects when flex grow/shrink changed a child's size, preventing stale cache hits

**Performance trade-off:** The fingerprint cache makes Flexture **5.5x faster** than Yoga for no-change re-layout (27ns regardless of tree size). However, the per-node caching overhead makes Flexture **2.8-3.4x slower** than Yoga for incremental re-layout when nodes are actually dirty. This is a deliberate trade-off — in interactive TUIs, most keystrokes don't change layout, so the no-change case dominates.

Where Chrome's Blink needed a ground-up rewrite (LayoutNG) to escape cascading cache bugs, PanGui chose to skip caching entirely, and Yoga uses conservative invalidation, Flexture pursues aggressive caching paired with rigorous empirical verification.
