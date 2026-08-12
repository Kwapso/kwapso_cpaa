// The agent's REAL-SCREEN TRACE map. When the co-pilot runs a WRITE tool, the panel
// gently drives the user's screen to where that change is now VISIBLE — the affected
// record's detail, or the collection list where row-level live-sync makes the new /
// changed row appear (CACHING.md) — and rings it briefly. `traceFor` turns one tool
// call into a URL target (path) plus a highlight selector for a transient ring.
//
// A trace NEVER opens an input dialog (?panel=add|edit). The agent writes DIRECTLY
// through the gated API — it doesn't type into the manual form — so opening that form
// would just leave a blank, stale dialog sitting open after the record already exists
// (the "created the role but left an empty new-role form open" bug). Traces show the
// RESULT, not the input. The target mirrors the /t/<team>/<module>[/<id>] spine of
// deep-link-screen.tsx. READS (list_*/get_*) return null — nothing to show, so the
// panel just narrates them in the step log. Kept as a pure function (no React) so
// it's unit-testable and shared by the panel + its test.

/** Where a traced tool should take the user: a host path (the record's detail or the
 * list where the change shows) and a CSS selector to ring briefly once it's there.
 * Deliberately has NO query field — a trace shows a RESULT, it never opens an input
 * dialog (?panel=…), so the form-left-open bug class can't be expressed here at all. */
export type TraceTarget = { path: string; highlight?: string }

// The nav bus + engine live in web/lib/screen-trace.tsx (DOM/React); THIS file
// stays pure and DOM-free so the trace-parity test in workers/data-ops can import
// it and prove every write tool in the agent catalog maps to a screen.

const seg = (teamId: string, module: string) => `/t/${teamId}/${module}`
const str = (input: Record<string, unknown>, key: string): string => {
  const v = input[key]
  return typeof v === "string" ? v : ""
}

/** Map a WRITE tool + its input to the screen + dialog the manual path uses. Returns
 * null for reads (and anything without a first-class screen), so the caller skips the
 * on-screen move. `teamId` is the effective team the tool ran against. */
