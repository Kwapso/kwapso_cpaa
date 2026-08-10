"use client"

// TEMPORARY PLACEHOLDER — flagged in UI-GAPS.md.
// The library has no auth/login collection yet. This stand-in is built ENTIRELY
// from library primitives (Button, Input, Field, Spinner, toast) so when
// @kwapso/ui ships `auth-card`, swapping is a one-file change. Flat (no
// card surface), matching the app-wide flat look. No styles invented beyond layout.
//
// This file is the agency door's CHROME. The email → code → signed-in BEHAVIOUR
// (including the cooldown rule) lives once, in shared/web/use-email-sign-in.ts,
// which the portal's own sign-in screen renders too.

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"
import { brand } from "@shared/brand"
import { CodeInput } from "@shared/web/code-input"
import { useEmailSignIn } from "@shared/web/use-email-sign-in"

import { auth } from "@/lib/api"
import { BrandMark } from "@/components/brand-mark"

const emailFieldConfig = {
  ...defaultFieldConfig,
  label: "Email",
  required: true,
}

export function AuthCard({ onSignedIn }: { onSignedIn: () => void }) {
  const { step, email, setEmail, code, busy, error, sendCode, enterCode, useDifferentEmail } =
    useEmailSignIn({
      startEmail: auth.startEmail,
      verifyEmail: auth.verifyEmail,
      onSignedIn,
      announce: toast.success,
    })

  return (
    <div className="animate-rise w-full max-w-sm">
      <div className="flex flex-col items-center text-center">
        <BrandMark className="mb-1" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to {brand.name}
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
              Email me a code
            </Button>
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
                Change email
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void sendCode()}>
                Resend code
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
