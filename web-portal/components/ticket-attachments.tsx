"use client"

// WHAT A CLIENT MAY DO WITH A FILE ON THEIR TICKET: attach one, read their own
// back, and take their own off. NOT rename or replace one the agency attached —
// owner's ruling, 27 Aug 2026, answered "never" when asked. The reasoning and
// the fence that would have to carry it live where the mistake would be made:
// `web/components/help-attachments.tsx`'s header and the door in
// `workers/content/src/routes/help.ts`.

// FILES AND LINKS ON ONE TICKET (CHECKLIST 5.10) — "show us what you mean".
//
// A screenshot of the thing that is wrong is the client's half of a support
// conversation, and until this shipped they had no way to send one: the ticket
// screen had a description box, a thread, and nowhere to put a picture. So the
// section does three things and no more — read what is on the ticket, add a file,
// add a link — plus taking one back off, because the first thing anybody does
// with an upload button is attach the wrong file.
//
// BOTH SIDES' MATERIAL, ONE LIST. We attach things too (a mock-up, a recording of
// the fix), and the door answers with all of it. Whose it is follows the same
// rule the thread's authors do: the SERVER sends a name for everyone on the
// client's side of the fence and NO name for anyone on ours, so "you, your
// colleague, or kwapso" is decided by the wire and this component never chooses
// what to draw (SCOPE ch.06).
//
// THE UPLOAD IS THE TO-DO'S UPLOAD. Hidden <input type="file"> driven by the
// button beside it → readFileAsDataUrl → one api call. Same seam, same 10 MB
// pre-check, same shape as waiting-on-you.tsx, because "send us the file" is one
// act and a client should not meet two versions of it.
//
// R14: the door caps the list at TICKET_ATTACHMENT_CAP and this renders what it
// was handed — there is no page two to walk, and the WRITE refuses past the same
// ceiling, so a full list is a refusal with a sentence rather than a silent drop.
// R16: the count is the door's exact COUNT(*), rendered once, through the portal's
// one CollectionHeading.
// R21: nothing here moves a ticket along its lifecycle. Attaching is gated on
// help:read — the right that lets a person see the ticket at all — and the
// account fence decides whose ticket it is, at the door.

import * as React from "react"

import { Button } from "@shared/ui/controls/button/button"
import { Skeleton } from "@shared/ui/controls/skeleton/skeleton"
import { Spinner } from "@shared/ui/controls/spinner/spinner"
import { toast } from "@shared/ui/controls/sonner/sonner"
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
import { Link2, Paperclip, Trash2 } from "@shared/ui/icons"

import { brand } from "@shared/brand"
import type { HelpAttachment } from "@shared/types"
import { AttachmentPreview, hasPreview } from "@shared/web/attachment-preview"
import { readFileAsDataUrl } from "@shared/web/file"
import { formatRelative } from "@shared/web/format"
import { useT } from "@shared/web/language"
import { reportError } from "@shared/web/log"
import { primeCache, useCached, useCachedValue } from "@shared/web/store"
import { TICKET_FILE_MAX_BYTES } from "@shared/workers/limits"
import { ApiFailure, support } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"
import { AddLinkDialog } from "@/components/add-link-dialog"
import { CollectionHeading } from "@/components/collection-heading"
import { safeHref } from "@shared/web/rich-text"

/** "2.4 MB", "812 KB". Only ever shown for a file — a link has no size, and a
 * "0 bytes" beside one would read as a broken upload. */
