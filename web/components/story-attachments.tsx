"use client"

// WHAT A STORY SHOWS FOR ITSELF, ON THE STORY'S OWN SCREEN — the files and links
// somebody put up to say "come and look at this".
//
// THE BUG THIS EXISTS FOR (owner, 27 Aug 2026): he attached two screenshots while
// editing a story, the form showed their names, the save succeeded — and the
// files were never visible again anywhere. Nothing was lost: the door answered
// 200, the objects are in the bucket, the rows are in `story_attachments`, and
// `GET /api/content/stories/attachments` returns them correctly. The WRITE half
// was built and the READ half never was. `story-detail.tsx` contained no mention
// of an attachment, and the read door's only caller in the whole app was the
// review dialog — a screen you reach by pressing "Ready for review", which is not
// where anybody goes to look at a screenshot.
//
// IT IS `help-attachments.tsx` ONE RECORD ALONG, deliberately and closely: one
// list for files AND links because "here is the thing I mean" is one act; a file
// is a capability URL (`/media/<key>`) rendered as a plain link, so nothing here
// signs, proxies or re-uploads; deactivate rather than delete, so a removed
// screenshot leaves an audit block behind.
//
// THE ONE REAL DIFFERENCE IS THE RIGHT. A ticket's attachment door gates on
// `help:read`, because the person who raised a request may show you what they
// mean. A story is OURS, and its door gates on `work:edit` — so this panel offers
// the buttons on `work:edit` and not a hair wider. `help-detail.tsx` carries a
// comment recording that exact mistake being made and fixed on its own screen: a
// button drawn on the read right is a button whose every press is a 403.
//
// AND NOW IT IS ALSO WHERE A MISTAKE IS FIXED. Attaching and removing were both
// built and the middle was not, so somebody who put up the wrong document could
// only take it off and put another one on — two acts, two lines of history, and
// a moment where the story carried neither. The pencil renames; the replace
// swaps a file's bytes or a link's address for the right ones. Which of the
// three the door does is decided by what the body carries, so this panel sends
// one call for all three (`updateStoryAttachment`).
//
// THE ROW LEADS WITH THE THING ITSELF where the thing is a picture
// (`AttachmentMark`) — the same square every other record in the app is known
// by, shared with both ticket panels so a screenshot looks the same wherever it
// is attached.
//
// UI-RULEBOOK K5: one card around the whole collection, hairline between rows,
// never a box per row.

import * as React from "react"

import { Button } from "@shared/ui/controls/button/button"
import { Input } from "@shared/ui/controls/input/input"
import { Skeleton } from "@shared/ui/controls/skeleton/skeleton"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { Check, Link2, Pencil, Plus, Trash2, Upload, Xmark } from "@shared/ui/icons"

import type { StoryAttachment } from "@shared/types"
import { ApiFailure, content as contentApi } from "@/lib/api"
import { storyAttachmentsKey } from "@/lib/live-resources"
import { AttachmentMark } from "@shared/web/attachment-mark"
import { readFileAsDataUrl } from "@shared/web/file"
import { safeHref } from "@shared/web/rich-text"
import { formatRelative } from "@shared/web/format"
import { primeCache, useCached } from "@shared/web/store"
import { TICKET_FILE_MAX_BYTES } from "@shared/workers/limits"
import { useT } from "@shared/web/language"

/** WILL WE PUT THIS IN AN `href`? The seam that answers it is `safeHref`; this
 * says which of ITS answers this screen also accepts, exactly as the ticket panel
 * does over the same shape of row.
 *
 * The door refuses anything but http(s) on a link and stores a file as our own
 * `/media/<key>` path, so this should never be false. It is checked anyway,
 * because a row written before the door was tightened — or by a future door
 * somebody adds — must not be able to put `javascript:` in an `href` on a page a
 * colleague already trusts. Anything unrecognised is printed as text. */
function isFollowable(url: string): boolean {
  return safeHref(url) !== undefined
}

