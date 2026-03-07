#!/usr/bin/env bun
/**
 * Measure bundle sizes for flexture entry points.
 *
 * Builds minified browser bundles and measures raw + gzipped sizes.
 * Also checks whether the `debug` dependency leaks into production builds.
 *
 * Run: cd vendor/flexture && bun scripts/measure-bundle.ts
 */

import { gzipSync } from "zlib"
import { resolve, basename } from "path"
import { mkdirSync, rmSync, readFileSync, existsSync } from "fs"

const ROOT = resolve(import.meta.dirname, "..")

interface EntryConfig {
  name: string
  entrypoint: string
  description: string
}

const entries: EntryConfig[] = [
  {
    name: "Full package",
    entrypoint: resolve(ROOT, "src/index.ts"),
    description: "import { Node, ... } from 'flexture'",
  },
  {
    name: "Constants only",
    entrypoint: resolve(ROOT, "src/constants.ts"),
    description: "import { FLEX_DIRECTION_ROW, ... } from 'flexture' (constants only)",
  },
  {
    name: "Classic algorithm",
    entrypoint: resolve(ROOT, "src/index-classic.ts"),
    description: "import { Node, ... } from 'flexture/classic'",
  },
]

interface BundleResult {
  name: string
  description: string
  minifiedBytes: number
  gzipBytes: number
  includesDebug: boolean
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  return kb >= 100 ? `${Math.round(kb)} KB` : `${kb.toFixed(1)} KB`
}

async function measureEntry(entry: EntryConfig, outDir: string): Promise<BundleResult> {
  const outFile = resolve(outDir, `${basename(entry.entrypoint, ".ts")}.min.js`)

  const result = await Bun.build({
    entrypoints: [entry.entrypoint],
    outdir: outDir,
    naming: `${basename(entry.entrypoint, ".ts")}.min.js`,
    minify: true,
    target: "browser",
    // Mark debug as external initially to see if it's referenced
    // Actually, bundle everything to measure true size
  })

  if (!result.success) {
    console.error(`Build failed for ${entry.name}:`)
    for (const msg of result.logs) {
      console.error(`  ${msg}`)
    }
    process.exit(1)
  }

  const contents = readFileSync(outFile)
  const gzipped = gzipSync(contents)
  const text = contents.toString("utf-8")

  // Check if the `debug` npm package is bundled (look for its humanize helper or namespace logic)
  const includesDebug = text.includes("humanize") || text.includes("createDebug")

  return {
    name: entry.name,
    description: entry.description,
    minifiedBytes: contents.length,
    gzipBytes: gzipped.length,
    includesDebug,
  }
}

