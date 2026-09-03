"use client"

// Onboarding (locked flow): first name + last name + optional photo + the
// app's background colour, then the tenancy worker either accepts waiting
// invites or creates "{First}'s team" with its own database. Everything here
// is library components.
//
// THE SPINE IS OFFERED HERE — client ruling, 2026-09-02, verbatim: "default
// spine to mango, but everyone can change it during the onboarding or anytime
// at settings". This screen is the "during the onboarding" half; Settings ·
// Appearance is the other. STILL ONE SCREEN: the flow's own comment calls it a
// locked flow, and a second step to hold the cards would trade a one-screen
// sign-up for a wizard in exchange for nothing — the kit's own three-step
// OnboardingRoute is exempted for exactly that mismatch (COMPOSITION_EXEMPT,
// "screens/onboarding.tsx"), and adding the step it describes would be
// adopting the shape we wrote the exemption to refuse.
//
// AND IT IS THE SAME CONTROL SETTINGS DRAWS, not a lighter one invented for
// this screen. `SpineChoice` (shared/web/spine-section.tsx) is the kit's own
// `AppearanceOptionGroup` + `SpinePicture` with the section furniture — the
// heading, the prose and the save-on-press — taken off. Its `short` prop is
// on here: onboarding draws `compositions/screens/onboarding.tsx`'s own
// SHORTER captions, not settings.tsx's longer ones — the kit itself keeps two
// lengths of the same three names, and `SpineChoice` carries both rather than
// picking one (see its own header for why that split is not R34 drift).
//
// A LIGHTER CONTROL WAS CONSIDERED AND IS NOT AVAILABLE, which is the whole
// answer to "picture cards are heavy for a one-screen flow". Kit ruling 26.05
// is explicit and is a client ruling: "a choice that changes how the app looks
// is never a row of pills … one card per option: a small picture of the thing
// itself, the option's name, one line of prose, and a mango badge on the one
// that is set". A Select or a pill row here would break that, and it would put
// a second vocabulary on the same question Settings already answers — which is
// exactly what `SpineChoice` was extracted to prevent. The kit's own
// onboarding composition reaches the same conclusion independently: its step 2
// draws `AppearanceOptionGroup` with these `SpinePicture` cards — three of
// them again, since the client's 2026-09-03 reversal ("i want to go back to
// the 3 options") restored `ink` and `paper` beside `mango`.
//
// SO THE SCREEN IS TALLER, AND THAT IS THE PRICE, PAID KNOWINGLY. The kit's
// group is `repeat(auto-fit, minmax(13.125rem, 1fr))` above a 45rem VIEWPORT,
// and this column is `max-w-sm` (24rem) — even one 13.125rem track barely
// fits, so on a desktop the three cards resolve to one column of full-width
// picture cards (~3.625rem of picture each) rather than the compact rows a
// phone gets below 45rem. The main is `min-h-[100svh]` and not `h-`, so it
// grows and the page scrolls; nothing is clipped. Worth a look on a real
// screen before this ships — it is the one thing here a test cannot see,
// because jsdom lays nothing out.
//
// SKIPPING IT LANDS ON MANGO, and lands there by writing NOTHING. The cards
// open on `toSpine(user.spine)` — mango for anybody who has never chosen — and
// the submit posts only when the person moved them, so `users.spine` stays
// NULL for somebody who simply took the default. NULL means "never chosen" and
// shared/spine.ts keeps that distinct from a deliberate mango on purpose; a
// screen that wrote mango just for being looked at would destroy the
// distinction for every person who ever onboards.

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/ui/components/avatar/avatar"
import { Button } from "@shared/ui/components/button/button"
import { Field } from "@shared/web/field"
import { FileUpload } from "@shared/ui/components/file-upload/file-upload"
import { Input } from "@shared/ui/components/input/input"
import { ModeToggle } from "@shared/ui/components/mode-toggle/mode-toggle"
// Still here for the SUBMIT button's busy state, which is a different thing from
// a boot wait and stays a spinner: it says "this button is working", inside a
// screen that is already drawn.
import { Spinner } from "@shared/ui/components/spinner/spinner"
import { toast } from "@shared/ui/components/sonner/sonner"
import { Headline } from "@shared/ui/components/typography/typography"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import { ApiFailure, auth, tenancy } from "@/lib/api"
import { BrandMark } from "@/components/brand-mark"
import { personInitials } from "@/lib/identity"
import { fileToDataUrl } from "@/lib/image"
import { useT } from "@shared/web/language"
import { MarkLoader, useMarkHold } from "@shared/web/mark-loader"
import { TEAM_CREATION_CLOSED } from "@shared/product"
import { InvitationsPanel } from "@/components/invitations"
import { SpineChoice } from "@shared/web/spine-section"
import { toSpine, type Spine } from "@shared/spine"

const firstNameField = { ...defaultFieldConfig, label: "First name", required: true }
const lastNameField = { ...defaultFieldConfig, label: "Last name", required: true }
/* R33's sanctioned way out: `label:`/`helpText:` on an object that spreads a
   field config is translated on the way to the screen by shared/web/field.tsx,
   because `t` is a hook and this is a module-level constant. "Background" is
   the word Settings · Appearance heads the same three cards with — one thing,
   one name (R34), renamed from "Sidebar" once the fill it picks stopped being
   confined to the rail and started painting the whole screen. The help line
   is the client's own second clause said out loud: nobody should feel they
   are deciding something now that they cannot undo. */
