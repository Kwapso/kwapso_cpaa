// The ONE place the client portal talks to the workers. Same-origin /api calls —
// the PORTAL gateway routes them — so cookies flow automatically.
//
// This file is deliberately a SHORT list, and it is the portal's honest
// inventory: every function here corresponds to a door named in the portal
// gateway's allow-list (workers/portal-gateway/src/index.ts), and a test proves
// the two agree. If a screen needs something that isn't here, that is a
// conversation about opening a door — not an import away.
//
// It is NOT web/lib/api.ts with a filter. The agency client carries ~90 calls
// across roles, invites, imports and the assistant; the portal has fourteen.

import type { AccountDetail, HelpMessage, HelpTicket, SessionUser } from "@shared/types"
// The plumbing — one fetch wrapper, one error class, one paged shape — is shared
// with the agency app (shared/web/api.ts). Only the DOOR LIST below is the
// portal's own, and it is meant to be: it is this surface's honest inventory.
import { api, enc, post, type PagedResponse } from "@shared/web/api"

export { ApiFailure, type PagedResponse } from "@shared/web/api"

/** Where this person may stand, and where they stand now (the switcher's data).
 * `accounts` is a list of companies, never a list of logins — an account is a
 * company or a person you work with, never a sign-in (SCOPE ch.02). */
export type PortalContext = {
  accounts: { id: string; name: string }[]
  currentAccountId: string | null
}

export const auth = {
  /** Request a 6-digit code. The code goes ONLY to the inbox — never the response. */
  startEmail: (email: string) => api<{ ok: true }>("/api/auth/email/start", post({ email })),
  /** Prove it's you. Signing in NEVER creates access — the invite does (SCOPE ch.06). */
  verifyEmail: (email: string, code: string) =>
    api<{ user: SessionUser; isNew: boolean }>("/api/auth/email/verify", post({ email, code })),
  me: () => api<{ user: SessionUser }>("/api/auth/me"),
  /** First visit only: your name (and a photo if you'd like one). */
  updateProfile: (input: { firstName: string; lastName: string; imageDataUrl?: string }) =>
    api<{ user: SessionUser }>("/api/auth/profile", post(input)),
  logout: () => api<{ ok: true }>("/api/auth/logout", { method: "POST" }),
}

export const portal = {
  // Deliberately absent: `/api/tenancy/active`. The portal needs exactly one
  // field from it — the team id the live channel is keyed by — and `auth.me`
  // already carries that. Asking `active` would also hand a client the agency's
  // team name, logo, the caller's role title and the agency's member count.

  /** Where this person may stand, and where they stand now. */
  context: () => api<PortalContext>("/api/tenancy/portal/context"),

  /** Stand in another of their own companies. The set they may stand in comes
   * from the guard corridor, never from this body — the only thing it can do is
   * name one of their own or be refused. */
  switchAccount: (accountId: string) =>
    api<PortalContext>("/api/tenancy/portal/switch-account", post({ accountId })),

  /** One company opened: the record, the people in it, and the exact totals.
   * Fenced server-side by the caller's account set — the portal never asks for
   * an account it wasn't handed. */
  company: (id: string) => api<AccountDetail>(`/api/tenancy/accounts/detail?id=${enc(id)}`),
}

export const support = {
  /** R14: a PAGE of this client's tickets — hand `cursor` back from the previous
   * response for the next one. `total` is the exact server count of what this
   * caller may see (R16). */
  tickets: (cursor?: string | null) =>
    api<PagedResponse<{ tickets: HelpTicket[]; mineTotal: number }>>(
      `/api/content/help?scope=all${cursor ? `&cursor=${enc(cursor)}` : ""}`
    ),
  /** One ticket by id — the same door, narrowed. Outside the fence it simply
   * isn't there. */
  ticket: (id: string) =>
    api<{ tickets: HelpTicket[] }>(`/api/content/help?id=${enc(id)}`).then(
      (r) => r.tickets[0] ?? null
    ),
  /** A ticket's conversation, plus its exact reply count. */
  thread: (id: string) =>
    api<{ replies: HelpMessage[]; total: number }>(`/api/content/help/thread?id=${enc(id)}`),
  /** Raise a ticket. */
  raise: (input: { description: string; helpType?: string }) =>
    api<PagedResponse<{ tickets: HelpTicket[]; mineTotal: number }>>("/api/content/help", post(input)),
  /** Add to the conversation. No @mentions from this surface: a client has no
   * business naming which staff member picks it up (SCOPE ch.06). */
  reply: (helpId: string, body: string) =>
    api<{ replies: HelpMessage[]; total: number }>("/api/content/help/reply", post({ helpId, body })),
}
