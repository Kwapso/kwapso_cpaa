"use client"

// TEMPORARY PLACEHOLDER — flagged in UI-GAPS.md.
// The library has no auth/login collection yet. This stand-in is built ENTIRELY
// from library primitives (Button, Input, Field, Spinner, toast) so when
// the library ships `auth-card`, swapping is a one-file change. Flat (no
// card surface), matching the app-wide flat look. No styles invented beyond layout.
//
// This file is the agency door's CHROME. The email → code → signed-in BEHAVIOUR
// (including the cooldown rule) lives once, in shared/web/use-email-sign-in.ts,
// which the portal's own sign-in screen renders too.
//
// TWO WAYS IN, ONE IDENTITY: a six-digit email code, or Google. Google is a plain
// browser redirect with no state machine to share, so only its mark and its
// failure wording are shared (shared/web/google-sign-in.tsx). The button sits
// BESIDE the code, never instead of it — the verified email is the identity, so
// the person who used a code last week and Google today is one row. Unset
// credentials simply mean no button; the code path is untouched (ARCHITECTURE §5).

import { Button } from "@shared/ui/components/button/button"
import { Field } from "@shared/web/field"
import { Input } from "@shared/ui/components/input/input"
import { Spinner } from "@shared/ui/components/spinner/spinner"
import { toast } from "@shared/ui/components/sonner/sonner"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"
import { brand } from "@shared/brand"
import { CodeInput } from "@shared/web/code-input"
import { GoogleMark, useSignInError } from "@shared/web/google-sign-in"
import { useEmailSignIn } from "@shared/web/use-email-sign-in"

import { auth } from "@/lib/api"
import { BrandMark } from "@/components/brand-mark"
import { useT } from "@shared/web/language"

const emailFieldConfig = {
  ...defaultFieldConfig,
  label: "Email",
  required: true,
}

export function AuthCard({ onSignedIn }: { onSignedIn: () => void }) {
  const t = useT()
  const { step, email, setEmail, code, busy, error, sendCode, enterCode, useDifferentEmail } =
    useEmailSignIn({
      startEmail: auth.startEmail,
      verifyEmail: auth.verifyEmail,
      onSignedIn,
      announce: toast.success,
    })
  // Google sends someone back here with a `?error=` when the round-trip failed.
  const googleError = useSignInError()

  return (
    <div className="motion-panel-in w-full max-w-sm">
      <div className="flex flex-col items-center text-center">
        <BrandMark className="mb-1" />
        <h1 className="text-2xl font-medium">
          {t("Welcome to")} {brand.name}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {step === "email" ? brand.motto : `Enter the 6-digit code sent to ${email}`}
        </p>
      </div>
      <div className="mt-6 flex flex-col gap-4">
        {step === "email" ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void sendCode()
            }}
          >
            <Field config={emailFieldConfig} htmlFor="email" error={error}>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </Field>
            <Button type="submit" className="w-full" disabled={busy || !email}>
              {busy ? <Spinner /> : null}
              {t("Email me a code")}
            </Button>
            {/* BESIDE the code, never instead of it. Both prove the same
                identity and land on the same user record — a colleague who used
                a code last week and Google today is one person. */}
            <div className="flex items-center gap-2">
              <span className="bg-border h-px flex-1" />
              <span className="text-muted-foreground text-xs">or</span>
              <span className="bg-border h-px flex-1" />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => window.location.assign(auth.googleStartUrl)}
            >
              <GoogleMark />
              {t("Continue with Google")}
            </Button>
            {googleError && (
              <p className="text-destructive text-center text-xs">{googleError}</p>
            )}
          </form>
        ) : (
          <>
            <CodeInput value={code} disabled={busy} onChange={enterCode} />
            {error && <p className="text-destructive text-center text-xs">{error}</p>}
            {busy && (
              <div className="flex justify-center">
                <Spinner />
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" disabled={busy} onClick={useDifferentEmail}>
                {t("Change email")}
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void sendCode()}>
                {t("Resend code")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