/** Bytes, said the way a person says them. */
function spellSize(bytes: number | null): string {
  if (!bytes) return ""
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function StoryAttachmentsPanel({
  storyId,
  canEdit,
}: {
  storyId: string
  /** `work:edit` — the right BOTH write doors ask for. See the header: the ticket
   * panel's wider `read` would be wrong here, and drawing a button the door
   * refuses is the failure this parameter is named after. */
  canEdit: boolean
}) {
  const t = useT()
  const key = storyAttachmentsKey(storyId)
  const listQ = useCached<StoryAttachment[]>(key, () =>
    contentApi.storyAttachments(storyId).then((r) => {
      // R16: the tab badge shows the door's exact COUNT(*), never this list's length.
      primeCache(`total:${key}`, r.total)
      return r.attachments
    })
  )
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [addingLink, setAddingLink] = React.useState(false)
  const [link, setLink] = React.useState({ label: "", url: "" })
  const [busy, setBusy] = React.useState(false)
  /** The row being fixed, and the values in its boxes. `null` is the list at
   * rest — one row is open at a time, because two half-finished renames on one
   * screen is a state nobody can read. */
  const [editing, setEditing] = React.useState<{ id: string; label: string; url: string } | null>(null)
  /** WHICH ROW THE FILE PICKER IS ANSWERING FOR. One hidden `<input type=file>`
   * serves both "add a file" and "replace this one" — a second picker per row
   * would be one DOM node per attachment for a control that can only be used
   * once at a time. Set before `.click()`, read in the change handler, cleared
   * on the way out of both paths including the cancel. */
  const replacingRef = React.useRef<string | null>(null)

  function keep(r: { attachments: StoryAttachment[]; total: number }) {
    primeCache(key, r.attachments)
    primeCache(`total:${key}`, r.total)
  }

  async function run(what: () => Promise<{ attachments: StoryAttachment[]; total: number }>, done: string) {
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

  /** A PICKED FILE, CHECKED AND READ — or null, having already said why.
   *
   * Extracted the day a second caller arrived (replace). Adding and replacing ask
   * exactly the same three questions of the same file, and the day they stop
   * agreeing is the day one of them gets a different size limit or loses the
   * failure toast. Everything specific to the ACT is in its caller. */
  async function readPicked(file: File): Promise<string | null> {
    // Checked here as well as at the door: a 10MB upload that fails after the
    // whole file has been read and base64'd is a minute of somebody's morning.
    if (file.size > TICKET_FILE_MAX_BYTES) {
      toast.error(t("That file is too big. The limit is 10MB."))
      return null
    }
    // THE READ IS INSIDE ITS OWN TRY, not folded into `run`'s. A file the browser
    // cannot read — a permission-denied on a synced folder, a file removed
    // between the pick and the read — would otherwise reject into nothing at all:
    // no toast, no spinner, no inline error, which is the one failure worse than
    // an error message.
    try {
      return await readFileAsDataUrl(file)
    } catch {
      toast.error(t("Couldn't add that file."))
      return null
    }
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset first: picking the SAME file twice must fire the change event twice,
    // and a browser only does that if the value was cleared in between. Which is
    // exactly what somebody does after a failed upload.
    e.target.value = ""
    // …and read the target row BEFORE any await, then clear it, so an abandoned
    // replace cannot capture the next plain "Add a file".
    const replacing = replacingRef.current
    replacingRef.current = null
    if (!file) return
    const dataUrl = await readPicked(file)
    if (!dataUrl) return
    if (replacing) {
      // The name comes with the new file, because that is what a person means by
      // swapping one document for another: the row should stop saying the wrong
      // filename the moment it stops holding the wrong file.
      await run(
        () =>
          contentApi.updateStoryAttachment({
            id: storyId,
            attachmentId: replacing,
            label: file.name,
            fileDataUrl: dataUrl,
          }),
        "Replaced."
      )
      setEditing(null)
      return
    }
    await run(
      () => contentApi.addStoryAttachment({ id: storyId, kind: "file", label: file.name, fileDataUrl: dataUrl }),
      "Attached."
    )
  }

  /** Save the boxes. A link sends its address too; a file has none to send —
   * its bytes are swapped by the picker above, never typed. */
  async function saveEdit(a: StoryAttachment) {
    if (!editing || !editing.label.trim()) return
    await run(
      () =>
        contentApi.updateStoryAttachment({
          id: storyId,
          attachmentId: a.id,
          label: editing.label.trim(),
          ...(a.kind === "link" ? { url: editing.url.trim() } : {}),
        }),
      "Saved."
    )
    setEditing(null)
  }

  async function addLink() {
    if (!link.label.trim() || !link.url.trim()) return
    await run(
      () =>
        contentApi.addStoryAttachment({
          id: storyId,
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
        <p className="text-muted-foreground text-sm">{t("Nothing attached yet.")}</p>
      ) : (
        <ul className="divide-border divide-y">
          {listQ.data.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 py-3">
              {/* The thing itself where the thing is a picture, its type's glyph
                * where it is not — one square either way, so the column does not
                * go ragged down a list that mixes screenshots and documents. */}
              <AttachmentMark kind={a.kind} url={a.url} contentType={a.contentType} />
              {editing?.id === a.id ? (
                <>
                  <Input
                    value={editing.label}
                    onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                    placeholder={t("What it is")}
                    // ITS OWN LINE ON A PHONE. The row is `flex-wrap`, so a
                    // full-width basis makes the name box take a line and the
                    // three buttons wrap under it; sharing the line the way the
                    // desktop does left it 60px wide and showing "Sc".
                    className="w-full min-w-0 sm:w-auto sm:flex-1"
                    disabled={busy}
                    aria-label={t("Name")}
                  />
                  {a.kind === "link" && (
                    <Input
                      value={editing.url}
                      onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                      placeholder="https://…"
                      className="w-full sm:w-64"
                      disabled={busy}
                      aria-label={t("Link")}
                    />
                  )}
                  {a.kind === "file" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        replacingRef.current = a.id
                        fileRef.current?.click()
                      }}
                      className="shrink-0 gap-1"
                    >
                      <Upload className="size-3.5" />
                      {t("Replace the file")}
                    </Button>
                  )}
                  <Button size="sm" disabled={busy} onClick={() => void saveEdit(a)} className="shrink-0 gap-1">
                    <Check className="size-3.5" />
                    {t("Save")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      replacingRef.current = null
                      setEditing(null)
                    }}
                    className="shrink-0 gap-1"
                    aria-label={t("Cancel")}
                  >
                    <Xmark className="size-3.5" />
                  </Button>
                </>
              ) : (
                <>
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
                  {/* THE METADATA WRAPS, NOT THE NAME. On a phone this span
                    * would not shrink and the name column has `min-w-0`, so the
                    * filename was squeezed down to its first letter — the row
                    * read "S · 2.7 MB · Alaap K · 3h ago". The mark this commit
                    * put in front of it (36px where a glyph was 16px) took
                    * twenty more pixels off the same column. Below `sm` the
                    * size, the person and the date take a line of their own and
                    * the name gets the width it needs. */}
                  <span className="text-muted-foreground w-full text-xs tabular-nums sm:w-auto">
                    {[spellSize(a.sizeBytes), a.addedByName, formatRelative(a.createdAt, t)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {canEdit && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setEditing({ id: a.id, label: a.label, url: a.kind === "link" ? a.url : "" })}
                        className="shrink-0 gap-1"
                        aria-label={t("Rename")}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void run(() => contentApi.removeStoryAttachment(storyId, a.id), "Taken off.")}
                        className="text-destructive hover:text-destructive shrink-0 gap-1"
                        aria-label={t("Take it off")}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )}
                </>
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
