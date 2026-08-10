// The ONE HTTP helper the deploy scripts share. smoke-staging, smoke-mcp and
// seed-staging each carried a near-identical `api()` — and only seed-staging's copy
// had a timeout, so `smoke:staging` (the LAST step of `deploy:staging`) could hang a
// deploy on a wedged host forever. R11 lives here now, in one place no script can
// forget: the machine check for R11 scans `workers/*/src` .ts only, which is exactly
// why these .mjs copies were free to drift.

/** R11: never hang on an external service. Generous enough for a cold Worker start
 * on a fresh deploy, short enough that a wedged host fails the run instead of the day. */
export const REQUEST_TIMEOUT_MS = 30_000

/** The one bare `fetch` in the scripts, with the timeout already on it. A caller can
 * still pass its own `signal` (the spread wins) — nothing here does. */
export function timedFetch(url, opts = {}) {
  return fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...opts })
}

/** A JSON caller bound to one base URL — `api(path, opts, cookie)`, exactly as the
 * three copies were called, so no call site changed.
 *
 * Returns the SUPERSET of what the copies returned: `{ ok, status, body, res }`. The
 * smoke scripts read `.res` / `.body`; the seed reads `.ok` / `.status`. A non-JSON
 * answer (a gateway error page, an empty 502) still carries a readable `message`, so
 * a failure reports a reason rather than a bare status — the seed's behaviour, now
 * everyone's. */
export function makeApi(base) {
  return async function api(path, opts = {}, cookie = "") {
    const res = await timedFetch(`${base}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...opts.headers,
      },
    })
    let body = null
    try {
      body = await res.json()
    } catch {
      body = { message: (await res.text().catch(() => "")).slice(0, 300) || "(no body)" }
    }
    return { ok: res.ok, status: res.status, body, res }
  }
}

/** One JSON-RPC call to POST /mcp with a bearer token — the outside tool's view.
 * `bearer` is explicit (and `null` means send NO Authorization header) so the
 * no-token and bad-token cases share the same helper. */
export function makeRpc(base) {
  return async function rpc(bearer, method, params = {}, id = 1) {
    const res = await timedFetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bearer === null ? {} : { Authorization: `Bearer ${bearer}` }),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    })
    return { status: res.status, body: await res.json().catch(() => null), res }
  }
}
