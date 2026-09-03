// PRODUCT SHAPE — the decisions that are not a limit, not a permission, and not
// a preference: they are what this product IS. Both the workers and the web read
// from here, so a door and the button that opens it can never disagree.

/** Kwapso is ONE agency running ONE team. The base it is built on is multi-team
 * SaaS, so team creation exists in the code and would otherwise be reachable
 * from the sidebar, the API and (in principle) any machine caller — a second
 * team would be an empty world with its own database, its own roles and none of
 * the customer data, reached by a menu item that looks like a feature.
 *
 * Closed here means closed EVERYWHERE a person or a program can ask (owner
 * decision, 10 Aug 2026): the create route refuses, onboarding stops minting a
 * team for a stranger, and the sidebar stops offering it. The only way into this
 * team is an invitation.
 *
 * The one exception is the ops door (`POST /api/tenancy/admin/create-team`),
 * which is not a user surface at all: it needs the deployment's ADMIN_KEY, which
 * no user, agent or token holder has. It exists so a FRESH environment can be
 * seeded and so the smoke suite can still prove "a token is pinned to one team"
 * — a proof that needs a second team to be a proof at all.
 *
 * Reopening this is a product decision, not a config change: flip it here, and
 * the check in web/test/rules.test.ts tells you every surface it reopens. */
export const TEAM_CREATION_CLOSED = true

/** THE TEAM SCREENS ARE HIDDEN, AND EVERYTHING UNDER THEM IS UNTOUCHED.
 *
 * A tester asked for teams to be removed altogether. The owner overruled it,
 * twice, and the reason is the whole point of this file: the multi-team
 * plumbing is not a feature kwapso uses, it is the thing that gets FORKED for a
 * paying client next year. Deleting it would save one nav line and cost the
 * product it is built to become.
 *
 * OVERRULED A THIRD TIME, 3 SEPTEMBER 2026, and this one arrived costed. A
 * design-lane brief argued the concept is HIDDEN, NOT REMOVED — correctly — and
 * that an unused dimension in the permission spine taxes every future module and
 * misleads every agent reading the source. The owner's ruling stands unchanged:
 * keep it hidden and blocked, and keep the architecture multi-tenant and
 * scalable. It is written down a third time because the argument gets better
 * each time it is made, and the answer has not moved.
 *
 * THE MEASUREMENTS, so a fourth proposal starts from facts instead of re-deriving
 * them (taken 3 Sep 2026 against origin/main):
 *   • 231 live source files name a team, 3,596 times — but only 251 of those are
 *     `guard.teamId`. The other ~628 read `guard.databaseId`, which any successor
 *     guard would still have to hand them, so they are not the cost they look.
 *   • The removal is ~8-9 days of sequential work. It is not a weekend job, and
 *     it is not the multi-week rewrite the file count suggests either.
 *
 * AND THE ONE THING A REMOVAL MUST NOT TAKE WITH IT. `teams.database_id` is not
 * only a data pointer: it is the ownership oracle `ourDatabases` in
 * workers/tenancy/src/lib/sharding.ts filters by. This deployment shares a
 * Cloudflare account with other companies, and the nightly size cron lists EVERY
 * database on it before narrowing to ours. Take the table away without replacing
 * that filter FIRST and the only thing between a cron and somebody else's
 * production database is a fallback. Whoever proposes this next: that goes first,
 * on its own, or the proposal is not ready.
 *
 * So this hides two things and only two things:
 *   • the TEAM SWITCHER — the dropdown in the sidebar and the mobile top bar
 *     (web/components/team-switcher.tsx, rendered from app-shell.tsx);
 *   • the TEAMS LIST on the Settings screen
 *     (web/components/screens/settings-screen.tsx).
 *
 * NOTHING ELSE CHANGES. Every team route still answers, `switchTeam` still
 * works, `/t/<teamId>/…` still resolves a team from the URL and switches to it,
 * the per-team databases are still per-team, a person can still hold more than
 * one membership, and the whole permission spine is exactly as it was. Kwapso
 * runs one team and the second one would be an empty world (see
 * TEAM_CREATION_CLOSED above), so the controls were offering a choice with one
 * option in it.
 *
 * TO SHOW THEM AGAIN: change this line to `false`. That is the entire change —
 * both surfaces read this constant and nothing else was removed. Documented at
 * length because the owner asked specifically that a future reader be able to
 * find that out without reading the diff. */
export const TEAM_SCREENS_HIDDEN = true
