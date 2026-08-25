// Small presentational pieces for the deep-link screen — the empty/not-found/
// error states and the "list with a create button above it" wrapper. Extracted
// so the resolver stays focused on routing + data.

import * as React from "react"

import { cn } from "@shared/ui/lib/utils"
import { Button, buttonVariants } from "@shared/ui/controls/button/button"
import { Card, CardContent } from "@shared/ui/controls/card/card"
import { Plus, Mail, Upload, Download, Lock, SearchX, TriangleAlert } from "@shared/ui/icons"
import { DynamicIcon, type IconName } from "lucide-react/dynamic"

import { CONCEPT_ICON } from "@/lib/pages"
import { useT } from "@shared/web/language"

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

/** A COLLECTION WITH NOTHING IN IT — the same face `StateLine` gives a refusal
 * or a 404, for the far commoner state: a panel, a tab or a list that is empty
 * because nothing has happened yet.
 *
 * WHY IT IS A SEAM AND NOT A CLASS NAME. There were twenty-five of these
 * written out by hand across the agency screens, every one a bare grey `<p>`,
 * and a lone line of grey text in the middle of a card reads as a screen that
 * FAILED rather than one with nothing on it yet — which is precisely the screen
 * a brand-new team meets on every page. `StateLine` above has said so in a
 * comment since the deep-link states were extracted; nothing else could reach
 * it.
 *
 * THE GLYPH IS DERIVED, never chosen here. It comes from `CONCEPT_ICON` — the
 * one icon vocabulary (UI-CONVENTIONS §4) — keyed by the concept the empty
 * collection is OF, so the face on "no meetings yet" is the face the rail, the
 * heading and the tab already wear for a meeting. A caller cannot pick a glyph
 * that disagrees with the rest of the app, because there is nowhere to pick one.
 *
 * IT IS `aria-hidden`, like every other mark on both front doors: the sentence
 * beside it carries the whole meaning, and a screen reader announcing "calendar
 * clock, no meetings with them yet" is one fact read twice.
 *
 * WHAT IT IS NOT FOR: a refusal ("you can't see the team"), a 404 ("that ticket
 * no longer exists") or a caption under a number. Those are `NoAccess`,
 * `NotFound` and ordinary copy — an empty collection is a state a person can
 * fix, and the three above are not. */
export function EmptyLine({
  concept,
  children,
}: {
  /** the CONCEPT_ICON key for what this collection holds — `meetings`, `tickets`,
   * `time`. Typed to the vocabulary so a key it has no entry for cannot be
   * passed, which is the difference between "no glyph" and "a wrong one". */
  concept: keyof typeof CONCEPT_ICON
  children: React.ReactNode
}) {
  return (
    <p className="text-muted-foreground flex items-center gap-2 text-sm">
      <span aria-hidden className="shrink-0">
        <DynamicIcon name={CONCEPT_ICON[concept] as IconName} className="size-4" fallback={() => null} />
      </span>
      {children}
    </p>
  )
}

export function NoAccess() {
  const t = useT()
  return (
    <StateLine icon={Lock}>
      {t("You don't have access to this, or it doesn't exist.")}
    </StateLine>
  )
}

export function NotFound() {
  const t = useT()
  return <StateLine icon={SearchX}>{t("That screen doesn't exist.")}</StateLine>
}

export function LoadError({ what }: { what: string }) {
  const t = useT()
  return (
    <StateLine icon={TriangleAlert} tone="destructive">
      {t("Couldn't load {what}.", { what })}
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
  folderTabs,
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
  /** A FOLDER tab strip, drawn flush against the top of the collection card.
   *
   * It is a slot of its own rather than more `aboveCard`, and the reason is one
   * number. The kit's folder strip already pulls itself down by
   * `--folder-tab-overlap` (17.02) so the panel below covers the tabs' cut
   * feet — chapter 14's join, and the whole of why the active tab reads as
   * attached. `aboveCard` sits in a `gap-4` column, and 16 - 17.02 leaves ONE
   * pixel of overlap where seventeen were meant: the tabs float, their feet
   * show, and the shape reads as broken rather than as a folder. So this slot
   * renders in a column of its own with no gap at all, and the decision lives
   * here once instead of as a negative margin at every call site.
   *
   * Only a `variant: "folder"` strip belongs here. A `line` strip has no feet
   * to hide and wants the gap. */
  folderTabs?: React.ReactNode
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
            <a href={download.href} className={cn(buttonVariants({ variant: "secondary" }), "gap-1")}>
              <Download className="size-4" />
              {download.label}
            </a>
          )}
          {showSecondary && secondary && (
            <Button variant="secondary" onClick={secondary.onClick} className="gap-1">
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
      {/* No gap: the folder strip's own negative margin IS the join. */}
      <div className="flex flex-col">
        {folderTabs}
        <CollectionCard>{children}</CollectionCard>
      </div>
    </div>
  )
}
