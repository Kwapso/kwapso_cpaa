"use client"

// WHAT WE HANDED OVER ON THIS APP (CHECKLIST 8.7) — the handover shelf, as cards.
//
// CARDS AND NOT ROWS, and the rulebook decides it rather than taste: K9 allows a
// card grid exactly where a record carries an image, and a deliverable is one of
// the three things in this app that does. It is also the shape the owner showed
// when he finally said what a deliverable IS — a thumbnail, the kind in small
// caps, a title and a date — so this is his screen, drawn out of our own
// primitives.
//
// IT ASKS THE SERVER ITS OWN QUESTION (`?appId=`), like every other nested
// collection here: the exact total that badges the tab comes back from the same
// call over the same WHERE, so the number above the list and the list itself can
// never be two answers (R16).
//
// THE DOOR GATES; THIS ONLY DECIDES WHAT TO DRAW. Every button below is behind
// the right its own door demands — `deliverables:create` to add, `:edit` to
// correct, `:delete` to archive — and none of them is `processes`, which is what
// lets somebody open the app. A role without the right sees no button instead of
// a button that comes back a 403.
//
// SELF-CONTAINED on purpose: its own read, its own form, its own writes. The app
// record is already a long screen, and a tab that owns its own collection is the
// shape `help-attachments.tsx` and `work-panels.tsx` both settled on.

import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/ui/controls/alert-dialog/alert-dialog"
import { Badge } from "@shared/ui/controls/badge/badge"
import { Button } from "@shared/ui/controls/button/button"
import { Input } from "@shared/ui/controls/input/input"
import { Skeleton } from "@shared/ui/controls/skeleton/skeleton"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { Eye, EyeOff, Pencil, Power } from "@shared/ui/icons"

import { AddButton } from "@/components/deep-link/screen-bits"
import {
  InternalRecordDialog,
  deliverableFields,
  type InternalRecordValues,
} from "@/components/internal-record-dialog"
import { ApiFailure, content as contentApi, tenancy } from "@/lib/api"
import { deliverablesKey, totalKey } from "@/lib/live-resources"
import { usePermissions } from "@/lib/perms"
import type { Deliverable, SelectableValue } from "@shared/types"
import { formatDate } from "@shared/web/format"
import { useT } from "@shared/web/language"
import { safeHref } from "@shared/web/rich-text"
import { RecordCover } from "@shared/web/record-mark"
import { primeCache, useCached } from "@shared/web/store"

/** The initials shown where a deliverable has no picture. One glyph, from the
 * word a person chose for it — the same trick the app tiles use for a system
 * with no logo, so an empty shelf never looks broken. */
function initial(d: Deliverable): string {
  return (d.kind || d.title).trim().slice(0, 1).toUpperCase()
}

