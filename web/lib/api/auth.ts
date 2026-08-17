// AUTH — sign in, the session, and your own profile.
//
// One of the five door lists behind `@/lib/api`. They are split by WORKER,
// because that is the boundary the doors already have: a path under
// `/api/auth/…` is answered by the auth worker and nothing else.
//
// THE WHOLE DIRECTORY IS THE ATTACK SURFACE the two gateway suites derive from —
// workers/gateway/test/agency-door.test.ts walks every file here to prove each
// door reaches a worker, and workers/portal-gateway/test/portal-door.test.ts
// walks the same files to prove none of them reaches the CLIENT door. They read
// the DIRECTORY, not one file, so a door added in a new domain file is covered
// the day it lands.

import type {
  ActivityItem,
  SessionUser,
} from "@shared/types"
import type { Language } from "@shared/i18n"
import { api } from "@shared/web/api"

export const auth = {
  /** Request a 6-digit code. The code goes ONLY to the inbox — never the response. */
  startEmail: (email: string) =>
    api<{ ok: true }>("/api/auth/email/start", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  verifyEmail: (email: string, code: string) =>
    api<{ user: SessionUser; isNew: boolean }>("/api/auth/email/verify", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    }),

  /** "Continue with Google" — a NAVIGATION, not a fetch. The whole flow is the
   * browser bouncing to Google and back to `/api/auth/google/callback`, which
   * sets the session cookie and redirects home; there is nothing for `api()` to
   * await. It is a door in this list anyway, because this directory IS the
   * attack surface both gateway suites derive from (see the file header) — a
   * path hidden in a component is a path nothing proves reaches a worker. */
  googleStartUrl: "/api/auth/google/start",

  me: () => api<{ user: SessionUser }>("/api/auth/me"),

  /** Your own account activity (name / photo / email changes) — identity-level,
   * not tied to any team. */
  activity: () => api<{ activity: ActivityItem[] }>("/api/auth/activity"),

  /** Onboarding / profile edit: names + optional photo (as a data URL). */
  updateProfile: (input: {
    firstName: string
    lastName: string
    imageDataUrl?: string
  }) =>
    api<{ user: SessionUser }>("/api/auth/profile", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /** The language this person reads kwapso in. Its own door rather than a field
   * on updateProfile: a language change must not be refused because a name is
   * missing, and must not post a name back (a lost update with two tabs open). */
  setLanguage: (language: Language) =>
    api<{ user: SessionUser }>("/api/auth/language", {
      method: "POST",
      body: JSON.stringify({ language }),
    }),

  /** Change email, step 1: send a 6-digit code to the NEW address (inbox only —
   * same law as login, the code never rides the response). */
  startEmailChange: (email: string) =>
    api<{ ok: true }>("/api/auth/email/change/start", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  /** Change email, step 2: verify the code → switched email (other devices are
   * signed out server-side; the old address is warned). */
  verifyEmailChange: (email: string, code: string) =>
    api<{ user: SessionUser }>("/api/auth/email/change/verify", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    }),

  logout: () => api<{ ok: true }>("/api/auth/logout", { method: "POST" }),
}
