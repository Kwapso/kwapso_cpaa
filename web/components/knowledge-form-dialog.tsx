"use client"

// Knowledge-source form — write something into the knowledge base, or correct
// what is already there. The whole point of the module in one dialog: the owner
// asked for a base a person can "add to, correct, and remove something wrong
// from", and a source list you can only watch is not that.
//
// TWO FIELDS THAT ARE NOT ABOUT THE TEXT, and they are the interesting ones:
//   • FILED UNDER — which client's compartment this belongs to, or the agency's.
//     A picker over accounts the caller can already see, because a compartment
//     built from an id nobody owns is a slice nothing can ever reach again.
//   • WHO CAN USE IT — the team, or only you. That is the second fence
//     (`owner_user_id`), and it is the one a personal Google connection lands on
//     later: material that arrived through what YOU can see stays in YOUR answers.
//
// A MIRRORED source (one the sweep keeps in step with a ticket, an article or an
// account) hands `textOwnedElsewhere` in, and the two text fields go read-only
// with the reason said out loud — the sweep would overwrite an edit on its next
// pass, and a form that silently loses your typing is worse than one that says
// it will. Library primitives, FormShell, per-session draft (R4 + R7).

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kwapso/ui/registry/primitives/select/select"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { useFormDraft } from "@shared/web/use-form-draft"

const titleField = { ...defaultFieldConfig, label: "What is it called?", required: true }
const bodyField = { ...defaultFieldConfig, label: "What should the assistant know?", required: false }
const linkField = { ...defaultFieldConfig, label: "Link (optional)", required: false }
const filedField = { ...defaultFieldConfig, label: "Filed under", required: false }
const visibilityField = { ...defaultFieldConfig, label: "Who can use it", required: false }

/** Radix Select can't hold an empty value, so "the agency's own" uses a sentinel. */
const AGENCY = "__agency__"

export type KnowledgeFormValues = {
  title: string
  body: string
  sourceUrl: string
  accountId: string
  visibility: "team" | "private"
}

export function KnowledgeFormDialog({
  open,
  onOpenChange,
  onSubmit,
  accountOptions,
  initial,
  draftKey,
  textOwnedElsewhere,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: KnowledgeFormValues) => Promise<void>
  /** the accounts this caller may file under — already fenced by their own read */
  accountOptions: { id: string; name: string }[]
  /** Present = EDIT mode (prefilled). */
  initial?: Partial<KnowledgeFormValues>
  /** stable id for per-session draft persistence (CACHING.md §11); omit to disable */
  draftKey?: string
  /** true when the sweep owns this source's words (a mirrored ticket/article/account) */
  textOwnedElsewhere?: boolean
}) {
  const isEdit = !!initial
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    {
      title: initial?.title ?? "",
      body: initial?.body ?? "",
      sourceUrl: initial?.sourceUrl ?? "",
      accountId: initial?.accountId || AGENCY,
      visibility: initial?.visibility ?? ("team" as const),
    },
    open
  )
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit({
        title: values.title.trim(),
        body: values.body.trim(),
        sourceUrl: values.sourceUrl.trim(),
        accountId: values.accountId === AGENCY ? "" : values.accountId,
        visibility: values.visibility,
      })
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiFailure
          ? err.message
          : isEdit
            ? "Couldn't save the source."
            : "Couldn't add it to the knowledge base."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormShellDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      clearDraft={clearDraft}
      onSubmit={submit}
      title={<DialogTitle>{isEdit ? "Correct this source" : "Add to the knowledge base"}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {textOwnedElsewhere
            ? "This one is kept in step with the record it came from, so its words are edited there. You can still change where it is filed and who can use it."
            : "Anything you put here is something the assistant may use to answer questions — and it will name this source when it does."}
        </DialogDescription>
      }
      footer={
        <Button type="submit" disabled={busy || !values.title.trim()}>
          {busy ? <Spinner /> : null}
          {busy ? "Saving…" : isEdit ? "Save changes" : "Add source"}
        </Button>
      }
    >
      <Field config={titleField} htmlFor="knowledge-title" className={fieldSpacing}>
        <Input
          id="knowledge-title"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          placeholder="e.g. How we handle a Bergman dispatch outage"
          disabled={busy || textOwnedElsewhere}
          autoFocus
        />
      </Field>
      <Field config={bodyField} htmlFor="knowledge-body" className={fieldSpacing}>
        <Textarea
          id="knowledge-body"
          value={values.body}
          onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))}
          placeholder="Write it the way you would explain it to a new colleague."
          disabled={busy || textOwnedElsewhere}
          rows={8}
        />
      </Field>
      <Field config={linkField} htmlFor="knowledge-link" className={fieldSpacing}>
        <Input
          id="knowledge-link"
          value={values.sourceUrl}
          onChange={(e) => setValues((v) => ({ ...v, sourceUrl: e.target.value }))}
          placeholder="https://…"
          disabled={busy || textOwnedElsewhere}
        />
      </Field>
      <Field config={filedField} htmlFor="knowledge-filed" className={fieldSpacing}>
        <Select
          value={values.accountId}
          onValueChange={(accountId) => setValues((v) => ({ ...v, accountId }))}
          disabled={busy}
        >
          <SelectTrigger id="knowledge-filed">
            <SelectValue placeholder="The agency's own" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AGENCY}>The agency&apos;s own</SelectItem>
            {accountOptions.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground mt-1 text-xs">
          Filing it under a client is how a question about them finds it first.
        </p>
      </Field>
      <Field config={visibilityField} htmlFor="knowledge-visibility" className={fieldSpacing}>
        <Select
          value={values.visibility}
          onValueChange={(visibility) =>
            setValues((v) => ({ ...v, visibility: visibility === "private" ? "private" : "team" }))
          }
          disabled={busy}
        >
          <SelectTrigger id="knowledge-visibility">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="team">Anyone who can read the knowledge base</SelectItem>
            <SelectItem value="private">Only me</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </FormShellDialog>
  )
}
