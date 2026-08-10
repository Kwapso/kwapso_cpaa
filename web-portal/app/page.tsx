"use client"

// The root redirects to Home, so the address bar always says where you are.
// Real landing logic lives in the shell (which decides between the door, the
// name question, the "nothing here yet" screen, and the app).

import * as React from "react"
import { useRouter } from "next/navigation"

import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"

export default function RootRedirect() {
  const router = useRouter()
  React.useEffect(() => {
    router.replace("/home")
  }, [router])
  return (
    <main className="flex min-h-[100svh] items-center justify-center">
      <Spinner />
    </main>
  )
}
