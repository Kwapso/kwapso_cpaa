// WHERE A SCRIPT GETS ITS CLOUDFLARE ACCOUNT AND TOKEN, and why neither is
// written down in the script that needs them.
//
// ── WHAT WENT WRONG ─────────────────────────────────────────────────────────
//
// On 2026-08-31 the owner moved every platform credential into the macOS
// Keychain under new service names and began purging the old entries. Thirteen
// scripts in this folder had the OLD name spelled out inside them:
//
//   execSync("security find-generic-password -s cloudflare-token-kwapso -w")
//
// That entry no longer exists, so every one of them now throws at import time —
// before a single line of its actual work runs. The repair scripts, the
// benchmarks, the prune tools: all dead, none of them saying why in a sentence
// anybody could act on. It is the same fault as `deploy:staging`'s sign-in
// check, in thirteen more places, and it was invisible for the same reason:
// nothing runs these on a schedule, so nothing reported it.
//
// ── WHY THE ACCOUNT ID WAS AS BAD AS THE TOKEN ──────────────────────────────
//
// The same thirteen also carried the account id as a hard-coded default. That
// is worse than it looks. THIS MACHINE HOSTS MORE THAN ONE CLOUDFLARE ACCOUNT,
// and eleven of the sixteen D1 databases on the Kwapso account belong to other
// companies. An id copied into a script is a decision made once, months ago, by
// somebody who is not in the room when it runs.
//
// So both come from `~/.config/cloudflare/accounts.json` — the file `cf-exec`
// already reads, which maps a FOLDER to an account and names that account's
// Keychain entry. One source of truth for the shell and for Node, and a script
// that lands in another folder gets that folder's account rather than this
// folder's.
//
// ── THE RULES IT KEEPS ──────────────────────────────────────────────────────
//
// The token is piped from `security` straight into this process and returned to
// the caller. It is never echoed, never logged, never written to a file. An
// explicit `CLOUDFLARE_API_TOKEN` in the environment still wins, for CI or a
// one-off — an override is always deliberate.
//
// It REFUSES rather than guesses. An unregistered folder, a missing account
// block, an empty Keychain entry: each is a thrown error naming the fix. The
// old behaviour on a missing token was a raw `execSync` stack trace, which tells
// an operator nothing about what to do next.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

const CONFIG = join(homedir(), ".config", "cloudflare", "accounts.json")

function config() {
  try {
    return JSON.parse(readFileSync(CONFIG, "utf8"))
  } catch (err) {
    throw new Error(
      `Cannot read ${CONFIG} — it is the one place a folder's Cloudflare account is decided.\n` +
        `  ${err.message}`
    )
  }
}

/** Which account this FOLDER belongs to, by the same rule `cf-exec` uses.
 *  Defaults to the current working directory; pass a path to ask about another. */
function accountKeyFor(dir) {
  const cfg = config()
  const here = resolve(dir ?? process.cwd())
  const home = homedir()
  // Longest match wins, so a nested project beats its parent. `~/x` in the file
  // is expanded here rather than in the file, which keeps the file portable.
  let best = null
  for (const [folder, key] of Object.entries(cfg.projects ?? {})) {
    const abs = resolve(folder.startsWith("~") ? join(home, folder.slice(1)) : folder)
    if ((here === abs || here.startsWith(abs + "/")) && (!best || abs.length > best.abs.length))
      best = { abs, key }
  }
  if (!best)
    throw new Error(
      `${here} is not registered in ${CONFIG}, so which Cloudflare account it belongs to is unknown.\n` +
        `  This machine hosts more than one account and the default is another company's.\n` +
        `  Add the folder to "projects" there, then re-run. Never let it guess.`
    )
  return best.key
}

/** The account id and the Keychain service name for this folder's account. */
export function cloudflareAccount(dir) {
  const cfg = config()
  const key = accountKeyFor(dir)
  const account = cfg.accounts?.[key]
  if (!account?.id)
    throw new Error(`${CONFIG} names account "${key}" for this folder but has no id for it.`)
  return { key, id: account.id, keychainService: account.keychain_service ?? null }
}

/** The API token for this folder's account. NEVER log the return value.
 *
 *  Order: an explicit `CLOUDFLARE_API_TOKEN` first — an override is deliberate —
 *  then the Keychain entry `accounts.json` names for this folder's account. */
export function cloudflareToken(dir) {
  const fromEnv = process.env.CLOUDFLARE_API_TOKEN
  if (fromEnv) return fromEnv
  const { key, keychainService } = cloudflareAccount(dir)
  if (!keychainService)
    throw new Error(
      `${CONFIG} gives account "${key}" no "keychain_service", so there is nowhere to read its token from.`
    )
  let value = ""
  try {
    value = execFileSync("security", ["find-generic-password", "-s", keychainService, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    throw new Error(
      `No Cloudflare token in the Keychain under "${keychainService}" (the entry ${CONFIG} names for account "${key}").\n` +
        `  Add it, or export CLOUDFLARE_API_TOKEN for this run.`
    )
  }
  if (!value)
    throw new Error(`The Keychain entry "${keychainService}" is empty. Put this account's API token in it.`)
  return value
}

/** Both at once, for the common case. The account id may still be overridden by
 *  `CLOUDFLARE_ACCOUNT_ID` — same reasoning as the token. */
export function cloudflareCredentials(dir) {
  const { key, id } = cloudflareAccount(dir)
  return { account: process.env.CLOUDFLARE_ACCOUNT_ID || id, token: cloudflareToken(dir), key }
}
