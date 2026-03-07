# Contributing to Flexture

Thanks for your interest in contributing to Flexture! This guide covers the essentials.

## Prerequisites

- **Bun** >= 1.0 (runtime and package manager)
- **Node.js** >= 18 (for TypeScript tooling)
- **TypeScript** >= 5.7

## Getting Started

```bash
git clone https://github.com/beorn/flexture.git
cd flexture
bun install
bun run build       # Compile TypeScript
bun run typecheck   # Type check without emitting
```

## Running Tests

```bash
bun test                    # All tests (1368)
bun test tests/layout.test.ts   # Specific test file
bun test --watch            # Watch mode
```

The most important test layer is the **re-layout consistency suite** (1200+ fuzz tests). Always run it after layout changes:

```bash
bun test tests/relayout-consistency.test.ts
```

## Running Benchmarks

Performance is Flexture's core value proposition. Any change touching hot paths (`src/layout-zero.ts`, `src/node-zero.ts`) **must** include benchmark verification.

```bash
# 1. Check for CPU-heavy processes that would skew results
top -l 1 -n 5 -stats command,cpu | head -10

# 2. Capture baseline BEFORE changes
bun bench bench/yoga-compare-warmup.bench.ts > /tmp/bench-before.txt

# 3. Make your changes...

# 4. Re-check CPU load (must match pre-change conditions)
top -l 1 -n 5 -stats command,cpu | head -10

# 5. Capture AFTER changes
bun bench bench/yoga-compare-warmup.bench.ts > /tmp/bench-after.txt

# 6. Compare
diff /tmp/bench-before.txt /tmp/bench-after.txt
```

**Acceptable performance impact**: < 5% regression for minor features; no regression for refactoring.

## Code Structure

```
src/
├── index.ts        # Main export
├── node-zero.ts    # Node class with FlexInfo (hot path)
├── layout-zero.ts  # Layout algorithm (~2300 lines, hot path)
├── constants.ts    # Flexbox constants (Yoga-compatible)
├── types.ts        # TypeScript interfaces
├── utils.ts        # Shared utilities
└── classic/        # Allocating algorithm (for debugging)
```

See `docs/` for detailed documentation on the algorithm, API, performance, and testing methodology.

## Pull Request Guidelines

1. **Run the full test suite** (`bun test`) — all 1368 tests must pass
2. **Run `bun run typecheck`** — no type errors
3. **Benchmark if touching hot paths** — include before/after numbers in the PR description
4. **Keep Yoga API compatibility** — don't break the public API surface
5. **Don't allocate in hot paths** — `layout-zero.ts` avoids `new` in layout loops by design
6. **Don't add WASM** — pure JavaScript is the point

## Architecture Principles

- **Zero-allocation design** in the layout engine — reuses FlexInfo objects
- **Yoga API compatibility** — same constants, same method names
- **Two algorithms**: zero (production, zero-alloc) and classic (debugging, allocating)

For the full development workflow and detailed guidance, see [CLAUDE.md](CLAUDE.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
