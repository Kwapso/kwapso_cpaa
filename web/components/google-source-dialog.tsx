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
// AND IT SHARES SEVERAL AT ONCE. The owner: "can you make it so that I can
// select multiple spaces, multiple folders, and multiple files at once?" The
// three decisions this form exists for — who may read it, whose material it is,
// and what kind of thing it is — are the SAME answer for everything picked in
// one sitting, which is exactly why one form with a multi-select is the right
// shape and not merely a faster one. Somebody sharing four client folders was
// answering the same two questions four times, and the fourth answer is the one
// that gets rushed.
//
// DRIVE ASKS ONE MORE QUESTION FIRST: a folder, or a file? The owner again —
// "In Drive, why is it that it's only folder-wise? What if it had to be
// file-wise, or does that file have to be in a folder?" It did not have to. It
// is a choice above the search box rather than a mode on each result, because it
// changes what the search LOOKS IN, and a person who has picked two folders and
// then switches to files has changed their mind about what they are doing.
//
// Through the shared FormShell (Law R4) with a per-session draft (Law R7) — a
// half-answered "who may read this" must not be lost to a mis-tap and guessed
// at the second time.

import * as React from "react"

import { Button } from "@shared/ui/controls/button/button"
import { DialogDescription, DialogTitle } from "@shared/ui/controls/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@shared/ui/controls/input/input"
import { Spinner } from "@shared/ui/controls/spinner/spinner"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { Check, Plus, Search } from "@shared/ui/icons"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import type { GoogleShelf, GoogleSourceKind } from "@shared/types"
import { ApiFailure, content } from "@/lib/api"
import { pickerKey, searchAccounts } from "@/lib/picker-sources"
import { RecordPicker } from "@/components/record-picker"
import type { PickableRecord } from "@/lib/pickable"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
// EVERY URL THAT REACHES AN ATTRIBUTE GOES THROUGH THE SEAM, including these.
// Google's own icon host and our own thumbnail path are both perfectly safe
// today; the rule is not about today. It is about the fact that "this one came
// from somewhere trustworthy" is a judgement the next reader has to re-make on
// every line, and a seam call is a judgement nobody has to re-make.
import { safeSrc } from "@shared/web/rich-text"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"

export type GoogleSourceValues = {
  /** everything picked in this sitting. The three decisions below are one answer
   * for all of them — see the note at the top for why that is the argument for a
   * multi-select rather than a convenience. */
  items: { externalId: string; name: string; kind: GoogleSourceKind }[]
  shelf: GoogleShelf
  /** which client's compartment their contents are filed under; "" = the agency's own. */
  accountId: string
}

/** Radix Select can't hold an empty value, so "the agency's own" uses a sentinel
 * — the same one the knowledge form uses for exactly the same decision. */
const AGENCY = "__agency__"

const searchField = { ...defaultFieldConfig, label: "Find it", required: false }
const kindField = { ...defaultFieldConfig, label: "Type", required: true }
const chosenField = { ...defaultFieldConfig, label: "What you're sharing", required: true }
const shelfField = { ...defaultFieldConfig, label: "Who will be able to read it", required: true }
const filedField = { ...defaultFieldConfig, label: "Whose material is in it", required: false }

/** The two shelves, in the words a person needs rather than the words the column
 * uses. "Just me" is first and is the default, because the safe answer should be
 * the one you get by not deciding. */
// `description` rather than `detail`, and the rename is the point: `title` is a
// prop the extractor reads and `detail` is not, so the two halves of one line of
// copy were on opposite sides of the catalogue — the heading translated and the
// sentence under it in English, on the same row, forever. `description` is
// already one of the closed set of props a person reads
// (scripts/lib/i18n-source.mjs), so both halves are now catalogued together.
const SHELVES: { value: GoogleShelf; title: string; description: string }[] = [
  {
    value: "private",
    title: "Just me",
    description: "Only you, and the assistant when it is answering you.",
  },
  {
    value: "team",
    title: "The team",
    description: "Anyone here whose role can read it. Their questions can be answered from it too.",
  },
]

/** One row the picker offered. */
type PickOption = {
  externalId: string
  name: string
  /** false when the label is OURS rather than Google's — see the picker below. */
  named: boolean
  iconUrl: string | null
  mimeType: string
  /** whether Google can render a picture of it. The FACT rather than the link —
   * Google's own preview url is authenticated and expires, so the picture is
   * asked of our own door instead. */
  hasThumbnail: boolean
}

/** The two shapes a Drive share can take, in the words a person needs. A folder
 * is the default because it is what most people mean and what the module has
 * always done; a file is the narrower, more deliberate act. */
