/**
 * A0.1 — dev-mode invariance assertions.
 *
 * Validates that flexily throws "intrinsic leak" when a CQ container's frozen
 * inline-size (Pass 1) diverges from its final rendered width (Phase 9). This
 * is the dev-mode safety net that prevents the subtle bug class the two-phase
 * algorithm exists to eliminate: descendants resolving cqi against a frozen
 * size that doesn't match the rendered layout → visible misalignment that
 * looks like a font/spacing bug, NOT a layout bug.
 *
 * Gating: `isDevModeAssertionsEnabled()` reads SILVERY_STRICT + NODE_ENV.
 * Default (dev/test): ON. Production: OFF (zero cost).
 *
 * Per dragon bead "Dev-mode invariance assertions:
 *   - Recompute CQ branches with same frozen size → outcomes differ → throw "branch instability"
 *   - Assert container's used main-size equals its frozen query size → throw "intrinsic leak""
 *
 * Phase 1 ships the intrinsic-leak check. Branch-instability requires the
 * silvery-layer CQ resolver to be in place (Phase A) — filed as follow-up.
 */
import { describe, expect, test } from "vitest"
import * as C from "../src/constants.js"
import { createFlexily } from "../src/index.js"

describe("[A0.1] dev-mode invariance — intrinsic-leak assertion", () => {
  test("CQ container with auto-width + no containSize THROWS intrinsic-leak", () => {
    // The classic unsound configuration: auto-width CQ container (no
    // containSize, no explicit width). Pass 1 freezes pre-shrink-wrap size;
    // Phase 9 shrinks to children's intrinsic. The two sizes diverge → throw.
    const flex = createFlexily()
    const cq = flex.createNode()
    cq.setContainerType(C.CONTAINER_TYPE_INLINE_SIZE)
    // NO setContainSize, NO setWidth — the unsound config

    const child = flex.createNode()
    child.setWidth(50)
    cq.insertChild(child, 0)

    expect(() => flex.calculateLayout(cq, 200, 100)).toThrow(/intrinsic-leak/)
  })

  test("error message names both frozen and rendered sizes, plus the fix", () => {
    const flex = createFlexily()
    const cq = flex.createNode()
    cq.setContainerType(C.CONTAINER_TYPE_INLINE_SIZE)

    const child = flex.createNode()
    child.setWidth(50)
    cq.insertChild(child, 0)

    expect(() => flex.calculateLayout(cq, 200, 100)).toThrow(/frozen at 200/)
    expect(() => flex.calculateLayout(cq, 200, 100)).toThrow(/rendered at 50/)
    expect(() => flex.calculateLayout(cq, 200, 100)).toThrow(/setContainSize\(true\)/)
  })

  test("CQ container with containSize=true does NOT throw (frozen == rendered)", () => {
    const flex = createFlexily()
    const cq = flex.createNode()
    cq.setContainerType(C.CONTAINER_TYPE_INLINE_SIZE)
    cq.setContainSize(true) // the fix

    const child = flex.createNode()
    child.setWidth(50)
    cq.insertChild(child, 0)

    expect(() => flex.calculateLayout(cq, 200, 100)).not.toThrow()
  })

  test("CQ container with explicit width does NOT throw (no shrink-wrap path)", () => {
    const flex = createFlexily()
    const cq = flex.createNode()
    cq.setContainerType(C.CONTAINER_TYPE_INLINE_SIZE)
    cq.setWidth(160) // explicit → Phase 9 main-axis override doesn't fire

    const child = flex.createNode()
    child.setWidth(50)
    cq.insertChild(child, 0)

    expect(() => flex.calculateLayout(cq, 200, 100)).not.toThrow()
  })

  test("non-CQ container with auto-width does NOT throw (assertion only fires on CQ containers)", () => {
    // Non-CQ container shrink-wrap is fine — only CQ containers care about
    // frozen vs rendered divergence because only descendants of CQ containers
    // resolve cqi against the frozen value.
    const flex = createFlexily()
    const node = flex.createNode()
    // NO setContainerType → normal node, auto-width, shrink-wraps freely

    const child = flex.createNode()
    child.setWidth(50)
    node.insertChild(child, 0)

    expect(() => flex.calculateLayout(node, 200, 100)).not.toThrow()
    expect(node.getComputedWidth()).toBe(50)
  })

  test("CQ container nested inside flex parent with implicit constraint does not throw", () => {
    // The realistic case: outer flex parent at 200, inner CQ container with
    // explicit width or containSize. No leak should fire.
    const flex = createFlexily()
    const outer = flex.createNode()
    outer.setWidth(200)

    const cq = flex.createNode()
    cq.setContainerType(C.CONTAINER_TYPE_INLINE_SIZE)
    cq.setWidth(160)

    const child = flex.createNode()
    child.setWidthCqi(50) // 50% of 160 = 80

    outer.insertChild(cq, 0)
    cq.insertChild(child, 0)

    expect(() => flex.calculateLayout(outer, 200, 100)).not.toThrow()
    expect(child.getComputedWidth()).toBe(80)
  })

  test("assertion respects 1-cell tolerance for edge-rounding (no false positives on float vs int)", () => {
    // Pass 1 freezes a float (e.g., percent of 100 = 50.0). Phase 10 rounds
    // edges to integer cells. A clean integer width like 200 should be a
    // direct hit (no tolerance needed). This test verifies clean values pass.
    const flex = createFlexily()
    const cq = flex.createNode()
    cq.setContainerType(C.CONTAINER_TYPE_INLINE_SIZE)
    cq.setWidthPercent(50) // 50% of 200 = 100, integer
    cq.setContainSize(true) // prevent shrink-wrap

    const child = flex.createNode()
    child.setWidth(30)
    cq.insertChild(child, 0)

    const outer = flex.createNode()
    outer.setWidth(200)
    outer.insertChild(cq, 0)

    expect(() => flex.calculateLayout(outer, 200, 100)).not.toThrow()
    expect(cq.getComputedWidth()).toBe(100)
  })
})

describe("[A0.1] dev-mode invariance — assertion gating", () => {
  test("assertion is enabled by default in test runs (NODE_ENV !== production)", () => {
    // This is meta-testing: confirms the test environment correctly triggers
    // the assertion. Subsequent assertion tests rely on this.
    const flex = createFlexily()
    const cq = flex.createNode()
    cq.setContainerType(C.CONTAINER_TYPE_INLINE_SIZE)

    const child = flex.createNode()
    child.setWidth(50)
    cq.insertChild(child, 0)

    // If we got here and the assertion didn't fire, test environment isn't
    // configured correctly — but per CLAUDE.md, SILVERY_STRICT=1 is default
    // for all tests.
    expect(() => flex.calculateLayout(cq, 200, 100)).toThrow(/intrinsic-leak/)
  })
})