function fileSize(bytes: number | null): string | null {
  if (bytes === null || bytes <= 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** IS THIS SOMETHING A BROWSER SHOULD FOLLOW?
 *
 * A link's address is text a person typed, and it comes back out of the database
 * exactly as it went in. Putting it straight into an `href` would make
 * `javascript:…` a script that runs when a colleague clicks it — stored, on a
 * page that person already trusts. So a link is only ever CLICKABLE when it is
 * plainly the web: http, https, or a path on this hostname (which is what every
 * file attachment is — `/media/<key>`, served by the portal's own gateway).
 * Anything else still shows, in full, as plain text: refusing to draw it would
 * hide what somebody sent, and refusing to FOLLOW it costs one copy-and-paste. */
function isFollowable(url: string): boolean {
  // The portal's own policy (plainly-the-web only, so no mailto:) AND the one
  // shared seam every data-derived href goes through — safeHref adds the
  // markup-character refusal and the canonical parse, so this file cannot
  // drift from the agency twin's discipline.
  return (/^https?:\/\//i.test(url) || url.startsWith("/")) && safeHref(url) !== undefined
}

export function TicketAttachments({ ticketId }: { ticketId: string }) {
  const t = useT()
  const listQ = useCached<HelpAttachment[]>(cacheKeys.attachments(ticketId), () =>
    support.attachments(ticketId).then((r) => {
      primeCache(cacheKeys.attachmentsTotal(ticketId), r.total)
      return r.attachments
    })
  )
  const total = useCachedValue<number>(cacheKeys.attachmentsTotal(ticketId))
  const attachments = listQ.data ?? []

  /** WHICH write is in flight, not merely THAT one is. Everything here is
   * disabled together (one change to a ticket's material at a time), but the
   * spinner has to land on the control that is actually working — an upload that
   * takes eight seconds and a remove that takes one look identical from a
   * boolean, and putting the spinner on the wrong button is worse than none. */
  const [busy, setBusy] = React.useState<null | "file" | "remove">(null)
  const [adding, setAdding] = React.useState(false)
  const [removing, setRemoving] = React.useState<HelpAttachment | null>(null)
  const picker = React.useRef<HTMLInputElement | null>(null)

  /** Every write answers with the whole list and its count, so both keys are
   * re-primed from the response and the screen updates without a round-trip
   * (CACHING.md: cache-first, and a mutation seeds what it just changed). */
  function apply(r: { attachments: HelpAttachment[]; total: number }) {
    primeCache(cacheKeys.attachments(ticketId), r.attachments)
    primeCache(cacheKeys.attachmentsTotal(ticketId), r.total)
  }

  async function sendFile(file: File) {
    if (busy) return
    // The browser-side ceiling is a courtesy — it saves reading a 40 MB file into
    // memory to be refused. The door's cap is the one that counts, and it is the
    // same number (shared/workers/limits TICKET_FILE_MAX_BYTES).
    if (file.size > TICKET_FILE_MAX_BYTES) {
      toast.error(t("That file is too big, 10 MB is the most we can take."))
      return
    }
    setBusy("file")
    try {
      const fileDataUrl = await readFileAsDataUrl(file)
      apply(await support.attach(ticketId, { kind: "file", label: file.name, fileDataUrl }))
      toast.success(t("Got it, thank you."))
    } catch (err) {
      reportError("portal-attachments.sendFile", err)
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't send that. Try again."))
    } finally {
      setBusy(null)
    }
  }

  async function addLink(input: { label: string; url: string }) {
    apply(await support.attach(ticketId, { kind: "link", ...input }))
  }

  async function remove(attachment: HelpAttachment) {
    setBusy("remove")
    try {
      apply(await support.detach(ticketId, attachment.id))
      setRemoving(null)
      toast.success(t("Taken off."))
    } catch (err) {
      reportError("portal-attachments.remove", err)
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't take that off. Try again."))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section>
      {/* R16: the door's exact total, in the one place the portal renders a
       * count. No action beside it — the two buttons live under the list, where
       * they have room to say what they do on a phone (B5). */}
      <CollectionHeading label={t("Files and links")} total={total} />

      {listQ.loading && !listQ.data ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : attachments.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("Nothing attached yet. A screenshot often explains it faster than a paragraph.")}
        </p>
      ) : (
        // K5: one container, rows separated by a hairline — never a box each.
        <ul className="divide-y rounded-xl border">
          {attachments.map((a) => {
            const size = a.kind === "file" ? fileSize(a.sizeBytes) : null
            const Glyph = a.kind === "file" ? Paperclip : Link2
            // The row is `items-start` rather than centred: its column now
            // carries a picture, and centring would hang the glyph and the
            // remove button halfway down the preview.
            const meta = [a.addedByName ?? brand.name, formatRelative(a.createdAt, t), size]
              .filter(Boolean)
              .join(" · ")
            return (
              <li key={a.id} className="flex items-start gap-2 p-4">
                <Glyph className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  {isFollowable(a.url) ? (
                    <a
                      href={safeHref(a.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate underline-offset-4 hover:underline"
                    >
                      {a.label}
                    </a>
                  ) : (
                    // Not plainly the web, so it is shown and not offered. The
                    // address is printed under it, because a name with no way to
                    // reach the thing is worse than a line somebody can copy.
                    <>
                      <p className="truncate">{a.label}</p>
                      <p className="text-muted-foreground truncate text-xs">{a.url}</p>
                    </>
                  )}
                  <p className="text-muted-foreground truncate text-xs">{meta}</p>
                  {/* THE CLIENT'S SIDE OF THE SAME ROWS, drawn by the same
                    * component as the agency's — a picture they sent us should
                    * look the same to them as it does to us, and a client
                    * scanning their own ticket for "the screenshot I sent" has
                    * exactly the problem the owner described. These files are in
                    * the SHARED media bucket, which this front door's gateway
                    * serves at /media/* (portal-gateway/src/index.ts) — there is
                    * one media route here and it is bound to `env.MEDIA`, so
                    * nothing internal can be reached through this. */}
                  {hasPreview(a.kind, a.contentType) && (
                    <div className="mt-2">
                      <AttachmentPreview
                        kind={a.kind}
                        url={a.url}
                        contentType={a.contentType}
                      />
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive shrink-0"
                  aria-label={t("Take it off")}
                  disabled={!!busy}
                  onClick={() => setRemoving(a)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {/* The file picker is hidden and driven by the button beside it — one
       * visible control per action, the same arrangement a to-do's evidence gets
       * (waiting-on-you.tsx). */}
      <input
        ref={picker}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void sendFile(file)
          // Cleared so picking the SAME file twice still fires a change event —
          // which is exactly what somebody does after a failed upload.
          e.target.value = ""
        }}
      />
      <div className="mt-4 flex gap-2">
        <Button
          variant="secondary"
          className="flex-1 gap-1"
          disabled={!!busy}
          onClick={() => picker.current?.click()}
        >
          {busy === "file" ? <Spinner /> : <Paperclip className="size-3.5" />}
          {t("Send a file")}
        </Button>
        <Button
          variant="secondary"
          className="flex-1 gap-1"
          disabled={!!busy}
          onClick={() => setAdding(true)}
        >
          <Link2 className="size-3.5" />
          {t("Add a link")}
        </Button>
      </div>

      <AddLinkDialog
        open={adding}
        onOpenChange={setAdding}
        onSubmit={addLink}
        draftKey={`portal:attachment:link:${ticketId}`}
      />

      {/* Destructive, so it confirms — and it says WHAT is coming off, because on
       * a list of screenshots the labels are the only thing telling them apart. */}
      <AlertDialog open={!!removing} onOpenChange={(o) => !busy && !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Take this off the ticket?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("{label} won't be part of this ticket any more. You can always send it again.", {
                label: removing?.label ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              disabled={!!busy}
              onClick={(e) => {
                e.preventDefault()
                if (removing) void remove(removing)
              }}
            >
              {busy === "remove" ? <Spinner /> : <Trash2 className="size-3.5" />}
              {t("Take it off")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
