/**
 * A0.3 — CSS math functions: min() / max() / clamp().
 *
 * Late-bound per the contract in vendor/flexily/docs/two-phase-layout.md:
 * math functions evaluate at the SAME epoch as their leaf units. A min(1, 2cqi)
 * resolves at Pass 2 because cqi is a Pass-2 unit — eager Pass-1 evaluation
 * would see cqi = 0 and collapse the function to 1 in small containers, the
 * exact trap A0.3 exists to prevent.
 *
 * Tests cover:
 *   - Property: min ≤ all args; max ≥ all args; clamp ∈ [min, max]
 *   - Edge: clamp degenerates to min when min > max (CSS spec)
 *   - Edge: empty min/max fall back to 0 (defensive)
 *   - Nesting: math inside math
 *   - cqi inside math: cqi resolves to 0 without CQ ancestor, math composes
 *   - Engine integration: a Box with style.width = min(80, 200cqi) lays out
 *     correctly under a CQ container
 */
import { describe, expect, test } from "vitest"
import * as C from "../src/constants.js"
import { createFlexily } from "../src/index.js"
import type { MathExpr, Value } from "../src/types.js"
import { evaluateMathExpr, resolveValue } from "../src/utils.js"

const pt = (n: number): Value => ({ value: n, unit: C.UNIT_POINT })
const cqi = (n: number): Value => ({ value: n, unit: C.UNIT_CQI })

describe("[A0.3] evaluateMathExpr — min / max / clamp", () => {
  test("min returns smallest", () => {
    expect(evaluateMathExpr({ fn: "min", args: [pt(80), pt(120), pt(40)] }, NaN, NaN)).toBe(40)
  })

  test("max returns largest", () => {
    expect(evaluateMathExpr({ fn: "max", args: [pt(80), pt(120), pt(40)] }, NaN, NaN)).toBe(120)
  })

  test("clamp returns val when in range", () => {
    const expr: MathExpr = { fn: "clamp", args: [pt(10), pt(50), pt(100)] }
    expect(evaluateMathExpr(expr, NaN, NaN)).toBe(50)
  })

  test("clamp returns min when val < min", () => {
    const expr: MathExpr = { fn: "clamp", args: [pt(10), pt(5), pt(100)] }
    expect(evaluateMathExpr(expr, NaN, NaN)).toBe(10)
  })

  test("clamp returns max when val > max", () => {
    const expr: MathExpr = { fn: "clamp", args: [pt(10), pt(200), pt(100)] }
    expect(evaluateMathExpr(expr, NaN, NaN)).toBe(100)
  })

  test("clamp(min > max, val, max): min wins (CSS spec)", () => {
    // CSS: when minimum > maximum, minimum dominates.
    const expr: MathExpr = { fn: "clamp", args: [pt(80), pt(50), pt(40)] }
    expect(evaluateMathExpr(expr, NaN, NaN)).toBe(80)
  })

  test("empty min args fall back to 0 (defensive — CSS disallows)", () => {
    expect(evaluateMathExpr({ fn: "min", args: [] }, NaN, NaN)).toBe(0)
  })

  test("empty max args fall back to 0 (defensive — CSS disallows)", () => {
    expect(evaluateMathExpr({ fn: "max", args: [] }, NaN, NaN)).toBe(0)
  })

  test("nested: max(10, min(20, 30)) === max(10, 20) === 20", () => {
    const expr: MathExpr = {
      fn: "max",
      args: [pt(10), { fn: "min", args: [pt(20), pt(30)] }],
    }
    expect(evaluateMathExpr(expr, NaN, NaN)).toBe(20)
  })

  test("deeply nested: clamp(min(5, 10), max(15, 20), min(50, 100))", () => {
    const expr: MathExpr = {
      fn: "clamp",
      args: [
        { fn: "min", args: [pt(5), pt(10)] }, // 5
        { fn: "max", args: [pt(15), pt(20)] }, // 20
        { fn: "min", args: [pt(50), pt(100)] }, // 50
      ],
    }
    expect(evaluateMathExpr(expr, NaN, NaN)).toBe(20) // 5 ≤ 20 ≤ 50
  })

  test("min args resolve at the same epoch — cqi without CQ ancestor → 0; min(1, 0) = 0", () => {
    // The classic collapse trap the dragon bead calls out. Without A0.3,
    // padding="2cqi" in a small container collapses to floor(0.something) = 0.
    // With A0.3 + max(1, 2cqi), padding stays at least 1 in small containers.
    // Here we test the COLLAPSE path: min(1, 2cqi) in a no-CQ context →
    // 2cqi resolves to 0 → min(1, 0) = 0. The fix is max(1, 2cqi).
    const collapse: MathExpr = { fn: "min", args: [pt(1), cqi(2)] }
    expect(evaluateMathExpr(collapse, NaN, NaN)).toBe(0)
  })

  test("max args resolve at the same epoch — max(1, 2cqi) protects against cqi collapse", () => {
    // This is THE point of A0.3: collapse-safety for cqi in small containers.
    const protected_: MathExpr = { fn: "max", args: [pt(1), cqi(2)] }
    expect(evaluateMathExpr(protected_, NaN, NaN)).toBe(1)
  })

  test("cqi args resolve against queryInlineSize when CQ ancestor exists", () => {
    // queryInlineSize=100 → cqi(2) = 2 cells (2% of 100). max(1, 2) = 2.
    const expr: MathExpr = { fn: "max", args: [pt(1), cqi(2)] }
    expect(evaluateMathExpr(expr, NaN, 100)).toBe(2)
  })
})

