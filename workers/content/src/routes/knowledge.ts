// Knowledge-base routes: list the sources the assistant may read, ask it a
// question, add / correct / take away a source, and bring the base back into
// step with the app's own rows. Same opening as every other content route —
// gated (`knowledge` module), validated at the boundary, published after a
// write — plus the one thing this module adds to that habit:
//
// EVERY DOOR HERE REFUSES A CLIENT LOGIN, AT THE DOOR (R21). The knowledge base
// holds the agency's internal material — its process notes, its own tickets,
// what it knows about each client — so there is no fenced slice of it to serve a
// client; there is a refusal. The refusal is written on each handler rather than
// left to the portal gateway's allow-list, because the agency gateway forwards
// by PREFIX and a client login is an ordinary team member: a door not named on
// the portal's list is still served to them at the other hostname. That mistake
// has been made twice in this codebase and caught twice.

import { fail, json, pagedJson } from "@shared/workers/http"
import { optionalText, queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { hasRight, requireRight } from "@shared/workers/gating"
import { publishChange } from "@shared/workers/realtime"
import { refusePortalCaller } from "@shared/workers/account-scope"
import { gated, gatedBody } from "@shared/workers/route"
import { ANY_FILE_TYPE, mediaKey, NEUTRALISED_CONTENT_TYPE, parseUploadDataUrl } from "@shared/workers/image"
import { KNOWLEDGE_FILE_MAX_BYTES, KNOWLEDGE_UPLOAD_MAX_BYTES } from "@shared/workers/limits"
import {
  countSources,
  createFileSource,
  createSource,
  getSource,
  KNOWLEDGE_KINDS,
  listSources,
  retrieve,
  setSourceActive,
  updateSource,
  type SourceInput,
} from "../lib/knowledge"
import { extractFile } from "../lib/knowledge-files"
import { catchUp, listIngestState, sweepAll } from "../lib/knowledge-ingest"
import { googleStateKeys, sweepGoogle } from "../lib/knowledge-google"
import type { Env } from "../env"

/** GET /api/content/knowledge — the sources, newest first (?id → just that one).
 * Filters: `kind`, `compartment`, `q`. R14: sources GROW with ordinary use (the
 * agency's own history is thousands), so the door PAGES by key — the opaque
 * cursor comes straight back from the previous response. */
export async function getKnowledge(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "knowledge", "read")
  await refusePortalCaller(cfg, guard)
  const url = new URL(request.url)
  const id = queryText(url.searchParams.get("id"), "Id")
  if (id) {
    const one = await getSource(cfg, guard, id)
    return pagedJson(
      "sources",
      { rows: one ? [one] : [], total: await countSources(cfg, guard), hasMore: false, nextCursor: null }
    )
  }
  const kind = queryText(url.searchParams.get("kind"), "Kind")
  const [page, total] = await Promise.all([
    listSources(
      cfg,
      guard,
      {
        // An unknown kind is dropped rather than refused: a filter is a narrowing,
        // and narrowing by a word that is not a kind would answer "nothing" as if
        // the base were empty.
        kind: kind && (KNOWLEDGE_KINDS as readonly string[]).includes(kind) ? kind : undefined,
        compartment: queryText(url.searchParams.get("compartment"), "Compartment"),
        q: queryText(url.searchParams.get("q"), "Search"),
      },
      queryText(url.searchParams.get("cursor"), "Cursor") ?? null
    ),
    countSources(cfg, guard),
  ])
  // R16: the exact server total rides every list response (badges never use
  // rows.length — on a paged list that is just "50" forever).
  return pagedJson("sources", { ...page, total })
}

/** GET /api/content/knowledge/ask — answer a question from the team's own
 * material, with citations.
 *
 * A READ, deliberately: it changes nothing, and the cost model (MCP.md) puts it
 * with the other reads — it spends ONE embedding of the question, which is a
 * rounding error beside a chat turn, and no model writes a word here. The
 * assistant composes the answer with these passages in front of it, which is
 * what makes "every answer cites its sources" a property of the data.
 *
 * `accountId` is how a screen says WHOSE record the question was asked from; the
 * compartment is derived from it (or from the question), never picked by hand. */
