"use client"

// HOW MUCH OF YOUR GMAIL OR YOUR CALENDAR KWAPSO MAY READ.
//
// ══════════════════════════════════════════════════════════════════════════════
// WHY THIS FORM EXISTS
//
// On 25 August 2026 a live password was said out loud on a call, transcribed
// into the meeting notes and indexed into the knowledge base. It was rotated.
// The fix offered was a credential SCANNER over transcripts, and the owner
// refused it: "no it should not scan anything.. give content as it is." He is
// right. A scanner tuned to catch a spoken secret also silently drops real
// material, and a knowledge base that drops things silently is one nobody can
// trust the answers of.
//
// So the lever is SCOPE. The answer to "that should never have been read" is
// "that source was never in scope" — a decision the person whose connection it
// is makes in advance, in this form.
//
// ══════════════════════════════════════════════════════════════════════════════
// THE ONE PLACE THIS SCREEN COULD DO HARM, and the copy that stops it
//
// A person meeting a "which calendars" control on a privacy screen reads it as a
// RESTRICTION. On the calendar it is the opposite. Until this lane, kwapso read
// `calendars/primary/events` and nothing else — one calendar, hard-coded — so
// naming a second calendar WIDENS what it can see. Somebody could quietly
// increase their own exposure believing they had narrowed it.
//
// That is a copy problem, not a code one, and it is answered here in words: the
// calendar's sentence says plainly that this lets kwapso read calendars it
// cannot see today, and Gmail's says plainly that it takes mail away. The two
// controls look alike and mean opposite things, so they must not READ alike.
// ══════════════════════════════════════════════════════════════════════════════
//
// Through the shared FormShell (Law R4) with a per-session draft (Law R7): a
// half-made decision about who may read your mail must not be lost to a mis-tap
// and guessed at the second time.

import * as React from "react"

import { Button } from "@shared/ui/components/button/button"
import { Checkbox } from "@shared/ui/components/checkbox/checkbox"
import { Choice } from "@shared/ui/components/choice/choice"
import { DialogDescription, DialogTitle } from "@shared/ui/components/dialog/dialog"
import { Field } from "@shared/web/field"
import { Input } from "@shared/ui/components/input/input"
import { Spinner } from "@shared/ui/components/spinner/spinner"
import { toast } from "@shared/ui/components/sonner/sonner"
import { Check, MagnifyingGlass } from "@shared/ui/foundations/icons"
import { defaultFieldConfig } from "@shared/web/screen-engine/config"

import {
  GOOGLE_EVENT_TYPES,
  type GoogleEventType,
  type GoogleScopedService,
  type GoogleScopeMode,
  type GoogleSource,
} from "@shared/types"
import { ApiFailure, content } from "@/lib/api"
import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"
import { brand } from "@shared/brand"

/** THE APP'S OWN NAME, THROUGH THE SEAM THAT OWNS IT. `shared/brand.ts` calls
 * itself "THE one place to brand this app" and twenty-three files read it; the
 * sentences below used to spell the name out instead, which meant a rebrand — or
 * a fork of this base for the next product — would have left them saying the old
 * one, in four languages, on a screen that looked finished. Written as a `{brand}`
 * hole rather than concatenated, because a hole is the only shape a translator
 * can reorder (shared/i18n.ts, `fill`). */
const BRAND = { brand: brand.name }


export type GoogleScopeValues = {
  mode: GoogleScopeMode
  /** containers picked in THIS sitting — the ones already named are shown
   * separately and are switched off on the connections card, not here. */
  items: { externalId: string; name: string }[]
  eventTypes: GoogleEventType[]
  /** whether to let go of what was already read under the old scope. */
  forget: boolean
}

const modeField = { ...defaultFieldConfig, label: "How much to read", required: true }
const searchField = { ...defaultFieldConfig, label: "Find it", required: false }
const chosenField = { ...defaultFieldConfig, label: "In reach", required: false }
const kindsField = { ...defaultFieldConfig, label: "Which kinds of entry", required: true }
const forgetField = { ...defaultFieldConfig, label: "What was already read", required: false }

