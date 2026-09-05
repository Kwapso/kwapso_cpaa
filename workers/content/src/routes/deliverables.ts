// THE HANDOVER SHELF ON ONE APP (CHECKLIST 8.7) — five doors, and the same
// sentence at the top of every one of them.
//
// R21, AT THE DOOR, ON ALL SIX OF THE AGENCY'S. `deliverables` is a module a
// client login could plausibly be granted — the material IS theirs, it is what we
// hand over — and that is exactly why the refusal is written here rather than
// assumed from the portal gateway's allow-list. The agency gateway forwards by
// PREFIX and a client login is an ordinary team member holding an ordinary role,
// so a door the portal withheld is served to the same person at the other
// hostname unless it says no itself.
//
// THE DAY ARRIVED (18 August 2026), AND THE SHAPE OF THE ANSWER IS THE POINT.
// The owner: "yes of course.. the deliverables are for them! but only once we
// mark it as visible yeah?" — so a client may now read their own shelf, through
// ONE new door, `GET /api/content/portal/deliverables`, which is the LAST handler
// in this file and the only one that does not refuse them.
//
// It is a SEPARATE DOOR rather than a mode on the agency's, and that is the same
// decision `GET /api/content/portal/delivery` made about sprints one module over.
// Three reasons, in order of how much they would cost to get wrong:
//   • THE SHAPE IS HALF THE FENCE. The staff answer carries `creatorName`,
//     `editorName` and `active`; SCOPE ch.06 says the portal shows the work and
//     never which staff member is doing it. A door that answered both audiences
//     would be one `if` away from saying our names out loud, forever.
//   • THE QUESTION IS DIFFERENT. Staff ask "what is on THIS app's shelf"
//     (`?appId=`); a client asks "what has been handed to MY company", across
//     every app they own. Two questions, two `WHERE`s.
//   • THE AGENCY'S FIVE KEEP THEIR REFUSAL, UNTOUCHED. Opening a mode on the
//     existing read would have meant deleting a `refusePortalCaller` — and R21
//     was earned twice by defences that were removed or never added. A new door
//     beside them changes nothing about the five that already say no.
//
// THE APP IS THE FILTER, AND IT IS ASKED OF THE SERVER. `?appId=` narrows here,
// never in the browser: the count beside the tab is the door's own COUNT(*) over
// the same WHERE the rows came from (R16), and a browser-side filter would put a
// number from one question above a list answering another.
//
// THE PING CARRIES THE APP, NOT THE DELIVERABLE (R1 + R15) — AND NOW THE ACCOUNT
// AS WELL. A deliverable has no list and no screen of its own — it is only ever
// read on the app it belongs to — so the APP is the one row a listener can act
// on, and the app id is what lets it name the shelf and the badge exactly. The
// same shape `account_rates` and `account_links` already have, one spine along.
//
// The moment a CLIENT can hear this resource, an app id stops being enough: it
// says nothing about whose app it is, and `mayHearChange` has nothing to fence a
// portal socket against. So every publish below passes the account as
// `ChangeEvent.scope`, `deliverables` joins `SCOPE_STAMPED_RESOURCES`, and the
// writes hand the account back rather than the routes asking for it again. A
// publish that forgot the scope would be heard by no client at all — silence, the
// direction that file fails in on purpose.
//
// ONE UPLOAD DOOR, NOT TWO. Its four elders come in pairs — a buffered base64
// door kept alive for browser builds that were already loaded when the streamed
// twin shipped. A door with no clients in the wild has nothing to be compatible
// with, so this module ships only the streamed shape and never grows the
// 128 MB-isolate arithmetic the buffered one is stuck with.

