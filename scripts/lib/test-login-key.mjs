// WHERE THE TEST SIGN-IN KEY COMES FROM, and why it is not an environment
// variable you are expected to remember.
//
// The key is the shared secret between these scripts and the auth worker's
// non-production test-login door (`POST /api/auth/admin/test-login`, staging
// only — the door refuses outright when ENVIRONMENT is "production"). Without
// it a smoke run cannot sign in, so it cannot prove that the thing it just
// deployed actually works, only that it uploaded.
//
// IT USED TO LIVE IN A FILE, and on 2026-08-31 the owner moved every platform
// credential into the macOS Keychain and began purging the files. `deploy:staging`
// then ended in `FAIL no TEST_LOGIN_KEY in the environment` on every run — the
// deploy itself was fine and the last step could not run. A check that always
// fails is a check people stop reading, which is worse than not having one.
//
// SO IT READS THE KEYCHAIN ITSELF. An explicit `TEST_LOGIN_KEY` in the
// environment still wins, for CI or a one-off against another host; otherwise
// the Keychain answers and a deploy needs no ceremony. The value is piped
// straight from `security` into this process and never written down, echoed or
// logged — the same rule the tokens follow.
//
// TO ROTATE: mint a value, put it in the Keychain under the name below, and
// `wrangler secret put TEST_LOGIN_KEY --env staging` from `workers/auth` with
// the same value. Two steps, both of which take the value on stdin or in a
// variable, neither of which leaves it in a file.

import { execFileSync } from "node:child_process"

/** The Keychain service name. Matches the `cf-*-kwapso` convention beside it. */
export const KEYCHAIN_SERVICE = "test-login-key-kwapso"

/**
 * The key, or "" when there is none. NEVER log the return value.
 *
 * Order: the environment first (an explicit override is always a deliberate
 * one), then the Keychain. A missing Keychain entry is not an error here — the
 * caller decides what to say, because the smoke scripts want to fail with an
 * instruction rather than a stack trace.
 */
export function testLoginKey() {
  const fromEnv = process.env.TEST_LOGIN_KEY
  if (fromEnv) return fromEnv
  // Darwin only, and that is fine: this door exists for a developer's own
  // staging run. Anywhere else, set the variable.
  if (process.platform !== "darwin") return ""
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim()
  } catch {
    // No entry, or the Keychain is locked. Both mean "no key", and both are the
    // caller's sentence to write.
    return ""
  }
}

/** The sentence every smoke script says when there is no key, so all three say
 *  the same thing and it names the fix rather than the symptom. */
export const NO_KEY_MESSAGE =
  `FAIL no test sign-in key — add it to the Keychain as "${KEYCHAIN_SERVICE}" ` +
  `(and set the same value with: cd workers/auth && wrangler secret put TEST_LOGIN_KEY --env staging), ` +
  `or export TEST_LOGIN_KEY for this run`
