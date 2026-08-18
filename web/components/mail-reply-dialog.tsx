"use client"

// REPLY BY EMAIL — the two things the owner asked for, in one form.
//
//   "a clear link or a very nice UI when the agent is done, so that I can just
//    click inside of the kwapso app and it takes me to my Gmail"
//   "Or I can just say send it from kwapso and it sends it"
//
// Two doors, and the ORDER of them is the product decision. Writing a draft
// changes nothing outside this building, so it is the plain button. Sending is
// the one act here that leaves — so it sits beside the draft rather than
// replacing it, and it needs the role's own send switch (`google_mail:create`),
// exactly as the assistant does. A switch that bound the assistant and not the
// person clicking the same button would be a switch that means nothing.
//
// ONCE DRAFTED, THE LINK IS THE POINT. The door hands back the Gmail URL of the
// draft it just wrote in the person's OWN mailbox, and this form shows it as a
// real link rather than a toast that disappears — that is the "clear link"
// half of the sentence above. Sending after that sends THAT draft (by its id),
// never a second copy of the same letter into the client's inbox.
//
// It never sends by itself and it never sends what you have not read: the send
// button is disabled while the three fields are incomplete, exactly like the
// draft one.
//
// Library primitives, FormShell, per-session draft (R4 + R7) — and the draft rule
// earns its place here more than almost anywhere: what is typed in is a letter
// to a client, written once.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"
import { ExternalLink, PenLine, Send } from "lucide-react"

import { ApiFailure, content } from "@/lib/api"
import { safeHref } from "@shared/web/rich-text"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

const toField = { ...defaultFieldConfig, label: "To", required: true }
const subjectField = { ...defaultFieldConfig, label: "Subject", required: true }
const bodyField = { ...defaultFieldConfig, label: "Message", required: true }

/** What the draft door handed back — the id the send door can send, and the URL
 * that opens it where it actually lives. */
type WrittenDraft = { draftId: string; url: string }

export function MailReplyDialog({
  open,
  onOpenChange,
  draftKey,
  defaultTo = "",
  defaultSubject = "",
  defaultBody = "",
  canSend,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** stable id for per-session draft persistence (R7 · CACHING.md §11) */
  draftKey?: string
  defaultTo?: string
  defaultSubject?: string
  defaultBody?: string
  /** the role's own send switch (`google_mail:create`). Without it the person can
   * still write a draft and open it in Gmail — they just cannot make kwapso send
   * mail out of their mailbox. */
  canSend: boolean
}) {
  const t = useT()
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    { to: defaultTo, subject: defaultSubject, body: defaultBody },
    open
  )
  const [busy, setBusy] = React.useState<"draft" | "send" | null>(null)
  const [written, setWritten] = React.useState<WrittenDraft | null>(null)

  // A new letter starts with no draft behind it — otherwise reopening the form
  // would offer to "send" the one written for the last ticket.
  React.useEffect(() => {
    if (open) setWritten(null)
  }, [open])

  const ready =
    values.to.trim() !== "" && values.subject.trim() !== "" && values.body.trim() !== ""
  const gmailLink = safeHref(written?.url)

  async function writeDraft() {
    if (!ready || busy) return
    setBusy("draft")
    try {
      const { draft } = await content.googleDraftMail({
        to: values.to.trim(),
        subject: values.subject.trim(),
        body: values.body,
      })
      setWritten({ draftId: draft.draftId, url: draft.url })
      toast.success(t("Written into your Gmail drafts."))
    } catch (err) {
      // The door's own sentence when Gmail isn't connected reads better than
      // anything this form could invent ("Connect Gmail in Settings first —
      // kwapso only ever uses your own account"), so it is shown as written.
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't write that draft.")
    } finally {
      setBusy(null)
    }
  }

  /** THE ONE ACT HERE THAT LEAVES THE BUILDING. If a draft has already been
   * written, this sends THAT one by its id — so pressing draft and then send
   * puts one letter in the client's inbox, not two. */
  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy("send")
    try {
      await content.googleSendMail(
        written
          ? { draftId: written.draftId }
          : { to: values.to.trim(), subject: values.subject.trim(), body: values.body }
      )
      clearDraft()
      onOpenChange(false)
      toast.success(t("Sent from your mailbox."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't send that.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <FormShellDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy !== null}
      clearDraft={clearDraft}
      onSubmit={send}
      title={<DialogTitle>{t("Reply by email")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("From your own mailbox. Leave it in your Gmail drafts to check it there, or send it from here.")}
        </DialogDescription>
      }
      footer={
        // The row WRAPS and the group takes ml-auto, so a narrow phone reflows
        // instead of pushing the leftmost button off the edge (UI-CONVENTIONS §4).
        <div className="flex w-full flex-wrap gap-2">
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!ready || busy !== null}
              onClick={() => void writeDraft()}
              className="gap-1.5"
            >
              {busy === "draft" ? <Spinner /> : <PenLine className="size-4" />}
              {busy === "draft" ? "Writing…" : written ? "Write it again" : "Save to Gmail drafts"}
            </Button>
          </div>
        </div>
      }
      /* THE ONE FORM WITH A SECOND ACTION. Saving a draft to Gmail is a
         different act from sending, so it keeps its own words in the footer
         above; the SUBMIT is the send, and it says Submit like every other form
         (F1). It is offered only to somebody who may send. */
      submit={canSend ? { busy: busy === "send", disabled: !ready || busy !== null, icon: <Send className="size-4" /> } : undefined}
    >
      <Field config={toField} htmlFor="mail-to" className={fieldSpacing}>
        <Input
          id="mail-to"
          type="email"
          value={values.to}
          onChange={(e) => setValues((v) => ({ ...v, to: e.target.value }))}
          placeholder="them@theircompany.com"
          disabled={busy !== null}
        />
      </Field>
      <Field config={subjectField} htmlFor="mail-subject" className={fieldSpacing}>
        <Input
          id="mail-subject"
          value={values.subject}
          onChange={(e) => setValues((v) => ({ ...v, subject: e.target.value }))}
          placeholder={t("What it is about")}
          disabled={busy !== null}
        />
      </Field>
      <Field config={bodyField} htmlFor="mail-body" className={fieldSpacing}>
        <Textarea
          id="mail-body"
          value={values.body}
          onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))}
          placeholder={t("Write the reply.")}
          disabled={busy !== null}
          rows={8}
        />
      </Field>

      {/* THE CLEAR LINK, once there is something to link to. It opens the draft
          in the person's own Gmail, in a new tab, which is the whole of what was
          asked for — "I can just click inside of the kwapso app and it takes me
          to my Gmail". */}
      {gmailLink && (
        <p className="border-border/60 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">{t("It is waiting in your Gmail drafts. Nothing is sent.")}</span>
          <a
            href={gmailLink}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary inline-flex shrink-0 items-center gap-1.5 underline-offset-2 hover:underline"
          >
            <ExternalLink className="size-3.5" />
            {t("Open it in Gmail")}
          </a>
        </p>
      )}
    </FormShellDialog>
  )
}
