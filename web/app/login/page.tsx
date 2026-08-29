"use client"

// The sign-in screen. Its chrome is the kit's own composition
// (compositions/screens/sign-in-system.tsx); see AuthCard for the wiring.

import { useRouter } from "next/navigation"

import { ModeToggle } from "@shared/ui/components/mode-toggle/mode-toggle"

import { AuthCard } from "@/components/auth-card"

export default function LoginPage() {
  const router = useRouter()
  return (
    <>
      <div className="fixed right-4 top-4 z-30">
        <ModeToggle />
      </div>
      <AuthCard onSignedIn={() => router.replace("/home")} />
    </>
  )
}
