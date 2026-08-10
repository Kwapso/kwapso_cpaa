"use client"

// SIGN IN — an email address and a six-digit code, and nothing else on screen.
//
// Two decisions worth stating, because both are easy to get wrong later:
//
// 1. THE CODE ONLY EVER GOES TO THE INBOX. It never rides the response and never
//    appears in a toast. That is a rule of the auth worker, and this screen is
//    where it would be broken first if someone "helpfully" surfaced it in dev.
//
// 2. SIGNING IN IS NOT GETTING IN. Invite-only is absolute (SCOPE ch.06): a
//    correct code proves who you are, it does not create access. So a stranger
//    who signs in successfully lands on the "nothing here yet" screen rather
//    than a new empty world of their own — and this component says nothing that
//    promises otherwise.
//
// Google sign-in exists as a product decision (same person as long as the email
// matches) but is not wired in code yet, on either front door. It is deliberately
// NOT stubbed here: a button that doesn't work is worse than one that isn't there.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { brand } from "@shared/brand"
import { CodeInput } from "@web/components/temp/code-input"
import { invalidate } from "@web/lib/store"
import { ApiFailure, auth } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"

const emailConfig = { ...defaultFieldConfig, label: "Your email", required: true }

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [step, setStep] = React.useState<"email" | "code">("email")
  const [email, setEmail] = React.useState("")
  const [code, setCode] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | undefined>()

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await auth.startEmail(email)
      setStep("code")
      setCode("")
      toast.success("Code sent — check your email.")
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't send the code.")
    } finally {
      setBusy(false)
    }
  }

  async function verify(full: string) {
    setBusy(true)
    setError(undefined)
    try {
      await auth.verifyEmail(email, full)
      // The session changed under us; nothing cached about the last person is
      // true any more.
      invalidate(cacheKeys.session)
      onSignedIn()
    } catch (err) {
      setCode("")
      setError(err instanceof ApiFailure ? err.message : "That didn't work. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col items-center gap-2 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoUrl ?? "/icons/icon.svg"} alt="" className="size-12 rounded-xl" />
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to {brand.name}</h1>
        <p className="text-muted-foreground">
          {step === "email"
            ? "We'll email you a six-digit code. No password to remember."
            : `Enter the code we sent to ${email}.`}
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        {step === "email" ? (
          <form className="flex flex-col gap-4" onSubmit={sendCode}>
            <Field config={emailConfig} htmlFor="email" error={error}>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@yourcompany.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={busy || !email}>
              {busy ? <Spinner /> : null}
              Email me a code
            </Button>
          </form>
        ) : (
          <>
            <CodeInput
              value={code}
              disabled={busy}
              onChange={(next) => {
                setCode(next)
                if (next.length === 6) void verify(next)
              }}
            />
            {error ? <p className="text-destructive text-center text-sm">{error}</p> : null}
            {busy ? (
              <div className="flex justify-center">
                <Spinner />
              </div>
            ) : null}
            <Button
              variant="ghost"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setStep("email")
                setError(undefined)
              }}
            >
              Use a different email
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
