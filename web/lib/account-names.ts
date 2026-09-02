"use client"

// ACCOUNT NAMES, FOR A LIST OF RECORDS AT ONCE — an apps tile grid or a
// knowledge list shows another record's account by NAME, never a ULID, and
// every one of them used to build that map off the accounts list alone
// (`accountsQ.data`). Accounts are a GROWING collection that PAGES (R14),
// newest first, so an account outside page one silently read as "A client"
// even though it exists — the ETZI app's own account (Etzi Haus) among them,
// 2026-08-31.
//
// `companiesKey`'s own read (`type: "entity"`) already exists for exactly
// this shape of problem — a picker needing every COMPANY rather than page one
// (waves-screen.tsx, 25 Aug 2026: "the paged accounts list's page one cannot
// be trusted to hold every company") — so this merges it in as a safety net
// on TOP of the ordinary paged read: an app or a knowledge source is always
// filed under an entity account or the agency's own, never a person, so this
// makes every one of THOSE resolve correctly regardless of where it fell in
// the page. An account this second read doesn't carry either (an individual,
// past page one) keeps the same honest "A client" it always had — never worse
// than before, and the shared seam a screen that DOES file under a person
// should read one account at a time instead (`accountKey`/`tenancy.accountRow`
// — see app-detail.tsx's own `accountName` and knowledge-detail.tsx's
// `filedUnder`, both switched to it the same day for the single-record case).
import { useCached } from "@shared/web/store"
import type { Account } from "@shared/types"
import { tenancy } from "@/lib/api"
import { accountsKey, companiesKey, listFetch } from "@/lib/live-resources"

export function useAccountNames(teamId: string): Map<string, string> {
  const accountsQ = useCached<Account[]>(accountsKey(teamId), () => listFetch.accounts(teamId))
  const companiesQ = useCached<Account[]>(companiesKey(teamId), () =>
    tenancy.accounts({ type: "entity" }).then((r) => r.accounts)
  )
  const names = new Map((accountsQ.data ?? []).map((a) => [a.id, a.name]))
  for (const a of companiesQ.data ?? []) names.set(a.id, a.name)
  return names
}
