"use client"

// SHARE A DRIVE FOLDER OR A CHAT SPACE — and say, in the same breath, who will
// be able to read it.
//
// This form exists because of one finding. Asked whether a colleague could get
// an answer built from a document in YOUR Drive, the right answer is "only if
// you filed it as team material" — and the note beside it was that the
// team/private shelf is invisible today, so whatever we build "must say, at the
// moment of connecting a folder, who will be able to read it". So the shelf is
// not a setting somebody finds later on a row: it is the second field of the
// form that shares the thing, it defaults to `private`, and each choice is
// spelled out in a sentence rather than a word.
//
// THE THIRD FIELD IS THE SAME ARGUMENT, ONE STEP ALONG: whose material is in it.
// A folder's contents become knowledge-base sources, and every source is filed in
// a COMPARTMENT — one client's, or the agency's own. That could have been guessed
// by matching client names inside the documents; guessing it is precisely the
// failure the compartment idea exists to prevent, because a document filed under
// the wrong client is worse than one filed under nobody: the assistant will quote
// it confidently at the wrong person. The person naming the folder knows. So the
// form asks, here, beside the question about who may read it — the two decisions
// that cannot be read back off the contents afterwards.
//
// Through the shared FormShell (Law R4) with a per-session draft (Law R7) — a
// half-answered "who may read this" must not be lost to a mis-tap and guessed
// at the second time.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kwapso/ui/registry/primitives/select/select"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Plus, Search } from "lucide-react"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"

import type { GoogleShelf } from "@shared/types"
import { ApiFailure, content } from "@/lib/api"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

export type GoogleSourceValues = {
  externalId: string
  name: string
  shelf: GoogleShelf
  /** which client's compartment its contents are filed under; "" = the agency's own. */
  accountId: string
}

/** Radix Select can't hold an empty value, so "the agency's own" uses a sentinel
 * — the same one the knowledge form uses for exactly the same decision. */
const AGENCY = "__agency__"

const searchField = { ...defaultFieldConfig, label: "Find it", required: false }
const chosenField = { ...defaultFieldConfig, label: "What you're sharing", required: true }
const shelfField = { ...defaultFieldConfig, label: "Who will be able to read it", required: true }
const filedField = { ...defaultFieldConfig, label: "Whose material is in it", required: false }

/** The two shelves, in the words a person needs rather than the words the column
 * uses. "Just me" is first and is the default, because the safe answer should be
 * the one you get by not deciding. */
const SHELVES: { value: GoogleShelf; title: string; detail: string }[] = [
  {
    value: "private",
    title: "Just me",
    detail: "Only you — and the assistant when it is answering you.",
  },
  {
    value: "team",
    title: "The team",
    detail: "Anyone here whose role can read it. Their questions can be answered from it too.",
  },
]

