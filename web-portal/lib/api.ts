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
// across roles, invites, imports and the assistant; this list is a fraction of
// it. The COUNT is deliberately not written down here: it was "fourteen" for
// long enough to become wrong, in this comment and in ARCHITECTURE.md at the
// same time, because a number in prose is a number nothing checks. The door
// table in workers/portal-gateway/src/index.ts is the truth, and the fence
// suite walks this file against it.

import type {
  AccountDetail,
  HelpMessage,
  HelpTicket,
  ProcessComment,
  SessionUser,
  Todo,
} from "@shared/types"
import type { Language } from "@shared/i18n"
import type { SavingsView } from "@shared/workers/savings"
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
  /** "Continue with Google" — a NAVIGATION, not a fetch (the browser bounces to
   * Google and back to the callback, which sets the cookie). Named here anyway:
   * this list is the portal's honest inventory, and the fence suite checks every
   * /api path the portal mentions against the gateway's allow-list. Same rule as
   * the code: signing in proves who you are, it never creates access. */
  googleStartUrl: "/api/auth/google/start",
  me: () => api<{ user: SessionUser }>("/api/auth/me"),
  /** First visit only: your name (and a photo if you'd like one). */
  updateProfile: (input: { firstName: string; lastName: string; imageDataUrl?: string }) =>
    api<{ user: SessionUser }>("/api/auth/profile", post(input)),
  /** The language this contact reads their own portal in. On the gateway's
   * allow-list: it touches one column on the caller's own user row and says
   * nothing about the agency or about any other account. */
  setLanguage: (language: Language) =>
    api<{ user: SessionUser }>("/api/auth/language", post({ language })),
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

/** WHAT THE WORK GAVE BACK, and — only for the accounts the agency has switched
 * price visibility on for — what it cost. `prices` is ABSENT when the switch is
 * off: the door does not send it, so no screen can render it, and there is no
 * flag on this side to get wrong. The one figure that is never here under any
 * setting is the agency's own margin (R24). */
export type PortalValue = SavingsView & {
  prices?: {
    rates: { label: string; centsPerHour: number; currency: string | null }[]
    soldCents: number | null
  }
}

export const value = {
  /** The savings, drilled App → Process → Step, for the company this person is
   * standing in. The account is decided by the SERVER from their own stamp — the
   * portal never composes an account id. */
  read: () => api<PortalValue>("/api/tenancy/value"),
  /** The conversation on one process map. */
  comments: (processId: string) =>
    api<{ comments: ProcessComment[]; total: number }>(
      `/api/tenancy/processes/comments?processId=${enc(processId)}`
    ),
  /** Say something about a map. A comment is a conversation, never an edit: it
   * changes no step, no duration and no figure. */
  comment: (processId: string, body: string) =>
    api<{ id: string }>("/api/tenancy/processes/comments", post({ processId, body })),
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
  /** CORRECT YOUR OWN WORDING, while it is still yours to correct. The door
   * refuses once a staff member has read it (SCOPE ch.07's lock), and refuses a
   * colleague's ticket outright — this side does not decide either. */
  edit: (id: string, description: string) =>
    api<PagedResponse<{ tickets: HelpTicket[]; mineTotal: number }>>(
      "/api/content/help/update",
      post({ id, description })
    ),
  /** PUT THEM IN YOUR OWN ORDER. Neighbours, never a position: a position is
   * arithmetic over a list this browser loaded seconds ago. */
  rank: (id: string, afterId: string | null, beforeId: string | null) =>
    api<PagedResponse<{ tickets: HelpTicket[]; mineTotal: number }>>(
      "/api/content/help/rank",
      post({ id, afterId, beforeId })
    ),
}

/** WHAT WE ARE WAITING ON YOU FOR, and WHAT YOU BOUGHT. The two halves of the
 * client's own picture of delivery — one is a list they act on, the other is a
 * block they read. */
export const delivery = {
  /** Their company's open to-dos. Bounded, not paged: a to-do is a thing we are
   * waiting on, so there are a handful. */
  todos: () => api<{ todos: Todo[]; total: number }>("/api/content/todos"),
  /** Mark one done, and send the file with it if there is one. `fileDataUrl` is
   * a base64 data URL; the door caps it, parses it and stores it under a key
   * nobody can guess. */
  completeTodo: (id: string, file?: { dataUrl: string; name: string }) =>
    api<{ todo: Todo }>(
      "/api/content/todos/complete",
      post({ id, fileDataUrl: file?.dataUrl, fileName: file?.name })
    ),
  /** The blocks of work they bought — named, dated, and counted. No price here
   * under any setting: what they were CHARGED comes from `value.read()` behind
   * their own account's price-visibility switch, and there is one door for it. */
  sprints: () =>
    api<{
      sprints: {
        ref: string | null
        name: string
        sprintType: string | null
        startsOn: string | null
        endsOn: string | null
        completedAt: string | null
        storyCount: number
        doneStoryCount: number
      }[]
    }>("/api/content/portal/delivery"),
}