export async function getKnowledgeAsk(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "knowledge", "read")
  await refusePortalCaller(cfg, guard)
  const url = new URL(request.url)
  // A question is prose, so it carries the message cap rather than the query
  // default — and it is still capped, because a query string is an input.
  const question = queryText(url.searchParams.get("q"), "Question", TEXT_LIMITS.message)
  if (!question) return fail(400, "invalid_input", "A question is required.")
  // BEFORE IT ANSWERS, IT CATCHES UP. A ticket whose status changed a minute ago
  // must not be answered from a quarter-hour-old memory of it, and the owner's
  // ruling was explicit: nothing to press, nothing to wait for. Bounded and
  // best-effort — see catchUp(); a question is still answerable when it cannot
  // run, just as current as the last sweep.
  await catchUp(env, cfg, guard)
  const limit = Number(queryText(url.searchParams.get("limit"), "Limit"))
  return json(
    await retrieve(env, cfg, guard, {
      question,
      accountId: queryText(url.searchParams.get("accountId"), "Account") ?? null,
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    })
  )
}

/** GET /api/content/knowledge/sync — how far the sweep has got with each kind of
 * material, when it last ran, and what went wrong if it did (R12's record, read
 * back). This is the screen's "is the assistant up to date?" answer. */
export async function getKnowledgeSync(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "knowledge", "read")
  await refusePortalCaller(cfg, guard)
  // THE CALLER'S OWN Google rows ride along — and only theirs. The state table
  // holds a row per person per service now (a sweep of somebody's mailbox is
  // that person's sweep), so a screen showing "everything in the table" would be
  // one member reading how far every colleague's Drive has got. `hasRight`
  // rather than `requireRight`: somebody without the Google switch still gets a
  // perfectly good answer about the tickets, articles and accounts.
  const mine = (await hasRight(cfg, guard, "google", "read")) ? googleStateKeys(guard.userId) : []
  return json({ ingest: await listIngestState(cfg, guard, mine) })
}

/**
 * POST /api/content/knowledge/sync-google — bring MY OWN Google material into
 * step: the folders and spaces I named, the mail with a known contact, my diary.
 *
 * A SECOND DOOR RATHER THAN A FLAG ON THE FIRST, for two reasons that point the
 * same way. It needs a right the other one does not (`google:read` — reading
 * somebody's mailbox is not the same permission as filing a note), and it is the
 * only sweep in the product that acts as a PERSON rather than on a team's rows:
 * every byte it reads comes through the caller's own token, and there is no
 * caller on a cron. Bolting it onto the shared door would have made "who is this
 * running as?" a question with two answers depending on a flag.
 *
 * WHAT AN OWNER STILL HAS TO DO: nothing here works until somebody has stood at
 * Google's own consent screen in a browser and said yes (Settings → connect).
 * Until then this door answers honestly with an empty list of kinds — the person
 * has connected nothing, so there is nothing of theirs to sweep.
 *
 * A coarse ping, not a row-level one: a slice touches many sources and no one
 * row is the change — the same shape the shared sync door already has.
 */
export async function postKnowledgeSyncGoogle(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "knowledge", "create")
  await refusePortalCaller(cfg, guard)
  await requireRight(cfg, guard, "google", "read")
  const results = await sweepGoogle(env, cfg, guard)
  if (results.some((r) => r.indexed > 0)) await publishChange(env, guard.teamId, "knowledge")
  return json({
    results,
    caughtUp: results.every((r) => r.caughtUp && !r.error),
    total: await countSources(cfg, guard),
  })
}

/** POST /api/content/knowledge — add a source the assistant may read. */
export async function postCreateKnowledge(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<SourceInput>(request, env, "knowledge", "create")
  await refusePortalCaller(cfg, guard)
  requireText(body.title, "Title", TEXT_LIMITS.short)
  const id = await createSource(env, cfg, guard, actor, body)
  // Row-level: carry the new source's id so open lists patch just that row.
  await publishChange(env, guard.teamId, "knowledge", id, "add")
  return json({ source: await getSource(cfg, guard, id), total: await countSources(cfg, guard) })
}

