// IS THIS WORKER ACTUALLY ABLE TO DO ITS JOB — asked at any moment, rather than
// discovered by the first person who tries.
//
// ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────
//
// A Cloudflare Worker fails a DEPLOY on a module-scope throw, which is why boot
// failures barely exist here. What does exist, and is worse, is a worker that
// deploys perfectly and cannot work: a secret nobody set on a fresh environment,
// a token that was rotated at Cloudflare's end and not here, a var that moved.
// Nothing catches that. `npm run check` runs no wrangler at all, six workers
// expose a `/health` endpoint that answers `{ ok: true }` unconditionally, and
// the FIRST signal is a person's request failing.
//
// It is not hypothetical. `cloud_key_rejected` — the D1 token being refused — is
// 1,848 rows of the 5,086 in the live staging error store. Every one of them was
// somebody's request, and every one of them could have been one line in a health
// answer nobody had to be inconvenienced to produce.
//
// ── WHAT IT WILL NOT DO ─────────────────────────────────────────────────────
//
// It reports NAMES, never values, and never a length or a prefix — a health
// endpoint is reachable and "the key is 37 characters and starts with abc" is a
// fact worth nothing to us and something to somebody else. And it reports
// PRESENCE, not validity: whether a token still works is a question with a
// network call in it, and a health endpoint that makes one is a health endpoint
// that can be used to make us call somebody else.
//
// So the honest claim is narrow and worth having: "this worker is missing
// CF_D1_TOKEN" is a complete diagnosis, and `ok: true` on this check means the
// class of failure that produced those 1,848 rows is not the one you have.

/** What one worker cannot work without. Names only — this never reads a value. */
export type ConfigReport = {
  ok: boolean
  /** Required names that are absent or empty, in the order they were asked for. */
  missing: string[]
}

/** Which of `required` this env does not have. A var set to the empty string
 * counts as missing, because a secret somebody cleared and a secret nobody set
 * are the same outage. */
export function configReport(env: unknown, required: readonly string[]): ConfigReport {
  const bag = (env ?? {}) as Record<string, unknown>
  const missing = required.filter((name) => {
    const v = bag[name]
    if (v === undefined || v === null) return true
    if (typeof v === "string") return v.trim() === ""
    // A binding (D1, R2, a Fetcher, the AI binding) is an object and is present
    // by virtue of existing — wrangler would have refused the deploy otherwise.
    return false
  })
  return { ok: missing.length === 0, missing }
}

/** The health body every worker answers with.
 *
 * `ok` stays the first field and stays true-when-well, because something may be
 * reading it already and a health check that changes what "fine" looks like is a
 * health check that breaks a monitor. What is new sits beside it. */
export function healthBody(
  worker: string,
  env: unknown,
  required: readonly string[]
): { ok: boolean; worker: string; config: ConfigReport } {
  const config = configReport(env, required)
  return { ok: config.ok, worker, config }
}
