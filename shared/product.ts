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
