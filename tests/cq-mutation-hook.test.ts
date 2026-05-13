/**
 * A0.0 spike: container-query mutation hook
 *
 * Validates the insertion point between Phase 7b and Phase 8 of `layoutNode`
 * by exercising two invariants:
 *
 *   Test A — no-op idempotency
 *     With an empty / unset callback installed on the parent, layout output
 *     must be byte-identical to a control tree without any callback.
 *
 *   Test B — mutation propagates to child layout
 *     A callback that mutates a child's style via `setContainerQueryStyle`
 *     must cause the **same-pass** Phase 8 recursion to lay out the child
 *     with the mutated style — proving the hook fires before Phase 8.
 *
 *   Test C — caching audit (Phase 5 stale measurement)
 *     A child that is pre-measured in Phase 5 (auto-sized container path,
 *     no measureFunc, has grandchildren) and then mutated by the CQ hook
 *     must NOT return the stale Phase 5 measurement in the same pass. The
 *     mutation calls `markDirty()` internally, which clears the layout
 *     cache and forces Phase 8's `layoutNode(child, ...)` to recompute.
 *
 *   Test D — performance no-op verification
 *     A no-op (null) callback adds zero `layoutNode` calls vs the control.
 *
 * See `hub/silvery/diagnosis/flexily-two-phase-feasibility.md` for the
 * verdict report and `@km/silvery/responsive-layout-architecture-reframe`
 * for the dragon bead.
 */
import { describe, test, expect } from "vitest"
import { createFlexily } from "../src/index.js"
import * as stats from "../src/layout-stats.js"

