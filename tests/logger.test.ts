import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "bun:test"

const here = dirname(fileURLToPath(import.meta.url))
const flexilyEntry = resolve(here, "../src/index.ts")

describe("logger module shape", () => {
  test("Flexily source can be bundled behind a sync require", async () => {
    const dir = mkdtempSync(join(tmpdir(), "flexily-require-build-"))
    try {
      const entry = join(dir, "entry.ts")
      writeFileSync(
        entry,
        [
          `const flexily = require(${JSON.stringify(flexilyEntry)})`,
          "if (!flexily.Node) throw new Error('missing Node export')",
          "",
        ].join("\n"),
      )

      const result = await Bun.build({
        entrypoints: [entry],
        outdir: join(dir, "dist"),
        target: "node",
      })

      expect(result.logs.map((log) => log.message)).toEqual([])
      expect(result.success).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