/** POST /api/content/knowledge/upload — hand the knowledge base a FILE.
 *
 * ONE DOOR, ONE RECORD. It is deliberately not the learning module's shape (an
 * upload door that answers with a URL, and a second call that writes the row):
 * there, the file is an illustration inside something a person is already
 * writing, and the two halves are genuinely two acts. Here the file IS the
 * record, so splitting it would mean a stored object with no row pointing at it
 * every time somebody closed the tab between the two calls — an orphan in a
 * bucket, invisible to every screen and every sweep.
 *
 * A SEPARATE DOOR FROM `POST /api/content/knowledge`, though, and that is also
 * on purpose. Bolting `fileDataUrl` onto the typed-note door would put a
 * megabyte-shaped field on a door the ASSISTANT sits on — and R22 would then
 * quite rightly require `add_knowledge_source` to expose and forward it, which
 * is a contract no language model can honour (it cannot emit a base64 PDF). A
 * door a machine cannot use should not pretend to be one a machine can use.
 * There is no MCP tool on this one, and that is the whole reason.
 *
 * THE ENVELOPE IS CHECKED BEFORE THE BODY IS READ. `gatedBody` calls
 * `request.json()`, which is the expensive step — so the declared length is
 * refused first, exactly as the agent chat door learned to (limits.ts). Past the
 * envelope, `parseUploadDataUrl` caps the FILE itself before it decodes a byte.
 *
 * WHAT HAPPENS TO A FILE WE CANNOT READ: it is stored and listed anyway, and it
 * says so. See lib/knowledge-files.ts — that decision has a page of its own.
 *
 * R21 at the door, like every other handler here. */
export async function postUploadKnowledgeFile(request: Request, env: Env): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > KNOWLEDGE_UPLOAD_MAX_BYTES)
    return fail(
      413,
      "too_large",
      `That upload is too big — the most we can take in one file is ${mb(KNOWLEDGE_FILE_MAX_BYTES)}. Nothing was saved.`
    )
  const { actor, cfg, guard, body } = await gatedBody<{
    title?: unknown
    fileName?: unknown
    fileDataUrl?: unknown
    accountId?: unknown
    visibility?: unknown
  }>(request, env, "knowledge", "create")
  await refusePortalCaller(cfg, guard)

  const fileName = requireText(body.fileName, "File name", TEXT_LIMITS.short)
  // The title defaults to the file's own name, because a person who dragged a
  // contract onto the screen has already named it once.
  const title = optionalText(body.title, "Title", TEXT_LIMITS.short) ?? fileName
  const parsed = parseUploadDataUrl(body.fileDataUrl, KNOWLEDGE_FILE_MAX_BYTES, ANY_FILE_TYPE)
  if (!parsed)
    return fail(
      400,
      "too_large",
      `We couldn't read that as a file, or it is over ${mb(KNOWLEDGE_FILE_MAX_BYTES)}. Nothing was saved.`
    )

  // READ IT FIRST, STORE IT SECOND, WRITE THE ROW LAST. The order is the one that
  // fails least badly: a conversion that dies leaves nothing behind at all, and a
  // row is only ever written once there is a file for it to point at. The one
  // orphan this can still leave — bytes in R2 with no row, because the INSERT
  // failed — costs storage and nothing else, which is the same bargain every
  // other upload door in the base makes (see reclaimMedia's header).
  const extract = await extractFile(env, {
    bytes: parsed.bytes,
    contentType: parsed.contentType,
    fileName,
  })
  // The agency's OWN bucket, and the reasoning is R21's rather than R2's: the
  // knowledge base holds internal material, and `/media/internal/` is served by
  // the AGENCY gateway alone — the portal has no such path, so a capability URL
  // that leaked into a client's hands has nowhere to be redeemed. The shared
  // MEDIA bucket, which both front doors serve, would have been exactly the
  // wrong shelf. A bucket of its own was considered and rejected: INTERNAL_MEDIA
  // already exists to hold "the agency's own files, for the agency's own eyes",
  // its own header argues against one bucket per module, and a new one would be
  // a step in BOOTSTRAP.md that a rebuild from zero can silently skip.
  const key = mediaKey(guard.teamId)
  await env.INTERNAL_MEDIA.put(key, parsed.bytes as unknown as ArrayBuffer, {
    // NEVER the declared type. The object is served back on the app's own origin,
    // so a stored `text/html` would be stored XSS — and the structural answer is
    // to write the bytes with no renderable label at all rather than to keep a
    // list of types somebody has to maintain (shared/workers/image.ts).
    httpMetadata: { contentType: NEUTRALISED_CONTENT_TYPE },
  })

  const id = await createFileSource(env, cfg, guard, actor, {
    title,
    accountId: optionalText(body.accountId, "Account", TEXT_LIMITS.short) ?? null,
    privateToMe: body.visibility === "private",
    file: {
      url: `/media/internal/${key}`,
      name: fileName,
      type: parsed.contentType,
      bytes: parsed.bytes.length,
    },
    extract,
  })
  // Row-level (R1): carry the new source's id so open lists patch just that row.
  await publishChange(env, guard.teamId, "knowledge", id, "add")
  return json({ source: await getSource(cfg, guard, id), total: await countSources(cfg, guard) })
}

