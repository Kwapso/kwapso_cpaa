"use client"

// A small render-error catcher. When the wrapped UI throws, instead of Next.js
// nuking the whole page with the generic "a client-side exception has occurred",
// this shows an honest, generic card (and logs the stack) so nobody sees a blank
// tab. The raw error message is diagnostic value, not user copy — it renders
// too, but only on a host where "diagnosable" means us: staging or a local dev
// server. A client on production sees the same plain sentence a member of staff
// sees; the owner's ruling, 2026-08-29, after the raw error.message shipped to
// everyone regardless of environment. React error boundaries must be classes.

import * as React from "react"

import { Button } from "@shared/ui/components/button/button"
import { PageFailureScreen } from "@shared/ui/compositions/screens/page-failure"

import { reportError } from "@shared/web/log"
import { useT } from "@shared/web/language"
import { healStaleShell, isStaleShellError } from "@/components/version-watch"

// staging hosts are `agency-staging.kwapso.app` / `staging-client.kwapso.app`
// (OPERATIONS.md's hostname table) — hyphenated, never a real client's own
// domain. `href` rather than `hostname` alone because a test environment's
// stand-in `window.location` carries only the former.
function isDiagnosableHost(): boolean {
  if (typeof window === "undefined") return false
  try {
    const hostname = window.location.hostname || new URL(window.location.href).hostname
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname.includes("staging")
  } catch {
    return false
  }
}

type Props = { label?: string; children: React.ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Report with the component stack so a render crash is diagnosable from the
    // logs (the swappable seam — shared/web/log.ts → Cloudflare observability now).
    // The report goes FIRST and travels by sendBeacon, so it survives the reload
    // the next line may start: a healed stale shell should still leave a row, or
    // "how often does a deploy strand an open tab?" has no answer.
    reportError(`ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}`, error, {
      componentStack: info.componentStack,
    })
    // A STALE TAB IS NOT A BROKEN SCREEN, and this boundary is the only thing
    // that sees the difference. version-watch's own window listeners never hear
    // a chunk error that arrives through a lazy route — React's render phase
    // fires neither of the events they are bound to — so the heal has to be
    // invited in from here. Same seam, same one-reload cooldown.
    healStaleShell(error)
  }

  render() {
    // Reloading already, or refused by the cooldown: either way the honest thing
    // to say is what actually happened. A stack trace about a chunk id is not a
    // sentence anybody can act on.
    if (this.state.error && isStaleShellError(this.state.error))
      return <StaleShell />
    if (this.state.error)
      return (
        <Broken
          label={this.props.label}
          detail={this.state.error.message || String(this.state.error)}
          onRetry={() => this.setState({ error: null })}
        />
      )
    return this.props.children
  }
}

// THE TWO FALLBACKS ARE FUNCTIONS, and that is the whole reason they exist as
// separate components. A React error boundary must be a CLASS, a class cannot
// call a hook, and `t` is a hook — so the boundary that catches a crash was the
// one screen in the app that could not ask for the reader's language. It said
// "Something broke" in English to everybody. Two small function components move
// the words to where the hook can be called, and the class keeps the catching.

function StaleShell() {
  const t = useT()
  return (
    <div className="text-muted-foreground flex flex-col items-start gap-2 rounded-[var(--radius)] border p-4 text-sm">
      <p>{t("A new version of the app is ready.")}</p>
      <Button variant="secondary" size="sm" onClick={() => location.reload()}>
        {t("Reload")}
      </Button>
    </div>
  )
}

// THE KIT'S OWN WHOLE-PAGE FAILURE CARD (chapter 21, PageFailureScreen), the
// same one portal-shell.tsx already renders for its "unavailable" session
// state — this boundary sits at the ROOT of the tree (web/app/layout.tsx),
// so a throw it catches is exactly that case: the app itself could not draw a
// frame, not one screen inside a frame that's still standing.
//
// The wrapper's `mx-auto … max-w-md … px-6` is portal-shell.tsx's own
// unavailable-state wrapper, copied rather than re-invented — the same
// whole-page-card layout, same reason.
function Broken({
  label,
  detail,
  onRetry,
}: {
  label?: string
  detail: string
  onRetry: () => void
}) {
  const t = useT()
  return (
    <main className="mx-auto flex min-h-[100svh] max-w-md flex-col items-center justify-center px-6">
      <PageFailureScreen
        variant="500"
        labels={{
          // BORROWED, NOT WRITTEN. Both sentences already exist in the catalogue
          // in all three languages. Two new ones would have shipped in English to
          // anybody who chose German — the catalogue check only proves the
          // extraction is CURRENT, not that every string has a translation — and
          // the only way to translate them spends the owner's own API key, which
          // is not something a crash screen is worth. The borrowed pair also says
          // more than the pair they replace: "nothing is lost" is the sentence a
          // person actually needs at the moment their screen has just died.
          headline: t("Something broke"),
          body: t("Something on our side isn't responding. Nothing is lost. Try again in a moment."),
          action: t("Try again"),
          // The composition's own 500 defaults are a placeholder error code
          // ("Error 8F31-A2") and a fabricated "your last save went through
          // at 12:04" — this boundary has neither a real reference nor a
          // save to point to, so both are suppressed rather than left to
          // show invented text (the same rule portal-shell.tsx's own
          // PageFailureScreen call already follows for "unavailable").
          reference: undefined,
        }}
        onAction={onRetry}
      />
      {/* THE DIAGNOSTIC, NOT THE USER COPY. Everybody above sees the same
          honest sentence; only a diagnosable host also gets the raw error —
          which screen it was in, and what it actually said. */}
      {isDiagnosableHost() ? (
        <p className="text-muted-foreground border-destructive/30 bg-destructive/5 mt-4 w-full break-words rounded-[var(--radius)] border p-4 font-mono text-xs">
          {label ? `${label}: ` : ""}
          {detail}
        </p>
      ) : null}
    </main>
  )
}
