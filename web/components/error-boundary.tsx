"use client"

// A small render-error catcher. When the wrapped UI throws, instead of Next.js
// nuking the whole page with the generic "a client-side exception has occurred",
// we show the ACTUAL error message inline (and log the stack) so a crash on
// staging is diagnosable on the spot. React error boundaries must be classes.

import * as React from "react"

import { Button } from "@shared/ui/controls/button/button"

import { reportError } from "@shared/web/log"
import { useT } from "@shared/web/language"
import { healStaleShell, isStaleShellError } from "@/components/version-watch"

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
    <div className="border-destructive/30 bg-destructive/5 flex flex-col gap-2 rounded-[var(--radius)] border p-4 text-sm">
      {/* ONE SENTENCE PER BRANCH, not "Something broke" plus a tail. The tail was
          a template naming the panel, so the sentence a German reader got was
          half-translated at best and could not be reordered at all. */}
      <p className="text-destructive font-medium">
        {label ? t("Something broke in {label}.", { label }) : t("Something broke.")}
      </p>
      <p className="text-muted-foreground break-words font-mono text-xs">{detail}</p>
      <div>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t("Try again")}
        </Button>
      </div>
    </div>
  )
}
