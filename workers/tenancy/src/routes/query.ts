// THE QUERY DOORS — two of them, standing in for fifty tools.
//
// `GET /api/tenancy/query/describe` says what a module HAS: its fields, their
// types, and the values an enum accepts (including the ones the TEAM edits,
// read live off their own dropdown list).
// `GET /api/tenancy/query`          asks a module something: filters, an
// optional grouped count, an order, a page.
//
// WHY THEY LIVE ON TENANCY. The team database is ONE database per team, and
// this worker already serves the app's only other generic, module-spanning read
// — the activity feed, which resolves a module GATE from the table being asked
// about (`ACTIVITY_GATE_MAP`) rather than naming one at the door. These doors
// are the same shape one step further along: the module named in the request
// resolves to a table AND to the permission that table's own list door gates on,
// so nothing here is readable that was not already readable one screen at a time.
//
// WHAT THEY GRANT: nothing. `requireRight(<the module's own right>, "read")` is
// the same gate the module's list door opens with, and `refusePortalCaller`
// closes the door on a client login outright (R21) — a generic reader over the
// agency's own material is not a thing a client login is ever handed, and
// refusing at the door is what survives somebody adding a line to the portal
// gateway's allow-list.

import { fail, json, pagedJson } from "@shared/workers/http"
import { d1Query } from "@shared/workers/d1-rest"
import { GuardError, requireRight, rightsSheet, teamContext } from "@shared/workers/gating"
import { refusePortalCaller } from "@shared/workers/account-scope"
import { LIST_HARD_CAP } from "@shared/workers/limits"
import { queryText, TEXT_LIMITS } from "@shared/workers/validate"
import {
  canonicalModule,
  MODULE_ALIASES,
  QUERY_MODULES,
  QUERY_MODULE_NAMES,
  QUERY_OPS,
  queryModule,
  suggestModule,
} from "@shared/workers/query-grammar"
import { parseQuery, runQuery } from "../lib/query-engine"
import type { Env } from "../env"

/** HOW MANY NAMES `describe_module` LISTS for one reference field (R14: a hard
 * cap, and a small one). It is a hint for composing a filter, not a collection
 * read — a caller who wants the whole list asks `query_records` for it, and one
 * that hits this ceiling is told so rather than handed a quietly short list. */
const CHOICE_CAP = 60

/** The one sentence a caller sees when they name something that is not a module.
 *
 * It names the alternatives, and it LEADS WITH THE NEAREST ONE. Listing them all
 * was not enough on its own: asked the owner's own question on staging on 29 Aug
 * 2026, the assistant asked for `help`, read a refusal that listed every module,
 * correctly worked out from it that the module is called `tickets` — and then
 * OFFERED to do the work rather than retrying. A refusal that has to be reasoned
 * about costs a whole turn; one that says "did you mean" is a correction the
 * model can act on in the same breath.
 *
 * (`help` itself now RESOLVES — see MODULE_ALIASES — so it never reaches here.
 * This is for the next name nobody thought of.) */
const unknownModule = (name: string | undefined) => {
  const near = suggestModule(name)
  return fail(
    400,
    "unknown_module",
    `There is nothing here called "${name ?? ""}".` +
      (near.length === 1 ? ` Did you mean "${near[0]}"?` : "") +
      (near.length > 1 ? ` That covers ${near.join(", ")} — ask for one of those.` : "") +
      ` You can query: ${QUERY_MODULE_NAMES.join(", ")}.`
  )
}

/** Parse a JSON-shaped query parameter that has ALREADY been through the
 * boundary seam.
 *
 * It takes the CAPPED text, not the raw parameter, and R20's positional rule is
 * why: the census reads the call a raw query-parameter read sits directly
 * inside, so handing one to this function instead would hide the cap a level
 * deeper — a check a reader of the door cannot see is a check the law does not
 * count, and rightly. So the door caps at the door and passes the result here.
 * (The offending shape is not spelled out above on purpose: that census reads
 * this file's text, comments and all, so an example of the wrong thing IS the
 * wrong thing as far as it can tell.)
 *
 * Malformed JSON is a clean 400 that says WHICH parameter, because a model given
 * a bare "bad request" retries the same thing. */
function jsonParam(text: string | undefined, field: string): unknown {
  if (text === undefined) return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw new GuardError(400, "invalid_query", `\`${field}\` isn't valid JSON.`)
  }
}

