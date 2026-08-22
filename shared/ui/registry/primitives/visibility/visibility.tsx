"use client"

// Visibility — the runtime for config-driven show/hide.
//   <VisibilityProvider value={{ row, user, app }}> wraps your app/page and
//   supplies the data that rules are checked against.
//   useIsVisible(config) → false when the component should be hidden.
//   <Visible config={...}> renders its children only when visible.
//
// With no provider, the context is empty and components default to visible, so
// this is safe to use anywhere. See lib/config.ts for the rule engine.

import * as React from "react"

import {
  type BaseConfig,
  type VisibilityContext,
  emptyContext,
  evaluateRules,
} from "../../../lib/config"

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

/** Resolve whether a component should render, from its config + the context. */
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