const KINDS: { value: GoogleSourceKind; title: string; description: string }[] = [
  {
    value: "folder",
    title: "A folder",
    description: "Everything in it, including whatever you put there later.",
  },
  {
    value: "file",
    title: "Particular files",
    description: "Only the ones you pick. Nothing else in the folder they sit in.",
  },
]

export function GoogleSourceDialog({
  open,
  onOpenChange,
  service,
  draftKey,
  teamId,
  accountOptions,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  service: "drive" | "chat"
  draftKey?: string
  /** the clients this person may file it under — already fenced by their own
   * read of the accounts door. */
  /** the team whose clients the picker searches — accounts PAGE (R14). */
  teamId: string | null
  /** the clients the screen already holds, painted while the door answers. */
  accountOptions: PickableRecord[]
  onSubmit: (values: GoogleSourceValues) => Promise<void>
}) {
  const t = useT()
  const [values, setValues, clearDraft] = useFormDraft<GoogleSourceValues & { search: string }>(
    draftKey,
    { items: [], shelf: "private", accountId: AGENCY, search: "" },
    open
  )
  const [busy, setBusy] = React.useState(false)
  const [options, setOptions] = React.useState<PickOption[] | null>(null)
  const [looking, setLooking] = React.useState(false)
  // A DRIVE SHARE IS A FOLDER OR A FILE; a Chat share is always a space. Held
  // outside the draft on purpose: it decides what the picker LOOKS IN, so
  // restoring a half-finished form with a stale answer here would show somebody
  // a list of folders under a heading that says files.
  const [kind, setKind] = React.useState<GoogleSourceKind>(service === "chat" ? "space" : "folder")
  const noun = service === "chat" ? "space" : kind === "file" ? "file" : "folder"
  const chosen = values.items ?? []
  const ready = chosen.length > 0

  async function look() {
    if (looking) return
    setLooking(true)
    try {
      const r = await content.googlePick(
        service,
        values.search.trim() || undefined,
        service === "drive" ? (kind === "file" ? "file" : "folder") : undefined
      )
      setOptions(r.options)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : `Couldn't list your ${noun}s.`)
    } finally {
      setLooking(false)
    }
  }

  /** Picked, or un-picked. A second tap takes it off the list, because a
   * multi-select where the only way to undo a mis-tap is to close the form and
   * start again is a multi-select that makes people slower. */
  function toggle(option: PickOption) {
    setValues((v) => {
      const items = v.items ?? []
      return items.some((i) => i.externalId === option.externalId)
        ? { ...v, items: items.filter((i) => i.externalId !== option.externalId) }
        : { ...v, items: [...items, { externalId: option.externalId, name: option.name, kind }] }
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await onSubmit({
        items: chosen,
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
      submit={{
        busy: busy,
        disabled: !ready,
        icon: <Plus className="size-4" />,
      }}
    >
      {/* A FOLDER, OR A FILE — Drive only, and above the search because it
       * decides what the search looks in. Two buttons rather than a dropdown:
       * there are two answers and both fit on a line, and the sentence under
       * each is what makes the difference obvious to somebody who has never
       * thought about it. */}
      {service === "drive" && (
        <Field config={kindField} className={fieldSpacing}>
          <div className="flex flex-col gap-2 sm:flex-row">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => {
                  setKind(k.value)
                  // The picked list is emptied with the choice. A folder id and
                  // a file id are not interchangeable, and carrying four folders
                  // into a file share would file them under a word that is not
                  // true of them.
                  setValues((v) => ({ ...v, items: [] }))
                  setOptions(null)
                }}
                disabled={busy}
                className={`flex flex-1 flex-col gap-1 rounded-xl border p-3 text-left ${
                  kind === k.value ? "border-primary bg-muted" : ""
                }`}
              >
                <span className="text-sm font-medium">{t(k.title)}</span>
                <span className="text-muted-foreground text-xs">{t(k.description)}</span>
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field config={searchField} htmlFor="google-source-search" className={fieldSpacing}>
        {/* Stacked on narrow screens: an input and a button side by side is how a
         * button ends up 40px wide on a phone (UI-CONVENTIONS §4). */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="google-source-search"
            value={values.search}
            onChange={(e) => setValues((s) => ({ ...s, search: e.target.value }))}
            placeholder={
              service === "chat" ? t("Leave blank to list your spaces") : `Part of the ${noun}'s name`
            }
            disabled={busy}
            autoFocus
          />
          <Button type="button" variant="secondary" onClick={look} disabled={busy || looking} className="gap-1">
            {looking ? <Spinner /> : <Search className="size-3.5" aria-hidden />}
            {looking ? t("Looking…") : t("Look")}
          </Button>
        </div>
      </Field>

      {options !== null && (
        <div className="flex max-h-56 flex-col overflow-y-auto rounded-xl border">
          {options.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">{t("Nothing found in your Google account.")}</p>
          ) : (
            options.map((o) => {
              const picked = chosen.some((i) => i.externalId === o.externalId)
              return (
                <button
                  key={o.externalId}
                  type="button"
                  onClick={() => toggle(o)}
                  className={`hover:bg-muted/50 flex items-center gap-2 border-b p-3 text-left text-sm last:border-0 ${
                    picked ? "bg-muted" : ""
                  }`}
                >
                  {/* The tick is the whole of the multi-select's affordance, so
                   * it holds its width whether or not it is showing — a row that
                   * shifts sideways as you pick things is a row you mis-tap. */}
                  <Check
                    className={`size-3.5 shrink-0 ${picked ? "" : "opacity-0"}`}
                    aria-hidden
                  />
                  {/* GOOGLE'S OWN ICON for the type — a static, unauthenticated
                   * link, which is the one piece of Drive chrome that can go
                   * straight into a page. It is what turns a column of names
                   * ending in the same three words into a list somebody can
                   * pick from. */}
                  {o.iconUrl && (
                    <img src={safeSrc(o.iconUrl)} alt="" width={16} height={16} className="shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  {/* A PICTURE OF PAGE ONE, for the file-level share the owner
                   * asked for. It is the whole point of previews here: two
                   * contracts with nearly the same name are one glance apart
                   * when you can see them and a coin toss when you cannot.
                   *
                   * Served by OUR door, not Google's — `thumbnailLink` is
                   * authenticated and expires within hours, so hotlinking it
                   * shows a broken image to everybody. Lazy, so opening the
                   * picker does not fetch fifty pictures nobody scrolled to,
                   * and it simply disappears if the fetch fails: a missing
                   * preview must never break a row somebody is trying to pick. */}
                  {o.hasThumbnail && (
                    <img
                      src={safeSrc(content.googleDriveThumbnailUrl(o.externalId))}
                      alt=""
                      loading="lazy"
                      className="h-8 w-8 shrink-0 rounded border object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none"
                      }}
                    />
                  )}
                  {/* WE MADE THAT LABEL UP. Google leaves the name of a direct
                   * message empty, so "A direct message" is our sentence, not
                   * theirs — and a picker that presented it as a name would be
                   * the same lie the raw ids were, better dressed. */}
                  {!o.named && (
                    <span className="text-muted-foreground shrink-0 text-badge">
                      {t("no name in Google")}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}

      {/* WHAT IS ACTUALLY GOING TO BE SHARED, listed. The picker is a search
       * result that a person scrolls and re-searches; this is the answer, and
       * keeping it on screen is what stops somebody submitting three things when
       * they meant four. */}
      <Field config={chosenField} className={fieldSpacing}>
        {chosen.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("Nothing picked yet. Look one up above and tap it.")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {chosen.map((i) => (
              <button
                key={i.externalId}
                type="button"
                onClick={() =>
                  toggle({
                    externalId: i.externalId,
                    name: i.name,
                    named: true,
                    iconUrl: null,
                    mimeType: "",
                    hasThumbnail: false,
                  })
                }
                disabled={busy}
                className="bg-muted hover:bg-muted/70 flex items-center gap-1 rounded-xl px-2 py-1 text-xs"
                title={t("Take it off the list")}
              >
                <span className="max-w-[16rem] truncate">{i.name}</span>
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
        )}
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
              className={`flex flex-col gap-1 rounded-xl border p-3 text-left ${
                values.shelf === s.value ? "border-primary bg-muted" : ""
              }`}
            >
              <span className="text-sm font-medium">{t(s.title)}</span>
              <span className="text-muted-foreground text-xs">{t(s.description)}</span>
            </button>
          ))}
        </div>
      </Field>

      {/* WHOSE MATERIAL, asked rather than guessed — see the note at the top. */}
      <Field config={filedField} htmlFor="google-source-client" className={fieldSpacing}>
        <RecordPicker
          id="google-source-client"
          value={values.accountId}
          onChange={(v) => setValues((s) => ({ ...s, accountId: v }))}
          search={(term) => searchAccounts(term)}
          searchKey={pickerKey("accounts", teamId)}
          options={accountOptions.map((a) => ({ value: a.id, label: a.name, picture: a.logoUrl }))}
          emptyOption={{ value: AGENCY, label: t("Ours, not a client's") }}
          placeholder={t("Ours, not a client's")}
          searchPlaceholder={t("Search accounts…")}
          emptyText={t("No account matched.")}
          disabled={busy}
        />
        <p className="text-muted-foreground mt-1.5 text-xs">
          {t("Questions about that client are answered from what is in here. Leave it as ours if the")} {noun} {t("is not about one.")}
        </p>
      </Field>
    </FormShellDialog>
  )
}
