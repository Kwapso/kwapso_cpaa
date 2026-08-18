"use client"

// The root redirects to Home, so the address bar always says where you are.
// Real landing logic lives in the shell (which decides between the door, the
// name question, the "nothing here yet" screen, and the app).
//
// This is the first React frame of a cold start — the splash is still dissolving
// over it — so it draws the same mark, still turning, rather than a spinner.

import * as React from "react"
import { useRouter } from "next/navigation"

import { useT } from "@shared/web/language"
import { MarkLoader } from "@shared/web/mark-loader"

export default function RootRedirect() {
  const t = useT()
  const router = useRouter()
  React.useEffect(() => {
    router.replace("/home")
  }, [router])
  return <MarkLoader label={t("Loading…")} />
}
