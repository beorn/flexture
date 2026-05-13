# Two-phase layout — late-binding contract

Status: A0.1 shipped (engine substrate). Consumers: A0.3 math functions (`min`/`max`/`clamp`), Phase A0.4 onward.

## What the two-phase algorithm guarantees

flexily resolves layout in two well-defined epochs per `calculateLayout` pass:

| Epoch  | What is finalized                                                                            | What is still unknown                              |
| ------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Pass 1 | Each CQ container's **frozen inline-size** (`node._frozenQuerySize`)                         | Children's CQ branch resolutions, post-Pass-2 sizes |
| Pass 2 | Each descendant's CQ branch (via `setContainerQueryStyle`); final `layout.width`/`.height`   | nothing — layout is complete                       |

Pass 1 captures the parent's constraint-derived inline-size BEFORE recursing into children. Pass 2 runs on top of Pass 1's frozen values — by then, `findContainerQuerySize(child)` returns a stable result for any descendant.

This means: at any point in Pass 2, a consumer of cqi can ask "what is my CQ container's inline-size?" and get a deterministic answer that won't change as Pass 2 progresses.

## Why A0.3 (math functions) needs this contract

CSS math functions like `min()`/`max()`/`clamp()` mix unit kinds:

```ts
paddingLeft = "max(1, 2cqi)"
```

If math functions evaluated **eagerly** at Pass 1, the cqi argument would be unresolved (`cqi = 0` because Pass 1 hasn't published containers yet) → `max(1, 0)` → 1 always. The math function would silently collapse in small containers — exactly the trap the contract exists to prevent.

A0.3 implements math functions as **late-bound**: they parse at style-set time (recording the expression tree) and evaluate at Pass 2 resolveValue call sites, where queryInlineSize is available via `findContainerQuerySize`. The same call-site hook that consumes raw `cqi` values consumes math-wrapped ones.

## The Pass-2 hook contract for math functions

Every flexily resolveValue call site that accepts cqi MUST also accept math expressions wrapping cqi. The signature stays unchanged:

```ts
resolveValue(value: Value, availableSize: number, queryInlineSize?: number): number
```

A math-expression `Value` (added in A0.3) carries an `expr: MathExpr` field. `resolveValue` recursively evaluates the expression against the same `availableSize` and `queryInlineSize` it would for a plain cqi value. The expression's leaves are POINT, PERCENT, CQI, CQMIN values resolved via the existing per-unit logic.

This contract has two binding rules:

1. **Math functions evaluate at the same epoch as their leaf units.** A `max(1, 2cqi)` resolves at Pass 2 because cqi is a Pass-2 unit. A `max(1, 50%)` could resolve at Pass 1 or Pass 2 — either is correct because percent doesn't depend on Pass 1 outputs.

2. **No epoch crossing.** A math function cannot mix a Pass-1-only unit (none exist today) with a Pass-2 unit unless the implementation explicitly defers to Pass 2. This is enforced by the late-binding architecture: math expressions are never partially evaluated.

## What changed in A0.1 to enable A0.3

- **Pass 1 freeze** (`layoutNode` Phase 3a) — every CQ container gets a finite `_frozenQuerySize` BEFORE child layout recurses. Late-binding consumers can rely on this.
- **`findContainerQuerySize(node)`** — pure read of the parent chain. Idempotent, safe to call from any Pass-2 resolveValue site.
- **`resolveValue(value, available, queryInlineSize)`** — third parameter is the late-binding hook. Math functions in A0.3 wrap this with their evaluator.

## What A0.3 still has to do

- Extend the `Value` type with a math-expression variant: `{ value: 0, unit: UNIT_CALC, expr: MathExpr }`.
- Parse `min(...)`, `max(...)`, `clamp(...)` strings (silvery-layer) into the `expr` tree.
- Extend `resolveValue` with a `case UNIT_CALC` branch that evaluates `expr` recursively, passing through `availableSize` + `queryInlineSize`.
- Property tests: `min(a,b) ≤ both`; `max(a,b) ≥ both`; `clamp(min,val,max)` clamps; nested calls work.

A0.3 should NOT need to modify Pass 1, Phase 9, or any layout phase outside of resolveValue. If it does, the late-binding contract has been violated — escalate before implementing.

## What the contract does NOT promise

- **Branch stability**: Pass 2 may resolve a CQ branch differently if the user mutates styles inside `setContainerQueryResolver`. The dev-mode "branch instability" assertion (filed as Phase A follow-up) catches this — it does NOT belong in A0.3.
- **Cross-pass caching**: each `calculateLayout` runs Pass 1 and Pass 2 fresh. Math functions cannot memoize across calls.
- **Out-of-band Pass 1 access**: math functions cannot peek at Pass-1 results of OTHER nodes. They can only see the resolved `queryInlineSize` for THEIR node's CQ ancestor.