export function traceFor(
  tool: string,
  input: Record<string, unknown>,
  teamId: string
): TraceTarget | null {
  switch (tool) {
    /* ------------------------------- invites ------------------------------- */
    // Invite → the invites list, where the new pending invite appears live. (Not the
    // InviteDialog — the agent already sent the invite; an empty add form would just
    // sit open.)
    case "invite_member":
      return { path: seg(teamId, "invites"), highlight: "main" }
    // Revoke → the invite's detail (the confirm is destructive; the manual path
    // opens ?confirm=invites.revoke there). Land on the row so the change is visible.
    case "revoke_invite":
      return { path: `${seg(teamId, "invites")}/${str(input, "inviteId")}`, highlight: "main" }

    /* ------------------------------- members ------------------------------- */
    // Change a role → the member's detail, where their new role now shows. (Not the
    // role-picker dialog — the change is already applied.)
    case "set_member_role":
      return { path: `${seg(teamId, "members")}/${str(input, "userId")}`, highlight: "main" }
    // Remove a member → their detail row (destructive; server-gated). Show where it
    // happened rather than auto-firing the ?confirm, so nothing surprises the user.
    case "remove_member":
      return { path: `${seg(teamId, "members")}/${str(input, "userId")}`, highlight: "main" }

    /* -------------------------------- roles -------------------------------- */
    // Create a role → the roles list, where the new role appears live. (Not the
    // RoleFormDialog — the agent already created it; a blank new-role form left open
    // was the reported bug.)
    case "create_role":
      return { path: seg(teamId, "roles"), highlight: "main" }
    // Edit / (de)activate / set-permissions / read-permissions → that role's detail
    // (the permission grid is host-composed at the role detail). Land on the row.
    case "update_role":
    case "set_role_active":
    case "set_role_permissions":
    case "get_role_permissions":
      return { path: `${seg(teamId, "roles")}/${str(input, "roleId")}`, highlight: "main" }

    /* ------------------------------ dropdowns ------------------------------ */
    // Any dropdown write → the Dropdown values screen (one screen, no per-value URL).
    case "create_dropdown_value":
    case "update_dropdown_value":
    case "set_dropdown_active":
      return { path: seg(teamId, "dropdowns"), highlight: "main" }

    /* ------------------------------- learning ------------------------------ */
    // Create → the learning list (the "New article" form is a rich dialog; land on the
    // list where the new row appears live). Edit / (de)activate / mark-done → the
    // article's detail.
    case "create_learning":
      return { path: seg(teamId, "learning"), highlight: "main" }
    case "update_learning":
    case "set_learning_active":
    case "mark_learning_done":
      return { path: `${seg(teamId, "learning")}/${str(input, "id")}`, highlight: "main" }

    /* -------------------------------- tickets ------------------------------- */
    // Raise → the Tickets list (the new ticket appears live). Reply / edit / status
    // → that ticket's detail thread.
    case "raise_help_ticket":
      return { path: seg(teamId, "tickets"), highlight: "main" }
    case "reply_help_ticket":
      return { path: `${seg(teamId, "tickets")}/${str(input, "helpId")}`, highlight: "main" }
    case "update_help_ticket":
    case "set_help_status":
    // Answering lands on the ticket, where the words that were sent are now the
    // last thing in the conversation.
    case "resolve_help_ticket":
    case "add_help_stakeholder":
    // Archiving lands on the ticket too: the record is still there, and its
    // detail is where you see that it has been put away (and put it back).
    case "archive_help_ticket":
      return { path: `${seg(teamId, "tickets")}/${str(input, "id")}`, highlight: "main" }
    // Reordering is a change to the LIST, not to the ticket — the whole point of
    // it is where the row now sits relative to its neighbours, which is a thing
    // you can only see on the list.
    case "rank_help_ticket":
      return { path: seg(teamId, "tickets"), highlight: "main" }

    /* ------------------------------ knowledge ------------------------------- */
    // Add → the knowledge list, where the new source appears live. Correct /
    // take away / give back → that source's own screen, where its text and the
    // pieces the assistant reads from it are.
    case "add_knowledge_source":
      return { path: seg(teamId, "knowledge"), highlight: "main" }
    case "update_knowledge_source":
    case "set_knowledge_source_active":
      return { path: `${seg(teamId, "knowledge")}/${str(input, "id")}`, highlight: "main" }
    // A sweep touches many rows and names none of them — the list is where
    // "it went and got the new material" is a thing you can see happening.
    case "sync_knowledge":
      return { path: seg(teamId, "knowledge"), highlight: "main" }

    /* ------------------------------- accounts ------------------------------- */
    // Create → the accounts list, where the new account appears live. Every other
    // account write → that account's detail: its own fields, its contacts and its
    // portal logins all live on one screen, so the change is visible wherever it
    // landed. A contact link and a portal login carry their OWN row ids (not an
    // account id), so those two land on the list — the ping names the account and
    // the row patches in place.
    case "create_account":
      return { path: seg(teamId, "accounts"), highlight: "main" }
    case "update_account":
    case "set_account_parent":
    case "set_account_active":
      return { path: `${seg(teamId, "accounts")}/${str(input, "id")}`, highlight: "main" }
    case "link_contact":
    case "grant_portal_access":
      return { path: `${seg(teamId, "accounts")}/${str(input, "accountId")}`, highlight: "main" }
    case "set_contact_link_active":
    case "set_portal_access_active":
      return { path: seg(teamId, "accounts"), highlight: "main" }

    /* ------------------------------- imports -------------------------------- */
    // Running an attached-files import (the chat import) → the Import screen,
    // where the batch's plan/report lives. Bulk changes → the list that patches
    // live as the rows change.
    case "run_import_batch":
      return { path: seg(teamId, "import"), highlight: "main" }
    case "bulk_set_help_status":
    case "set_help_status_by_filter":
      return { path: seg(teamId, "tickets"), highlight: "main" }
    case "bulk_set_learning_active":
      return { path: seg(teamId, "learning"), highlight: "main" }

    /* ----------------------------- process maps ----------------------------- */
    // An APP has no screen of its own — it is the heading a map sits under, and
    // the filter above the list — so every app write lands on the maps page,
    // where the new or changed app shows on the rows beneath it.
    case "create_app":
    case "update_app":
    case "set_app_active":
      return { path: seg(teamId, "processes"), highlight: "main" }
    // Create → the maps list, where the new map appears live. Everything else →
    // that map's own detail, because its steps, its versions and its
    // conversation are all on one screen, so a change is visible wherever it
    // landed. A step and a comment carry the PROCESS id rather than their own,
    // which is what lets both land on the map that now reads differently.
    case "create_process":
      return { path: seg(teamId, "processes"), highlight: "main" }
    case "update_process":
    case "set_process_active":
      return { path: `${seg(teamId, "processes")}/${str(input, "id")}`, highlight: "main" }
    case "add_process_step":
    case "cut_process_version":
    case "comment_on_process":
      return { path: `${seg(teamId, "processes")}/${str(input, "processId")}`, highlight: "main" }
    // A step write names the STEP, not its map, so there is no map id to land
    // on — the list is where the changed step's saving shows up either way.
    case "update_process_step":
    case "remove_process_step":
      return { path: seg(teamId, "processes"), highlight: "main" }

    /* -------------------------------- the money ----------------------------- */
    // Both rate cards are read on the account they belong to; the internal one is
    // team-wide, so it lands on the team area where it is managed. Neither has a
    // per-row URL — a card is a handful of lines read whole.
    case "create_account_rate":
      return { path: `${seg(teamId, "accounts")}/${str(input, "accountId")}`, highlight: "main" }
    case "update_account_rate":
    case "set_account_rate_active":
      return { path: seg(teamId, "accounts"), highlight: "main" }
    case "create_internal_rate":
    case "update_internal_rate":
    case "set_internal_rate_active":
      return { path: `/t/${teamId}`, highlight: "main" }

    /* ----------------------------- the work engine -------------------------- */
    // Every work-engine write lands on the Work page, and that is not a shortcut:
    // the backlog, the sprint block and each sprint's "3 of 8 done" counts are all
    // on that one screen, so a story moving to in review and a sprint completing
    // are both visible there. A story has no detail URL of its own to land on.
    case "create_story":
    case "update_story":
    case "set_story_status":
    case "rank_story":
    case "create_sprint":
    case "complete_sprint":
      return { path: seg(teamId, "work"), highlight: "main" }
    // Time lands on the same page, and the header timer is on every screen
    // anyway — so a person who asked for a timer sees it start wherever they
    // already were, and the trace takes them to the list it joined.
    case "start_timer":
    case "stop_timer":
    case "log_time":
    case "resolve_runaway_timer":
    case "set_timer_auto_stop":
      return { path: seg(teamId, "work"), highlight: "main" }
    // To-dos and tasks land on the same page: the Work screen is where all four
    // nouns are managed, and a to-do's other home is a screen we do not own (the
    // client's portal).
    case "raise_todo":
    case "complete_todo":
    case "cancel_todo":
    case "create_task":
    case "set_task_done":
      return { path: seg(teamId, "work"), highlight: "main" }
    // The rota and the unread backlog are both read on the Tickets screen — the
    // triage strip sits above the list, which is where "what is waiting" belongs.
    case "set_triage_duty":
      return { path: seg(teamId, "tickets"), highlight: "main" }
    /* ------------------- the agency's own housekeeping ---------------------- */
    // A create lands on the LIST (row-level live-sync makes the new row appear
    // there); an edit or an archive lands on the record itself, because that is
    // where the change is visible. The staff pair is the odd one out and for the
    // owner's own reason: a profile and a certificate live on the MEMBER's page,
    // so that is where a trace has to go — `/t/<team>/staff/<id>` would be a URL
    // this app deliberately does not have.
    case "create_marketing_post":
      return { path: seg(teamId, "marketing"), highlight: "main" }
    case "update_marketing_post":
    case "set_marketing_post_active":
      return { path: `${seg(teamId, "marketing")}/${str(input, "id")}`, highlight: "main" }
    case "create_brand_asset":
      return { path: seg(teamId, "brand"), highlight: "main" }
    case "update_brand_asset":
    case "set_brand_asset_active":
      return { path: `${seg(teamId, "brand")}/${str(input, "id")}`, highlight: "main" }
    case "create_programme":
      return { path: seg(teamId, "delivery"), highlight: "main" }
    case "update_programme":
    case "set_programme_active":
      return { path: `${seg(teamId, "delivery")}/${str(input, "id")}`, highlight: "main" }
    case "create_meeting_purpose":
      return { path: seg(teamId, "purposes"), highlight: "main" }
    case "update_meeting_purpose":
    case "set_meeting_purpose_active":
      return { path: `${seg(teamId, "purposes")}/${str(input, "id")}`, highlight: "main" }
    case "save_staff_profile":
    case "create_staff_certificate":
      return { path: `${seg(teamId, "members")}/${str(input, "userId")}`, highlight: "main" }

    /* --------------------------------- team -------------------------------- */
    // Rename the team → the team Overview (the bare /t/<team> path), where the new
    // name now shows. (Not the edit dialog — the rename is already saved.)
    case "update_team":
      return { path: `/t/${teamId}`, highlight: "main" }

    // Reads (list_*, and anything else) — nothing to open on screen.
    default:
      return null
  }
}

/** Write tools that deliberately have NO screen to drive (none today — the
 * trace-parity test forces every new write tool to either map above or be
 * added here with a reason). */
export const SCREENLESS_WRITE_TOOLS: string[] = [
  // The three agency-internal writes that name a RECORD rather than the person
  // it belongs to. A staff profile and a certificate are read on the member's
  // own page (staff-panel.tsx) — there is no `/t/<team>/staff/<id>` URL, on
  // purpose, because the owner's ruling is that they live on the member's page
  // and not on a page of their own. Their sibling CREATE tools carry `userId`
  // and do trace, which is the honest split: when the tool says whose it is, the
  // panel can drive there; when it says only which row, it cannot, and inventing
  // a URL that resolves to nothing would be worse than staying put.
  "update_staff_certificate",
  "set_staff_certificate_active",
  "set_staff_profile_active",
]