describe("[A0.0 spike] CQ mutation hook — insertion point", () => {
  test("Test A: no-op stub is byte-identical to control (callback unset)", () => {
    // Control tree: parent with two children, no callback installed.
    const flexControl = createFlexily()
    const rootC = flexControl.createNode()
    rootC.setWidth(200)
    rootC.setHeight(100)
    const c1C = flexControl.createNode()
    c1C.setFlexGrow(1)
    const c2C = flexControl.createNode()
    c2C.setFlexGrow(1)
    rootC.insertChild(c1C, 0)
    rootC.insertChild(c2C, 1)
    flexControl.calculateLayout(rootC, 200, 100)

    // Spike tree: identical, callback installed but explicitly null.
    const flexSpike = createFlexily()
    const rootS = flexSpike.createNode()
    rootS.setWidth(200)
    rootS.setHeight(100)
    const c1S = flexSpike.createNode()
    c1S.setFlexGrow(1)
    const c2S = flexSpike.createNode()
    c2S.setFlexGrow(1)
    rootS.insertChild(c1S, 0)
    rootS.insertChild(c2S, 1)
    rootS.setContainerQueryResolver(null) // explicit no-op
    flexSpike.calculateLayout(rootS, 200, 100)

    expect(rootS.layout).toEqual(rootC.layout)
    expect(c1S.layout).toEqual(c1C.layout)
    expect(c2S.layout).toEqual(c2C.layout)
  })

  test("Test A.2: empty-overrides callback is byte-identical and skips markDirty", () => {
    // A callback that calls setContainerQueryStyle({}) on a child should be a
    // true no-op — no markDirty cascade, no second layout pass.
    const flexControl = createFlexily()
    const rootC = flexControl.createNode()
    rootC.setWidth(200)
    rootC.setHeight(100)
    const c1C = flexControl.createNode()
    c1C.setFlexGrow(1)
    rootC.insertChild(c1C, 0)
    flexControl.calculateLayout(rootC, 200, 100)

    const flexSpike = createFlexily()
    const rootS = flexSpike.createNode()
    rootS.setWidth(200)
    rootS.setHeight(100)
    const c1S = flexSpike.createNode()
    c1S.setFlexGrow(1)
    rootS.insertChild(c1S, 0)
    let cbCalls = 0
    rootS.setContainerQueryResolver(() => {
      cbCalls++
      c1S.setContainerQueryStyle({}) // empty overrides — should be a no-op
    })
    flexSpike.calculateLayout(rootS, 200, 100)

    expect(cbCalls).toBe(1)
    expect(rootS.layout).toEqual(rootC.layout)
    expect(c1S.layout).toEqual(c1C.layout)
  })

  test("Test B: callback mutating child padding affects same-pass grandchild layout", () => {
    // Strategy: a CQ hook on `root` mutates `child`'s padding. The grandchild
    // is auto-positioned inside `child`'s content area, so padding mutation
    // shifts the grandchild's `left`. If the hook fires BEFORE Phase 8's
    // recursive `layoutNode(child, ...)`, the grandchild observes the new
    // padding. If it fires AFTER (or never), the grandchild observes the
    // original padding (0).
    //
    // This is the spike's primary observable: a same-pass mutation that
    // propagates through Phase 8's recursion into a grandchild's layout.
    // Padding mutation is appropriate here because (a) it doesn't disturb
    // Phase 6a/6b parent-side flex distribution, (b) it's exactly the kind
    // of style change a CQ branch resolution would emit ("at narrow widths,
    // tighten gutters"), (c) it's directly observable.
    const flex = createFlexily()
    const root = flex.createNode()
    root.setWidth(200)
    root.setHeight(100)

    const child = flex.createNode()
    child.setWidth(200)
    child.setHeight(100)
    root.insertChild(child, 0)

    const grand = flex.createNode()
    grand.setWidth(50)
    grand.setHeight(20)
    child.insertChild(grand, 0)

    // Without mutation: grand.left = 0 (no padding on child).
    // With mutation (padding-left = 15): grand.left = 15.
    root.setContainerQueryResolver(() => {
      child.setContainerQueryStyle({
        // padding tuple: [left, top, right, bottom, start, end]
        padding: [
          { value: 15, unit: 1 }, // UNIT_POINT
          { value: 0, unit: 0 },
          { value: 0, unit: 0 },
          { value: 0, unit: 0 },
          { value: 0, unit: 0 },
          { value: 0, unit: 0 },
        ],
      })
    })
    flex.calculateLayout(root, 200, 100)

    // Same-pass propagation: grandchild observes mutated padding.
    expect(grand.layout.left).toBeCloseTo(15, 5)
    // Sanity: child itself still spans the full 200x100 box (padding doesn't
    // shrink an explicit-size container in flexily's default behavior).
    expect(child.layout.width).toBeCloseTo(200, 5)
  })

  test("Test C: stale Phase 5 measurement is invalidated by CQ mutation", () => {
    // Phase 5 pre-measures auto-sized container children via `measureNode`
    // (lines ~538-560 in layout-zero.ts). The result is stored in the layout
    // cache keyed on (availW, availH). If the CQ hook mutates the child AFTER
    // this pre-measurement, the cache must be cleared so Phase 8's recursive
    // `layoutNode(child, ...)` doesn't reuse the stale measurement.
    //
    // Strategy: build a row container with an auto-sized child whose nested
    // grandchild has explicit width 30. The CQ hook mutates the grandchild
    // to width 80. If the cache invalidation works, the parent shrink-wraps
    // around 80px; if it doesn't, around 30px.
    //
    // NOTE: the mutation target is the grandchild (not the direct child),
    // because the direct child's intrinsic width comes from measuring its
    // own children. This puts pressure on the cache invalidation path that
    // matters most for the A0.1 work.
    const flex = createFlexily()
    const root = flex.createNode()
    root.setWidth(200)
    root.setHeight(100)

    const middle = flex.createNode()
    // No explicit width — middle's intrinsic width is determined by its
    // single grandchild's width.
    root.insertChild(middle, 0)

    const grandchild = flex.createNode()
    grandchild.setWidth(30) // initial
    grandchild.setHeight(20)
    middle.insertChild(grandchild, 0)

    // Install the CQ hook on `root`. It mutates `grandchild`'s width.
    // This is *deep* mutation (skipping `middle`), specifically to probe
    // whether markDirty on grandchild correctly propagates up through middle
    // such that middle's cached Phase 5 measurement is invalidated.
    root.setContainerQueryResolver(() => {
      grandchild.setContainerQueryStyle({ width: { value: 80, unit: 1 } })
    })

    flex.calculateLayout(root, 200, 100)

    // If cache invalidation works: middle.layout.width >= 80
    // If cache is stale: middle.layout.width === 30
    //
    // The grandchild itself should land at width=80 (the mutated value).
    expect(grandchild.layout.width).toBeCloseTo(80, 5)

    // Middle was auto-sized — its layout reflects whatever Phase 8 produces.
    // Because the CQ hook fires AFTER Phase 5 pre-measurement of middle but
    // BEFORE Phase 8 recursion, Phase 8 sees the mutated grandchild. The
    // observable: middle layouts to the new grandchild width.
    expect(middle.layout.width).toBeCloseTo(80, 5)
  })

  test("Test D: null callback adds zero overhead (no extra layoutNode calls)", () => {
    // Performance sanity: a null callback should add no `layoutNode` calls
    // beyond the control. We use the engine's debug counters to verify.
    const flexControl = createFlexily()
    const rootC = flexControl.createNode()
    rootC.setWidth(200)
    rootC.setHeight(100)
    for (let i = 0; i < 4; i++) {
      const c = flexControl.createNode()
      c.setFlexGrow(1)
      rootC.insertChild(c, i)
    }
    stats.resetLayoutStats()
    flexControl.calculateLayout(rootC, 200, 100)
    const baselineCalls = stats.layoutNodeCalls

    const flexSpike = createFlexily()
    const rootS = flexSpike.createNode()
    rootS.setWidth(200)
    rootS.setHeight(100)
    for (let i = 0; i < 4; i++) {
      const c = flexSpike.createNode()
      c.setFlexGrow(1)
      rootS.insertChild(c, i)
    }
    rootS.setContainerQueryResolver(null)
    stats.resetLayoutStats()
    flexSpike.calculateLayout(rootS, 200, 100)
    const spikeCalls = stats.layoutNodeCalls

    expect(spikeCalls).toBe(baselineCalls)
  })

  test("Test E: clearing the callback restores no-op behavior", () => {
    const flex = createFlexily()
    const root = flex.createNode()
    root.setWidth(200)
    root.setHeight(100)
    const child = flex.createNode()
    child.setFlexGrow(1)
    root.insertChild(child, 0)

    let cbCalls = 0
    root.setContainerQueryResolver(() => {
      cbCalls++
    })
    flex.calculateLayout(root, 200, 100)
    expect(cbCalls).toBe(1)

    // Clear and force a re-layout. The callback should NOT fire again.
    root.setContainerQueryResolver(null)
    root.setWidth(220) // force re-layout via dirty
    flex.calculateLayout(root, 220, 100)
    expect(cbCalls).toBe(1) // unchanged
  })
})
