# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `Node.getMinContent(direction)` — recursive intrinsic min-content as a property of every node. Container min-content is derived from children (sum on main axis, max on cross axis); leaf measureFunc nodes query the measurer with `MEASURE_MODE_MIN_CONTENT`. Cached per-node alongside the existing measure cache; invalidated by `markDirty()`, `insertChild`/`removeChild`, and intrinsic-affecting style setters (padding / border / gap / flexDirection).

### Changed

- **CSS §4.5 auto-min-size for containers**: container nodes now use spec-correct recursive min-content instead of the prior `baseSize` (max-content) approximation. `Box` wrappers around `<Text wrap="wrap">` no longer pin sibling content at the longest unbreakable word — the row shrinks to its true min-content. Includes the CSS §4.5 specified-size suggestion cap so `flexBasis: 0` / `flex: 1 1 0` Fill-leader patterns continue to behave as expected (auto-min = `min(content-min, specified-size)`). Yoga preset is unaffected. `setMinWidth(0)` remains the canonical CSS escape hatch for non-wrappable Text and for containers narrower than their longest unbreakable word.

## [0.5.1] - 2026-04-09

### Changed

- Renamed `@bearly/vitepress-enrich` to `vitepress-enrich`

### Added

- Pretext integration guide page
- Glossary tooltip CSS for ecosystem cross-links
- Navigation submenu for Guide section

### Fixed

- VitePress build: added `vitepress-plugin-llms` and `vitepress-enrich` to docs deps (CI fix)
- Sitemap URLs, adopted vitepress-enrich for SEO
- CI: use `bunx --bun` for vitepress, drop old bun versions, remove Node 20

### Docs

- Removed km references from public docs
- Restored composable API section (pipe/createBareFlexily/plugins)
- Updated problem statement in tagline, benchmarks button, pretext link
- Bjorn → Bjørn in author references

## [0.5.0] - 2026-03-30

### Added

- **Composable engine**: `createFlexily()` batteries-included factory, `createBareFlexily()` + `pipe()` for custom plugin composition
- **TextLayoutService**: pluggable text measurement interface with prepare/layout two-phase API
- **MonospaceMeasurer**: terminal text measurement (1 char = 1 cell), default for `createFlexily()`
- **DeterministicTestMeasurer**: fixed grapheme widths (Latin 0.8, CJK 1.0, emoji 1.8) for CI-stable tests
- **PretextMeasurer**: adapter for [@chenglou/pretext](https://github.com/chenglou/pretext) proportional font measurement
- **FlexilyNode**: `setTextContent(text, style?)` and `getTextContent()` — auto-creates MeasureFunc from TextLayoutService
- 31 new tests for the composable API (1561 total)
- Full documentation: API reference, getting-started, README updated

### Changed

- `FlexilyNode` is a mixin on Node (zero overhead), not a wrapper class

## [0.3.3] - 2026-03-10

### Fixed

- **measureNode layout corruption**: `measureNode` overwrote `layout.width/height` on clean nodes during partial re-layout, causing text to bleed past card borders
- **NaN cache sentinel**: `resetLayoutCache()` used `NaN` as invalidation sentinel, but `NaN` is a legitimate "unconstrained" query — `Object.is(NaN, NaN)` caused false cache hits returning stale values. Fixed by using `-1` sentinel.
- **Fingerprint mismatch with parent override**: Auto-sized children received `NaN` as `availableWidth`, so fingerprint matched across passes even when parent's flex distribution changed their actual size. Fixed by passing actual width when flex distribution changes.

### Added

- Re-layout consistency test suite (1100+ tests) using differential oracle pattern
- Fuzz testing: 500-seed random tree generation with partial dirty marking
- Cache invalidation stress tests (100 seeds at varying root widths)
- Idempotency fuzz (200 seeds)
- Resize round-trip fuzz (200 seeds)
- Multi-step constraint sweep fuzz (100 seeds)
- `diffLayouts()` diagnostic with NaN-safe comparison for debugging
- Rich benchmark suite: TUI-realistic trees, measure functions, property diversity, incremental re-layout
- Documentation: `docs/testing.md` (test methodology), `docs/incremental-layout-bugs.md` (bug taxonomy)

### Changed

- Updated performance docs with accurate multi-scenario benchmarks (initial, incremental, no-change, resize)
- Corrected performance claims: Flexily is 1.5-2.5x faster for initial layout, 5.5x for no-change, Yoga faster for incremental re-layout

## [0.1.0] - 2026-02-06

### Added

- Core flexbox layout algorithm (direction, grow, shrink, basis)
- Alignment (justify-content, align-items, align-self, align-content)
- Spacing (gap, padding, margin, border)
- Constraints (min/max width/height)
- Measure functions for content-based sizing (e.g., text)
- Baseline functions for alignment
- Absolute positioning
- Aspect ratio support
- Flex-wrap (multi-line layouts)
- Logical edges (EDGE_START/END) with full RTL support
- Zero-allocation layout algorithm (layout-zero.ts) for high-frequency recalculation
- Classic allocating algorithm (layout.ts) for debugging and comparison
- Dirty tracking for incremental relayout
- Yoga API compatibility (41/41 comparison tests passing)
- 524 tests total
- 1.5-2.5x faster initial layout than Yoga, 5x smaller bundle, zero dependencies

[Unreleased]: https://github.com/beorn/flexily/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/beorn/flexily/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/beorn/flexily/compare/v0.3.3...v0.5.0
[0.3.3]: https://github.com/beorn/flexily/compare/v0.1.0...v0.3.3
[0.1.0]: https://github.com/beorn/flexily/releases/tag/v0.1.0
