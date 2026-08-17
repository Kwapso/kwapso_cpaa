"use client"

// useScreenData — the deep-link host's READ layer, lifted out of the component so
// the host reads as "fetch, then render" instead of a 70-line wall of queries.
//
// Every read is cache-first + null-keyed (a query whose key is null never fires),
// so a screen only fetches the modules it actually shows. The keys double as the
// live-sync + tab-count cache keys the rest of the app patches, so they must match
// the prefixes in pages.ts (LAW R8) and app-shell's realtime registry — don't
// rename one without the others. Roles / invites / dropdown values load across the
// whole team area (they back list + breadcrumb + a tab-count badge); members /
// learning / tickets / team-meta load only on their own module.

import { tenancy } from "@/lib/api"
import type { HelpScope, TaskView } from "@/lib/live-resources"
import {
  accountsKey,
  appsKey,
  brandAssetsKey,
  cursorKey,
  helpKey,
  knowledgeKey,
  listFetch,
  meetingsKey,
  marketingKey,
  programmesKey,
  purposesKey,
  sprintsKey,
  storiesKey,
  tasksKey,
  totalKey,
} from "@/lib/live-resources"
import { SELECTABLE_GROUPS } from "@shared/selectable-groups"
import { useRecordActivity } from "@/lib/use-record-activity"
import { primeCache, useCached, useCachedValue } from "@shared/web/store"

/** What the host needs to drive the reads: the resolved team, whether reads are
 * enabled (on-team + signed-in), the active module and the record id in view. */
export type ScreenDataInput = {
  teamId: string | null
  enabled: boolean
  module: string | null
  recordId: string | null
  /** which ticket set the Tickets screen is showing — a SERVER scope (R14/R16). */
  helpScope?: HelpScope
  /** which pile of our own admin the Tasks screen is showing — a SERVER view,
   * for the same reason (R14/R16). */
  taskView?: TaskView
}

/** Which TABLE a record under each agency-internal URL segment lives in — the
 * one place that translation is written down, so the record feed, the live
 * registry's `deps` and the activity gate map all name the same string. */
const INTERNAL_ACTIVITY_TABLE: Record<string, string> = {
  marketing: "marketing_posts",
  brand: "brand_assets",
  delivery: "programs",
  purposes: "meeting_purposes",
  // A task's segment and its table are one word, so this line looks redundant —
  // it is not. This map is what the record feed READS to decide it should fetch
  // anything at all, so a segment missing from it has an Activity tab with no
  // feed under it, silently.
  tasks: "tasks",
}