import { accountScope, refusePortalCaller } from "@shared/workers/account-scope"
import { fail, json } from "@shared/workers/http"
import { STREAM_UPLOAD_MAX_BYTES } from "@shared/workers/limits"
import { queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { ANY_FILE_TYPE, mediaKey, ownedMediaKey, reclaimMedia, storedContentType } from "@shared/workers/image"
import { gated, gatedBody } from "@shared/workers/route"
import {
  countDeliverables,
  createDeliverable,
  listDeliverables,
  setDeliverableActive,
  setDeliverableClientVisibility,
  updateDeliverable,
  type DeliverableInput,
} from "../lib/deliverables"
import { countClientDeliverables, listClientDeliverables } from "../lib/deliverables-client"
import type { Env } from "../env"

/** GET /api/content/deliverables?appId=[&id=] — one app's shelf, with the exact
 * total the tab badge shows (R16). `id` narrows to one row, so a machine caller
 * can read one back without pulling the shelf it sits on. */
export async function getDeliverables(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "deliverables", "read")
  await refusePortalCaller(cfg, guard)
  const url = new URL(request.url)
  const filter = {
    appId: queryText(url.searchParams.get("appId"), "App"),
    id: queryText(url.searchParams.get("id"), "Id"),
  }
  // These are independent reads — one wait, not 2.
  const [deliverables, total] = await Promise.all([listDeliverables(cfg, guard, filter), countDeliverables(cfg, guard, filter)])
  return json({
    deliverables,
    total,
  })
}

/** POST /api/content/deliverables — file something we handed over.
 *
 * `appId` is REQUIRED and is the only pointer this door takes: the account is
 * copied off the app inside `createDeliverable`, never accepted from a caller,
 * so nothing anybody sends can file our handover material under the wrong
 * client's company. */
export async function postCreateDeliverable(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<DeliverableInput>(
    request, env, "deliverables", "create"
  )
  await refusePortalCaller(cfg, guard)
  const appId = requireText(body.appId, "App", TEXT_LIMITS.short)
  requireText(body.title, "Title", TEXT_LIMITS.short)
  // Born INVISIBLE. Nothing here writes `visible_to_client_at`, so the column is
  // NULL and the client's read cannot see it — sharing is its own act, below.
  const wrote = await createDeliverable(cfg, guard, actor, appId, body)
  await publishChange(env, guard.teamId, "deliverables", appId, "add", wrote.accountId ?? undefined)
  // These are independent reads — one wait, not 2.
  const [deliverables, total] = await Promise.all([listDeliverables(cfg, guard, { appId }), countDeliverables(cfg, guard, { appId })])
  return json({
    deliverables,
    total,
  })
}

/** POST /api/content/deliverables/update — correct one. The app it hangs off is
 * deliberately not editable; lib/deliverables.ts says why. */