const spineField = {
  ...defaultFieldConfig,
  label: "Background",
  helpText: "You can change this later in Settings.",
}

/** The code every agency door answers a client login with (`refusePortalCaller`,
 * shared/workers/account-scope.ts). Named once here rather than typed at each of
 * the two places that read it — a string literal that has to match a worker is a
 * string literal somebody will mistype. */
const CLIENT_LOGIN = "client_login"

export default function OnboardingPage() {
  const t = useT()
  const router = useRouter()
  const [checking, setChecking] = React.useState(true)
  // Held one beat past `checking` so the mark reaches its ending rather than
  // being cut wherever this door happens to resolve (shared/web/mark-loader).
  const holding = useMarkHold(checking)
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [photo, setPhoto] = React.useState<string | undefined>()
  // THE SPINE, HELD LOCALLY UNTIL THE SUBMIT. `savedSpine` is what the row says
  // right now (null for almost everybody here, which reads as mango); `spine` is
  // what the cards show. Keeping both is what lets the submit post ONLY when the
  // person actually moved the cards — see `finish`.
  const [savedSpine, setSavedSpine] = React.useState<string | null>(null)
  const [spine, setSpine] = React.useState<Spine>(toSpine(null))
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
        // Read, not assumed. Somebody who bounced back here (a removed member,
        // a failed team creation) may already have chosen a spine in a previous
        // life, and showing them mango would be this screen telling them their
        // own setting is something else.
        setSavedSpine(user.spine ?? null)
        setSpine(toSpine(user.spine))
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
      // THE SPINE GOES FIRST, AND IT IS PART OF THIS SUBMIT RATHER THAN A SAVE
      // OF ITS OWN. Settings saves on press because it can revert a failure
      // into a screen the person is still standing on; here there is no such
      // screen — a preference written while the profile is still half-entered
      // is a preference saved for somebody who may abandon the form, and it
      // would be the only half of this submit that survived a failure of the
      // rest. So the cards are local until Continue is pressed, and the whole
      // press is one act.
      //
      // FIRST, of the three calls, on purpose: it is the only reversible and
      // cheap one. `updateProfile` mints a NEW R2 key for the photo every time
      // it runs, and `bootstrap` ACCEPTS pending invites — neither is something
      // to have already done when a later call fails and the person presses
      // Continue again. A refusal here costs one retry and leaves nothing
      // behind; a refusal after them costs an orphaned object or a re-run of an
      // acceptance.
      //
      // AND ONLY WHEN THEY MOVED IT. Equal to what the row already says (which
      // is null → mango for almost everybody) means the person took the
      // default, and taking the default writes nothing — `users.spine` stays
      // null, which is the honest record of "never chosen" that shared/spine.ts
      // keeps distinct from a deliberate mango.
      if (spine !== toSpine(savedSpine)) {
        await auth.setSpine(spine)
        setSavedSpine(spine)
      }
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
  // one of its own reads, so it wears the mark like every other one… and, like
  // the shell's, it is held open until the mark finishes: this is a first-load
  // wait, so the composition gets its ending here too (useMarkHold · splash.ts).
  if (holding) return <MarkLoader label={t("Loading…")} />

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
          {/* display-m — CLIENT CORRECTION, 2026-08-31: main-screen titles must
              be the kit's own named "Page title" step (56/500), not h2 (32) —
              see collection-heading.tsx's own note for the full ruling. This
              standalone screen has no collection or record under it, but it is
              still the page's own name, in the same role. */}
          <Headline as="h1" size="display-m" className="mt-2">{t("You're in the right place")}</Headline>
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
          {/* display-m — see this file's other Headline for the ruling. */}
          <Headline as="h1" size="display-m">
            {teamless ? t("You're not in a team") : t("Set up your profile")}
          </Headline>
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
            team-switcher's hidden Create item, web/test/one-team.test.ts).

            AND THE ACCEPT LIVES HERE NOW. The withdrawal orphaned the other
            half of its own sentence: "ask for a new invite" — while
            use-active-team bounces every teamless person OFF /invitations and
            back to this screen, and the withdrawn form was the only caller of
            bootstrap, the door that accepts. So the invitations panel mounts
            exactly where the bounce lands, and accepting re-checks and routes
            home. The email's /invitations link now ends somewhere alive. */}
        {teamless && TEAM_CREATION_CLOSED ? (
          <div className="mt-6">
            <InvitationsPanel
              refresh={async () => {
                const { teams } = await tenancy.bootstrap()
                if (teams.length > 0) router.replace("/home")
              }}
            />
          </div>
        ) : (
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

            {/* Below the name and above Continue: the two things that identify
                the person come first, and the one that decorates their app
                comes last, so nobody reads it as a step they have to complete.
                The badge says "Picked" rather than Settings' "In use" — 27.14's
                own word for the same card, and the true one here, since nothing
                is in use until the form is submitted. */}
            <Field config={spineField}>
              <SpineChoice
                value={spine}
                onChange={setSpine}
                disabled={busy}
                badgeLabel={t("Picked")}
                short
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
