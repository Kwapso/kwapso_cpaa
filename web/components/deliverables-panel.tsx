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

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Pencil, Power } from "lucide-react"

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
import { safeHref, safeSrc } from "@shared/web/rich-text"
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
            // Both through the seam. The material is a link a person typed, so it
            // is the exact shape R20's render-side twin exists for; the picture
            // is our own /media path today and would be a typed one the moment
            // somebody pastes a thumbnail in.
            const href = safeHref(d.url)
            const picture = safeSrc(d.imageUrl)
            return (
              <li
                key={d.id}
                className={`bg-card flex flex-col overflow-hidden rounded-xl ${d.active ? "" : "opacity-60"}`}
              >
                {picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={picture} alt="" className="aspect-video w-full object-cover" />
                ) : (
                  <span
                    aria-hidden
                    className="bg-muted text-muted-foreground grid aspect-video w-full place-items-center text-3xl font-medium"
                  >
                    {initial(d)}
                  </span>
                )}
                <div className="flex min-w-0 flex-col gap-1 p-3">
                  {d.kind && (
                    <span className="text-muted-foreground truncate text-[11px] font-medium tracking-wide uppercase">
                      {d.kind}
                    </span>
                  )}
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="truncate text-sm font-medium underline-offset-2 hover:underline"
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
                  {(canEdit || canArchive) && (
                    <div className="mt-1 flex items-center gap-1">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => setEditing(d)}
                          aria-label={t("Edit")}
                          className="text-muted-foreground h-auto gap-1.5 px-2 py-1"
                        >
                          <Pencil className="size-3.5" />
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
                          className="text-muted-foreground h-auto gap-1.5 px-2 py-1"
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