export async function postUpdateDeliverable(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<DeliverableInput & { id?: string }>(
    request, env, "deliverables", "edit"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Deliverable", TEXT_LIMITS.short)
  const appId = requireText(body.appId, "App", TEXT_LIMITS.short)
  requireText(body.title, "Title", TEXT_LIMITS.short)
  const wrote = await updateDeliverable(cfg, guard, actor, id, appId, body)
  await publishChange(env, guard.teamId, "deliverables", appId, undefined, wrote.accountId ?? undefined)
  // The link's file and the picture, when this edit stopped pointing at either.
  // After the write and fail-soft; archiving still reclaims nothing, which is the
  // distinction lib/deliverables.ts draws between superseded and retired.
  await reclaimMedia(
    env.INTERNAL_MEDIA,
    wrote.supersededUrls.map((u) => ownedMediaKey(u, "/media/internal/", guard.teamId, "deliverables")),
    { db: env.DB, source: "content", place: "POST /api/content/deliverables/update, file reclaim" }
  )
  // These are independent reads — one wait, not 2.
  const [deliverables, total] = await Promise.all([listDeliverables(cfg, guard, { appId }), countDeliverables(cfg, guard, { appId })])
  return json({
    deliverables,
    total,
  })
}

/** POST /api/content/deliverables/active — archive one, or put it back. Never
 * deleted, and the file behind it is never reclaimed either way. */
export async function postSetDeliverableActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; appId?: unknown; active?: unknown }>(
    request, env, "deliverables", "delete"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Deliverable", TEXT_LIMITS.short)
  const appId = requireText(body.appId, "App", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean") return fail(400, "invalid_input", "Archive or restore?")
  // R17: a repeat moves zero rows → no ping, no duplicate line of history.
  const wrote = await setDeliverableActive(cfg, guard, actor, id, appId, body.active)
  if (wrote.changed)
    await publishChange(env, guard.teamId, "deliverables", appId, undefined, wrote.accountId ?? undefined)
  // These are independent reads — one wait, not 2.
  const [deliverables, total] = await Promise.all([listDeliverables(cfg, guard, { appId }), countDeliverables(cfg, guard, { appId })])
  return json({
    deliverables,
    total,
  })
}

/** POST /api/content/deliverables/visibility — show one to the client, or take
 * it back (Client visibility, glossary).
 *
 * ITS OWN DOOR, NOT A FIELD ON THE EDIT FORM. Publishing something to a client
 * is a decision; correcting a title is a correction. Folding the two together
 * would mean every typo fix carried the power to disclose, and R22's lesson runs
 * the other way too: a door that accepts a field is a door a machine caller can
 * set that field on. `postUpdateDeliverable` reads five fields off the body and
 * `visible` is deliberately not one of them.
 *
 * GATED ON `deliverables:edit`, the same right that corrects one — sharing is not
 * a harder act than editing, it is a different one, and inventing a fifth verb
 * for the permission matrix would be a right an owner has to understand before
 * they can grant anything. R21: it is the agency's decision about the agency's
 * material, so it refuses a client login like its five siblings. A client cannot
 * share a deliverable with themselves.
 *
 * R17: `changed` is false when it was already in the state asked for, and then
 * nothing is logged and nothing is published. */
export async function postSetDeliverableVisibility(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{
    id?: unknown
    appId?: unknown
    visible?: unknown
  }>(request, env, "deliverables", "edit")
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Deliverable", TEXT_LIMITS.short)
  const appId = requireText(body.appId, "App", TEXT_LIMITS.short)
  // R20, positionally: a `typeof` operand, not a truthiness guard. `{}` and
  // `"false"` are both refused here rather than quietly meaning something.
  if (typeof body.visible !== "boolean")
    return fail(400, "invalid_input", "Show this to the client, or hide it?")
  const wrote = await setDeliverableClientVisibility(cfg, guard, actor, id, appId, body.visible)
  if (wrote.changed)
    await publishChange(env, guard.teamId, "deliverables", appId, undefined, wrote.accountId ?? undefined)
  // These are independent reads — one wait, not 2.
  const [deliverables, total] = await Promise.all([listDeliverables(cfg, guard, { appId }), countDeliverables(cfg, guard, { appId })])
  return json({
    deliverables,
    total,
  })
}

/** GET /api/content/portal/deliverables — THE CLIENT'S OWN SHELF, and the only
 * door in this file that does not refuse them.
 *
 * FENCED TWICE, IN ONE CLAUSE, AND NEITHER HALF IS OPTIONAL. `clientWhere` (in
 * lib/deliverables-client.ts) ANDs the caller's account fence together with
 * `visible_to_client_at IS NOT NULL`, so a deliverable on somebody else's
 * account and a deliverable nobody has shared are equally absent — and the count
 * beside the rows is taken over that same clause, so the heading can never
 * advertise material the list is withholding (R16).
 *
 * NO PARAMETERS AT ALL, which is the strongest thing that can be said about it.
 * There is no `?appId=`, no `?accountId=`, nothing to parse and therefore nothing
 * to trust: the whole question is "what has been shared with the company this
 * caller is standing in", and the only input is the caller's own resolved scope.
 * The account-fence leak that R21 was earned on both times began with a door
 * taking an id.
 *
 * `accountScope` RATHER THAN `refusePortalCaller`, which is the one place in the
 * module those two differ — and it is exactly the second of R21's four permitted
 * answers: this door IS on the portal's surface (`PORTAL_DOORS`), and it resolves
 * the fence. */
export async function getClientDeliverables(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "deliverables", "read")
  const scope = await accountScope(cfg, guard)
  // These are independent reads — one wait, not 2.
  const [deliverables, total] = await Promise.all([listClientDeliverables(cfg, guard, scope), countClientDeliverables(cfg, guard, scope)])
  return json({
    deliverables,
    total,
  })
}

