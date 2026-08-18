"use client"

// A small render-error catcher. When the wrapped UI throws, instead of Next.js
// nuking the whole page with the generic "a client-side exception has occurred",
// we show the ACTUAL error message inline (and log the stack) so a crash on
// staging is diagnosable on the spot. React error boundaries must be classes.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"

import { reportError } from "@shared/web/log"
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
      return (
        <div className="text-muted-foreground flex flex-col items-start gap-2 rounded-xl border p-4 text-sm">
          <p>A new version of the app is ready.</p>
          <Button variant="outline" size="sm" onClick={() => location.reload()}>
            Reload
          </Button>
        </div>
      )
    if (this.state.error) {
      return (
        <div className="border-destructive/30 bg-destructive/5 flex flex-col gap-2 rounded-xl border p-4 text-sm">
          <p className="text-destructive font-medium">
            Something broke{this.props.label ? ` in ${this.props.label}` : ""}.
          </p>
          <p className="text-muted-foreground break-words font-mono text-xs">
            {this.state.error.message || String(this.state.error)}
          </p>
          <div>
            <Button variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