const mb = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`

/** POST /api/content/knowledge/update — correct a source. */
export async function postUpdateKnowledge(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<SourceInput & { id?: unknown }>(
    request,
    env,
    "knowledge",
    "edit"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Source", TEXT_LIMITS.short)
  requireText(body.title, "Title", TEXT_LIMITS.short)
  await updateSource(env, cfg, guard, actor, id, body)
  await publishChange(env, guard.teamId, "knowledge", id)
  return json({ source: await getSource(cfg, guard, id), total: await countSources(cfg, guard) })
}

/** POST /api/content/knowledge/active — take a source away from the assistant
 * (active:false) or give it back. Gated by knowledge:delete, because taking
 * material away IS this module's delete: the row survives, the assistant's sight
 * of it does not. R17: a repeat moves zero rows → no ping, no second history row. */
export async function postSetKnowledgeActive(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ id?: unknown; active?: unknown }>(
    request,
    env,
    "knowledge",
    "delete"
  )
  await refusePortalCaller(cfg, guard)
  const id = requireText(body.id, "Source", TEXT_LIMITS.short)
  if (typeof body.active !== "boolean")
    return fail(400, "invalid_input", "id and active are required.")
  const changed = await setSourceActive(env, cfg, guard, actor, id, body.active)
  if (changed) await publishChange(env, guard.teamId, "knowledge", id)
  return json({ source: await getSource(cfg, guard, id), total: await countSources(cfg, guard) })
}

/** POST /api/content/knowledge/sync — bring the knowledge base into step with
 * the app's own rows, one bounded slice at a time.
 *
 * The SAME engine the cron runs, reachable by hand: that is what makes the
 * backfill (scripts/knowledge-backfill.mjs) a loop over this door rather than a
 * second ingestion path nobody tests. `caughtUp` on every kind is how the caller
 * knows to stop asking.
 *
 * Gated on knowledge:create — it creates sources. A coarse ping, not a row-level
 * one: a slice touches many rows, so the list re-reads its first page rather than
 * carrying twenty-five ids nobody can patch individually. */
export async function postKnowledgeSync(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await gated(request, env, "knowledge", "create")
  await refusePortalCaller(cfg, guard)
  const results = await sweepAll(env, cfg, guard)
  if (results.some((r) => r.indexed > 0)) await publishChange(env, guard.teamId, "knowledge")
  return json({
    results,
    caughtUp: results.every((r) => r.caughtUp && !r.error),
    total: await countSources(cfg, guard),
  })
}
