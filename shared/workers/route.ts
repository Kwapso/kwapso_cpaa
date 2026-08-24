// The shared route-handler OPENING — the fixed steps every team-scoped handler
// repeats (CONVENTIONS §2): teamContext (who + which team) → requireRight (may
// they?) → a defensive JSON body read. Collapsed to one awaited call so ~50
// handlers don't restate the same three lines. Deliberately NOT a
// wrap-the-whole-handler decorator: handlers stay plain `export async function`s
// (the publish-seam tests read each handler's source by name straight off disk)
// and a handler that gates unusually — two rights, a body-derived module, an
// admin-key check, no gate at all — simply doesn't use these and writes the
// steps out.
//
// The `as B` body cast stays a SHAPE HINT, not a promise the fields are valid —
// each handler still validates at the boundary (requireText / optionalText).

import { accountScope } from "./account-scope"
import { requireRight, teamContext, type GatingEnv, type Right, type TeamCtx } from "./gating"

/** The uniform gated opening for reads (and body-less routes):
 * teamContext → requireRight, WITH THE FENCE READ ALONGSIDE IT.
 *
 * THE WAIT WAS THE COST, NOT THE WORK. 63 of the 67 gated doors open with these
 * two lines, in this order:
 *
 *     const { cfg, guard } = await gated(request, env, "help", "read")
 *     const scope = await callerScope(cfg, guard)
 *
 * Two reads that need nothing from each other, run one after the other, on
 * nearly every request the app serves. Measured against staging on 24 Aug 2026,
 * one trip to the D1 REST door costs 300–500ms while the SQL inside it runs in
 * about one millisecond — so that ordering alone was roughly 400ms on almost
 * every screen, spent waiting rather than working.
 *
 * `accountScope` memoises its PROMISE per request (account-scope.ts), so simply
 * starting it here is enough: `callerScope` and `refusePortalCaller` both resolve
 * through the same memo and get an answer that is already in flight, or already
 * back. Not one call site changed, and none had to — which is the point, because
 * a repair that needed 63 edits is one a 64th door forgets to apply.
 *
 * NOTHING ABOUT WHO MAY PASS HAS MOVED. Both reads still happen, on every door,
 * every time; the permission is still awaited before this returns, and its
 * refusal is still the one the caller hears, because `requireRight` is what this
 * function awaits. The fence read is a lookup of the caller's OWN account set —
 * it answers no question for them and it cannot grant anything.
 *
 * THE FOUR DOORS THAT NEVER FENCE now make one read they will not use. It is
 * concurrent with a read they already made, so it costs them no time at all —
 * only a query — and that is a deliberately cheaper price than the alternative,
 * which is a flag at 67 call sites that a future door gets wrong in the unsafe
 * direction. */
export async function gated(
  request: Request,
  env: GatingEnv,
  module: string,
  right: Right
): Promise<TeamCtx> {
  const ctx = await teamContext(request, env)
  const fence = accountScope(ctx.cfg, ctx.guard)
  // Whoever needs the scope awaits it through the memo and sees any failure
  // there. This only stops an unobserved rejection when nobody does — the memo
  // drops a rejected read, so the next caller retries rather than inheriting it.
  void fence.catch(() => {})
  await requireRight(ctx.cfg, ctx.guard, module, right)
  return ctx
}

/** The uniform gated mutation opening: teamContext → requireRight → defensive
 * body read (a malformed body becomes {}, never a throw). */
export async function gatedBody<B = unknown>(
  request: Request,
  env: GatingEnv,
  module: string,
  right: Right
): Promise<TeamCtx & { body: B }> {
  const ctx = await gated(request, env, module, right)
  const body = (await request.json().catch(() => ({}))) as B
  return { ...ctx, body }
}

/** teamContext + the defensive body read WITHOUT a gate — for handlers whose
 * right depends on the body (e.g. import routes gate `create` on the TARGET
 * module named in the payload). The caller still gates; this just opens. */
export async function openTeam<B = unknown>(
  request: Request,
  env: GatingEnv
): Promise<TeamCtx & { body: B }> {
  const ctx = await teamContext(request, env)
  const body = (await request.json().catch(() => ({}))) as B
  return { ...ctx, body }
}
