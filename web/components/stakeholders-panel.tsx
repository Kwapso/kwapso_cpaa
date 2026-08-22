"use client"

// WHO OWNS THIS SYSTEM, both sides, on a tab of its own.
//
// It was two fields on the Overview — "Who is on it" and "Their contacts" —
// each a comma-joined sentence: "Alaap K, Alexander Stadlmair, Aurora Thalassa"
// and "Paras Maroo (main), Petya Bletsova". Three things were wrong with that
// and only one of them is cosmetic:
//
//   • you could not CLICK a person. The record for the human you needed to ask
//     about this system was one search away, from a screen that already knew
//     their id;
//   • the two SIDES were told apart only by which label the sentence sat under,
//     so "ours" and "theirs" read as one list if you skimmed;
//   • and the MAIN one on each side — the person who hears back when a ticket is
//     answered, and the one who marks work done — was a parenthesis inside prose.
//
// TWO GROUPS, ONE LIST EACH, and deliberately not one merged list with a column
// saying which side somebody is on. "Who at the agency" and "who at the client"
// are two questions a person asks separately, and the answer to one is never
// improved by having the other interleaved with it.
//
// THE MAIN PERSON IS A BADGE, not an ordering and not a parenthesis: the door
// already returns each side main-first, so the order carries it once and the
// badge says it out loud for anybody scanning rather than reading.

import * as React from "react"

import { Badge } from "@shared/ui/registry/primitives/badge/badge"
import { ChevronRight } from "lucide-react"

import { RecordMark } from "@shared/web/record-mark"
import { softNavigate } from "@/lib/nav"
import { useT } from "@shared/web/language"

type Side = {
  id: string
  name: string
  photo: string | null
  main: boolean
  href: string
}

/** One person, as a row you can open. The mark is required of every record row
 * in this app (R35); a person is a circle. */
function PersonRow({ p, mainLabel }: { p: Side; mainLabel: string }) {
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <RecordMark picture={p.photo} name={p.name} shape="round" fit="cover" />
      <button
        type="button"
        onClick={() => softNavigate(p.href)}
        className="hover:text-primary min-w-0 flex-1 truncate text-left text-sm underline-offset-2 hover:underline"
      >
        {p.name}
      </button>
      {p.main && (
        <Badge variant="secondary" className="shrink-0">
          {mainLabel}
        </Badge>
      )}
      <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
    </li>
  )
}

function Group({ title, people, empty, mainLabel }: { title: string; people: Side[]; empty: string; mainLabel: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-muted-foreground text-sm font-medium">{title}</h2>
      {people.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ul className="divide-border divide-y rounded-xl border">
          {people.map((p) => (
            <PersonRow key={p.id} p={p} mainLabel={mainLabel} />
          ))}
        </ul>
      )}
    </section>
  )
}

export function StakeholdersPanel({
  staff,
  stakeholders,
  memberNames,
  memberPhotos,
  contactNames,
  host,
}: {
  staff: { userId: string; isLead: boolean }[]
  stakeholders: { contactId: string; isMain: boolean }[]
  memberNames: Map<string, string>
  memberPhotos: Map<string, string | null>
  /** THE CLIENT'S PEOPLE, resolved off the ACCOUNT's own detail read rather than
   * the accounts list — accounts PAGE, so a contact outside page one resolved to
   * "Somebody" on the screen this replaces. */
  contactNames: Map<string, string>
  host: { base: string }
}) {
  const t = useT()
  // A CONTACT IS AN ACCOUNTS ROW (there is no contacts table), so their record
  // is at the accounts address — which is where the account screen sends an
  // individual too, so both routes reach the same screen.
  const ours: Side[] = staff.map((p) => ({
    id: p.userId,
    name: memberNames.get(p.userId) ?? t("Somebody"),
    photo: memberPhotos.get(p.userId) ?? null,
    main: p.isLead,
    href: `${host.base}/members/${p.userId}`,
  }))
  const theirs: Side[] = stakeholders.map((p) => ({
    id: p.contactId,
    name: contactNames.get(p.contactId) ?? t("Somebody"),
    photo: null,
    main: p.isMain,
    href: `${host.base}/accounts/${p.contactId}`,
  }))

  return (
    <div className="flex flex-col gap-6">
      <Group
        title={t("Ours")}
        people={ours}
        empty={t("Nobody from our side is on this yet.")}
        // "Team lead" is the word the app already uses for this person on the
        // form that sets them — not "main", which is the client side's word.
        mainLabel={t("Team lead")}
      />
      <Group
        title={t("Theirs")}
        people={theirs}
        empty={t("Nobody from the client's side is on this yet.")}
        mainLabel={t("Main")}
      />
    </div>
  )
}
