// `@shared/*` FOR NODE, so a script can import the shipped worker code.
//
// Every worker's tsconfig maps `@shared/*` onto the repo's shared/ folder, and
// vitest.workers.config.ts repeats the mapping for Vite (its own header explains
// why the two cannot be one). Node is the third resolver and had no mapping at
// all, so importing a worker lib from a script died on the first shared seam.
//
// One in-thread resolve hook, registered by the script that needs it. Nothing is
// rewritten on disk and no build step appears: the file the worker ships is the
// file the script runs.
import { registerHooks } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const SHARED = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "shared")

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@shared/"))
      return { url: pathToFileURL(join(SHARED, `${specifier.slice("@shared/".length)}.ts`)).href, shortCircuit: true }
    // TypeScript writes relative imports WITHOUT an extension, which Node's ESM
    // resolver refuses. Only inside a .ts parent, and only for a specifier that
    // has no extension of its own, so nothing else in the tree is affected.
    if (
      specifier.startsWith(".") &&
      context.parentURL?.endsWith(".ts") &&
      !/\.[cm]?[jt]s(on)?$/.test(specifier)
    )
      return next(`${specifier}.ts`, context)
    return next(specifier, context)
  },
})
