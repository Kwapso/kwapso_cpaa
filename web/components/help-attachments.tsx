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
// UI-RULEBOOK K5: one card around the whole collection, hairline between rows,
// never a box per row.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Link2, Paperclip, Plus, Trash2, Upload } from "lucide-react"

import type { HelpAttachment } from "@shared/types"
import { ApiFailure, content as contentApi } from "@/lib/api"
import { readFileAsDataUrl } from "@shared/web/file"
import { safeHref } from "@shared/web/rich-text"
import { formatRelative } from "@shared/web/format"
import { primeCache, useCached } from "@shared/web/store"
import { TICKET_FILE_MAX_BYTES } from "@shared/workers/limits"
import { useT } from "@shared/web/language"

/** The cache key the live registry drops when the ticket row moves — every
 * attachment write publishes `help`, so the ticket's own deps carry this. */
export function helpAttachmentsKey(ticketId: string): string {
  return `help-attachments:${ticketId}`
}

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
   * can show you what they mean, which is the same bar the reply box uses. */
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
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't do that.")
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
    const dataUrl = await readFileAsDataUrl(file)
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
              <span className="text-muted-foreground text-xs tabular-nums">
                {[spellSize(a.sizeBytes), a.addedByName, formatRelative(a.createdAt)]
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
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2">
          <input ref={fileRef} type="file" hidden onChange={(e) => void pickFile(e)} />
          <Button
            variant="outline"
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
                placeholder={t("https://…")}
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
              variant="outline"
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