/**
 * GET /api/tenancy/query/describe — what a module has.
 *
 * With `module`: that module's fields, each with its type, whether it is bulky
 * (left out of the default projection), what it points at, and — for an enum —
 * the values it accepts. A team-edited vocabulary is read LIVE off the team's own
 * dropdown list, because those words are theirs and change without a deploy.
 * A reference field marked `choices` also carries the names IN USE on this
 * module, so a caller composing a filter can see that the client is spelled
 * "FluClinic" before searching for "flu clinic" and finding nothing.
 *
 * Without `module`: the modules this caller may read, and one line each. Gated
 * per module from the caller's own rights sheet, so the catalogue a person sees
 * is the catalogue they can actually use.
 */
export async function getQueryDescribe(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await refusePortalCaller(cfg, guard)
  const url = new URL(request.url)
  const name = queryText(url.searchParams.get("module"), "Module")

  if (!name) {
    const held = await rightsSheet(cfg, guard)
    return json({
      modules: QUERY_MODULE_NAMES.filter((n) => held.has(`${QUERY_MODULES[n].module}:read`)).map(
        (n) => ({
          name: n,
          summary: QUERY_MODULES[n].summary,
          permission: QUERY_MODULES[n].module,
          // THE OTHER NAMES IT ANSWERS TO, said up front rather than discovered
          // by being refused. `tickets` also answers to `help`, which is what
          // every other tool in the catalogue calls it.
          ...(Object.entries(MODULE_ALIASES).some(([, key]) => key === n)
            ? { alsoCalled: Object.entries(MODULE_ALIASES).filter(([, key]) => key === n).map(([a]) => a) }
            : {}),
        })
      ),
      ops: QUERY_OPS,
    })
  }

  const mod = queryModule(name)
  if (!mod) return unknownModule(name)
  await requireRight(cfg, guard, mod.module, "read")

  // THE NAMES A CALLER CAN ACTUALLY FILTER ON. Only the ones IN USE on this
  // module — the clients who have tickets, not every company in the book — so
  // one small extra read answers the question a caller really has. See `choices`
  // in the grammar for the confusion it exists to end: an empty result cannot
  // tell you whether you spelled the client wrong or asked about one that isn't
  // here, and both happen.
  //
  // GATED, and per referenced module: the names belong to that module, so they
  // come out only if this caller may read it. A field whose target they cannot
  // read comes back without them rather than being refused.
  const held = await rightsSheet(cfg, guard)
  const choices = new Map<string, { names: string[]; more: boolean }>()
  for (const f of mod.fields) {
    if (!f.choices || !f.ref) continue
    const target = queryModule(f.ref)
    if (!target || !held.has(`${target.module}:read`)) continue
    // R14 — a hard cap, said at the query. Small on purpose: this is a hint for
    // composing a filter, not a collection read, and a caller who needs the
    // whole list asks query_records for it.
    const rows = await d1Query<{ label: string | null }>(
      cfg,
      guard.databaseId,
      `SELECT DISTINCT r.${target.labelColumn} AS label
         FROM ${mod.table} t JOIN ${target.table} r ON r.id = t.${f.column}
        WHERE t.${f.column} IS NOT NULL
        ORDER BY label LIMIT ${CHOICE_CAP + 1}`
    )
    const names = rows.map((r) => r.label).filter((v): v is string => !!v)
    choices.set(f.name, { names: names.slice(0, CHOICE_CAP), more: names.length > CHOICE_CAP })
  }

  // The team's own words for the fields that have them. ONE bounded read for all
  // of them (R14: LIST_HARD_CAP), not one per field — a module declares at most a
  // handful of vocabularies and this door is called once per question.
  const groups = [...new Set(mod.fields.map((f) => f.vocabulary).filter((v): v is string => !!v))]
  const vocab = new Map<string, string[]>()
  if (groups.length) {
    const rows = await d1Query<{ type: string; value: string }>(
      cfg,
      guard.databaseId,
      `SELECT type, value FROM selectable_data
        WHERE deactivated_at IS NULL AND type IN (${groups.map(() => "?").join(", ")})
        ORDER BY value LIMIT ${LIST_HARD_CAP}`,
      groups
    )
    for (const r of rows) vocab.set(r.type, [...(vocab.get(r.type) ?? []), r.value])
  }

  const canonical = canonicalModule(name)!
  return json({
    module: canonical,
    // The caller reached the right module by another of its names. Saying so is
    // how they learn the right one instead of using the other for the rest of
    // the conversation.
    ...(canonical === name ? {} : { askedAs: name }),
    summary: mod.summary,
    permission: `${mod.module}:read`,
    defaultSort: mod.defaultSort,
    ops: QUERY_OPS,
    fields: mod.fields.map((f) => ({
      name: f.name,
      type: f.type,
      ...(f.values ? { values: f.values } : {}),
      ...(f.vocabulary ? { values: vocab.get(f.vocabulary) ?? [], editable: true } : {}),
      ...(f.ref ? { references: f.ref } : {}),
      ...(choices.has(f.name)
        ? {
            inUse: choices.get(f.name)!.names,
            ...(choices.get(f.name)!.more ? { inUseCapped: true } : {}),
          }
        : {}),
      ...(f.bulky ? { bulky: true } : {}),
      ...(f.note ? { note: f.note } : {}),
    })),
  })
}