export function useScreenData({
  teamId,
  enabled,
  module,
  recordId,
  helpScope = "all",
  taskView = "open",
}: ScreenDataInput) {
  // Per-team screen-recipe overrides (config store) — load across the team area.
  const overridesQ = useCached(enabled ? `screens:${teamId}` : null, () =>
    tenancy.screenOverrides().then((r) => r.screens)
  )
  const membersQ = useCached(
    enabled && module === "members" ? `members:${teamId}` : null,
    () => tenancy.members().then((r) => r.members)
  )
  // Roles back the roles list, the breadcrumb label, the change-role picker and
  // the invite form's role options — load them for the whole team area. The
  // listFetch fetchers ALSO prime each collection's exact `total:` sidecar (R16).
  const rolesQ = useCached(enabled ? `member_roles:${teamId}` : null, () =>
    listFetch.roles(teamId as string)
  )
  // Invites back the invites list AND the section-tab count badge, so load them
  // across the team area (cache-first + live, so the count stays honest).
  const invitesQ = useCached(enabled ? `invites:${teamId}` : null, () =>
    listFetch.invites(teamId as string)
  )
  const metaQ = useCached(enabled && module === "team" ? `team-meta:${teamId}` : null, () =>
    tenancy.teamMeta()
  )
  // Learning backs its list, the breadcrumb label and the article detail; load it
  // for the whole learning area (cache-first + row-level live, decision below).
  const learningQ = useCached(enabled && module === "learning" ? `learning:${teamId}` : null, () =>
    listFetch.learning(teamId as string)
  )
  // Tickets backs its list, the breadcrumb label and the ticket thread. R14: the
  // list is a PAGE, so My/All is a SERVER scope with its own cache — filtering a
  // loaded page client-side would disagree with the exact badge above it (R16).
  // The All cache is still the one the live registry patches row-by-row.
  const helpQ = useCached(enabled && module === "tickets" ? helpKey(teamId as string, "all") : null, () =>
    listFetch.help(teamId as string)
  )
  const helpMineQ = useCached(
    enabled && module === "tickets" && helpScope === "mine" ? helpKey(teamId as string, "mine") : null,
    () => listFetch.helpMine(teamId as string)
  )
  const helpArchivedQ = useCached(
    enabled && module === "tickets" && helpScope === "archived"
      ? helpKey(teamId as string, "archived")
      : null,
    () => listFetch.helpArchived(teamId as string)
  )
  // Accounts back their list, the breadcrumb label and the record screen. R14:
  // the list is a PAGE — page one lands here, its next cursor in the sidecar
  // <LoadMore> reads. Row-level live: a change patches the one account in place.
  const accountsQ = useCached(
    enabled && module === "accounts" ? accountsKey(teamId as string) : null,
    () => listFetch.accounts(teamId as string)
  )
  // The knowledge base backs its list, the breadcrumb label and one source's
  // screen. R14: PAGED, like accounts and tickets — page one lands here and its
  // next cursor in the sidecar. Row-level live: a change patches one source.
  const knowledgeQ = useCached(
    enabled && module === "knowledge" ? knowledgeKey(teamId as string) : null,
    () => listFetch.knowledge(teamId as string)
  )
  // ── THE WORK ENGINE'S FOUR ───────────────────────────────────────────────
  // Each loaded only on its own section (cache-first + row-level live), so
  // opening Tasks costs one call rather than four. The RECORD screens read
  // through these same keys — an app's detail comes out of the bounded set the
  // list already holds — which is why they are keyed by team here rather than by
  // record, and why a slice narrowed to one record gets a key of its own instead
  // (see sliceKey in components/work-panels.tsx).
  const storiesQ = useCached(enabled && module === "stories" ? storiesKey(teamId as string) : null, () =>
    listFetch.stories(teamId as string)
  )
  const sprintsQ = useCached(enabled && module === "sprints" ? sprintsKey(teamId as string) : null, () =>
    listFetch.sprints(teamId as string)
  )
  const appsQ = useCached(enabled && module === "apps" ? appsKey(teamId as string) : null, () =>
    listFetch.apps(teamId as string)
  )
  // OUR OWN ADMIN, in two SERVER views. Open is the everyday one and the only
  // one the app could show for months — the door has parsed `?view=all` since it
  // shipped and nothing ever sent it.
  //
  // The ALL list is also what the RECORD screen reads, and that is not an
  // optimisation: ticking a task off the open list removes it from the open
  // list, so a detail screen sourced from that collection would answer "that
  // record no longer exists" the moment you used the button on it. It loads when
  // the strip asks for it, or when a record is open — never both fetches just to
  // show the open list.
  const tasksOpenQ = useCached(
    enabled && module === "tasks" ? tasksKey(teamId as string, "open") : null,
    () => listFetch.tasks(teamId as string, "open")
  )
  const tasksAllQ = useCached(
    enabled && module === "tasks" && (taskView === "all" || !!recordId)
      ? tasksKey(teamId as string, "all")
      : null,
    () => listFetch.tasks(teamId as string, "all")
  )
  // THE DIARY. Loaded only on its own section, cache-first + row-level live. R14:
  // PAGED like tickets and sources — page one lands here and its next cursor in
  // the sidecar <LoadMore> reads. The RECORD screen reads through this same key
  // and falls back to a by-id read when the loaded prefix doesn't reach it.
  const meetingsQ = useCached(enabled && module === "meetings" ? meetingsKey(teamId as string) : null, () =>
    listFetch.meetings(teamId as string)
  )
  // ── THE AGENCY'S OWN HOUSEKEEPING ────────────────────────────────────────
  // Four capped collections, each loaded only on its own module (cache-first +
  // row-level live). The Delivery method screen shows BOTH of its collections at
  // once, so both load on either of its two segments — a screen that offers a
  // "meeting purposes" button has to know how many there are before you press it.
  const marketingQ = useCached(enabled && module === "marketing" ? marketingKey(teamId as string) : null, () =>
    listFetch.marketing(teamId as string)
  )
  const brandQ = useCached(enabled && module === "brand" ? brandAssetsKey(teamId as string) : null, () =>
    listFetch.brandAssets(teamId as string)
  )
  const onDelivery = module === "delivery" || module === "purposes"
  const programmesQ = useCached(enabled && onDelivery ? programmesKey(teamId as string) : null, () =>
    listFetch.programmes(teamId as string)
  )
  const purposesQ = useCached(enabled && onDelivery ? purposesKey(teamId as string) : null, () =>
    listFetch.purposes(teamId as string)
  )
  // Staff profiles + certificates are NOT read here. They are read by the panel
  // on the member's own page (staff-panel.tsx), cache-first on the same keys the
  // live registry patches — the same shape every bespoke record screen uses, and
  // the right one for a collection that only ever appears on one screen.
  // The team's dropdown values — feed the ticket/learning forms' Type/Category pickers
  // AND the Dropdown-values tab's count badge, so load them across the team area
  // (cache-first + live, like roles/invites, so the count stays honest).
  const formSelectableQ = useCached(
    enabled ? `selectable:${teamId}` : null,
    () => listFetch.selectable(teamId as string)
  )
  // R16: the exact server totals the badges show (primed by the fetchers above;
  // bumped ±1 by add/remove pings; re-primed on reconnect). NEVER rows.length.
  const totals = {
    member_roles: useCachedValue<number>(enabled ? totalKey("member_roles", teamId as string) : null),
    invites: useCachedValue<number>(enabled ? totalKey("invites", teamId as string) : null),
    selectable: useCachedValue<number>(enabled ? totalKey("selectable", teamId as string) : null),
    learning: useCachedValue<number>(enabled ? totalKey("learning", teamId as string) : null),
    help: useCachedValue<number>(enabled ? totalKey("help", teamId as string) : null),
    helpMine: useCachedValue<number>(enabled ? totalKey("help-mine", teamId as string) : null),
    helpArchived: useCachedValue<number>(enabled ? totalKey("help-archived", teamId as string) : null),
    accounts: useCachedValue<number>(enabled ? totalKey("accounts", teamId as string) : null),
    knowledge: useCachedValue<number>(enabled ? totalKey("knowledge", teamId as string) : null),
    // R16: the exact server total the process-maps heading badges. Primed by the
    // same fetcher that loads page one, so the number and the rows agree.
    processes: useCachedValue<number>(enabled ? totalKey("processes", teamId as string) : null),
    // R16: the exact server totals of the work engine's four collections, each
    // primed by the fetcher that loaded its own rows so the number and the rows
    // can never disagree. The story total's prefix is `stories` — the same word
    // the worker publishes as a resource — so the shell's ±1 bump on an add
    // lands on the sidecar the heading actually reads.
    stories: useCachedValue<number>(enabled ? totalKey("stories", teamId as string) : null),
    sprints: useCachedValue<number>(enabled ? totalKey("sprints", teamId as string) : null),
    apps: useCachedValue<number>(enabled ? totalKey("apps", teamId as string) : null),
    tasks: useCachedValue<number>(enabled ? totalKey("tasks", teamId as string) : null),
    tasksAll: useCachedValue<number>(enabled ? totalKey("tasks-all", teamId as string) : null),
    meetings: useCachedValue<number>(enabled ? totalKey("meetings", teamId as string) : null),
    // The agency's own housekeeping — the exact server totals the sidebar badges
    // and the collection headings show, primed by the fetchers above.
    marketing: useCachedValue<number>(enabled ? totalKey("marketing", teamId as string) : null),
    brand_assets: useCachedValue<number>(enabled ? totalKey("brand_assets", teamId as string) : null),
    programmes: useCachedValue<number>(enabled ? totalKey("programmes", teamId as string) : null),
    purposes: useCachedValue<number>(enabled ? totalKey("purposes", teamId as string) : null),
    staff_certificates: useCachedValue<number>(enabled ? totalKey("staff_certificates", teamId as string) : null),
    // Our own cost card. Like the staff certificates above, its rows are read by
    // the screen that shows them (internal-rate-card.tsx) rather than here — one
    // small settled list nothing else needs — so this is a cache READ that badges
    // the team tab once that screen has primed it.
    internal_rates: useCachedValue<number>(enabled ? totalKey("internal_rates", teamId as string) : null),
  }
  const selectableValues = formSelectableQ.data ?? []
  // The list now includes DEACTIVATED values (so the manager can reactivate them),
  // so every form PICKER filters to `active` — a retired value never appears as a
  // pickable option (but old rows that referenced it still read truthfully).
  const activeSelectable = selectableValues.filter((v) => v.active)
  // The pickers on the agency-internal forms. Every one is a PICK-OR-CREATE
  // field, so these options are a convenience and never a constraint: typing a
  // channel nobody has used adds it to the vocabulary rather than being refused.
  const marketingChannelOptions = activeSelectable
    .filter((v) => v.type === SELECTABLE_GROUPS.channel)
    .map((v) => v.value)
  const marketingStatusOptions = activeSelectable
    .filter((v) => v.type === SELECTABLE_GROUPS.marketingStatus)
    .map((v) => v.value)
  const brandCategoryOptions = activeSelectable
    .filter((v) => v.type === SELECTABLE_GROUPS.brandCategory)
    .map((v) => v.value)
  const departmentOptions = activeSelectable
    .filter((v) => v.type === SELECTABLE_GROUPS.department)
    .map((v) => v.value)
  const helpTypeOptions = activeSelectable.filter((v) => v.type === "Ticket type").map((v) => v.value)
  const learningCategoryOptions = activeSelectable
    .filter((v) => v.type === "Learning category")
    .map((v) => v.value)
  const contentTypeOptions = activeSelectable.filter((v) => v.type === "File type").map((v) => v.value)

  // Activity is one read path over three scopes (team / a member / an invite) — the
  // scope is derived from what's in view, and its cache key mirrors the scope so a
  // live ping refreshes the right feed.
  // (An account's own history is read by its record screen through the generic
  // record path — it isn't one of the three scopes this feed covers.)
  const activityScope: "team" | "user" | "invite" | null =
    module === "team"
      ? "team"
      : module === "members" && recordId
        ? "user"
        : module === "invites" && recordId
          ? "invite"
          : null
  const activityKey =
    !enabled || !activityScope
      ? null
      : activityScope === "team"
        ? `activity:team:${teamId}`
        : `activity:${activityScope}:${recordId}`
  // R14: the feed is PAGED — page one lands here and parks its next cursor in the
  // sidecar <LoadMore> reads; R16: its exact (permission-filtered) total rides along.
  const activityQ = useCached(activityKey, () =>
    tenancy
      .activity(activityScope ?? "team", activityScope === "team" ? undefined : (recordId ?? undefined))
      .then((r) => {
        primeCache(cursorKey(activityKey as string), r.nextCursor)
        primeCache(`total:${activityKey}`, r.total)
        return r.activity
      })
  )
  // R8: the number the DETAIL's Activity tab badges — the same exact, already-
  // permission-filtered total the fetch above primed, read as a sidecar so the
  // tab and the feed can never disagree. Undefined until page one lands, which
  // formatCount renders as nothing.
  const activityTotal = useCachedValue<number>(activityKey ? `total:${activityKey}` : null)
  // THE GENERIC (table, id) RECORD FEED — Law R5, for the four agency-internal
  // details. The three scopes above (team / user / invite) are the base's older
  // fixed ones, named at the door; a module written today reads its history the
  // generic way, and this map is the only thing that has to know which table a
  // URL segment's records live in.
  const internalTable = recordId ? (INTERNAL_ACTIVITY_TABLE[module ?? ""] ?? null) : null
  const internalActivity = useRecordActivity(enabled ? internalTable : null, recordId)
  // The invite-detail audit (inviter snapshot + acceptance) — only when viewing
  // one invite. Cache-first + live (a revoke/accept ping refreshes its invite row).
  const inviteAuditQ = useCached(
    enabled && module === "invites" && recordId ? `invite-audit:${recordId}` : null,
    () => tenancy.inviteAudit(recordId as string)
  )

  return {
    overridesQ,
    accountsQ,
    knowledgeQ,
    storiesQ,
    sprintsQ,
    appsQ,
    tasksOpenQ,
    tasksAllQ,
    meetingsQ,
    membersQ,
    rolesQ,
    invitesQ,
    metaQ,
    learningQ,
    helpQ,
    helpMineQ,
    helpArchivedQ,
    totals,
    formSelectableQ,
    selectableValues,
    helpTypeOptions,
    learningCategoryOptions,
    contentTypeOptions,
    marketingQ,
    brandQ,
    programmesQ,
    purposesQ,
    marketingChannelOptions,
    marketingStatusOptions,
    brandCategoryOptions,
    departmentOptions,
    activityScope,
    activityKey,
    activityQ,
    activityTotal,
    internalActivity,
    inviteAuditQ,
  }
}
