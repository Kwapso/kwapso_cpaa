"use client"

// THE PORTAL'S OWN INLINE ERROR REGISTER — a section that could not load its data
// says so, rather than rendering as if there were simply nothing there. Every
// empty section in this app already draws the same box
// (`rounded-[var(--radius)] bg-surface-panel p-8 text-center`, a title plus a
// smaller muted line — see home-screen.tsx, tickets-screen.tsx,
// deliverables-screen.tsx); this is that box's error twin, with the one useful
// next step. Words and icon match error-boundary.tsx's whole-page version, at
// section scale rather than page scale.
//
// The agency app's answer to the same problem is the kit's `ShapeStateBody`
// (`shared/ui/compositions/states/states`) — a composition this app has never
// reached for anywhere else. Building a second, portal-shaped register here
// rather than importing that one is deliberate: it keeps every state on this
// front door speaking the one plain idiom it already uses, instead of adding a
// twelfth shape's worth of a system the portal does not otherwise draw from.

import { Button } from "@shared/ui/components/button/button"
import { ArrowCounterClockwise } from "@shared/ui/foundations/icons"

import { useT } from "@shared/web/language"

export function ErrorPanel({
  title,
  description,
  onRetry,
}: {
  /** What went wrong, in one plain sentence. */
  title: string
  /** What to do next, when it isn't simply "try again". */
  description?: string
  onRetry: () => void
}) {
  const t = useT()
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-3 rounded-[var(--radius)] bg-surface-panel p-8 text-center">
      <div>
        <p className="text-foreground font-medium">{title}</p>
        {description ? <p className="mt-1 text-sm">{description}</p> : null}
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <ArrowCounterClockwise className="size-3.5" />
        {t("Try again")}
      </Button>
    </div>
  )
}
