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

import type { Actor, MemberGuard } from "@shared/workers/gating"
import type { D1Rest } from "@shared/workers/d1-rest"
import type { KnowledgeCitation, KnowledgePassage } from "@shared/types"
import { consumeAiUnit, logUsage, refundAiUnits, type UsageSource } from "@shared/workers/credits"
import { fail, json, pagedJson } from "@shared/workers/http"
import { resolveOrdering } from "@shared/workers/sorting"
import { optionalText, queryText, requireText, TEXT_LIMITS } from "@shared/workers/validate"
import { hasRight, requireRight } from "@shared/workers/gating"
import { publishChange } from "@shared/workers/realtime"
import { refusePortalCaller } from "@shared/workers/account-scope"
import { gated, gatedBody } from "@shared/workers/route"
import { ANY_FILE_TYPE, mediaKey, NEUTRALISED_CONTENT_TYPE, parseUploadDataUrl } from "@shared/workers/image"
import {
  KNOWLEDGE_EXTRACT_MAX_BYTES,
  KNOWLEDGE_FILE_MAX_BYTES,
  STREAM_UPLOAD_MAX_BYTES,
  KNOWLEDGE_UPLOAD_MAX_BYTES,
} from "@shared/workers/limits"
import {
  countSources,
  createFileSource,
  createSource,
  getSource,
  KNOWLEDGE_KINDS,
  listSources,
  KNOWLEDGE_SORTS,
  retrieve,
  setSourceActive,
  updateSource,
  type SourceInput,
} from "../lib/knowledge"
import { writeAnswer } from "../lib/knowledge-compose"
import { extractFile, unreadableNote } from "../lib/knowledge-files"
import { catchUp, listIngestState, sweepAll } from "../lib/knowledge-ingest"
import { googleStateKeys, sweepGoogle } from "../lib/knowledge-google"
import type { Env } from "../env"
import { INGEST_SOURCES_PER_PRESS } from "@shared/workers/limits"

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
  const kind = queryText(url.searchParams.get("kind"), "Type")
  // IN USE, OR TAKEN AWAY — an allow-list of two words, checked here so nothing
  // but our own literal ever reaches the statement (R20). Anything else is
  // dropped for the same reason an unknown kind is: a filter narrows, and
  // narrowing by a word that means nothing would answer "no sources" as if the
  // base were empty.
  const active = queryText(url.searchParams.get("active"), "In use")
  const filter = {
    // An unknown kind is dropped rather than refused: a filter is a narrowing,
    // and narrowing by a word that is not a kind would answer "nothing" as if
    // the base were empty.
    kind: kind && (KNOWLEDGE_KINDS as readonly string[]).includes(kind) ? kind : undefined,
    compartment: queryText(url.searchParams.get("compartment"), "Compartment"),
    q: queryText(url.searchParams.get("q"), "Search"),
    active: active === "yes" || active === "no" ? active : undefined,
  }
  const [page, total] = await Promise.all([
    listSources(
      cfg,
      guard,
      filter,
      queryText(url.searchParams.get("cursor"), "Cursor") ?? null,
      // WHAT ORDER — asked of the door, because the base PAGES (R14). Sorting
      // the loaded page orders the newest fifty sources and says nothing about
      // the thousands behind them.
      resolveOrdering(
        KNOWLEDGE_SORTS,
        "touched",
        queryText(url.searchParams.get("sort"), "Sort"),
        queryText(url.searchParams.get("dir"), "Direction")
      )
    ),
    // …over the SAME question the rows answered. Counting the whole base beside a
    // searched page badges a number the list cannot reach.
    countSources(cfg, guard, filter),
  ])
  // R16: the exact server total rides every list response (badges never use
  // rows.length — on a paged list that is just "50" forever).
  return pagedJson("sources", { ...page, total })
}

