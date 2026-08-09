// CI's platform binding, locked.
//
// vitest 4 bundles through rolldown, which ships its compiler as a per-platform
// native module (an optionalDependency). npm resolves those against the machine
// that WROTE the lockfile: on this Mac only `binding-darwin-arm64` survives, and
// the linux-x64-gnu one is pruned because it declares `libc: glibc` (npm/cli
// #4828). `npm ci` on the GitHub runner then installs a rolldown with no binary
// and every test file dies at startup with "Cannot find native binding" — green
// here, red there, for a reason nothing in the app can explain.
//
// The fix is the root `optionalDependencies` pin: naming the linux binding
// explicitly forces it into the lockfile, and `optional` means this Mac still
// skips it. That pin must track rolldown's version — bump vitest without
// bumping the pin and CI breaks again with the same baffling error. So this
// test compares the two and fails HERE, with the fix in the message.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"))

const BINDING = "@rolldown/binding-linux-x64-gnu"

it("the linux native binding is pinned to rolldown's own version (CI runs on linux)", () => {
  const pinned = readJson("package.json").optionalDependencies?.[BINDING]
  const lock = readJson("package-lock.json").packages
  const rolldown = lock["node_modules/rolldown"]?.version

  expect(rolldown, "rolldown missing from the lockfile — has vitest changed bundler?").toBeTruthy()
  expect(
    pinned,
    `${BINDING} must be pinned in root optionalDependencies, or CI can't start vitest`
  ).toBe(rolldown)
  expect(
    lock[`node_modules/${BINDING}`],
    "the pin is set but the lockfile lacks the entry — run npm install to refresh it"
  ).toBeTruthy()
})
