"use client"

// Visibility — the runtime for config-driven show/hide. ENGINE-PRIVATE.
//
// This is the OLD library's rules-based hook, moved here when the library was
// replaced by the design kit (shared/ui, Kwapso/kwapso-ui-ux). It survives because
// it is BEHAVIOUR: `useIsVisible(config)` evaluates the config's visibility
// RULES against the row/user/app context. The kit ships a hook of the same
// name in controls/visibility, and it answers a DIFFERENT question — viewport
// visibility via IntersectionObserver (the kit's own header flags the
// name-collision, GAPS-G VIS-1). Do not merge the two.

import * as React from "react"

import {
  type BaseConfig,
  type VisibilityContext,
  emptyContext,
  evaluateRules,
} from "./config"

const Ctx = React.createContext<VisibilityContext>(emptyContext)

export function VisibilityProvider({
  value,
  children,
}: {
  value: VisibilityContext
  children: React.ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useVisibilityContext() {
  return React.useContext(Ctx)
}

export function useIsVisible(config: Partial<BaseConfig> | undefined): boolean {
  const ctx = React.useContext(Ctx)
  if (!config) return true
  if (config.visible === false) return false
  return evaluateRules(config.visibilityRules ?? [], ctx)
}

export function Visible({
  config,
  children,
}: {
  config: Partial<BaseConfig>
  children: React.ReactNode
}) {
  return useIsVisible(config) ? <>{children}</> : null
}
