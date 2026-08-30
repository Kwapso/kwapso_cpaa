#!/usr/bin/env node
// THE INTEGRATED GATE — everything the owner is about to test, checked in one run
// against DEPLOYED staging, after all lanes have merged.
//
// WHY IT EXISTS. Each lane checks its own work and `npm run check` checks the
// source; nobody checks what the eight deployed workers and two front doors add
// up to. This round landed a wrangler major, a types major, a next bump, two kit
// censuses and a law — and every one of those is invisible to the test suite at
// the point where it can actually break, which is the deploy.
//
// It runs the checks that already exist, in the order their failures matter, and
// STOPS at the first one that fails. Each is a real instrument that has caught
// something: the smokes catch a door, the shots catch a screen, the mobile walk
// catches a width. None of them is new here — what is new is that they run
// together and that a failure is loud.
//
//   set -a && source ~/.config/kwapso/keys.env && set +a
//   node scripts/final-gate.mjs
//
// Exits non-zero on the first failure, so it can gate a hand-off.

import { spawnSync } from "node:child_process"

const STEPS = [
  ["staging smoke", "npm", ["run", "smoke:staging"]],
  ["portal smoke", "npm", ["run", "smoke:portal"]],
  ["screens at four widths, both themes", "node", ["scripts/lane-shots/shoot-staging.mjs", "/tmp/final-shots"]],
  ["both doors at 375", "node", ["scripts/walk-mobile.mjs", "--live", "--door=both"]],
]

if (!process.env.TEST_LOGIN_KEY) {
  console.log("FAIL  no TEST_LOGIN_KEY — export it first (set -a && source ~/.config/kwapso/keys.env && set +a)")
  process.exit(1)
}

let failed = 0
for (const [label, cmd, args] of STEPS) {
  process.stdout.write(`\n── ${label} ${"─".repeat(Math.max(0, 56 - label.length))}\n`)
  const r = spawnSync(cmd, args, { stdio: "inherit", env: process.env })
  if (r.status !== 0) {
    console.log(`\nFAIL  ${label} exited ${r.status}. Stopping — later steps assume this one passed.`)
    failed = 1
    break
  }
  console.log(`PASS  ${label}`)
}

console.log(failed ? "\nFINAL GATE FAILED" : "\nFINAL GATE PASSED — deployed staging is what the owner will test")
process.exit(failed)
