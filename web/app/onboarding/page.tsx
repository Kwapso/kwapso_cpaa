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
} from "@kwapso/ui/registry/primitives/avatar/avatar"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { FileUpload } from "@kwapso/ui/registry/primitives/file-upload/file-upload"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { ModeToggle } from "@kwapso/ui/registry/primitives/mode-toggle/mode-toggle"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure, auth, tenancy } from "@/lib/api"
import { BrandMark } from "@/components/brand-mark"
import { personInitials } from "@/lib/identity"
import { fileToDataUrl } from "@/lib/image"

const firstNameField = { ...defaultFieldConfig, label: "First name", required: true }
const lastNameField = { ...defaultFieldConfig, label: "Last name", required: true }

export default function OnboardingPage() {
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

  React.useEffect(() => {
    let alive = true
    async function check() {
      try {
        const { user } = await auth.me()
        // Don't trust a stale currentTeamId — only send to the app when they
        // ACTUALLY belong to a team (a removed/teamless user stays here).
        if (user.onboardingComplete) {
          const ctx = await tenancy.active()
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
      toast.error("Couldn't read that image — try another one.")
    }
  }

  async function finish(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await auth.updateProfile({ firstName, lastName, imageDataUrl: photo })
      await tenancy.bootstrap()
      router.replace("/home")
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : "Something went wrong. Try again."
      )
      setBusy(false)
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center">
        <Spinner />
      </main>
    )
  }

  const initials = personInitials(firstName, lastName)

  return (
    <main className="flex min-h-[100svh] items-center justify-center p-6">
      <div className="fixed right-4 top-4 z-30">
        <ModeToggle />
      </div>
      <div className="animate-rise w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <BrandMark className="mb-1" />
          <h1 className="text-2xl font-semibold tracking-tight">
            {teamless ? "You're not in a team" : "Set up your profile"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {teamless
              ? "An admin can invite you back, or you can start a team of your own below."
              : "Tell us who you are — your team gets created right after."}
          </p>
        </div>
        <form className="mt-6 flex flex-col gap-4" onSubmit={finish}>
            <div className="flex flex-col items-center gap-3">
              <Avatar className="size-20">
                {photo && <AvatarImage src={photo} alt="Your photo" />}
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <FileUpload accept="image/*" multiple={false} onChange={handlePhoto} />
            </div>

            <Field config={firstNameField} htmlFor="first-name">
              <Input
                id="first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Chris"
                disabled={busy}
                autoFocus
              />
            </Field>
            <Field config={lastNameField} htmlFor="last-name">
              <Input
                id="last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Martin"
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
              {busy ? "Creating your team…" : teamless ? "Start my own team" : "Continue"}
            </Button>
          </form>
      </div>
    </main>
  )
}
