"use client"

// Onboarding (locked flow): first name + last name + optional photo, then the
// tenancy worker either accepts waiting invites or creates "{First}'s team"
// with its own database. Everything here is library components.

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/ui/controls/avatar/avatar"
import { Button } from "@shared/ui/controls/button/button"
import { Field } from "@shared/web/field"
import { FileUpload } from "@shared/ui/controls/file-upload/file-upload"
import { Input } from "@shared/ui/controls/input/input"
import { ModeToggle } from "@shared/ui/controls/mode-toggle/mode-toggle"
// Still here for the SUBMIT button's busy state, which is a different thing from
// a boot wait and stays a spinner: it says "this button is working", inside a
// screen that is already drawn.
import { Spinner } from "@shared/ui/controls/spinner/spinner"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import { ApiFailure, auth, tenancy } from "@/lib/api"
import { BrandMark } from "@/components/brand-mark"
import { personInitials } from "@/lib/identity"
import { fileToDataUrl } from "@/lib/image"
import { useT } from "@shared/web/language"
import { MarkLoader } from "@shared/web/mark-loader"
import { TEAM_CREATION_CLOSED } from "@shared/product"

const firstNameField = { ...defaultFieldConfig, label: "First name", required: true }
const lastNameField = { ...defaultFieldConfig, label: "Last name", required: true }

/** The code every agency door answers a client login with (`refusePortalCaller`,
 * shared/workers/account-scope.ts). Named once here rather than typed at each of
 * the two places that read it — a string literal that has to match a worker is a
 * string literal somebody will mistype. */
const CLIENT_LOGIN = "client_login"

