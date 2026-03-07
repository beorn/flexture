#!/usr/bin/env bun
/**
 * Mutation testing for Flexture cache code paths.
 *
 * Deliberately injects known-wrong values into cache/invalidation logic
 * and verifies the fuzz suite catches each mutation. If a mutation passes
 * all tests, that's a coverage gap in the test suite.
 *
 * Run: cd vendor/flexture && bun scripts/mutation-test.ts
 */

import { readFileSync, writeFileSync } from "fs"
import { resolve } from "path"

interface Mutation {
  name: string
  file: string
  find: string // Exact string to find (must be unique in file)
  replace: string
  description: string
  equivalent?: boolean // True = mutation disables redundant defense layer, expected to pass
}

const mutations: Mutation[] = [
  {
    name: "skip-resetLayoutCache",
    file: "src/layout-zero.ts",
    find: `  resetLayoutStats()
  // Clear layout cache from previous pass (important for correct layout after tree changes)
  root.resetLayoutCache()`,
    replace: `  resetLayoutStats()
  // Clear layout cache from previous pass (important for correct layout after tree changes)
  // root.resetLayoutCache() // MUTATION: skip cache reset`,
    description:
      "Skip clearing layout cache at start of calculateLayout — stale cache entries should cause wrong results",
    equivalent: true, // markDirty() clears caches for dirty-path nodes; clean nodes' cached entries match constraints → correct
  },
  {
    name: "skip-fingerprint-check",
    file: "src/layout-zero.ts",
    find: `  // Constraint fingerprinting: skip layout if constraints unchanged and node not dirty
  // Use Object.is() for NaN-safe comparison (NaN === NaN is false, Object.is(NaN, NaN) is true)
  const flex = node.flex
  if (
    flex.layoutValid &&
    !node.isDirty() &&
    Object.is(flex.lastAvailW, availableWidth) &&
    Object.is(flex.lastAvailH, availableHeight) &&
    flex.lastDir === direction
  ) {`,
    replace: `  // Constraint fingerprinting: skip layout if constraints unchanged and node not dirty
  // Use Object.is() for NaN-safe comparison (NaN === NaN is false, Object.is(NaN, NaN) is true)
  const flex = node.flex
  if (
    false && // MUTATION: always recompute (never skip)
    flex.layoutValid &&
    !node.isDirty() &&
    Object.is(flex.lastAvailW, availableWidth) &&
    Object.is(flex.lastAvailH, availableHeight) &&
    flex.lastDir === direction
  ) {`,
    description:
      "Disable fingerprint-based skip — forces full recompute every time (should still produce correct results if caching is correct)",
    equivalent: true, // Disables optimization, doesn't affect correctness
  },
  {
    name: "always-return-cached-layout",
    file: "src/node-zero.ts",
    find: `  getCachedLayout(availW: number, availH: number): { width: number; height: number } | null {
    // Never return cached layout for dirty nodes - content may have changed
    if (this._isDirty) {
      return null
    }`,
    replace: `  getCachedLayout(availW: number, availH: number): { width: number; height: number } | null {
    // Never return cached layout for dirty nodes - content may have changed
    // MUTATION: removed dirty check — return stale cache for dirty nodes
    if (false) {
      return null
    }`,
    description: "Return cached layout even for dirty nodes — stale results should cause mismatches",
    equivalent: true, // markDirty() sets _lc0=_lc1=undefined, so getCachedLayout returns null regardless of dirty check
  },
  {
    name: "skip-markDirty-propagation",
    file: "src/node-zero.ts",
    find: `  markDirty(): void {
    let current: Node | null = this
    while (current !== null) {
      // Always clear caches - even if already dirty, a child's content change
      // may invalidate cached layout results that used the old child size
      current._m0 = current._m1 = current._m2 = current._m3 = undefined
      current._lc0 = current._lc1 = undefined
      // Skip setting dirty flag if already dirty (but still cleared caches above)
      if (current._isDirty) break
      current._isDirty = true
      // Invalidate layout fingerprint
      current._flex.layoutValid = false
      current = current._parent
    }
  }`,
    replace: `  markDirty(): void {
    let current: Node | null = this
    // MUTATION: only mark self dirty, don't propagate to ancestors
    if (current !== null) {
      current._m0 = current._m1 = current._m2 = current._m3 = undefined
      current._lc0 = current._lc1 = undefined
      current._isDirty = true
      current._flex.layoutValid = false
    }
  }`,
    description: "Only mark the node itself dirty, skip ancestor propagation — parents won't know children changed",
  },
  {
    name: "skip-save-restore-measureNode-phase5",
    file: "src/layout-zero.ts",
    find: `      // Save/restore layout around measureNode — it overwrites node.layout
      const savedW = child.layout.width
      const savedH = child.layout.height
      measureNode(child, childAvailW, childAvailH, direction)
      measuredW = child.layout.width
      measuredH = child.layout.height
      child.layout.width = savedW
      child.layout.height = savedH`,
    replace: `      // MUTATION: skip save/restore — let measureNode corrupt layout dimensions
      measureNode(child, childAvailW, childAvailH, direction)
      measuredW = child.layout.width
      measuredH = child.layout.height`,
    description:
      "Skip save/restore around measureNode in initial measurement — layout.width/height get corrupted by intrinsic measurements",
  },
  {
    name: "wrong-cache-sentinel",
    file: "src/node-zero.ts",
    find: `      // Invalidate using -1 sentinel (not NaN — NaN is a legitimate "unconstrained" query
      // value and Object.is(NaN, NaN) === true would cause false cache hits)
      if (node._lc0) node._lc0.availW = -1
      if (node._lc1) node._lc1.availW = -1`,
    replace: `      // MUTATION: use NaN as sentinel — causes false cache hits for unconstrained queries
      if (node._lc0) node._lc0.availW = NaN
      if (node._lc1) node._lc1.availW = NaN`,
    description:
      "Use NaN as cache sentinel instead of -1 — Object.is(NaN, NaN) is true, so unconstrained queries will falsely match invalidated entries",
  },
  {
    name: "skip-flexDist-guard",
    file: "src/layout-zero.ts",
    find: `      const flexDistChanged = child.flex.mainSize !== child.flex.baseSize
      const passWidthToChild =
        isRow && mainIsAuto && !hasFlexGrow && !flexDistChanged`,
    replace: `      const flexDistChanged = child.flex.mainSize !== child.flex.baseSize
      const passWidthToChild =
        isRow && mainIsAuto && !hasFlexGrow /* MUTATION: removed flexDistChanged guard */`,
    description:
      "Remove flexDistChanged guard — NaN===NaN matches across passes with different flex distributions, preserving stale dimensions",
  },
  {
    name: "skip-layoutValid-set",
    file: "src/layout-zero.ts",
    find: `  // Update constraint fingerprint - layout is now valid for these constraints
  flex.lastAvailW = availableWidth
  flex.lastAvailH = availableHeight
  flex.lastOffsetX = offsetX
  flex.lastOffsetY = offsetY
  flex.lastDir = direction
  flex.layoutValid = true`,
    replace: `  // Update constraint fingerprint - layout is now valid for these constraints
  flex.lastAvailW = availableWidth
  flex.lastAvailH = availableHeight
  flex.lastOffsetX = offsetX
  flex.lastOffsetY = offsetY
  flex.lastDir = direction
  // MUTATION: don't mark layout as valid — forces recompute every time
  // flex.layoutValid = true`,
    description:
      "Never mark layout as valid — fingerprint check always fails, forcing full recompute (should still be correct if algorithm is sound)",
    equivalent: true, // Disables optimization, doesn't affect correctness
  },
]