export function DeliverablesPanel({ teamId, appId }: { teamId: string; appId: string }) {
  const t = useT()
  const key = deliverablesKey(appId)
  const q = useCached<Deliverable[]>(key, () =>
    contentApi.deliverables(appId).then((r) => {
      primeCache(totalKey("deliverables-app", appId), r.total)
      return r.deliverables
    })
  )

  const { can } = usePermissions(teamId)
  const canCreate = can("deliverables", "create")
  const canEdit = can("deliverables", "edit")
  const canArchive = can("deliverables", "delete")

  // The team's own vocabulary for the KIND field, read only by somebody who can
  // actually write one — a reader never fetches the picker they are not offered.
  const kindsQ = useCached<SelectableValue[]>(canCreate || canEdit ? `selectable:${teamId}` : null, () =>
    tenancy.selectable().then((r) => r.values)
  )
  const kinds = (kindsQ.data ?? [])
    .filter((v) => v.type === "Deliverable kind" && v.active)
    .map((v) => v.value)

  const [addOpen, setAddOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Deliverable | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [find, setFind] = React.useState("")
  /** THE ONE ACTION ON THIS SCREEN THAT ASKS FIRST, and only in one direction.
   *
   * The house rule pairs the destructive colour WITH a confirm; this is neither
   * destructive nor coloured, and it still asks — because the rule is really
   * about acts you cannot see the consequences of from here. Archiving fades a
   * card in front of you. Sharing puts a document in somebody else's hands at a
   * different hostname, and nothing on this screen would look any different if
   * you had meant to click the card beside it.
   *
   * HIDING DOES NOT ASK. It is the retraction, it moves in the safe direction,
   * and a confirm in front of it would put a speed bump in front of the fix. */
  const [sharing, setSharing] = React.useState<Deliverable | null>(null)

  /** One write path, and it PRIMES rather than invalidates. Every door here
   * answers with the app's whole shelf and its exact total, so the actor's own
   * cache is filled from the reply and the screen never blinks; everybody else
   * gets the `publishChange` ping (CACHING.md — the mutating call primes, the
   * ping re-pulls). Nothing else is dropped: a deliverable's history is written
   * against the deliverable, not against the app, so the app's Activity tab is
   * not a thing this write moves. */
  async function run(what: () => Promise<{ deliverables: Deliverable[]; total: number }>, done: string) {
    setBusy(true)
    try {
      const next = await what()
      primeCache(key, next.deliverables)
      primeCache(totalKey("deliverables-app", appId), next.total)
      toast.success(done)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't do that."))
    } finally {
      setBusy(false)
    }
  }

  if (q.error) return <p className="text-destructive text-sm">{t("Couldn't load the deliverables.")}</p>
  if (q.data === undefined) return <Skeleton variant="list" lines={3} />

  const needle = find.trim().toLowerCase()
  // Searched in the BROWSER, and honestly: this collection is bounded and read
  // whole (R14), so the array in hand IS the shelf. On a paged list the same five
  // lines would answer about page one while looking like an answer about all of
  // it, which is why the paged screens ask their door instead.
  const rows = needle
    ? q.data.filter((d) => `${d.title} ${d.kind ?? ""}`.toLowerCase().includes(needle))
    : q.data

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {q.data.length > 0 && (
          <Input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder={t("Search what we handed over…")}
            className="w-full sm:max-w-xs"
            aria-label={t("Search what we handed over…")}
          />
        )}
        {canCreate && (
          <div className="ml-auto">
            <AddButton label={t("Add a deliverable")} onClick={() => setAddOpen(true)} />
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {q.data.length === 0
            ? t("Nothing has been handed over on this app yet.")
            : t("Nothing here matches that.")}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((d) => {
            // The material is a link a person typed, so it is the exact shape
            // R20's render-side twin exists for. The PICTURE goes through
            // `RecordCover`, which does the same check and one thing more: a
            // path whose object has gone falls back to the letter block below
            // instead of a torn-paper glyph in the middle of a card grid.
            const href = safeHref(d.url)
            return (
              <li
                key={d.id}
                className={`bg-card flex flex-col overflow-hidden rounded-[var(--radius)] ${d.active ? "" : "opacity-60"}`}
              >
                <RecordCover
                  picture={d.imageUrl}
                  className="aspect-video w-full object-cover"
                  fallback={
                    <span
                      aria-hidden
                      className="bg-muted text-muted-foreground grid aspect-video w-full place-items-center text-3xl font-medium"
                    >
                      {initial(d)}
                    </span>
                  }
                />
                <div className="flex min-w-0 flex-col gap-1 p-3">
                  {d.kind && (
                    <span className="text-muted-foreground truncate text-badge font-medium tracking-wide uppercase">
                      {d.kind}
                    </span>
                  )}
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block truncate text-sm font-medium underline-offset-2 hover:underline"
                    >
                      {d.title}
                    </a>
                  ) : (
                    <span className="truncate text-sm font-medium">{d.title}</span>
                  )}
                  <span className="text-muted-foreground truncate text-xs">
                    {[formatDate(d.datedOn), d.active ? null : t("Archived")].filter(Boolean).join(" · ") ||
                      t("No date")}
                  </span>
                  {/* WHO CAN SEE IT, SAID ON THE CARD. A shared deliverable looks
                      different from an unshared one at a glance, because the
                      whole point of a per-record switch is that a shelf holds
                      both at once — a draft SOP beside the finished one — and
                      "which of these has the client got?" must be answerable by
                      looking rather than by clicking each in turn.
                      Only the SHARED state gets a badge: unshared is the
                      default and the resting state of most of the shelf, and
                      badging it would put a label on every card to say nothing
                      has happened. The archived-and-shared case says so out
                      loud, because that row is visible in NEITHER place and the
                      switch still reads on. */}
                  {d.visibleToClientAt && (
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge variant="success" className="gap-1">
                        <Eye className="size-3" />
                        {t("Client can see this")}
                      </Badge>
                      {!d.active && (
                        <span className="text-muted-foreground text-badge">
                          {t("Hidden while archived")}
                        </span>
                      )}
                    </span>
                  )}
                  {(canEdit || canArchive) && (
                    <div className="mt-1 flex items-center gap-1">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => setEditing(d)}
                          aria-label={t("Edit")}
                          className="text-muted-foreground h-auto gap-1 px-2 py-1"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      {/* SHOW IT TO THE CLIENT, OR TAKE IT BACK. `deliverables:edit`,
                          the same right that corrects one — sharing is a different
                          act, not a harder one. Eye / EyeOff join the house action
                          mapping (UI-CONVENTIONS) as show-to-client /
                          hide-from-client; they are not a synonym for the Power
                          icon beside them, which archives our own row. Sharing
                          asks first (see `sharing`); hiding just happens. */}
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            d.visibleToClientAt
                              ? void run(
                                  () => contentApi.setDeliverableVisibility(d.id, appId, false),
                                  t("Hidden from the client.")
                                )
                              : setSharing(d)
                          }
                          aria-label={
                            d.visibleToClientAt ? t("Hide from the client") : t("Show to the client")
                          }
                          className="text-muted-foreground h-auto gap-1 px-2 py-1"
                        >
                          {d.visibleToClientAt ? (
                            <EyeOff className="size-3.5" />
                          ) : (
                            <Eye className="size-3.5" />
                          )}
                        </Button>
                      )}
                      {/* NOT RED, AND NO CONFIRM — deliberately, and it is the
                          same call `TodosPanel`'s withdraw makes. The house rule
                          pairs the destructive colour WITH a confirm; this is a
                          reversible put-away whose undo is the very same button
                          one press later, and the card stays on the shelf faded
                          rather than disappearing. Dressing it red would ask for
                          a confirm on an action that has nothing to confirm. */}
                      {canArchive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => contentApi.setDeliverableActive(d.id, appId, !d.active),
                              d.active ? t("Archived.") : t("Restored.")
                            )
                          }
                          aria-label={d.active ? t("Archive") : t("Restore")}
                          className="text-muted-foreground h-auto gap-1 px-2 py-1"
                        >
                          <Power className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* THE APP IS NOT ON THE FORM — you are standing on it, so it rides the
          call as a fact. The same rule the ticket and meeting forms follow when
          they are opened from a record. */}
      <InternalRecordDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        fields={deliverableFields(kinds)}
        title={t("Add a deliverable")}
        subtitle={t("Something we handed over on this app: a doc, a recording, an SOP.")}
        draftKey={`deliverable:add:${appId}`}
        onSubmit={(v: InternalRecordValues) =>
          run(() => contentApi.createDeliverable({ appId, ...v }), t("Filed."))
        }
      />
      {/* THE ONE CONFIRM ON THIS SCREEN. Not red — nothing is being destroyed —
          but it asks, because it is the only button here whose effect happens
          somewhere the person pressing it cannot see. The sentence names the
          deliverable and says where it lands, so the answer to "which one is
          this?" is in the question rather than behind it. */}
      <AlertDialog open={sharing !== null} onOpenChange={(o) => !busy && !o && setSharing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Show this to the client?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Anyone at this company with portal access will be able to open “{title}”. You can hide it again at any time."
              , { title: sharing?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                const d = sharing as Deliverable
                setSharing(null)
                void run(
                  () => contentApi.setDeliverableVisibility(d.id, appId, true),
                  t("The client can see it now.")
                )
              }}
            >
              {t("Show to the client")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InternalRecordDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        fields={deliverableFields(kinds)}
        title={t("Edit this deliverable")}
        subtitle={t("Correct what it is, when it was, or where it lives.")}
        initial={
          editing
            ? {
                title: editing.title,
                kind: editing.kind ?? "",
                datedOn: editing.datedOn ?? "",
                url: editing.url ?? "",
                imageUrl: editing.imageUrl ?? "",
              }
            : undefined
        }
        draftKey={editing ? `deliverable:edit:${editing.id}` : undefined}
        onSubmit={(v: InternalRecordValues) =>
          run(
            () => contentApi.updateDeliverable({ id: (editing as Deliverable).id, appId, ...v }),
            t("Deliverable updated.")
          )
        }
      />
    </div>
  )
}
