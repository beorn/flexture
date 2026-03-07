# Flexture v1.0 Roadmap

Current version: **0.1.0**

## What 1.0 Means

A 1.0 release signals: the public API is stable, the layout algorithm is correct, performance claims are verified, and the package is published on npm for external adoption. After 1.0, breaking changes require a major version bump.

## Release Criteria

Every box must be checked before tagging 1.0.

### Correctness

- [x] All Yoga compatibility tests pass (41/41)
- [x] Re-layout fuzz tests pass (1200+)
- [x] Mutation testing validates fuzz suite catches known cache mutations
- [x] All feature tests pass (~110)
- [x] Total test count: 1368 passing
- [ ] No known layout correctness bugs (audit open issues before release)
- [x] Intentional Yoga divergences documented (CSS overflow:hidden behavior)

### API Stability

- [x] Yoga-compatible API surface (same constants, same method names)
- [x] Two entry points: `@beorn/flexture` (zero-alloc) and `@beorn/flexture/classic` (allocating)
- [ ] API surface audit: review all public exports, remove any accidental leaks
- [ ] TypeScript declaration files (`dist/`) build cleanly and match source types
- [ ] No planned breaking changes (or: list remaining breaking changes and execute them pre-1.0)

### Performance

- [x] Benchmark suite exists (`bench/yoga-compare-warmup.bench.ts`, `bench/incremental.bench.ts`)
- [x] Performance claims documented (`docs/performance.md`)
- [ ] Benchmark numbers verified on clean machine and recorded in release notes
- [x] Bundle size measured and documented:
  - Measured: 47 KB minified / 16 KB gzipped (35 KB / 11 KB without `debug`)
  - Reproducible via `bun scripts/measure-bundle.ts`

### Packaging

- [x] `package.json` has `engines` field (`node >=18`, `bun >=1.0`)
- [x] `package.json` has correct `exports` map (`.` and `./classic`)
- [x] `files` field limits published content to `dist` and `src`
- [ ] `npm pack --dry-run` produces a clean, minimal tarball
- [ ] Published on npm as `@beorn/flexture`
- [x] MIT license

### Documentation

- [x] README with usage, performance, and API overview
- [x] `CONTRIBUTING.md` with dev setup, testing, and PR guidelines
- [x] `docs/api.md` -- complete API reference
- [x] `docs/performance.md` -- benchmarks and methodology
- [x] `docs/testing.md` -- test infrastructure and methodology
- [x] `docs/algorithm.md` -- layout algorithm explanation
- [x] `docs/yoga-comparison.md` -- feature comparison
- [x] `docs/incremental-layout-bugs.md` -- bug taxonomy
- [ ] CHANGELOG.md started (or generated from git history at release time)

## Known Gaps

1. ~~**Bundle audit** (bead `km-flexture.bundle-audit`)~~ -- Done. `bun scripts/measure-bundle.ts` measures all entry points. README and docs updated with accurate numbers.
2. **npm publish** (bead `km-flexture.npm-publish`) -- blocked by vendor rename (`km-infra.vendor-rename-impl`). The package name `@beorn/flexture` needs to be claimed on npm.
3. **API surface audit** -- no formal review of which symbols are exported vs. internal. A pre-1.0 pass should ensure only intentional public API is accessible via the `exports` map.

## What's NOT in 1.0

These are out of scope for the initial stable release:

- **CSS Grid** -- Flexture is a flexbox engine. Grid is a different algorithm.
- **Text layout** -- Flexture computes box positions. Text measurement is the consumer's responsibility (via measure functions).
- **Multi-thread / worker support** -- The API is synchronous by design. Consumers can run it in a worker if needed.
- **Browser build** -- The npm package targets Node.js/Bun. A browser-ready bundle (ESM) is a nice-to-have but not a 1.0 gate.

## Semver Policy

After 1.0:

| Change                                                                         | Version Bump                 |
| ------------------------------------------------------------------------------ | ---------------------------- |
| Breaking API change (renamed method, removed export, changed default behavior) | **Major** (2.0, 3.0)         |
| New feature (new method, new constant, new export)                             | **Minor** (1.1, 1.2)         |
| Bug fix, performance improvement, documentation                                | **Patch** (1.0.1, 1.0.2)     |
| Intentional Yoga divergence (following CSS spec where Yoga doesn't)            | **Minor** with documentation |

**Yoga compatibility contract**: The Yoga-compatible API surface is part of the public API. Removing or renaming Yoga-compatible methods/constants is a breaking change. Adding Flexture-specific extensions is a minor change.

## Release Sequence

Flexture should reach 1.0 **before** inkx, because:

1. Flexture has a smaller, more focused API surface (layout engine only)
2. Flexture already passes 1368 tests including comprehensive fuzz testing
3. inkx depends on Flexture -- a stable Flexture simplifies inkx's own 1.0 story
4. The main blocker (vendor rename + npm publish) is shared with inkx

Suggested order:

1. Complete vendor rename (`km-infra.vendor-rename-impl`)
2. Run bundle audit, verify all criteria above
3. Tag and publish `@beorn/flexture@1.0.0`
4. Update inkx's `peerDependencies` to `@beorn/flexture@^1.0.0`