/** POST /api/content/deliverables/upload-stream — the bytes behind a deliverable
 * (a handover PDF, a recorded walkthrough), arriving AS the request body.
 *
 * THE SAME SEAM AS ITS THREE ELDERS, not a second one: the envelope is checked
 * before a byte is read, the DECLARED type is held to `INLINE_SAFE_UPLOAD`
 * because the object is served back under it (a script-capable type would be
 * stored XSS on our own origin), and the key is minted here by `mediaKey` so it
 * carries the team's prefix, a random ULID, and nothing at all the caller sent.
 *
 * INTERNAL_MEDIA, the bucket only the AGENCY gateway serves. The material is for
 * the client, but no client door names this module today, so the bytes sit where
 * a client's browser cannot reach them even holding the key — the structural
 * version of the answer rather than the conditional one (R24's shape, applied to
 * a milder question). Switching the portal on later binds this same bucket on the
 * portal gateway; it moves no files.
 *
 * HOUSEKEEPING: it writes a FILE, not a record — there is no row to patch, so
 * there is nothing to broadcast. The create or edit that stores the URL pings its
 * own row. */
export async function postStreamDeliverableFile(request: Request, env: Env): Promise<Response> {
  // The envelope BEFORE the gate and before a byte is read — a cap is only a cap
  // if it is checked before the expensive step.
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (!Number.isFinite(declared) || declared <= 0)
    return fail(411, "length_required", "That upload did not say how big it is, so we did not start it.")
  if (declared > STREAM_UPLOAD_MAX_BYTES)
    return fail(
      413,
      "too_large",
      `That upload is too big, the most we can take in one file is ${Math.round(STREAM_UPLOAD_MAX_BYTES / 1_000_000)} MB. Nothing was saved.`
    )

  const { cfg, guard } = await gated(request, env, "deliverables", "create")
  await refusePortalCaller(cfg, guard)

  // ANY WELL-FORMED TYPE, STORED SO IT CANNOT RUN — the same move the four
  // data-URL doors made on 26 Aug 2026. A deliverable is "a handover PDF, a
  // recorded walkthrough" and also, in practice, a spreadsheet, an archive, a
  // saved page; the old list took none of those and said "isn't a supported
  // upload" without saying which. `storedContentType` keeps the XSS boundary
  // exactly where it was — on what the browser is allowed to render — while the
  // door stops deciding what a deliverable is allowed to be.
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim()
  if (!ANY_FILE_TYPE.test(contentType))
    return fail(400, "invalid_input", "That upload did not say what kind of file it is.")
  if (!request.body) return fail(400, "invalid_input", "That upload had no file in it.")

  // THE MODULE IS PART OF THE KEY, and that is what makes a reclaim provable.
  // A key of the team id alone was minted by FOUR modules into the same
  // bucket — knowledge, brand assets, staff and deliverables — so
  // `ownedMediaKey(url, base, teamId)` could prove "this team" and never "this
  // module": a brand asset's URL pasted into a staff certificate's file field
  // would pass the ownership test and be destroyed by the staff door's own
  // reclaim. One more segment makes that impossible by construction rather than
  // by everybody remembering. Objects written under the old bare-team shape stay
  // exactly where they are: a key cannot be renamed, they simply match no
  // module's prefix and are never reclaimed, which is the behaviour they already
  // had.
  const key = mediaKey(guard.teamId, "deliverables")
  await env.INTERNAL_MEDIA.put(key, request.body, {
    httpMetadata: { contentType: storedContentType(contentType) },
  })
  // ?v= busts caches; the file itself is served immutable by the gateway.
  return json({ url: `/media/internal/${key}?v=${Date.now()}`, contentType })
}
