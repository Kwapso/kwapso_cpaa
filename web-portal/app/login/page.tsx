"use client"

// The sign-in door. Deliberately its own URL rather than a state of the shell,
// so a client who bookmarks it, or is sent it, lands somewhere that makes sense.

import { useRouter } from "next/navigation"

import { PortalDoor } from "@/components/portal-shell"
import { SignIn } from "@/components/sign-in"

export default function LoginPage() {
  const router = useRouter()
  return (
    <PortalDoor>
      <SignIn onSignedIn={() => router.replace("/home")} />
    </PortalDoor>
  )
}
