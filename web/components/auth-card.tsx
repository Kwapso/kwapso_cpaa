"use client"

// THE SIGN-IN SCREEN'S CHROME — drawn through the kit's own composition,
// compositions/screens/sign-in-system.tsx (LoginRoute). Was a temporary
// placeholder (web/components/temp/auth-card.tsx, UI-GAPS.md #2) built from
// primitives while the library had no sign-in collection; the library shipped
// one and this is the swap the gap always said was coming.
//
// LoginRoute's own header rules out MainScreen/ScreenShell for this screen on
// purpose — an unauthenticated person has no application shell around them —
// so there is no nesting conflict here the way there is for a collection.
//
// The email → code → signed-in BEHAVIOUR (including the cooldown rule) still
// lives once, in shared/web/use-email-sign-in.ts, which the portal's own
// sign-in screen renders too. This file is only the agency door's CHROME.

import { LoginRoute } from "@shared/ui/compositions/screens/sign-in-system"
import { GoogleMark, useSignInError } from "@shared/web/google-sign-in"
import { toast } from "@shared/ui/components/sonner/sonner"
import { useEmailSignIn } from "@shared/web/use-email-sign-in"

import { auth } from "@/lib/api"
import { useT } from "@shared/web/language"

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
    <LoginRoute
      // R33: LoginRoute's own defaults are English literals baked into the
      // (vendored, uneditable) composition — every one restated here through
      // t() so a reader who chose German gets German rather than the kit's
      // own copy silently showing through. Kept word-for-word what the old
      // hand-built card said.
      serifLine={t("The work, and how it is going.")}
      emailTitle={t("Sign in")}
      emailDescription={t("Use the address your account is registered to.")}
      codeTitle={t("Enter your code")}
      formatCodeSent={(addr) => t("We sent six digits to {email}.", { email: addr })}
      step={step}
      email={email}
      onEmailChange={setEmail}
      emailError={step === "email" ? (error ?? googleError) : undefined}
      code={code}
      onCodeChange={enterCode}
      codeError={step === "code" ? error : undefined}
      onSubmit={(e) => {
        e.preventDefault()
        if (step === "email") void sendCode()
      }}
      continueLabel={t("Email me a code")}
      submitting={busy}
      onResend={() => void sendCode()}
      onBack={useDifferentEmail}
      // No kwapso photography exists yet — the kit's own default here is a
      // generic stock demo photo (AuthPhotograph), which is wrong for this
      // brand. `null`, not omitted: the template only suppresses the panel on
      // an explicit null: an omitted prop falls through to its own default.
      media={null}
      providers={[
        {
          id: "google",
          label: t("Continue with Google"),
          icon: <GoogleMark />,
          onSelect: () => window.location.assign(auth.googleStartUrl),
        },
      ]}
    />
  )
}
