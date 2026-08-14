// How a worker that ISN'T auth sends an email. Only auth holds the Resend key, so
// everyone else hands the finished message to auth's internal send door. This was
// copied into tenancy and content byte-for-byte, and inlined a third time in the
// invite path — three places to fix a header, a URL or a failure log.
//
// Best-effort by design: a notification must NEVER fail the action that triggered
// it (the role already changed, the reply already saved). So this swallows its own
// errors and RETURNS whether the door accepted the message — the invite path needs
// that answer, because it tells the user honestly whether the email went out.

import type { D1Database, Fetcher } from "@cloudflare/workers-types"

import { brandedEmail, type BrandedEmail } from "./email-template"

/** What a worker needs to send: the auth binding, the origin its links point at,
 * and the shared secret guarding the internal door. */
export type MailEnv = { AUTH: Fetcher; PUBLIC_APP_URL?: string; INTERNAL_KEY?: string }

/** Send one branded email through the auth worker. `origin` overrides
 * `env.PUBLIC_APP_URL` — the invite path falls back to the request's own origin so
 * a link still works before that var is set. Returns true if the door accepted it. */
export async function sendBrandedEmail(
  env: MailEnv,
  to: string,
  subject: string,
  content: Omit<BrandedEmail, "origin">,
  origin?: string
): Promise<boolean> {
  const { html, text } = brandedEmail({ ...content, origin: origin ?? env.PUBLIC_APP_URL })
  try {
    // A CEILING ON A BEST-EFFORT HOP. This call is already allowed to fail — the
    // state change committed before it and is the authority (ARCHITECTURE §5,
    // member-notification emails) — but "allowed to fail" and "allowed to hang"
    // are different permissions. Without this, an auth worker stuck behind a slow
    // Resend holds the role-change request open long after the role changed.
    // Longer than the identity ceiling because there is a real third party at the
    // other end of it.
    // (Cast: see whoAmI in gating.ts — shared/ compiles in the web workspaces too.)
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": env.INTERNAL_KEY ?? "" },
      body: JSON.stringify({ to, subject, html, text }),
      signal: AbortSignal.timeout(15_000),
    } as unknown as Parameters<typeof env.AUTH.fetch>[1]
    const res = await env.AUTH.fetch("https://auth/internal/send-email", init)
    if (!res.ok) console.error("email send failed:", subject, res.status)
    return res.ok
  } catch (e) {
    console.error("email send failed:", subject, e)
    return false
  }
}

/** The team's name for an email's subject line, from the global core database.
 * Falls back to "your team" so a subject never reads "undefined". */
export async function teamName(env: { DB: D1Database }, teamId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT name FROM teams WHERE id = ?")
    .bind(teamId)
    .first<{ name: string }>()
  return row?.name ?? "your team"
}
