"use client"

// WHAT SOMEBODY ATTACHED TO SHOW WHAT THEY MEAN (CHECKLIST 5.10) — several files
// and several links on one ticket, on the agency's side of the same list the
// client portal draws.
//
// ONE LIST FOR BOTH KINDS, because it is one act. A screenshot and a Loom link
// are the same sentence in a conversation, and splitting them would have made a
// person look in two places for "the thing they sent me".
//
// A FILE IS A CAPABILITY URL (`/media/<key>`, served by both gateways) — the key
// carries a ULID, and the fence on the door is what decides who is ever TOLD the
// key. Rendered as a plain link: nothing here signs, proxies or re-uploads.
//
// A CLIENT MAY NEVER FIX SOMEBODY ELSE'S FILE. Owner's ruling, 27 Aug 2026,
// asked as "may a client login rename or replace a file agency staff attached?"
// and answered in one word: "never." Not on `help:read`, not on any role a
// client login can hold.
//
// IT IS RECORDED HERE BECAUSE THIS IS WHERE THE MISTAKE WOULD BE MADE. The story
// panel one record along has a rename and a replace (`updateStoryAttachment`),
// and copying them onto this panel is the obvious next commit — the two files
// are deliberately twins. The reason it is not a small copy is four lines below
// this one: this panel's write right is `help:read`, which a CLIENT LOGIN HOLDS.
// The story panel's is `work:edit`, which no client can reach. Same shape, and
// the right underneath it is the whole difference.
//
// AND IF IT IS EVER EXTENDED: the fence goes on the DOOR, not here. R21 was
// earned twice by exactly this — the agency gateway forwards `/api/content/*` by
// PREFIX and a client login is an ordinary team member, so a door the portal's
// allow-list withheld was being served to the same person at the other hostname.
// A `canEdit` that renders no button is not a fence; a fence is
// `refusePortalCaller` inside the handler. What a client may still do is
// unchanged: attach their own file, and see what they sent. The line is drawn on
// somebody ELSE'S file, never on their own.
//
// UI-RULEBOOK K5: one card around the whole collection, hairline between rows,
// never a box per row.

import * as React from "react"

import { Button } from "@shared/ui/components/button/button"
import { Input } from "@shared/ui/components/input/input"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { toast } from "@shared/ui/components/sonner/sonner"
import { Link2, Paperclip, Plus, Trash2, Upload } from "@shared/ui/foundations/icons"

import type { HelpAttachment } from "@shared/types"
import { ApiFailure, content as contentApi } from "@/lib/api"
import { AttachmentPreview, hasPreview } from "@shared/web/attachment-preview"
import { readFileAsDataUrl } from "@shared/web/file"
import { safeHref } from "@shared/web/rich-text"
import { formatRelative } from "@shared/web/format"
import { primeCache, useCached } from "@shared/web/store"
import { helpAttachmentsKey } from "@/lib/live-resources"
import { TICKET_FILE_MAX_BYTES } from "@shared/workers/limits"
import { useT } from "@shared/web/language"

/** WILL WE PUT THIS IN AN `href`? (The seam that answers it is `safeHref`; this
 * says which of ITS answers this screen also accepts.)
 *
 * The door refuses anything but http(s) on a link, and stores a file as our own
 * `/media/<key>` path — so this should never be false. It is checked anyway, and
 * the reason is the shape of the failure rather than its likelihood: an
 * attachment can be put on a ticket by a CLIENT login, it renders on a page a
 * staff member already trusts, and `javascript:` in an `href` there is stored
 * XSS. A row written before the door was tightened, or by a future door somebody
 * adds, must not become one. Anything unrecognised is printed as text.
 *
 * Same rule the client portal applies to the same rows — two front doors, one
 * sentence. */
function isFollowable(url: string): boolean {
  return safeHref(url) !== undefined
}