async function main() {
  const outDir = resolve(ROOT, ".bundle-measure")

  // Clean previous measurement
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true })
  }
  mkdirSync(outDir, { recursive: true })

  const results: BundleResult[] = []

  for (const entry of entries) {
    const result = await measureEntry(entry, outDir)
    results.push(result)
  }

  // Also build with debug marked as external to measure the delta
  const fullWithoutDebugFile = resolve(outDir, "index-no-debug.min.js")
  const resultNoDebug = await Bun.build({
    entrypoints: [entries[0].entrypoint],
    outdir: outDir,
    naming: "index-no-debug.min.js",
    minify: true,
    target: "browser",
    external: ["debug", "decant"],
  })

  let debugDelta: { raw: number; gzip: number } | null = null
  if (resultNoDebug.success && existsSync(fullWithoutDebugFile)) {
    const contentsNoDebug = readFileSync(fullWithoutDebugFile)
    const gzippedNoDebug = gzipSync(contentsNoDebug)
    debugDelta = {
      raw: results[0].minifiedBytes - contentsNoDebug.length,
      gzip: results[0].gzipBytes - gzippedNoDebug.length,
    }
  }

  // Measure Yoga for comparison (WASM + JS, same methodology)
  let yogaSize: { raw: number; gzip: number } | null = null
  const yogaWasm = resolve(ROOT, "node_modules/yoga-wasm-web/dist/yoga.wasm")
  const yogaJs = resolve(ROOT, "node_modules/yoga-wasm-web/dist/index.js")
  const yogaWrap = resolve(ROOT, "node_modules/yoga-wasm-web/dist/wrapAsm-f766f97f.js")
  if (existsSync(yogaWasm) && existsSync(yogaJs)) {
    const wasmBuf = readFileSync(yogaWasm)
    const jsBuf = readFileSync(yogaJs)
    const wrapBuf = existsSync(yogaWrap) ? readFileSync(yogaWrap) : Buffer.alloc(0)
    const totalRaw = wasmBuf.length + jsBuf.length + wrapBuf.length
    const totalGzip =
      gzipSync(wasmBuf).length + gzipSync(jsBuf).length + (wrapBuf.length > 0 ? gzipSync(wrapBuf).length : 0)
    yogaSize = { raw: totalRaw, gzip: totalGzip }
  }

  // Clean up
  rmSync(outDir, { recursive: true })

  // Output results
  console.log("# Flexture Bundle Size Audit\n")

  console.log("## Entry Points\n")
  console.log("| Entry point | Minified | Gzipped | `debug` included? |")
  console.log("| --- | ---: | ---: | --- |")

  for (const r of results) {
    console.log(
      `| ${r.name} | ${formatBytes(r.minifiedBytes)} | ${formatBytes(r.gzipBytes)} | ${r.includesDebug ? "Yes" : "No"} |`,
    )
  }

  console.log("")

  if (yogaSize) {
    const flextureFull = results[0]
    const rawRatio = (yogaSize.raw / flextureFull.minifiedBytes).toFixed(1)
    const gzipRatio = (yogaSize.gzip / flextureFull.gzipBytes).toFixed(1)

    console.log("## Yoga Comparison\n")
    console.log("|         | Yoga | Flexture | Ratio |")
    console.log("| ------- | ---: | ----: | ----- |")
    console.log(
      `| Minified | ${formatBytes(yogaSize.raw)} | ${formatBytes(flextureFull.minifiedBytes)} | **${rawRatio}x smaller** |`,
    )
    console.log(
      `| Gzipped | ${formatBytes(yogaSize.gzip)} | ${formatBytes(flextureFull.gzipBytes)} | **${gzipRatio}x smaller** |`,
    )

    if (debugDelta) {
      const flexturenodebugRaw = flextureFull.minifiedBytes - debugDelta.raw
      const flexturenodebugGzip = flextureFull.gzipBytes - debugDelta.gzip
      const rawRatioNoDebug = (yogaSize.raw / flexturenodebugRaw).toFixed(1)
      const gzipRatioNoDebug = (yogaSize.gzip / flexturenodebugGzip).toFixed(1)
      console.log("")
      console.log("Without `debug` dependency (tree-shaken):\n")
      console.log("|         | Yoga | Flexture | Ratio |")
      console.log("| ------- | ---: | ----: | ----- |")
      console.log(
        `| Minified | ${formatBytes(yogaSize.raw)} | ${formatBytes(flexturenodebugRaw)} | **${rawRatioNoDebug}x smaller** |`,
      )
      console.log(
        `| Gzipped | ${formatBytes(yogaSize.gzip)} | ${formatBytes(flexturenodebugGzip)} | **${gzipRatioNoDebug}x smaller** |`,
      )
    }

    console.log("")
  }

  if (debugDelta) {
    console.log("## `debug` Dependency Impact\n")
    console.log(
      `The \`debug\` dependency (via \`logger.ts\`) adds **${formatBytes(debugDelta.raw)}** minified / **${formatBytes(debugDelta.gzip)}** gzipped to the full bundle.`,
    )
    console.log("Bundlers that tree-shake dynamic `require()` will exclude it automatically.")
    console.log("")
  }

  console.log("## Measurement Method\n")
  console.log("- Bundler: `Bun.build()` with `minify: true`, `target: 'browser'`")
  console.log("- Yoga: raw file sizes (WASM + JS + wrapper), not bundled")
  console.log("- Gzip: Node.js `zlib.gzipSync()` (default compression level)")
  console.log(`- Date: ${new Date().toISOString().split("T")[0]}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
