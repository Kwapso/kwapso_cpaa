// Small presentational pieces for the deep-link screen — the empty/not-found/
// error states and the "list with a create button above it" wrapper. Extracted
// so the resolver stays focused on routing + data.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Card, CardContent } from "@kwapso/ui/registry/primitives/card/card"
import { Plus, Mail, Upload, Download, Lock, SearchX, TriangleAlert } from "lucide-react"

/** A state with nothing in it still gets a face. One glyph in the leading slot,
 * `aria-hidden` beside the sentence that carries the meaning (UI-CONVENTIONS §5)
 * — a bare line of grey text in the middle of a page reads as a screen that
 * failed rather than a screen with nothing on it. */
function StateLine({
  icon: Icon,
  tone,
  children,
}: {
  icon: typeof Lock
  tone?: "muted" | "destructive"
  children: React.ReactNode
}) {
  const colour = tone === "destructive" ? "text-destructive" : "text-muted-foreground"
  return (
    <p className={`flex items-center gap-2 text-sm ${colour}`}>
      <Icon aria-hidden className="size-4 shrink-0" />
      {children}
    </p>
  )
}

export function NoAccess() {
  return (
    <StateLine icon={Lock}>
      You don&apos;t have access to this, or it doesn&apos;t exist.
    </StateLine>
  )
}

export function NotFound() {
  return <StateLine icon={SearchX}>That screen doesn&apos;t exist.</StateLine>
}

export function LoadError({ what }: { what: string }) {
  return (
    <StateLine icon={TriangleAlert} tone="destructive">
      Couldn&apos;t load {what}.
    </StateLine>
  )
}

/** Box a collection (its title/search/filter/rows) into ONE card surface so it
 * reads as a single unit. The engine renders each list as surface="none" so this
 * Card is the single box (no card-in-a-card); since library 0.4.0 the flat list
 * rounds + clips its own row-group, so the hover/selected highlight follows the
 * corners here just like the library demo (UI-GAPS #12, shipped). */
export function CollectionCard({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  )
}

/** THE ADD BUTTON, wherever one appears (UI-RULEBOOK B3 / D9, CHECKLIST 11.7).
 *
 * A plus glyph and nothing else. The words it used to carry become the button's
 * accessible name and its tooltip, which is where a label belongs on a control
 * whose meaning is already in the collection it sits above.
 *
 * It is a seam and not a class string because it was written out ten times, in
 * six files, for the same act — and ten copies is ten chances for the eleventh
 * sub-collection to grow a wordy button again. */
export function AddButton({
  label,
  onClick,
  icon,
}: {
  /** The old label. Now the accessible name and the tooltip. */
  label: string
  onClick: () => void
  /** Defaults to `Plus` — the UI-CONVENTIONS §4 icon for create. */
  icon?: React.ReactNode
}) {
  return (
    <Button size="icon" onClick={onClick} aria-label={label} title={label}>
      {icon ?? <Plus className="size-4" />}
    </Button>
  )
}

/** A list screen with a host-rendered create button above it (the engine list
 * has no "add" affordance — creating opens a ?panel form). The collection itself
 * is boxed in a CollectionCard so title/search/filter/rows read as one unit. */
export function SectionWithCreate({
  show,
  label,
  icon,
  onCreate,
  secondary,
  download,
  aboveCard,
  children,
}: {
  show: boolean
  label: string
  icon: "plus" | "mail"
  onCreate: () => void
  /** An optional second action beside the create button — today the contextual
   * "Import CSV" affordance on import-target pages (Learning / Member roles). */
  secondary?: { show: boolean; label: string; onClick: () => void }
  /** An optional DOWNLOAD action (Export CSV): a plain link so the browser saves
   * the file with the session cookie — export needs only READ, so it shows for
   * anyone who can see the screen (hidden while the list is empty). */
  download?: { show: boolean; label: string; href: string }
  /** Content shown between the create row and the boxed collection, OUTSIDE the
   * card — e.g. the Tickets My/All raiser strip (it scopes the list, not part of it). */
  aboveCard?: React.ReactNode
  children: React.ReactNode
}) {
  const Icon = icon === "plus" ? Plus : Mail
  const showSecondary = secondary?.show ?? false
  const showDownload = download?.show ?? false
  return (
    <div className="flex flex-col gap-4">
      {(show || showSecondary || showDownload) && (
        // flex-wrap: on a narrow phone a row of action buttons (Export/Import/New)
        // must REFLOW to a new line, never clip. `justify-end` alone pushes overflow
        // off the LEFT edge where the container hides it (the owner's cut-off button).
        // Global UI rule — see UI-CONVENTIONS "Action-button rows never clip".
        <div className="flex flex-wrap justify-end gap-2">
          {showDownload && download && (
            <Button asChild variant="outline" className="gap-1">
              <a href={download.href}>
                <Download className="size-4" />
                {download.label}
              </a>
            </Button>
          )}
          {showSecondary && secondary && (
            <Button variant="outline" onClick={secondary.onClick} className="gap-1">
              <Upload className="size-4" />
              {secondary.label}
            </Button>
          )}
          {/* THE ADD BUTTON IS A GLYPH (UI-RULEBOOK B3, CHECKLIST 11.7). One seam,
              so every collection in the agency app loses its label at once, and
              the thirteen labels it deletes ("New task", "Start a sprint", "Raise
              ticket", "Map a process"…) become the accessible name and the
              tooltip rather than disappearing. That also ends the two competing
              naming families the screens had grown, "New <noun>" and "<verb> a
              <noun>", without anybody having to choose between them.
              Import and Export keep their words above (B4): they are rare,
              consequential and not guessable from a glyph. */}
          {show && <AddButton label={label} onClick={onCreate} icon={<Icon className="size-4" />} />}
        </div>
      )}
      {aboveCard}
      <CollectionCard>{children}</CollectionCard>
    </div>
  )
}
