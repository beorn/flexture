/**
 * Debug wrap-reverse layout.
 */

import * as Flexture from "../src/index.js"
import initYoga, { type Yoga } from "yoga-wasm-web"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const wasmPath = join(__dirname, "../node_modules/yoga-wasm-web/dist/yoga.wasm")
const wasmBuffer = readFileSync(wasmPath)
const yoga: Yoga = await initYoga(wasmBuffer)

// Flexture
const fRoot = Flexture.Node.create()
fRoot.setWidth(100)
fRoot.setHeight(100)
fRoot.setFlexDirection(Flexture.FLEX_DIRECTION_ROW)
fRoot.setFlexWrap(Flexture.WRAP_WRAP_REVERSE)

for (let i = 0; i < 3; i++) {
  const child = Flexture.Node.create()
  child.setWidth(40)
  child.setHeight(20)
  fRoot.insertChild(child, i)
}
fRoot.calculateLayout(100, 100, Flexture.DIRECTION_LTR)

console.log("=== wrap-reverse debug ===")
console.log("\nFlexture layout:")
console.log("Root:", {
  left: fRoot.getComputedLeft(),
  top: fRoot.getComputedTop(),
  width: fRoot.getComputedWidth(),
  height: fRoot.getComputedHeight(),
})
for (let i = 0; i < 3; i++) {
  const c = fRoot.getChild(i)!
  console.log(`Child ${i}:`, {
    left: c.getComputedLeft(),
    top: c.getComputedTop(),
    width: c.getComputedWidth(),
    height: c.getComputedHeight(),
  })
}

// Yoga
const yRoot = yoga.Node.create()
yRoot.setWidth(100)
yRoot.setHeight(100)
yRoot.setFlexDirection(yoga.FLEX_DIRECTION_ROW)
yRoot.setFlexWrap(yoga.WRAP_WRAP_REVERSE)

for (let i = 0; i < 3; i++) {
  const child = yoga.Node.create()
  child.setWidth(40)
  child.setHeight(20)
  yRoot.insertChild(child, i)
}
yRoot.calculateLayout(100, 100, yoga.DIRECTION_LTR)

console.log("\nYoga layout (expected):")
console.log("Root:", {
  left: yRoot.getComputedLeft(),
  top: yRoot.getComputedTop(),
  width: yRoot.getComputedWidth(),
  height: yRoot.getComputedHeight(),
})
for (let i = 0; i < 3; i++) {
  const c = yRoot.getChild(i)
  console.log(`Child ${i}:`, {
    left: c.getComputedLeft(),
    top: c.getComputedTop(),
    width: c.getComputedWidth(),
    height: c.getComputedHeight(),
  })
}
yRoot.freeRecursive()

console.log("\n=== Difference ===")
console.log("wrap-reverse means lines wrap from bottom to top (cross-axis reversed)")
console.log("- Children 0,1 (40+40=80) fit on first line → should be at BOTTOM (high top value)")
console.log("- Child 2 wraps to second line → should be ABOVE first line (lower top value)")
