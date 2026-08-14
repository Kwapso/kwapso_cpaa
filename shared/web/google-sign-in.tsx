"use client"

// "CONTINUE WITH GOOGLE" — the bits of it that must be the SAME at both front
// doors, for the same reason use-email-sign-in.ts exists: the agency app and the
// client portal LOOK different on purpose, but a person hitting the same failure
// at the two hostnames must be told the same thing, and a brand mark drawn twice
// is a brand mark that drifts.
//
// What is NOT here, deliberately: the URL. `/api/auth/google/start` lives in each
// app's own door list (web/lib/api/auth.ts, web-portal/lib/api.ts) because that
// is the inventory both gateway suites read off disk — a door named only in
// shared code would be a door nothing checks. See the header of web/lib/api/auth.ts.
//
// The flow itself is a plain browser redirect, so there is no state machine to
// share: the button navigates, Google answers, and the worker sets the session
// cookie before handing the browser back. Everything that can go wrong comes
// back as one `?error=` on the sign-in screen — which is what this file reads.

import * as React from "react"

/** Every reason the worker sends someone back to the sign-in screen, in the
 * app's voice (warm, plain, sentence case) rather than the worker's code. An
 * unrecognised reason falls back to the general one — a new failure code must
 * never render a blank or a raw string at a person. */
const GOOGLE_SIGN_IN_ERRORS: Record<string, string> = {
  google_not_ready: "Google sign-in isn't switched on yet. Use your email and a code instead.",
  google_failed: "That didn't work. Try again, or use your email and a code.",
  // Never "your account is switched off": at the portal an account is a COMPANY,
  // never a login (SCOPE ch.02), and this copy is rendered at both doors.
  deactivated: "That sign-in has been switched off. Get in touch with kwapso if that isn't right.",
}

/**
 * The message for a `?error=` on the sign-in URL, or undefined when there is
 * nothing wrong.
 *
 * Read in an effect rather than during render because both apps are STATIC
 * EXPORTS: the sign-in screen is prerendered at build time, where `window` does
 * not exist (EDGE-CASES.md, the static-export trap). A `useState` initialiser
 * reading `window.location` would build fine and crash the build.
 */
export function useSignInError(): string | undefined {
  const [message, setMessage] = React.useState<string | undefined>()
  React.useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("error")
    if (reason) setMessage(GOOGLE_SIGN_IN_ERRORS[reason] ?? GOOGLE_SIGN_IN_ERRORS.google_failed)
  }, [])
  return message
}

/** Google's G. Inline because a strict no-external-hosts posture is the whole
 * point of the two front doors, and because Google's brand terms ask for this
 * mark on this button — it is not a generic icon the library could supply. */
export function GoogleMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7A21.99 21.99 0 0 0 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18A13.2 13.2 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A22 22 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  )
}
