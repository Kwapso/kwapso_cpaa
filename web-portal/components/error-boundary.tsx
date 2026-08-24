"use client"

// A render-error catcher for the portal. Same seam as the agency app's (report
// through shared/web/log → the gateway → the 90-day error log), DIFFERENT words.
//
// The agency version prints the raw error message, because the person reading it
// is us and a stack trace is the most useful thing we could give them. A client
// reading a stack trace learns nothing and loses confidence. So the message here
// says what happened in plain words and offers the one thing that usually works,
// while the technical detail goes where it belongs: the log.

import * as React from "react"

import { Button } from "@shared/ui/controls/button/button"
import { RotateCcw } from "@shared/ui/icons"

import { reportError } from "@shared/web/log"
import { useT } from "@shared/web/language"

type Props = { label?: string; children: React.ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError(`portal:ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}`, error, {
      componentStack: info.componentStack,
    })
  }

  render() {
    if (this.state.error) return <Broken onRetry={() => this.setState({ error: null })} />
    return this.props.children
  }
}

// A FUNCTION, because a React error boundary must be a CLASS and a class cannot
// call a hook — so the one screen a client sees when something fails was the one
// screen that could not ask for their language. Same split as the agency app's.
function Broken({ onRetry }: { onRetry: () => void }) {
  const t = useT()
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
      <p className="text-lg font-medium">{t("This part didn't load.")}</p>
      <p className="text-muted-foreground">
        {t("We've been told about it. Try again, and if it keeps happening, raise a ticket and we'll sort it out.")}
      </p>
      <Button variant="secondary" onClick={onRetry}>
        <RotateCcw className="size-3.5" />
        {t("Try again")}
      </Button>
    </div>
  )
}