export default function OnboardingPage() {
  const t = useT()
  const router = useRouter()
  const [checking, setChecking] = React.useState(true)
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [photo, setPhoto] = React.useState<string | undefined>()
  const [busy, setBusy] = React.useState(false)
  // Someone who already finished onboarding and has NO team didn't arrive here
  // to sign up — they were removed from their last one (or their team's creation
  // failed). Telling them "your team gets created right after" reads as an
  // instruction to start again, which is neither what happened nor what they
  // usually want. Same form, honest words.
  const [teamless, setTeamless] = React.useState(false)
  // A CLIENT LOGIN STANDING AT THE AGENCY'S FRONT DOOR. Their invitation email
  // sends them here — it is built from the agency's own address for everybody —
  // and every door they then knock on refuses them, correctly (R21). Until now
  // nothing in this app knew that refusal by name, so a client got a red toast
  // and a form that could never finish, or a bounce back to the sign-in page.
  // Both look like a broken app and neither says the one useful thing.
  const [wrongDoor, setWrongDoor] = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    async function check() {
      try {
        const { user } = await auth.me()
        // Don't trust a stale currentTeamId — only send to the app when they
        // ACTUALLY belong to a team (a removed/teamless user stays here).
        if (user.onboardingComplete) {
          // `active` refuses a client login outright, so its failure is not
          // always "you are signed out" — read the code before deciding.
          let ctx
          try {
            ctx = await tenancy.active()
          } catch (e) {
            if (e instanceof ApiFailure && e.code === CLIENT_LOGIN) {
              if (alive) {
                setWrongDoor(e.message)
                setChecking(false)
              }
              return
            }
            throw e
          }
          if (ctx.teams.length > 0) {
            router.replace("/home")
            return
          }
          if (alive) setTeamless(true)
        }
        if (!alive) return
        setFirstName(user.firstName ?? "")
        setLastName(user.lastName ?? "")
        setPhoto(user.imageUrl ?? undefined)
        setChecking(false)
      } catch {
        router.replace("/login")
      }
    }
    void check()
    return () => {
      alive = false
    }
  }, [router])

  async function handlePhoto(files: File[]) {
    if (!files[0]) return
    try {
      setPhoto(await fileToDataUrl(files[0]))
    } catch {
      toast.error(t("Couldn't read that image. Try another one."))
    }
  }

  async function finish(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await auth.updateProfile({ firstName, lastName, imageDataUrl: photo })
      // THE LOOP THAT COST AN AFTERNOON WAS THIS ONE LINE'S FAULT. Bootstrap
      // succeeds and returns NO TEAMS for anybody with no invitation waiting —
      // which is everybody, because team creation is closed (TEAM_CREATION_CLOSED
      // is the product, not a bug). Sending them to /home regardless meant /home
      // found no team and sent them straight back here, for ever, with no error
      // and nothing to read. The door was answering honestly the whole time; this
      // side was not listening to the answer.
      const { teams } = await tenancy.bootstrap()
      if (teams.length === 0) {
        setTeamless(true)
        setBusy(false)
        return
      }
      router.replace("/home")
    } catch (err) {
      // A client login gets here having ALREADY joined the team — bootstrap
      // accepts pending invites before it decides whether it may describe the
      // team to the caller, and it may not describe the agency to a client. So
      // this refusal is the end of a successful journey at the wrong address,
      // and it deserves a sentence rather than a red toast on a form they are
      // now stuck on.
      if (err instanceof ApiFailure && err.code === CLIENT_LOGIN) {
        setWrongDoor(err.message)
        setBusy(false)
        return
      }
      toast.error(
        err instanceof ApiFailure ? err.message : t("Something went wrong. Try again.")
      )
      setBusy(false)
    }
  }

  // Still deciding which door this is — an app-boot wait, not a screen waiting on
  // one of its own reads, so it wears the mark like every other one.
  if (checking) return <MarkLoader label={t("Loading…")} />

  // THE WRONG DOOR, SAID ONCE AND WITHOUT A FORM UNDER IT. There is deliberately
  // nothing to press: this app has nothing for a client, and a button that tried
  // to send them onward would need to know the portal's address — which lives in
  // the workers' configuration, not in a static export. Their own bookmark, or
  // the person who invited them, is a better answer than a link this build would
  // have to guess.
  if (wrongDoor) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center p-6">
        <div className="fixed right-4 top-4 z-30">
          <ModeToggle />
        </div>
        <div className="motion-panel-in w-full max-w-sm text-center">
          <BrandMark className="mb-1" />
          <h1 className="mt-2 text-2xl font-medium tracking-tight">{t("You're in the right place")}</h1>
          {/* The worker's own sentence, not a second copy written here. */}
          <p className="text-muted-foreground mt-2 text-sm">{wrongDoor}</p>
          <p className="text-muted-foreground mt-4 text-sm">
            {t("Your invite has been accepted, so nothing is waiting on you. Open the portal at the address your invite came from, and sign in with this same email address.")}
          </p>
        </div>
      </main>
    )
  }

  const initials = personInitials(firstName, lastName)

  return (
    <main className="flex min-h-[100svh] items-center justify-center p-6">
      <div className="fixed right-4 top-4 z-30">
        <ModeToggle />
      </div>
      <div className="motion-panel-in w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <BrandMark className="mb-1" />
          <h1 className="text-2xl font-medium tracking-tight">
            {teamless ? t("You're not in a team") : t("Set up your profile")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {teamless
              ? t("An admin can invite you back — ask them to send a new invite to this email address.")
              : t("Tell us who you are, your team gets created right after.")}
          </p>
        </div>
        {/* NO FORM FOR THE TEAMLESS under a closed product. The button used to
            promise a team of their own while TEAM_CREATION_CLOSED made the server
            refuse the creation — so pressing it looped back to this screen,
            silently, for ever. A promise the product forbids is not softened
            by keeping the button; it is withdrawn (same rule as the
            team-switcher's hidden Create item, web/test/one-team.test.ts). */}
        {teamless && TEAM_CREATION_CLOSED ? null : (
        <form className="mt-6 flex flex-col gap-4" onSubmit={finish}>
            <div className="flex flex-col items-center gap-4">
              <Avatar className="size-20">
                {photo && <AvatarImage src={photo} alt={t("Your photo")} />}
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <FileUpload accept="image/*" multiple={false} onFilesSelected={handlePhoto} />
            </div>

            <Field config={firstNameField} htmlFor="first-name">
              <Input
                id="first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t("Chris")}
                disabled={busy}
                autoFocus
              />
            </Field>
            <Field config={lastNameField} htmlFor="last-name">
              <Input
                id="last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t("Martin")}
                disabled={busy}
              />
            </Field>

            <Button
              type="submit"
              className="w-full"
              disabled={busy || !firstName.trim() || !lastName.trim()}
            >
              {busy ? <Spinner /> : null}
              {/* The button says what pressing it DOES. For a removed member
                  "Continue" hides the consequence — they'd end up owning a new
                  team they never asked for. */}
              {busy ? t("Creating your team…") : t("Continue")}
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}
