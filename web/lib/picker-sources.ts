"use client"

// WHAT A SERVER-SEARCHED PICKER ASKS FOR — one file, one shape per door.
//
// A `RecordPicker` over a GROWING collection (R14) cannot filter in the browser,
// because the browser only holds page one: typing "Confia" into an in-memory
// filter searches the newest fifty and answers "no" about the rest, confidently.
// So the question goes to the door's own `q`, which is SEARCH.md layer 2.
//
// These live together rather than beside each screen for the reason the same
// three lines used to live in ten dialogs: "which clients may I name?" has one
// answer in this app, and a copy of it in ten files is ten chances for one of
// them to forget `archived` and start offering companies nobody works with any
// more. Each function is one door, asked one way.
//
// THEY NARROW, THEY NEVER WIDEN. Every one of these is the same door the list
// screen reads, with the same gate and the same account fence behind it — a
// picker cannot be shown a row its own caller may not list. Search makes a
// nameable record easier to find; it never makes an unnameable one nameable.

import type { PickerOption } from "@/components/record-picker"
import { content, tenancy } from "@/lib/api"

/** The cache prefix a picker's answers land under. TEAM-SCOPED, like every key
 * in the app: a picker that cached "the companies matching Berg" without saying
 * whose companies would show the last team's people after a switch. */
export function pickerKey(kind: string, teamId: string | null | undefined): string | undefined {
  return teamId ? `pick:${kind}:${teamId}` : undefined
}

/** CLIENTS AND PEOPLE — the accounts door (`q` searches name, code and email).
 *
 * `archived: "no"` is the door's own way of saying what every picker used to say
 * in the browser with `.filter(a => a.active)`: a put-away company is still a
 * row, and still readable on its own record, but it is not something new work
 * should be filed against. */
export async function searchAccounts(
  term: string,
  opts: { type?: "entity" | "individual" } = {}
): Promise<PickerOption[]> {
  const r = await tenancy.accounts({ q: term || undefined, type: opts.type, archived: "no" })
  return r.accounts.map((a) => ({
    value: a.id,
    label: a.name,
    // The code and the email are what tell two people called Marta apart, and
    // they are two of the three fields the door itself searched — so a row that
    // matched on an email nobody could see used to look like a wrong answer.
    hint: [a.code, a.email].filter(Boolean).join(" · ") || undefined,
    // AND THE LOGO (R35). It arrived on every one of these rows and was dropped
    // here, one line before the picker, so the accounts LIST drew a company's
    // mark and the picker that chooses the same company drew a word.
    picture: a.logoUrl,
    shape: "square" as const,
  }))
}

/** TICKETS — the help door (`q` searches the description and the reference).
 * `appId` narrows to one system, which is what the story form already asked of
 * its in-memory list. Resolved tickets are left out: they are not what new work
 * is filed against. */
export async function searchTickets(
  term: string,
  opts: { appId?: string; marks?: Map<string, string> } = {}
): Promise<PickerOption[]> {
  const r = await content.help({ q: term || undefined, appId: opts.appId })
  return r.tickets
    .filter((t) => t.status !== "resolved")
    .map((t) => ({
      value: t.id,
      label: t.ref ? `${t.ref} · ${t.description.slice(0, 80)}` : t.description.slice(0, 80),
      // THE TYPE'S GLYPH (R35), handed IN rather than read here: the vocabulary
      // is the team's own and lives in a screen's cache, and a lib that fetched
      // it would make one picker cost two round trips.
      mark: opts.marks?.get(t.helpType ?? "") ?? null,
    }))
}

/** STORIES — the stories door (`q`). Done work is left out for the same reason
 * resolved tickets are. */
async function searchStories(
  term: string,
  opts: { appId?: string; marks?: Map<string, string> } = {}
): Promise<PickerOption[]> {
  const r = await content.stories({ q: term || undefined, appId: opts.appId })
  return r.stories
    .filter((s) => s.status !== "done")
    .map((s) => ({
      value: s.id,
      label: s.ref ? `${s.ref} · ${s.title}` : s.title,
      mark: opts.marks?.get(s.storyType ?? "") ?? null,
    }))
}

/** WHAT TIME CAN BE LOGGED AGAINST — a story OR a ticket, in one list, because
 * the question a person is answering is "what were you working on", not "which
 * table does the thing you were working on live in".
 *
 * Both halves PAGE, so both are asked. The value carries its own table, exactly
 * as the form's in-memory version did, so nothing downstream changes.
 *
 * The two WORDS come from the call site rather than from here: a sentence a
 * person reads has to be in the catalogue (R28), and the catalogue is written
 * from `t(...)` calls in the screens. A lib that hard-coded "Story" would ship
 * that word in English to somebody who chose German, on a screen that looks
 * finished. */
export async function searchWorkTargets(
  term: string,
  words: { story: string; ticket: string },
  marks: { story?: Map<string, string>; ticket?: Map<string, string> } = {}
): Promise<PickerOption[]> {
  const [stories, tickets] = await Promise.all([
    searchStories(term, { marks: marks.story }),
    searchTickets(term, { marks: marks.ticket }),
  ])
  return [
    ...stories.map((s) => ({ ...s, value: `stories:${s.value}`, hint: words.story })),
    ...tickets.map((t) => ({ ...t, value: `help:${t.value}`, hint: words.ticket })),
  ]
}
