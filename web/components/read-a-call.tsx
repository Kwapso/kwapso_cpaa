"use client"

// READ A CALL — the button that turns a conversation into a proposed process map,
// and the source picker in front of it.
//
// IT IS TWO STEPS AND NOT ONE, deliberately. Pressing it does not change the map.
// It spends one unit of the team's AI allowance, produces a PROPOSAL, and opens
// the review screen — and only what survives that review is ever written. Both
// respondents passed the comprehension check on exactly this: with eleven steps
// proposed and nobody having touched anything, what is on the client's record?
// "Nothing — the draft is not the record."
//
// THE SOURCE IS EITHER A MEETING WE HOLD OR TEXT SOMEBODY PASTED (the ruling:
// "both — a meeting if there is one, pasted text if there is not"). A meeting is
// offered first because the app already has the transcript; pasting is the way
// in for a call nobody recorded, which is most of them.
//
// It lives beside the map rather than on a screen of its own because a proposal
// is ABOUT a map — there is no useful "drafts" destination, only "what did that
// call say about this process".

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@shared/web/field"
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"
import { Sparkles } from "lucide-react"

import { ApiFailure, tenancy } from "@/lib/api"
import { DraftReviewDialog } from "@/components/draft-review"
import { RecordPicker } from "@/components/record-picker"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useT } from "@shared/web/language"
import type { ProcessDraftDetail } from "@shared/process-drafts"

const sourceField = {
  ...defaultFieldConfig,
  label: "A meeting we already hold",
  required: false,
  hint: "We read its transcript. Leave it empty and paste the notes instead.",
}
const textField = {
  ...defaultFieldConfig,
  label: "Or paste what was said",
  required: false,
}

export function ReadACall({
  processId,
  meetings,
  onApplied,
}: {
  processId: string
  /** meetings we hold for this client, newest first */
  meetings: { value: string; label: string }[]
  /** re-read the map — steps have just landed on it */
  onApplied: () => void
}) {
  const t = useT()
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [meetingId, setMeetingId] = React.useState("")
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [detail, setDetail] = React.useState<ProcessDraftDetail | null>(null)

  const ready = meetingId !== "" || text.trim().length > 20

  async function read(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      const made = await tenancy.createProcessDraft({
        processId,
        meetingId: meetingId || undefined,
        sourceText: text.trim() || undefined,
      })
      // READ IT BACK RATHER THAN TRUSTING THE REPLY. The review screen renders a
      // full detail — the payload plus the caption its figures must be quoted
      // with (R25) — and assembling that here from a create response would be a
      // second place that shape is decided.
      setDetail(await tenancy.processDraftDetail(made.id))
      setPickerOpen(false)
      setMeetingId("")
      setText("")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't read that call."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
        <Sparkles className="size-3.5" />
        {t("Read a call")}
      </Button>

      <FormShellDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        busy={busy}
        onSubmit={read}
        title={<DialogTitle>{t("Read a call into this map")}</DialogTitle>}
        subtitle={
          <DialogDescription>
            {t("Nothing is written to the map. You get a proposal to go through, and only what you keep is saved.")}
          </DialogDescription>
        }
        submit={{ busy, disabled: !ready }}
      >
        {meetings.length > 0 && (
          <Field config={sourceField} htmlFor="call-meeting" className={fieldSpacing}>
            <RecordPicker
              value={meetingId}
              onChange={setMeetingId}
              options={meetings}
              placeholder={t("Pick a meeting")}
              searchPlaceholder={t("Search meetings…")}
              emptyText={t("Nothing matched.")}
              className="w-full"
            />
          </Field>
        )}
        <Field config={textField} htmlFor="call-text" className={fieldSpacing}>
          <Textarea
            id="call-text"
            value={text}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
            placeholder={t("Paste the notes or the transcript of the call.")}
            disabled={busy}
            className="min-h-40"
          />
        </Field>
      </FormShellDialog>

      {detail && (
        <DraftReviewDialog
          open={true}
          onOpenChange={(open) => !open && setDetail(null)}
          detail={detail}
          onApply={async (decisions) => {
            const result = await tenancy.applyProcessDraft(detail.draft.id, decisions)
            onApplied()
            setDetail(null)
            return result
          }}
          onDiscard={async () => {
            await tenancy.discardProcessDraft(detail.draft.id)
            setDetail(null)
          }}
        />
      )}
    </>
  )
}