/** SPEND ONE AI UNIT AND WRITE THE ANSWER OUT — the only act on this module that
 * costs the team anything, kept in one function so the whole transaction reads at
 * once: claim the unit, write, give it back if nothing was written.
 *
 * NOTHING WRITTEN IS NOT AN ERROR, twice over. Out of allowance, and a model that
 * could not be reached, both end the same way: null, no charge, and the question
 * still answered with the material it found. The alternative — a 429 — would take
 * a free search away from somebody the moment the team's assistant budget ran out,
 * which is the opposite of what the budget is for.
 *
 * AND THE UNIT IS RECORDED. `logUsage` puts the question in the team's AI usage
 * log as the caller's OWN row ("prompt", so a teammate sees who spent what and
 * never what they typed). A spend nobody can find afterwards is exactly the
 * surprise this product is built not to have.
 *
 * THE GATE OPENS THIS FUNCTION, one line above the spend, because a door that
 * spends the team's money is an assistant door (workers/data-ops/test/
 * ai-cost-gate.test.ts reads both workers' routes for exactly this). It refuses
 * rather than quietly answering less than was asked for: a machine caller that
 * sets `compose` without the assistant right gets the 403 the tool description
 * promises it, not a response with a silently missing field. The SCREEN never
 * meets that refusal — it only asks when the person holds the right. */
// Exported for one reason: ai-cost-gate.test.ts indexes `export async function`
// declarations, and a spender the census cannot SEE is a spender nobody grades.
export async function payToWrite(
  env: Env,
  cfg: D1Rest,
  guard: MemberGuard,
  actor: Actor,
  question: string,
  material: KnowledgePassage[],
  sources: KnowledgeCitation[]
): Promise<string | null> {
  await requireRight(cfg, guard, "agent", "create")
  const spend = await consumeAiUnit(env, guard.teamId)
  if (!spend.ok) return null
  const source: UsageSource = spend.source === "credit" ? "credit" : "free"
  const written = await writeAnswer(env, question, material, sources)
  if (!written) {
    await refundAiUnits(env, guard.teamId, source === "free" ? 1 : 0, source === "credit" ? 1 : 0)
    return null
  }
  await logUsage(env, guard.teamId, actor, 1, source, `Knowledge base: ${question}`.slice(0, 140), "prompt")
  return written
}

/** GET /api/content/knowledge/ask — answer a question from the team's own
 * material, with citations, and WRITE THAT ANSWER OUT when asked to.
 *
 * THE FINDING IS FREE; THE WRITING IS THE COST, and that split is the whole cost
 * model of this door. Finding the material spends ONE embedding of the question —
 * a rounding error, which is why it sits with the reads in MCP.md. `compose=1`
 * additionally asks a cheap model to write the answer out of what was found, which
 * is one unit of the team's AI allowance, so it gates on the `agent` module exactly
 * as every other door that spends the allowance does. A role without the assistant
 * still gets the material, still spends nothing, and loses nothing it had
 * yesterday.
 *
 * WHY A PARAMETER RATHER THAN ALWAYS. An assistant calling this composes its own
 * reply — that IS R23's design — so writing the answer for it would spend the
 * team's allowance twice for one answer. The Knowledge tab has no assistant of its
 * own, so it asks, every time. There is no switch on the screen: the screen always
 * asks, and the MODEL decides whether a picture belongs in what it writes.
 *
 * `accountId` is how a screen says WHOSE record the question was asked from; the
 * compartment is derived from it (or from the question), never picked by hand. */
