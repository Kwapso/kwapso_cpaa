"use client"

// WHO CAN BE GIVEN WORK — the one answer, for every picker in the agency app.
//
// THE PROBLEM. A client-portal login is an ORDINARY TEAM MEMBER. Grant → invite
// → accept is the only way to make one that works, so a client contact holds a
// role, has a session, and sits in `listMembers` beside our own staff with
// nothing on the row to tell them apart. Every dropdown built from that list
// therefore offered them: "Who's doing it" on a new task, the assignee on a
// story, the staff tick-list on an app, triage duty, the people you can mention
// on a ticket. The owner found it by opening one of them and reading his
// clients' names back.
//
// THE RULE (his words): assignee and owner pickers on internal work list AGENCY
// STAFF ONLY. A client may be picked in exactly two places — a to-do raised for
// them, and a ticket raised on their behalf — and neither of those is a person
// picker at all: both name an ACCOUNT, and a ticket's "raised by" names a
// CONTACT off that account's own detail door. So there is no exception to carve
// here; there is one list, and it is ours.
//
// WHY IT IS ONE FUNCTION AND NOT A FILTER PER SCREEN. Nine screens build a
// people list. A rule copied nine times is a rule that holds eight times: the
// tenth screen is written by somebody who never read this comment. So the DOOR
// supplies the fact (`isClient`, from the team's own `portal_users` table, the
// same table the account fence reads) and this file makes the decision, once.
// The admin screens — the members list, a member's detail, change-role, remove,
// the team roster — deliberately do NOT call this: a client login is a member,
// and the screen for managing members has to show them, or nobody can take one
// away.

import type { TeamMember } from "@shared/types"
import { useCached } from "@shared/web/store"
import { personName } from "@/lib/identity"
import { tenancy } from "@/lib/api"
import { TEAM_RESOURCES } from "@/lib/live-resources"

/** One pickable person: the id a door stores, and the words a person reads. */
export type PickablePerson = { id: string; name: string }

/**
 * The people this team can hand work to — our own staff, never a client login,
 * each with a name that is theirs alone.
 *
 * TWO NAMES THE SAME IS ITS OWN BUG. The owner's screenshot had "Alaap
 * Kanchwala" listed twice in one dropdown: not a duplicated row (the membership
 * table is unique on team + user), but two DIFFERENT people rows carrying the
 * same display name — an agency login and a client-contact login for the same
 * human. Dropping clients removes that particular pair, and it does not fix the
 * class: two colleagues genuinely called Alaap Kanchwala would read as one
 * option twice, and picking is a guess. So a name that is not unique in this
 * list carries the email that makes it unique. A name that IS unique is left
 * exactly as it was, because most of the time it is a name, not a record.
 */
export function assignableMembers(members: TeamMember[] | undefined): PickablePerson[] {
  const ours = (members ?? []).filter((m) => !m.isClient)
  const seen = new Map<string, number>()
  for (const m of ours) {
    const name = personName(m)
    seen.set(name, (seen.get(name) ?? 0) + 1)
  }
  return ours.map((m) => {
    const name = personName(m)
    return {
      id: m.userId,
      // The email is the disambiguator because it is the thing that is unique by
      // construction (the users table says so) and the thing a colleague already
      // knows. A role title would not be: two people can share one.
      name: (seen.get(name) ?? 0) > 1 && m.email ? `${name} (${m.email})` : name,
    }
  })
}

/** The same answer, fetched. Every screen that offers people reads the ONE
 * members cache four other screens already hold, so opening a form costs a round
 * trip only on a page that has never needed the list. */
export function useAssignableMembers(teamId: string): PickablePerson[] {
  const membersQ = useCached<TeamMember[]>(TEAM_RESOURCES.members.key(teamId), () =>
    tenancy.members().then((r) => r.members)
  )
  return assignableMembers(membersQ.data)
}