/** Bytes, said the way a person says them. */
function spellSize(bytes: number | null): string {
  if (!bytes) return ""
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function HelpAttachmentsPanel({
  ticketId,
  canEdit,
}: {
  ticketId: string
  /** `help:read` — the right that gates the doors. A person who can see a ticket
   * can show you what they mean, which is the same bar the reply box uses.
   *
   * READ THE HEADER BEFORE WIDENING THIS. `help:read` is a right a CLIENT LOGIN
   * holds, so this prop is true for a client, and "the right that gates the
   * doors" is a sentence about ADDING and REMOVING your own — not about fixing
   * anybody else's. The owner ruled "never" on that, 27 Aug 2026. */
  canEdit: boolean
}) {
  const t = useT()
  const key = helpAttachmentsKey(ticketId)
  const listQ = useCached<HelpAttachment[]>(key, () =>
    contentApi.helpAttachments(ticketId).then((r) => {
      // R16: the tab badge shows the door's exact COUNT(*), never this list's length.
      primeCache(`total:${key}`, r.total)
      return r.attachments
    })
  )
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [addingLink, setAddingLink] = React.useState(false)
  const [link, setLink] = React.useState({ label: "", url: "" })
  const [busy, setBusy] = React.useState(false)

  function keep(r: { attachments: HelpAttachment[]; total: number }) {
    primeCache(key, r.attachments)
    primeCache(`total:${key}`, r.total)
  }

  async function run(what: () => Promise<{ attachments: HelpAttachment[]; total: number }>, done: string) {
    setBusy(true)
    try {
      keep(await what())
      toast.success(done)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't do that."))
    } finally {
      setBusy(false)
    }
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset first: picking the SAME file twice must fire the change event twice,
    // and a browser only does that if the value was cleared in between.
    e.target.value = ""
    if (!file) return
    // Checked here as well as at the door: a 30MB upload that fails after the
    // whole file has been read and base64'd is a minute of somebody's morning.
    if (file.size > TICKET_FILE_MAX_BYTES) {
      toast.error(t("That file is too big. The limit is 10MB."))
      return
    }
    // THE READ IS INSIDE THE TRY, not outside it. `run` has a perfectly good
    // catch and it only ever wrapped the API CALL, so a file the browser cannot
    // read — a permission-denied on a synced folder, a file removed between the
    // pick and the read, a HEIC on a browser that will not decode one — rejected
    // into nothing at all: no toast, no spinner, no inline error. Somebody picks
    // a file and the screen does not react, which is the one failure worse than
    // an error message. The portal's twin of this panel already had it right
    // (web-portal/components/ticket-attachments.tsx).
    let dataUrl: string
    try {
      dataUrl = await readFileAsDataUrl(file)
    } catch {
      // The sentence the knowledge base's own file picker already says for the
      // same failure, rather than a seventh way of putting it (R28: a new
      // sentence is a new row in the catalogue and a new thing to translate;
      // this one is already there, in every language).
      toast.error(t("Couldn't add that file."))
      return
    }
    await run(
      () => contentApi.addHelpAttachment({ id: ticketId, kind: "file", label: file.name, fileDataUrl: dataUrl }),
      "Attached."
    )
  }

  async function addLink() {
    if (!link.label.trim() || !link.url.trim()) return
    await run(
      () =>
        contentApi.addHelpAttachment({
          id: ticketId,
          kind: "link",
          label: link.label.trim(),
          url: link.url.trim(),
        }),
      "Attached."
    )
    setLink({ label: "", url: "" })
    setAddingLink(false)
  }

  if (listQ.data === undefined) return <Skeleton variant="list" lines={2} />

  return (
    <div className="flex flex-col gap-4">
      {listQ.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("Nothing attached to this ticket yet.")}</p>
      ) : (
        <ul className="divide-border divide-y">
          {listQ.data.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 py-3">
              {a.kind === "file" ? (
                <Paperclip className="text-muted-foreground size-4 shrink-0" />
              ) : (
                <Link2 className="text-muted-foreground size-4 shrink-0" />
              )}
              {isFollowable(a.url) ? (
                <a
                  href={safeHref(a.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sm underline-offset-2 hover:underline"
                >
                  {a.label}
                </a>
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm">
                  {a.label} <span className="text-muted-foreground">({a.url})</span>
                </span>
              )}
              {/* Wraps below `sm` so the filename keeps its width — the story
                * panel's note carries the whole reason. */}
              <span className="text-muted-foreground w-full text-xs tabular-nums sm:w-auto">
                {[spellSize(a.sizeBytes), a.addedByName, formatRelative(a.createdAt, t)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void run(() => contentApi.removeHelpAttachment(ticketId, a.id), "Taken off.")}
                  className="text-destructive hover:text-destructive shrink-0 gap-1"
                  aria-label={t("Take it off")}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
              {/* A SCREENSHOT LOOKS LIKE A SCREENSHOT. Half of what lands on a
                * ticket is a picture of the thing somebody is describing, and a
                * paperclip beside `Screenshot 2026-08-27 at 14.02.11.png` is the
                * one shape a person cannot scan. The same well the story panel
                * draws, from the same component, so a picture attached to a
                * ticket and a picture attached to a story look alike. */}
              {hasPreview(a.kind, a.contentType) && (
                <div className="w-full pl-6">
                  <AttachmentPreview
                    kind={a.kind}
                    url={a.url}
                    contentType={a.contentType}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2">
          <input ref={fileRef} type="file" hidden onChange={(e) => void pickFile(e)} />
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="gap-1"
          >
            <Upload className="size-3.5" />
            {t("Add a file")}
          </Button>
          {addingLink ? (
            <>
              <Input
                value={link.label}
                onChange={(e) => setLink((l) => ({ ...l, label: e.target.value }))}
                placeholder={t("What it is")}
                className="w-40"
                disabled={busy}
              />
              <Input
                value={link.url}
                onChange={(e) => setLink((l) => ({ ...l, url: e.target.value }))}
                placeholder="https://…"
                className="w-64"
                disabled={busy}
              />
              <Button size="sm" disabled={busy} onClick={() => void addLink()} className="gap-1">
                <Plus className="size-3.5" />
                {t("Submit")}
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setAddingLink(true)}
              className="gap-1"
            >
              <Link2 className="size-3.5" />
              {t("Add a link")}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