/**
 * GET /api/tenancy/query — ask a module a question.
 *
 * `module` picks the table (from the allow-list, and from nowhere else);
 * `countOnly` answers with the number and no rows at all;
 * `where` is a JSON list of {field, op, value}; `groupBy` is a JSON list of
 * field names, which turns the answer into counts; `fields` narrows the
 * projection; `sort`/`dir` order it; `cursor` walks it.
 *
 * The answer always goes through `pagedJson` (R14), so a caller reads one shape
 * whether they asked for rows or for a tally: `records` (empty when grouping),
 * the exact `total` over the SAME filters, `hasMore`, `nextCursor`, `groups`,
 * and `unmatched` — the filter values that named nothing here, which belong
 * beside the total because a caller who does not receive them will state a
 * correct number about a wider set than it covers.
 */
export async function getQueryRecords(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  await refusePortalCaller(cfg, guard)
  const url = new URL(request.url)
  const name = queryText(url.searchParams.get("module"), "Module")
  const mod = queryModule(name)
  if (!mod) return unknownModule(name)
  // The module's OWN read right — the same gate its list door opens with. This
  // door is a better question over rows the caller could already read one screen
  // at a time; it is not a wider set of rows.
  await requireRight(cfg, guard, mod.module, "read")

  const parsed = parseQuery(mod, {
    // Each capped AT the boundary (R20, positionally), then parsed — a
    // multi-megabyte `?where=` is a clean 400 rather than a JSON.parse that
    // stalls the worker. `long` rather than the default `short`: a filter list
    // is a structure, not a facet value.
    where: jsonParam(queryText(url.searchParams.get("where"), "Filter", TEXT_LIMITS.long), "where"),
    groupBy: jsonParam(queryText(url.searchParams.get("groupBy"), "Group by", TEXT_LIMITS.short), "groupBy"),
    fields: jsonParam(queryText(url.searchParams.get("fields"), "Fields", TEXT_LIMITS.long), "fields"),
    countOnly: queryText(url.searchParams.get("countOnly"), "Count only") === "true",
    sort: queryText(url.searchParams.get("sort"), "Sort"),
    dir: queryText(url.searchParams.get("dir"), "Direction"),
    cursor: queryText(url.searchParams.get("cursor"), "Cursor") ?? null,
  })

  // The reference tables a filter or a labelled group may reach — resolved from
  // the SAME allow-list, so a `ref` that names nothing declared simply is not one.
  const answer = await runQuery(cfg, guard, mod, parsed, QUERY_MODULES)
  const canonical = canonicalModule(name)!
  return pagedJson("records", { ...answer.page, total: answer.total }, {
    module: canonical,
    ...(canonical === name ? {} : { askedAs: name }),
    ...(answer.groups ? { groups: answer.groups, groupsTruncated: answer.groupsTruncated } : {}),
    // WHAT THE NUMBER EXCLUDES, beside the number. A filter value that named
    // nothing is a fact about the answer, not a detail of how it was computed —
    // see `Unmatched` in the engine for the sentence that made it necessary.
    ...(answer.unmatched.length ? { unmatched: answer.unmatched } : {}),
    ...(answer.sort ? { sort: answer.sort, dir: answer.dir } : {}),
  })
}