/** THE TWO ANSWERS, in the words each service needs.
 *
 * They are per-service and not shared, because the same two words mean opposite
 * things on the two connections — see the header. Gmail's 'only' takes mail
 * away; Calendar's 'only' can hand more over. */
const MODES: Record<
  GoogleScopedService,
  { value: GoogleScopeMode; title: string; description: string }[]
> = {
  gmail: [
    {
      value: "everything",
      title: "All of your mail",
      description: "Every message in the mailbox is in reach. This is how it works today.",
    },
    {
      value: "only",
      title: "Only the labels you name",
      description:
        "Mail outside those labels is never fetched, not even to be ignored. Name none and no mail is read at all.",
    },
  ],
  calendar: [
    {
      value: "everything",
      title: "Your main calendar",
      description: "Your main calendar only. Your other calendars are not read. This is how it works today.",
    },
    {
      value: "only",
      title: "Only the calendars you name",
      description:
        "This can ADD calendars {brand} cannot see today, as well as leaving your main one out. Name none and no calendar is read at all.",
    },
  ],
}

/** GOOGLE'S SIX KINDS OF CALENDAR ENTRY, in words a person recognises. The value
 * is Google's own word and goes straight to the API, so this table is a
 * translation and never a mapping — a kind Google adds tomorrow simply is not
 * offered until somebody adds a line here, which is the safe direction. */
const EVENT_KINDS: Record<GoogleEventType, { title: string; description: string }> = {
  default: { title: "Meetings and appointments", description: "Ordinary entries. Almost everything." },
  outOfOffice: { title: "Out of office", description: "The blocks that say you are away." },
  focusTime: { title: "Focus time", description: "Time you have blocked out to work." },
  workingLocation: { title: "Where you are working", description: "Home, office, elsewhere." },
  birthday: { title: "Birthdays", description: "From your contacts, every year." },
  fromGmail: { title: "Added by Gmail", description: "Flights and bookings Gmail put there itself." },
}

/** One row the picker offered. */
type PickOption = { externalId: string; name: string }

