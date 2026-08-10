"use client"

// Mounts the global error/unhandled-rejection listeners once, at the app root.
// The error boundary below it catches what React can see; these two handlers
// catch what it cannot — an async throw, a rejected promise nobody awaited.
// Without this the portal has no way to report either, which is what made a
// swallowed sign-out invisible. Renders nothing.

import * as React from "react"

import { installGlobalErrorReporting } from "@web/lib/log"

export function ErrorReporter() {
  React.useEffect(() => {
    installGlobalErrorReporting()
  }, [])
  return null
}