describe("[A0.3] resolveValue with UNIT_CALC", () => {
  test("Value with unit=CALC + expr evaluates via evaluateMathExpr", () => {
    const v: Value = {
      value: 0, // ignored for CALC
      unit: C.UNIT_CALC,
      expr: { fn: "max", args: [pt(10), pt(20)] },
    }
    expect(resolveValue(v, NaN, NaN)).toBe(20)
  })

  test("Value with unit=CALC but no expr resolves to 0 (defensive)", () => {
    const v: Value = { value: 0, unit: C.UNIT_CALC }
    expect(resolveValue(v, NaN, NaN)).toBe(0)
  })

  test("CALC with cqi children resolves with queryInlineSize threading", () => {
    const v: Value = {
      value: 0,
      unit: C.UNIT_CALC,
      expr: { fn: "max", args: [pt(1), cqi(50)] },
    }
    // queryInlineSize=80 → cqi(50) = 40. max(1, 40) = 40.
    expect(resolveValue(v, NaN, 80)).toBe(40)
  })
})

describe("[A0.3] engine integration — Box.width with min/max", () => {
  test("Box width = max(80, 2cqi) inside CQ ancestor uses larger value", () => {
    // Direct construction of a CALC value on width (silvery's parser will do this
    // at the React seam in a follow-up commit).
    const flex = createFlexily()
    const outer = flex.createNode()
    outer.setContainerType(C.CONTAINER_TYPE_INLINE_SIZE)
    outer.setContainSize(true)
    outer.setWidth(200)

    const box = flex.createNode()
    // width = max(80, 50cqi) → max(80, 100) = 100
    box.style.width = {
      value: 0,
      unit: C.UNIT_CALC,
      expr: { fn: "max", args: [pt(80), cqi(50)] },
    }

    outer.insertChild(box, 0)
    flex.calculateLayout(outer, 200, 100)

    expect(box.getComputedWidth()).toBe(100) // max(80, 100) = 100
  })

  test("Box width = min(80, 200cqi) caps via numeric arg", () => {
    const flex = createFlexily()
    const outer = flex.createNode()
    outer.setContainerType(C.CONTAINER_TYPE_INLINE_SIZE)
    outer.setContainSize(true)
    outer.setWidth(200)

    const box = flex.createNode()
    box.style.width = {
      value: 0,
      unit: C.UNIT_CALC,
      expr: { fn: "min", args: [pt(80), cqi(100)] }, // min(80, 200) = 80
    }

    outer.insertChild(box, 0)
    flex.calculateLayout(outer, 200, 100)

    expect(box.getComputedWidth()).toBe(80)
  })

  test("Box width = clamp(40, 50cqi, 120) bounded", () => {
    const flex = createFlexily()
    const outer = flex.createNode()
    outer.setContainerType(C.CONTAINER_TYPE_INLINE_SIZE)
    outer.setContainSize(true)
    outer.setWidth(200)

    const box = flex.createNode()
    box.style.width = {
      value: 0,
      unit: C.UNIT_CALC,
      expr: {
        fn: "clamp",
        args: [pt(40), cqi(50), pt(120)], // clamp(40, 100, 120) = 100
      },
    }

    outer.insertChild(box, 0)
    flex.calculateLayout(outer, 200, 100)

    expect(box.getComputedWidth()).toBe(100)
  })
})

describe("[A0.3] property tests", () => {
  test("min(a, b) ≤ both args (1000 random pairs)", () => {
    let seed = 0xdeadbeef
    const rand = (): number => {
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      return ((seed >>> 0) % 1000) / 10
    }
    for (let i = 0; i < 1000; i++) {
      const a = rand()
      const b = rand()
      const result = evaluateMathExpr({ fn: "min", args: [pt(a), pt(b)] }, NaN, NaN)
      expect(result).toBeLessThanOrEqual(a)
      expect(result).toBeLessThanOrEqual(b)
    }
  })

  test("max(a, b) ≥ both args (1000 random pairs)", () => {
    let seed = 0x12345678
    const rand = (): number => {
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      return ((seed >>> 0) % 1000) / 10
    }
    for (let i = 0; i < 1000; i++) {
      const a = rand()
      const b = rand()
      const result = evaluateMathExpr({ fn: "max", args: [pt(a), pt(b)] }, NaN, NaN)
      expect(result).toBeGreaterThanOrEqual(a)
      expect(result).toBeGreaterThanOrEqual(b)
    }
  })

  test("clamp(lo, val, hi) ∈ [lo, max(lo, hi)] (1000 random triples)", () => {
    let seed = 0xfeedface
    const rand = (): number => {
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      return ((seed >>> 0) % 1000) / 10
    }
    for (let i = 0; i < 1000; i++) {
      const lo = rand()
      const val = rand()
      const hi = rand()
      const result = evaluateMathExpr({ fn: "clamp", args: [pt(lo), pt(val), pt(hi)] }, NaN, NaN)
      // CSS clamp: result ≥ lo always; result ≤ hi UNLESS lo > hi (then result = lo)
      expect(result).toBeGreaterThanOrEqual(lo)
      if (lo <= hi) {
        expect(result).toBeLessThanOrEqual(hi)
      }
    }
  })
})