export function GoogleScopeDialog({
  open,
  onOpenChange,
  service,
  draftKey,
  named,
  current,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  service: GoogleScopedService
  draftKey?: string
  /** what this person has already named — shown so the form is about the WHOLE
   * decision rather than about this sitting's half of it. */
  named: GoogleSource[]
  current: { mode: GoogleScopeMode; eventTypes: GoogleEventType[] }
  onSubmit: (values: GoogleScopeValues) => Promise<void>
}) {
  const t = useT()
  const [values, setValues, clearDraft] = useFormDraft<GoogleScopeValues & { search: string }>(
    draftKey,
    {
      mode: current.mode,
      items: [],
      // EMPTY MEANS EVERY KIND on the way in, and this form spells it as all six
      // ticked — because "none ticked" and "every kind" are the two things a
      // person must never confuse, and a row of empty boxes reads as neither.
      // The door refuses an empty list for the same reason from the other side.
      eventTypes: current.eventTypes.length ? current.eventTypes : [...GOOGLE_EVENT_TYPES],
      forget: false,
      search: "",
    },
    open
  )
  const [busy, setBusy] = React.useState(false)
  const [options, setOptions] = React.useState<PickOption[] | null>(null)
  const [looking, setLooking] = React.useState(false)
  const picked = values.items ?? []
  const kinds = values.eventTypes ?? []
  const alreadyNamed = named.filter((s) => s.active)
  // NOTHING IN REACH — the state this form must not let somebody reach by
  // accident. 'Only' with no calendar and no label named means kwapso reads
  // nothing at all from that connection, which is a real answer and is said out
  // loud rather than being the shape of an empty list.
  const readsNothing =
    values.mode === "only" && alreadyNamed.length === 0 && picked.length === 0
  const ready = service === "gmail" || kinds.length > 0

  async function look() {
    if (looking) return
    setLooking(true)
    try {
      const r = await content.googlePick(service, values.search.trim() || undefined)
      setOptions(r.options.map((o) => ({ externalId: o.externalId, name: o.name })))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't list those."))
    } finally {
      setLooking(false)
    }
  }

  /** Picked, or un-picked. A second tap takes it off, so a mis-tap costs a tap
   * rather than a closed form. Anything already named is filtered out of the
   * options, so this only ever adds. */
  function toggle(option: PickOption) {
    setValues((v) => {
      const items = v.items ?? []
      return items.some((i) => i.externalId === option.externalId)
        ? { ...v, items: items.filter((i) => i.externalId !== option.externalId) }
        : { ...v, items: [...items, option] }
    })
  }

  function toggleKind(kind: GoogleEventType) {
    setValues((v) => {
      const on = v.eventTypes ?? []
      return {
        ...v,
        eventTypes: on.includes(kind) ? on.filter((k) => k !== kind) : [...on, kind],
      }
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await onSubmit({
        mode: values.mode,
        items: picked,
        eventTypes: kinds,
        forget: values.forget === true,
      })
      clearDraft()
      setOptions(null)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't save that."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormShellDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      onSubmit={submit}
      title={
        <DialogTitle>
          {service === "gmail"
            ? t("What {brand} may read in your mail", BRAND)
            : t("What {brand} may read in your calendar", BRAND)}
        </DialogTitle>
      }
      subtitle={
        <DialogDescription>
          {t("Whatever you leave out is never fetched at all, so it never reaches {brand} even for a moment.", BRAND)}
        </DialogDescription>
      }
      submit={{ busy: busy, disabled: !ready, icon: <Check className="size-4" /> }}
    >
      {/* THE DECISION. Two plain choices with a sentence each, and the sentences
       * are what make the calendar's widening visible — see the header. */}
      <Field config={modeField} className={fieldSpacing}>
        <div className="flex flex-col gap-2">
          {MODES[service].map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setValues((v) => ({ ...v, mode: m.value }))}
              disabled={busy}
              className={`flex flex-col gap-1 rounded-[var(--radius)] bg-surface-panel p-3 text-left ${
                values.mode === m.value ? "border border-primary bg-muted" : ""
              }`}
            >
              <span className="text-sm font-medium">{t(m.title)}</span>
              <span className="text-muted-foreground text-xs">{t(m.description, BRAND)}</span>
            </button>
          ))}
        </div>
      </Field>

      {values.mode === "only" && (
        <>
          <Field config={searchField} htmlFor="google-scope-search" className={fieldSpacing}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="google-scope-search"
                value={values.search}
                onChange={(e) => setValues((s) => ({ ...s, search: e.target.value }))}
                placeholder={
                  service === "gmail" ? t("Leave blank to list your labels") : t("Leave blank to list your calendars")
                }
                disabled={busy}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={look}
                disabled={busy || looking}
                className="gap-1"
              >
                {looking ? <Spinner /> : <MagnifyingGlass className="size-3.5" aria-hidden />}
                {looking ? t("Looking…") : t("Look")}
              </Button>
            </div>
          </Field>

          {options !== null && (
            <div className="flex max-h-56 flex-col overflow-y-auto rounded-[var(--radius)] bg-surface-panel">
              {options.filter((o) => !alreadyNamed.some((s) => s.externalId === o.externalId)).length === 0 ? (
                <p className="text-muted-foreground p-3 text-sm">
                  {t("Nothing else to add from your Google account.")}
                </p>
              ) : (
                options
                  .filter((o) => !alreadyNamed.some((s) => s.externalId === o.externalId))
                  .map((o) => {
                    const on = picked.some((i) => i.externalId === o.externalId)
                    return (
                      <button
                        key={o.externalId}
                        type="button"
                        onClick={() => toggle(o)}
                        className={`hover:bg-muted/50 flex items-center gap-2 border-b p-3 text-left text-sm last:border-0 ${
                          on ? "bg-muted" : ""
                        }`}
                      >
                        <Check className={`size-3.5 shrink-0 ${on ? "" : "opacity-0"}`} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{o.name}</span>
                      </button>
                    )
                  })
              )}
            </div>
          )}

          {/* WHAT WILL ACTUALLY BE IN REACH — everything already named plus
           * everything picked in this sitting, in one list. Two lists would
           * make somebody add a calendar they already had. */}
          <Field config={chosenField} className={fieldSpacing}>
            {readsNothing ? (
              <p className="text-warning text-sm">
                {t("Nothing is named, so nothing at all would be read. Name one above, or choose the other answer.")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {alreadyNamed.map((s) => (
                  <span
                    key={s.id}
                    className="bg-muted flex items-center gap-1 rounded-[var(--radius)] px-2 py-1 text-xs"
                    title={t("Already in reach. Take it away on the card behind this one.")}
                  >
                    <span className="max-w-[16rem] truncate">{s.name}</span>
                  </span>
                ))}
                {picked.map((i) => (
                  <button
                    key={i.externalId}
                    type="button"
                    onClick={() => toggle(i)}
                    disabled={busy}
                    className="bg-muted hover:bg-muted/70 flex items-center gap-1 rounded-[var(--radius)] px-2 py-1 text-xs"
                    title={t("Take it off the list")}
                  >
                    <span className="max-w-[16rem] truncate">{i.name}</span>
                    <span aria-hidden>×</span>
                  </button>
                ))}
              </div>
            )}
          </Field>
        </>
      )}

      {/* WHICH KINDS OF ENTRY — the second axis, and it applies whichever answer
       * was given above: "not my birthdays" is a decision about kinds, not about
       * which calendar. Refused empty, here and at the door: unticking every box
       * would otherwise read as a narrowing and act as "every kind". */}
      {service === "calendar" && (
        <Field config={kindsField} shape="group" className={fieldSpacing}>
          <div className="flex flex-col gap-2">
            {GOOGLE_EVENT_TYPES.map((kind) => (
              <Choice
                key={kind}
                className="rounded-[var(--radius)] bg-surface-panel p-3"
                label={t(EVENT_KINDS[kind].title)}
                description={t(EVENT_KINDS[kind].description)}
              >
                <Checkbox
                  checked={kinds.includes(kind)}
                  onCheckedChange={() => toggleKind(kind)}
                  disabled={busy}
                />
              </Choice>
            ))}
          </div>
          {kinds.length === 0 && (
            <p className="text-warning mt-1.5 text-xs">
              {t("Pick at least one kind, or switch the whole connection off instead.")}
            </p>
          )}
        </Field>
      )}

      {/* THE HALF THAT REACHES BACKWARDS, and the cost said before it is paid.
       * Narrowing changes what will be READ; everything already brought in was
       * read under the old answer and stays answerable until somebody says
       * otherwise. This is that sentence, and it is opt-in because it is not
       * free. */}
      <Field config={forgetField} shape="group" className={fieldSpacing}>
        <Choice
          className="rounded-[var(--radius)] bg-surface-panel p-3"
          label={t("Let go of what was already read")}
          description={
            service === "gmail"
              ? t("The assistant stops answering from any mail it has already read, and reads your mailbox again from the start under the new answer. That takes a while and it costs some of the team's AI allowance.")
              : t("The assistant stops answering from any calendar entry it has already read, and reads your calendar again from the start under the new answer. That takes a while and it costs some of the team's AI allowance.")
          }
        >
          <Checkbox
            checked={values.forget === true}
            onCheckedChange={(on) => setValues((v) => ({ ...v, forget: on === true }))}
            disabled={busy}
          />
        </Choice>
        <p className="text-muted-foreground mt-1.5 text-xs">
          {t("Leave it off and what {brand} already read stays answerable. Only what it reads from now on follows the new answer.", BRAND)}
        </p>
      </Field>
    </FormShellDialog>
  )
}