export function GoogleSourceDialog({
  open,
  onOpenChange,
  service,
  draftKey,
  accountOptions,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  service: "drive" | "chat"
  draftKey?: string
  /** the clients this person may file it under — already fenced by their own
   * read of the accounts door. */
  accountOptions: { id: string; name: string }[]
  onSubmit: (values: GoogleSourceValues) => Promise<void>
}) {
  const t = useT()
  const [values, setValues, clearDraft] = useFormDraft<GoogleSourceValues & { search: string }>(
    draftKey,
    { externalId: "", name: "", shelf: "private", accountId: AGENCY, search: "" },
    open
  )
  const [busy, setBusy] = React.useState(false)
  const [options, setOptions] = React.useState<{ externalId: string; name: string }[] | null>(null)
  const [looking, setLooking] = React.useState(false)
  const noun = service === "drive" ? "folder" : "space"
  const ready = values.externalId.trim() !== "" && values.name.trim() !== ""

  async function look() {
    if (looking) return
    setLooking(true)
    try {
      const r = await content.googlePick(service, values.search.trim() || undefined)
      setOptions(r.options)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : `Couldn't list your ${noun}s.`)
    } finally {
      setLooking(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await onSubmit({
        externalId: values.externalId.trim(),
        name: values.name.trim(),
        shelf: values.shelf,
        accountId: values.accountId === AGENCY ? "" : values.accountId,
      })
      clearDraft()
      setOptions(null)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : `Couldn't share that ${noun}.`)
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
      title={<DialogTitle>{t("Share a")} {noun}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("Nothing outside the")} {noun}{t("s you share here is ever read.")}
        </DialogDescription>
      }
      footer={
        <Button type="submit" disabled={busy || !ready} className="gap-1.5">
          {busy ? <Spinner /> : <Plus className="size-4" />}
          {busy ? "Sharing…" : "Share it"}
        </Button>
      }
    >
      <Field config={searchField} htmlFor="google-source-search" className={fieldSpacing}>
        {/* Stacked on narrow screens: an input and a button side by side is how a
         * button ends up 40px wide on a phone (UI-CONVENTIONS §4). */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="google-source-search"
            value={values.search}
            onChange={(e) => setValues((s) => ({ ...s, search: e.target.value }))}
            placeholder={service === "drive" ? "Part of the folder's name" : "Leave blank to list your spaces"}
            disabled={busy}
            autoFocus
          />
          <Button type="button" variant="outline" onClick={look} disabled={busy || looking} className="gap-1.5">
            {looking ? <Spinner /> : <Search className="size-3.5" aria-hidden />}
            {looking ? "Looking…" : "Look"}
          </Button>
        </div>
      </Field>

      {options !== null && (
        <div className="flex max-h-56 flex-col overflow-y-auto rounded-xl border">
          {options.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">{t("Nothing found in your Google account.")}</p>
          ) : (
            options.map((o) => (
              <button
                key={o.externalId}
                type="button"
                onClick={() => setValues((s) => ({ ...s, externalId: o.externalId, name: o.name }))}
                className={`hover:bg-muted/50 border-b p-3 text-left text-sm last:border-0 ${
                  values.externalId === o.externalId ? "bg-muted" : ""
                }`}
              >
                {o.name}
              </button>
            ))
          )}
        </div>
      )}

      <Field config={chosenField} htmlFor="google-source-name" className={fieldSpacing}>
        <Input
          id="google-source-name"
          value={values.name}
          onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))}
          placeholder={service === "drive" ? "Pick a folder above" : "Pick a space above"}
          disabled={busy}
        />
      </Field>

      {/* THE QUESTION THIS FORM EXISTS FOR. Two plain choices with a sentence
       * each — not a switch labelled "team", which is the version somebody reads
       * as "shared with my team members' folders" or does not read at all. */}
      <Field config={shelfField} className={fieldSpacing}>
        <div className="flex flex-col gap-2">
          {SHELVES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setValues((v) => ({ ...v, shelf: s.value }))}
              disabled={busy}
              className={`flex flex-col gap-0.5 rounded-xl border p-3 text-left ${
                values.shelf === s.value ? "border-primary bg-muted" : ""
              }`}
            >
              <span className="text-sm font-medium">{s.title}</span>
              <span className="text-muted-foreground text-xs">{s.detail}</span>
            </button>
          ))}
        </div>
      </Field>

      {/* WHOSE MATERIAL, asked rather than guessed — see the note at the top. */}
      <Field config={filedField} htmlFor="google-source-client" className={fieldSpacing}>
        <Select
          value={values.accountId}
          onValueChange={(v) => setValues((s) => ({ ...s, accountId: v }))}
          disabled={busy}
        >
          <SelectTrigger id="google-source-client">
            <SelectValue placeholder={t("Ours — not a client's")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AGENCY}>{t("Ours — not a client's")}</SelectItem>
            {accountOptions.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground mt-1.5 text-xs">
          {t("Questions about that client are answered from what is in here. Leave it as ours if the")} {noun} {t("is not about one.")}
        </p>
      </Field>
    </FormShellDialog>
  )
}
