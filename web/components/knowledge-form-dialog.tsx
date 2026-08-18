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
//   • WHO CAN USE IT — the team, the people on one app, or only you. Two fences
//     behind one question: `owner_user_id` (the one a personal Google connection
//     lands on — material that arrived through what YOU can see stays in YOUR
//     answers) and `visible_to_app_id`, which borrows the app record's own rule
//     that only its staff and an admin may open it (12.3 + 8.11). Picking an app
//     you are not on is refused by the door, in words, rather than quietly
//     filing something you would be the first person unable to read.
//
// A MIRRORED source (one the sweep keeps in step with a ticket, an article or an
// account) hands `textOwnedElsewhere` in, and the two text fields go read-only
// with the reason said out loud — the sweep would overwrite an edit on its next
// pass, and a form that silently loses your typing is worse than one that says
// it will. Library primitives, FormShell, per-session draft (R4 + R7).

import * as React from "react"

import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { pickerKey, searchAccounts } from "@/lib/picker-sources"
import { RecordPicker } from "@/components/record-picker"
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
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import { ApiFailure } from "@/lib/api"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

const titleField = { ...defaultFieldConfig, label: "What is it called?", required: true }
const bodyField = { ...defaultFieldConfig, label: "What should the assistant know?", required: false }
const linkField = { ...defaultFieldConfig, label: "Link (optional)", required: false }
const filedField = { ...defaultFieldConfig, label: "Filed under", required: false }
const visibilityField = { ...defaultFieldConfig, label: "Who can use it", required: false }
const appField = { ...defaultFieldConfig, label: "Which app's people", required: true }

/** Radix Select can't hold an empty value, so "the agency's own" uses a sentinel. */
const AGENCY = "__agency__"

export type KnowledgeFormValues = {
  title: string
  body: string
  sourceUrl: string
  accountId: string
  visibility: "team" | "app" | "private"
  /** the app whose people may read it — meaningful only when visibility is "app" */
  visibleToAppId: string
}

export function KnowledgeFormDialog({
  open,
  onOpenChange,
  onSubmit,
  teamId,
  accountOptions,
  appOptions,
  initial,
  draftKey,
  textOwnedElsewhere,
  textOwnedNote,
  titleOwnedElsewhere,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: KnowledgeFormValues) => Promise<void>
  /** the accounts this caller may file under — already fenced by their own read */
  /** the team whose clients the compartment picker searches (accounts PAGE, R14) */
  teamId: string | null
  accountOptions: { id: string; name: string }[]
  /** the apps this caller may limit a source to. The host hands in the ones it
   * already loaded; the DOOR is what decides, and it refuses any app the caller
   * is not staffed to — this list only stops somebody choosing one to be told no. */
  appOptions: { id: string; name: string }[]
  /** Present = EDIT mode (prefilled). */
  initial?: Partial<KnowledgeFormValues>
  /** stable id for per-session draft persistence (CACHING.md §11); omit to disable */
  draftKey?: string
  /** true when this source's words belong to something else — a mirrored row the
   * sweep keeps in step, or an uploaded file the words were read out of */
  textOwnedElsewhere?: boolean
  /** WHY they are read-only, in the sentence that fits. Two different things own
   * words here and they need two different explanations: a mirrored source is
   * kept in step with a record, an uploaded file IS the record. One boolean with
   * one sentence would have told half the people the wrong thing. */
  textOwnedNote?: string
  /** true when even the NAME belongs elsewhere. Separate from the words on
   * purpose: a mirrored source is called what its row is called, and the sweep
   * would put that name straight back — but nothing owns what we call an
   * uploaded file, so a file source can be renamed while its words stay
   * read-only. Defaults to `textOwnedElsewhere`, which is what a mirrored source
   * has always meant. */
  titleOwnedElsewhere?: boolean
}) {
  const t = useT()
  const isEdit = !!initial
  const [values, setValues, clearDraft] = useFormDraft(
    draftKey,
    {
      title: initial?.title ?? "",
      body: initial?.body ?? "",
      sourceUrl: initial?.sourceUrl ?? "",
      accountId: initial?.accountId || AGENCY,
      visibility: initial?.visibility ?? ("team" as const),
      visibleToAppId: initial?.visibleToAppId ?? "",
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
        // Only sent when it is the answer. "Team" and "only me" both mean no
        // app, and sending one alongside them would store a restriction the
        // person did not choose.
        visibleToAppId: values.visibility === "app" ? values.visibleToAppId : "",
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
            ? (textOwnedNote ??
              "This one is kept in step with the record it came from, so its words are edited there. You can still change where it is filed and who can use it.")
            : "Anything you put here is something the assistant may use to answer questions, and it will name this source when it does."}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !values.title.trim(),
      }}
    >
      <Field config={titleField} htmlFor="knowledge-title" className={fieldSpacing}>
        <Input
          id="knowledge-title"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          placeholder={t("e.g. How we handle a Bergman dispatch outage")}
          disabled={busy || (titleOwnedElsewhere ?? textOwnedElsewhere)}
          autoFocus
        />
      </Field>
      <Field config={bodyField} htmlFor="knowledge-body" className={fieldSpacing}>
        <Textarea
          id="knowledge-body"
          value={values.body}
          onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))}
          placeholder={t("Write it the way you would explain it to a new colleague.")}
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
        <RecordPicker
          id="knowledge-filed"
          value={values.accountId}
          onChange={(accountId) => setValues((v) => ({ ...v, accountId }))}
          search={(term) => searchAccounts(term)}
          searchKey={pickerKey("accounts", teamId)}
          options={accountOptions.map((a) => ({ value: a.id, label: a.name }))}
          emptyOption={{ value: AGENCY, label: t("The agency's own") }}
          placeholder={t("The agency's own")}
          searchPlaceholder={t("Search clients…")}
          emptyText={t("No client matched.")}
          disabled={busy}
        />
        <p className="text-muted-foreground mt-1 text-xs">
          {t("Filing it under a client is how a question about them finds it first.")}
        </p>
      </Field>
      <Field config={visibilityField} htmlFor="knowledge-visibility" className={fieldSpacing}>
        <Select
          value={values.visibility}
          onValueChange={(visibility) =>
            setValues((v) => ({
              ...v,
              visibility:
                visibility === "private" ? "private" : visibility === "app" ? "app" : "team",
            }))
          }
          disabled={busy}
        >
          <SelectTrigger id="knowledge-visibility">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="team">{t("Anyone who can read the knowledge base")}</SelectItem>
            {/* THE MIDDLE ANSWER (12.3). Offered only when this caller is on an
                app, the door refuses any other, so a picker with nothing in it
                would be an option that can only end in a refusal. */}
            {appOptions.length > 0 && (
              <SelectItem value="app">{t("Only the people on one app")}</SelectItem>
            )}
            <SelectItem value="private">{t("Only me")}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {values.visibility === "app" && (
        <Field config={appField} htmlFor="knowledge-app" className={fieldSpacing}>
          <RecordPicker
            id="knowledge-app"
            value={values.visibleToAppId}
            onChange={(visibleToAppId) => setValues((v) => ({ ...v, visibleToAppId }))}
            options={appOptions.map((a) => ({ value: a.id, label: a.name }))}
            placeholder={t("Pick the app")}
            searchPlaceholder={t("Search apps…")}
            emptyText={t("No app matched.")}
            disabled={busy}
          />
          <p className="text-muted-foreground mt-1 text-xs">
            {t("The staff on that app can read it, and so can an admin. Nobody else will see it, and the assistant will not answer anyone else from it.")}
          </p>
        </Field>
      )}
    </FormShellDialog>
  )
}
