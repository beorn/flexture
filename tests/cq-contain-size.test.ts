/**
 * A0.1 — `containSize` invariant for CQ containers.
 *
 * Validates that CSS `contain: size` (paired with `containerType: inline-size`)
 * prevents the container's OWN auto-width shrink-wrap from collapsing to
 * children's intrinsic sizes. Phase 1 contains the inline axis only.
 *
 * What containSize changes in flexily:
 *
 *   - Phase 9 (shrink-wrap auto-sized containers): when the container is
 *     itself auto-sized (no explicit width, has parent constraint), it
 *     normally shrinks to fit children's actual laid-out main-size. With
 *     `containSize=true` paired with `containerType !== NORMAL`, Phase 9's
 *     inline-axis override is skipped — the container keeps its pre-shrink
 *     size (the constraint-derived size from Phase 3).
 *
 * What containSize does NOT change (intentional Phase 1 scope):
 *
 *   - Phase 5 intrinsic measurement (parent's getMaxContent of the container)
 *     still reads children's sizes. A bare auto-width contain:size container
 *     without `flexGrow: 1` will still receive 0 width from its parent's flex
 *     algorithm. Practical usage: pair containSize with explicit width OR
 *     `flexGrow: 1` (the canonical "fill parent" pattern for chat lanes).
 *
 *   - Block-size containment (the cross axis here). CSS `contain: size` covers
 *     both axes; we contain only inline-size in Phase 1.
 *
 * For the snap-left use case (silvercode chat lanes), the CQ container has
 * an explicit width from fitWidth lane selection — containSize is redundant
 * but documents intent and remains the invariance signal for dev-mode
 * assertions (next commit).
 */
import { describe, expect, test } from "vitest"
import * as C from "../src/constants.js"
import { createFlexily } from "../src/index.js"

describe("[A0.1] containSize invariant", () => {
  test("auto-width CQ container with containSize=true + flexGrow=1 keeps parent-constrained width", () => {
    // The canonical "fill parent" pattern: flexGrow=1 grows to fill, containSize
    // prevents children from feeding back to override. WITHOUT containSize, an
    // auto-width container with grow would still shrink-wrap to children's max-
    // content before re-growing — with containSize, the size stays definite.
    const flex = createFlexily()
    const outer = flex.createNode()
    outer.setWidth(200)

    const middle = flex.createNode()
    middle.setContainerType(C.CONTAINER_TYPE_INLINE_SIZE)
    middle.setContainSize(true)
    middle.setFlexGrow(1)

    const grandchild = flex.createNode()
    grandchild.setWidth(50)

    outer.insertChild(middle, 0)
    middle.insertChild(grandchild, 0)
    flex.calculateLayout(outer, 200, 100)

    // With flexGrow=1 + containSize=true, middle fills its share of outer (200).
    expect(middle.getComputedWidth()).toBe(200)
    expect(middle.getFrozenQuerySize()).toBe(200)
  })

  test("explicit-width CQ container with containSize=true behaves identically (already-definite size)", () => {
    // When width is explicit, containSize is redundant — parent size is already
    // independent of children. This test verifies the combo doesn't break things.
    const flex = createFlexily()
    const cq = flex.createNode()
    cq.setContainerType(C.CONTAINER_TYPE_INLINE_SIZE)
    cq.setContainSize(true)
    cq.setWidth(160)

    const child = flex.createNode()
    child.setWidth(50)

    cq.insertChild(child, 0)
    flex.calculateLayout(cq, 320, 100)

    expect(cq.getComputedWidth()).toBe(160)
    expect(cq.getFrozenQuerySize()).toBe(160)
    expect(child.getComputedWidth()).toBe(50)
  })

  test("containSize on non-CQ container is a no-op (Phase 1 only contains when paired with containerType)", () => {
    // Phase 1 ties containSize to containerType !== NORMAL (per the bead:
    // "containSize is effectively mandatory for CQ containers"). Setting
    // containSize without containerType doesn't disable shrink-wrap — the
    // existing behavior is preserved. This keeps the contained-axis surface
    // narrowly scoped to CQ usage in Phase 1.
    const flex = createFlexily()
    const outer = flex.createNode()
    outer.setWidth(200)

    const inner = flex.createNode()
    inner.setContainSize(true)
    inner.setFlexGrow(1)
    // NO setContainerType → containerType stays NORMAL → containSize no-op

    const grandchild = flex.createNode()
    grandchild.setWidth(50)

    outer.insertChild(inner, 0)
    inner.insertChild(grandchild, 0)
    flex.calculateLayout(outer, 200, 100)

    // With flexGrow=1 + no CQ-container declaration, inner fills (200) regardless
    // — the test asserts containSize hasn't broken anything, not that it's active.
    expect(inner.getComputedWidth()).toBe(200)
  })

  test("explicit-width CQ container: child sizes vary, container size stays invariant (CQ guarantee)", () => {
    // The two-phase algorithm's load-bearing invariant: container size MUST be
    // independent of child sizes when containerType + (explicit width or
    // containSize+flexGrow) are set. This test exercises explicit-width — the
    // simplest case where the invariant trivially holds because parent
    // constraint dictates size.
    const flex = createFlexily()
    const outer = flex.createNode()
    outer.setWidth(200)

    const cq = flex.createNode()
    cq.setContainerType(C.CONTAINER_TYPE_INLINE_SIZE)
    cq.setContainSize(true)
    cq.setWidth(160)

    const child = flex.createNode()
    child.setWidth(50)

    outer.insertChild(cq, 0)
    cq.insertChild(child, 0)
    flex.calculateLayout(outer, 200, 100)
    const widthSmall = cq.getComputedWidth()
    const frozenSmall = cq.getFrozenQuerySize()

    // Change child width — simulates CQ branch flip selecting different layout
    child.setWidth(150)
    flex.calculateLayout(outer, 200, 100)
    const widthLarge = cq.getComputedWidth()
    const frozenLarge = cq.getFrozenQuerySize()

    expect(widthSmall).toBe(widthLarge) // INVARIANCE
    expect(frozenSmall).toBe(frozenLarge)
    expect(widthSmall).toBe(160)
  })

  test("containSize=true on auto-sized ROOT CQ container keeps parent-supplied width", () => {
    // For a ROOT-level auto-sized CQ container (no parent flex distribution),
    // Phase 9's containSize gate keeps the width at the calculateLayout-supplied
    // available size instead of shrinking to children. The opposite scenario
    // (containSize=false) is unsound — `cq-invariance.test.ts` shows the
    // dev-mode "intrinsic leak" assertion fires on it.
    const flex = createFlexily()
    const cq = flex.createNode()
    cq.setContainerType(C.CONTAINER_TYPE_INLINE_SIZE)
    cq.setContainSize(true)
    // No setWidth — auto, but contained.

    const child = flex.createNode()
    child.setWidth(50)
    cq.insertChild(child, 0)

    flex.calculateLayout(cq, 200, 100)
    expect(cq.getComputedWidth()).toBe(200)
  })
})