export async function getKnowledgeAsk(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, actor } = await gated(request, env, "knowledge", "read")
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
  // Checked where it sits (R20): the door reads exactly one spelling of yes, so
  // there is no truthiness anywhere on this path.
  const write = queryText(url.searchParams.get("compose"), "Compose") === "1"
  return json(
    await retrieve(env, cfg, guard, {
      question,
      accountId: queryText(url.searchParams.get("accountId"), "Account") ?? null,
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      // The writer is only ever REACHED once there is something to write about —
      // `retrieve` calls it after `found` is settled — and it gates and meters
      // itself. So a question the base cannot answer costs nothing at all.
      compose: write
        ? (material, sources) => payToWrite(env, cfg, guard, actor, question, material, sources)
        : undefined,
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
 *
 * IT FIRES BY ITSELF NOW (14.12). The app calls this once on open, in the
 * background, so somebody's Drive and diary are in step without anybody pressing
 * anything — and THAT caller sends `onlyIfStale`, which is what the door's
 * five-minute floor hangs on (`sweepGoogle` says why the floor is opt-in rather
 * than universal: a button somebody presses is a deliberate act with an expected
 * result). `skipped` comes back true when the floor bit, meaning the answer is
 * the state as of the last real sweep and Google was not asked at all.
 */
export async function postKnowledgeSyncGoogle(request: Request, env: Env): Promise<Response> {
  const { cfg, guard, body } = await gatedBody<{ onlyIfStale?: unknown }>(
    request,
    env,
    "knowledge",
    "create"
  )
  await refusePortalCaller(cfg, guard)
  await requireRight(cfg, guard, "google", "read")
  // R20, positionally: a strict comparison against a literal. Anything that is
  // not exactly `true` — absent, a string, a number — means the ordinary sweep,
  // which is the behaviour every caller had before this field existed.
  // IT KEEPS GOING UNTIL IT IS DONE, and that is what "bring it in" means.
  //
  // One press used to be one bounded slice — twenty-five rows per kind — so
  // catching up a mailbox or a Drive that had never been read meant pressing the
  // button, watching it say it had worked, and pressing it again. Nobody does
  // that thirty times. The owner's words for the whole area were "this whole
  // mechanism… is fucking painful", and this is the half of it that lives here.
  //
  // BOUNDED BY THE CLOCK, NOT BY A COUNT, because the two things that vary are
  // how much there is and how fast Google is, and neither is knowable in
  // advance. A pass that finds everything caught up stops immediately, so a
  // press with nothing to do still costs one round. The wall-clock ceiling sits
  // under the platform's own request limit with room to spare, and the passes
  // ceiling is the backstop for the case where a kind reports progress forever.
  //
  // WHATEVER IT GOT THROUGH IS KEPT. Each pass commits its own rows before the
  // next begins, so stopping at the ceiling leaves the base further ahead than
  // it was — never half a write, and never nothing.
  const startedAt = Date.now()
  const SYNC_BUDGET_MS = 50_000
  const SYNC_MAX_PASSES = 40
  let sweep = await sweepGoogle(env, cfg, guard, {
    onlyIfStale: body.onlyIfStale === true,
    // A PRESS IS NOT A TICK. Every pass re-lists the whole of each service
    // before filing anything, so the listing dominates — a bigger slice is a
    // quarter of the round trips for the same result.
    limit: INGEST_SOURCES_PER_PRESS,
  })
  let indexed = sweep.results.reduce((sum, r) => sum + r.indexed, 0)
  let passes = 1
  while (
    !sweep.skipped &&
    passes < SYNC_MAX_PASSES &&
    Date.now() - startedAt < SYNC_BUDGET_MS &&
    sweep.results.some((r) => !r.caughtUp && !r.error)
  ) {
    // `onlyIfStale` is deliberately NOT carried into the later passes: it exists
    // to stop a browser asking twice on one page load, and a pass that has just
    // finished writing is not stale in the sense that flag is about.
    sweep = await sweepGoogle(env, cfg, guard, { limit: INGEST_SOURCES_PER_PRESS })
    indexed += sweep.results.reduce((sum, r) => sum + r.indexed, 0)
    passes += 1
  }
  if (indexed > 0) await publishChange(env, guard.teamId, "knowledge")
  // WRITTEN OUT LONGHAND, and that is R27 rather than a style preference: the
  // response-key derivation reads the keys of a `json({…})` literal, and a
  // SHORTHAND property reads as a variable rather than a field name. `skipped`
  // is named in this tool's description, so it has to be derivable from the door
  // — a vocabulary exemption for a word the door could simply say is a bypass
  // with better manners (the `yours` line in DESCRIPTION_VOCABULARY is the one
  // case where the shorthand really was the clearer reading; this is not it).
  return json({
    results: sweep.results,
    skipped: sweep.skipped,
    caughtUp: sweep.results.every((r) => r.caughtUp && !r.error),
    // HOW HARD IT WORKED, so "it says it synced and nothing changed" is a
    // readable sentence rather than a mystery: `passes` says how many rounds it
    // ran and `indexed` how many sources it actually wrote. A press that finds
    // nothing new reports 1 and 0, which is a complete and honest answer.
    passes,
    indexed,
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
      `That upload is too big, the most we can take in one file is ${mb(KNOWLEDGE_FILE_MAX_BYTES)}. Nothing was saved.`
    )
  const { actor, cfg, guard, body } = await gatedBody<{
    title?: unknown
    fileName?: unknown
    fileDataUrl?: unknown
    accountId?: unknown
    visibility?: unknown
    visibleToAppId?: unknown
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
    // 12.3: limit it to one app's people. The lib refuses an app this caller
    // cannot open, so a person cannot file something into a room they are not in.
    visibleToAppId: optionalText(body.visibleToAppId, "App", TEXT_LIMITS.short) ?? null,
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

/** POST /api/content/knowledge/upload-stream — the SAME capability as the door
 * above, with the file arriving as the request body instead of inside it.
 *
 * WHY A SECOND DOOR RATHER THAN A CHANGED ONE. The upload CONTRACT differs: the
 * file is the body, so the metadata that used to sit beside it in the JSON moves
 * to the query string. A client built against the old shape must keep working —
 * it is deployed, and a browser holds its own copy of the app for as long as the
 * tab is open — so the buffered door stays exactly as it was and this one sits
 * beside it. Nothing is migrated; the new client simply picks the new door. When
 * no build in the wild uses the old one, deleting it is a separate, boring change.
 *
 * WHAT IT ACTUALLY FIXES. The buffered door's 25 MB was never a judgement about
 * files — it was the largest number that fits in a 128 MB isolate three times
 * over: `request.json()` materialises the whole body, a base64 data URL is ~4/3
 * of the file it carries, and the decode makes another copy. Here the body is
 * handed to R2 as it arrives, so the isolate holds a window rather than a file.
 * The ceiling moves from 25 MB to 90 MB, and what stops it there is the PLATFORM's
 * own request-body limit rather than anything in this code (limits.ts says so, and
 * says what the only door past it is).
 *
 * THE METADATA IS STILL VALIDATED AT THE BOUNDARY (R20), and the query string is
 * held to exactly the same positional rule the body is: every `searchParams.get`
 * sits inside a checker, never in a truthiness test and never behind a cast.
 * Moving a field from a body to a query string must not be a way to leave the
 * validation seam behind — that is precisely the substitution R20's query census
 * exists to catch.
 *
 * THE KEY CARRIES NO CALLER INPUT AT ALL. `mediaKey(teamId)` is the team's id and
 * a fresh ULID, so there is no path to contain, no dot-segment to reject and no
 * escape to think about — the strongest form of the rule `safeObjectKey` states
 * for the backup, arrived at by the key having no user-supplied segment rather
 * than by filtering one. The declared FILE NAME is a label on the row; it never
 * reaches the key.
 *
 * R21 at the door, like every other handler here. */
export async function postStreamKnowledgeFile(request: Request, env: Env): Promise<Response> {
  // The envelope first, before anything expensive — the same order the buffered
  // door learned. A `Content-Length` past the ceiling is refused with a sentence
  // rather than cut off mid-body by the edge with nothing useful to say.
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (!Number.isFinite(declared) || declared <= 0)
    return fail(411, "length_required", "That upload did not say how big it is, so we did not start it.")
  if (declared > STREAM_UPLOAD_MAX_BYTES)
    return fail(
      413,
      "too_large",
      `That upload is too big, the most we can take in one file is ${mb(STREAM_UPLOAD_MAX_BYTES)}. Nothing was saved.`
    )

  const { actor, cfg, guard } = await gated(request, env, "knowledge", "create")
  await refusePortalCaller(cfg, guard)

  // The metadata rides the query string, and every field goes through the seam.
  const url = new URL(request.url)
  // EVERY ONE THROUGH `queryText`, including the two that look like they do not
  // need it. The file name is REQUIRED, so the obvious spelling is `requireText`
  // — but R20's query census reads the call a `searchParams.get` sits inside, and
  // it is right to: a required-ness check is not a length check, and this door's
  // whole point is that its metadata moved OUT of the validated body. The
  // required-ness is a separate line below, where it reads as what it is.
  const fileName = queryText(url.searchParams.get("fileName"), "File name", TEXT_LIMITS.short)
  if (!fileName)
    return fail(400, "invalid_input", "That upload did not say what the file is called. Nothing was saved.")
  const title = queryText(url.searchParams.get("title"), "Title", TEXT_LIMITS.short) ?? fileName
  const accountId = queryText(url.searchParams.get("accountId"), "Account", TEXT_LIMITS.short) ?? null
  const visibleToAppId = queryText(url.searchParams.get("visibleToAppId"), "App", TEXT_LIMITS.short) ?? null
  // …and the same for the one read only ever compared against a literal. A
  // comparison bounds what the value MEANS, never what it COSTS to carry here.
  const privateToMe =
    queryText(url.searchParams.get("visibility"), "Visibility", TEXT_LIMITS.short) === "private"

  // The declared type is checked for SHAPE, exactly as the buffered door checks
  // it — and, exactly as there, it is never what the bytes are stored under.
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim()
  if (!ANY_FILE_TYPE.test(contentType))
    return fail(400, "invalid_input", "That upload did not say what kind of file it is. Nothing was saved.")
  if (!request.body)
    return fail(400, "invalid_input", "That upload had no file in it. Nothing was saved.")

  // STREAMED STRAIGHT THROUGH. This is the whole change: the bytes are never a
  // value in this isolate. The bucket and the label are the buffered door's, for
  // its reasons — INTERNAL_MEDIA because `/media/internal/` is served by the
  // agency gateway alone, and NEUTRALISED_CONTENT_TYPE because an object served
  // back on the app's own origin must not carry a renderable label.
  const key = mediaKey(guard.teamId)
  await env.INTERNAL_MEDIA.put(key, request.body, {
    httpMetadata: { contentType: NEUTRALISED_CONTENT_TYPE },
  })

  // READING IT IS A SEPARATE QUESTION FROM STORING IT, and now they have separate
  // ceilings. Conversion needs the bytes in memory — that is what conversion is —
  // so a file past the extract ceiling is stored and listed and SAYS it was not
  // read, which is the answer the knowledge base already gives for a file it
  // cannot convert. Storing a 60 MB archive nobody can search beats refusing it:
  // the alternative is that the material is not in the product at all.
  let extract: { text: string | null; note: string | null }
  if (declared > KNOWLEDGE_EXTRACT_MAX_BYTES) {
    extract = { text: null, note: unreadableNote(fileName) }
  } else {
    // Read back ONCE, from the object we just wrote. One copy in memory, against
    // the buffered door's three.
    const stored = await env.INTERNAL_MEDIA.get(key)
    extract = stored
      ? await extractFile(env, {
          bytes: new Uint8Array(await stored.arrayBuffer()),
          contentType,
          fileName,
        })
      : { text: null, note: unreadableNote(fileName) }
  }

  const id = await createFileSource(env, cfg, guard, actor, {
    title,
    accountId,
    privateToMe,
    visibleToAppId,
    file: { url: `/media/internal/${key}`, name: fileName, type: contentType, bytes: declared },
    extract,
  })
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
