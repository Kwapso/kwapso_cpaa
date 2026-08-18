// THE HANDOVER SHELF ON ONE APP (CHECKLIST 8.7) — five doors, and the same
// sentence at the top of every one of them.
//
// R21, AT THE DOOR, ON ALL FIVE. `deliverables` is a module a client login could
// plausibly be granted — the material IS theirs, it is what we hand over — and
// that is exactly why the refusal is written here rather than assumed from the
// portal gateway's allow-list. The agency gateway forwards by PREFIX and a client
// login is an ordinary team member holding an ordinary role, so a door the portal
// withheld is served to the same person at the other hostname unless it says no
// itself. Every row carries `account_id`, so the fence EXISTS and a fenced read is
// one clause away the day the owner decides a client may see their own shelf;
// until then this module answers staff only, the way the knowledge base does.
//
// THE APP IS THE FILTER, AND IT IS ASKED OF THE SERVER. `?appId=` narrows here,
// never in the browser: the count beside the tab is the door's own COUNT(*) over
// the same WHERE the rows came from (R16), and a browser-side filter would put a
// number from one question above a list answering another.
//
// THE PING CARRIES THE APP, NOT THE DELIVERABLE (R1 + R15). A deliverable has no
// list and no screen of its own — it is only ever read on the app it belongs to —
// so the APP is the one row a listener can act on, and the app id is what lets it
// name the shelf and the badge exactly. The same shape `account_rates` and
// `account_links` already have, one spine along.
//
// ONE UPLOAD DOOR, NOT TWO. Its four elders come in pairs — a buffered base64
// door kept alive for browser builds that were already loaded when the streamed
// twin shipped. A door with no clients in the wild has nothing to be compatible
// with, so this module ships only the streamed shape and never grows the
// 128 MB-isolate arithmetic the buffered one is stuck with.

import { refusePortalCaller } from "@shared/workers/account-scope"
import { fail, json } from "@shared/workers/http"
import { STREAM_UPLOAD_MAX_BYTES } from "@shared/workers/limits"
import { queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { publishChange } from "@shared/workers/realtime"
import { INLINE_SAFE_UPLOAD, mediaKey } from "@shared/workers/image"
import { gated, gatedBody } from "@shared/workers/route"
import {
  countDeliverables,
  createDeliverable,
  listDeliverables,
  setDeliverableActive,
  updateDeliverable,
  type DeliverableInput,
} from "../lib/deliverables"
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
  return json({
    deliverables: await listDeliverables(cfg, guard, filter),
    total: await countDeliverables(cfg, guard, filter),
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
  await createDeliverable(cfg, guard, actor, appId, body)
  await publishChange(env, guard.teamId, "deliverables", appId, "add")
  return json({
    deliverables: await listDeliverables(cfg, guard, { appId }),
    total: await countDeliverables(cfg, guard, { appId }),
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
  await updateDeliverable(cfg, guard, actor, id, appId, body)
  await publishChange(env, guard.teamId, "deliverables", appId)
  return json({
    deliverables: await listDeliverables(cfg, guard, { appId }),
    total: await countDeliverables(cfg, guard, { appId }),
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
  const changed = await setDeliverableActive(cfg, guard, actor, id, appId, body.active)
  if (changed) await publishChange(env, guard.teamId, "deliverables", appId)
  return json({
    deliverables: await listDeliverables(cfg, guard, { appId }),
    total: await countDeliverables(cfg, guard, { appId }),
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

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim()
  if (!INLINE_SAFE_UPLOAD.test(contentType))
    return fail(400, "invalid_input", "That file isn't a supported upload.")
  if (!request.body) return fail(400, "invalid_input", "That upload had no file in it.")

  const key = mediaKey(guard.teamId)
  await env.INTERNAL_MEDIA.put(key, request.body, { httpMetadata: { contentType } })
  // ?v= busts caches; the file itself is served immutable by the gateway.
  return json({ url: `/media/internal/${key}?v=${Date.now()}`, contentType })
}