async function main() {
  const dir = resolve(import.meta.dir, "..")
  const kmRoot = resolve(dir, "../..")
  let caught = 0
  let equivalentConfirmed = 0
  let unexpectedPass = 0
  let unexpectedFail = 0
  const gaps: string[] = []
  const skipped: string[] = []

  console.log(`Mutation testing for Flexture cache code paths`)
  console.log(`Running ${mutations.length} mutations against relayout-consistency fuzz suite\n`)

  for (const mutation of mutations) {
    const filepath = resolve(dir, mutation.file)
    const original = readFileSync(filepath, "utf8")

    if (!original.includes(mutation.find)) {
      console.error(`SKIP "${mutation.name}" -- pattern not found in ${mutation.file}`)
      skipped.push(mutation.name)
      continue
    }

    // Verify uniqueness
    const firstIdx = original.indexOf(mutation.find)
    const secondIdx = original.indexOf(mutation.find, firstIdx + 1)
    if (secondIdx !== -1) {
      console.error(`SKIP "${mutation.name}" -- pattern appears multiple times in ${mutation.file}`)
      skipped.push(mutation.name)
      continue
    }

    try {
      const mutated = original.replace(mutation.find, mutation.replace)
      writeFileSync(filepath, mutated)

      process.stdout.write(`  "${mutation.name}" ... `)

      const proc = Bun.spawn(
        ["bun", "vitest", "run", "vendor/flexture/tests/relayout-consistency.test.ts", "--reporter=dot"],
        { cwd: kmRoot, stdout: "pipe", stderr: "pipe" },
      )
      const exitCode = await proc.exited

      if (exitCode === 0) {
        if (mutation.equivalent) {
          console.log(`equivalent (expected)`)
          equivalentConfirmed++
        } else {
          console.log(`COVERAGE GAP`)
          console.error(`    ${mutation.description}`)
          gaps.push(mutation.name)
          unexpectedPass++
        }
      } else {
        if (mutation.equivalent) {
          console.log(`UNEXPECTED FAIL (marked equivalent but tests caught it)`)
          unexpectedFail++
        } else {
          console.log(`caught`)
          caught++
        }
      }
    } finally {
      // ALWAYS restore
      writeFileSync(filepath, original)
    }
  }

  const total = caught + equivalentConfirmed + unexpectedPass + unexpectedFail
  console.log(`\n${"=".repeat(60)}`)
  console.log(`Mutation testing: ${caught} caught, ${equivalentConfirmed} equivalent, ${total} total`)
  if (skipped.length > 0) {
    console.log(`Skipped: ${skipped.join(", ")}`)
  }
  if (gaps.length > 0) {
    console.log(`Coverage gaps: ${gaps.join(", ")}`)
  }
  if (unexpectedFail > 0) {
    console.log(`Unexpected failures: ${unexpectedFail} mutations marked equivalent were caught by tests`)
  }
  // Exit non-zero only for real coverage gaps
  process.exit(gaps.length > 0 ? 1 : 0)
}

main()
