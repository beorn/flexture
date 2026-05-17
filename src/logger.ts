/**
 * Logger with auto-detection
 *
 * Uses @beorn/logger if available (when used in km), falls back to debug library.
 * Supports the conditional `?.` pattern for zero-cost when disabled.
 */

// Debug library style: (msg, ...args) - printf-style formatting
type DebugFn = (msg: string, ...args: unknown[]) => void

interface ConditionalLogger {
  debug?: DebugFn
}

let _logger: ConditionalLogger | null = null

async function createFallbackLogger(namespace: string): Promise<ConditionalLogger> {
  // Dynamic import to avoid bundling debug if not needed
  try {
    const { default: createDebug } = (await import("debug")) as {
      default: (ns: string) => DebugFn & { enabled: boolean }
    }
    const debug = createDebug(namespace)
    return { debug: debug.enabled ? debug : undefined }
  } catch {
    // debug not installed either
    return { debug: undefined }
  }
}

async function detectLogger(namespace: string): Promise<ConditionalLogger> {
  try {
    const { createLogger } = await import("loggily")
    const logger = createLogger(namespace)
    // Wrap @beorn/logger to accept printf-style args
    if (logger.debug) {
      const originalDebug = logger.debug
      return {
        debug: (msg: string, ...args: unknown[]) => {
          // Format printf-style placeholders
          let i = 0
          const formatted = msg.replace(/%[sdOo]/g, () => {
            const arg = args[i++]
            if (arg === undefined) return ""
            if (arg === null) return "null"
            if (typeof arg === "object") return JSON.stringify(arg)
            return String(arg)
          })
          originalDebug(formatted)
        },
      }
    }
    return { debug: undefined }
  } catch {
    return createFallbackLogger(namespace)
  }
}

// Kick off logger discovery without making Flexily an async module. Bun's
// bundler rejects sync require() calls when any transitive dependency has
// top-level await, and Flexily is often imported through compatibility layers.
void detectLogger("flexily:layout").then(
  (logger) => {
    _logger = logger
  },
  () => {
    _logger = { debug: undefined }
  },
)

/** Logger instance - use with optional chaining: `log.debug?.('message')` */
export const log: ConditionalLogger = {
  get debug() {
    return _logger?.debug
  },
}
