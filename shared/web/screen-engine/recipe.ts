// =============================================================================
// Screen recipes — the serializable contract for the config-driven SCREEN ENGINE.
//
// A `ScreenRecipe` describes a whole screen as DATA: which module it binds to,
// the fields, the actions, who may see it (gating), and how it's presented. The
// engine (registry/collections/screen-renderer) renders a recipe by COMPOSING
// the library's existing collections + primitives — so screens are served at
// runtime and reconfigured without a code deploy.
//
// This file is pure (types + URL/gating helpers, no React) so the LIBRARY owns
// the contract and the consuming app just imports it. The engine renders recipes
// and speaks the URL grammar; it does NOT fetch data, call APIs, store recipes,
// or own the router — those are the host app's job.
// =============================================================================

import { type CollectionConfig, type FieldConfig } from "./config"

/* ------------------------------- screen ------------------------------- */

export type ScreenType =
  | "list"
  | "detail"
  | "edit"
  | "add"
  | "confirm"
  | "custom"

/** "responsive" = overlay on desktop / full-screen sheet on mobile (default).
 *  The other three force one mode. Overlays/edit/add/confirm render as a LAYER. */
export type ScreenPresentation =
  | "responsive"
  | "overlay"
  | "sheet"
  | "fullscreen"

export type ScreenRight = "read" | "create" | "edit" | "delete"

export type RecipeFieldType =
  | "text"
  | "number"
  | "choice"
  | "image"
  | "date"
  | "switch"
  | "notes"

/** The action button styles map 1:1 to the Button primitive's variants.
 *
 * `outline` is gone: a button carries no border in any state, so a secondary
 * action is a FILLED button in the other paper tone. A recipe is DATA, so this
 * union is what stops a screen asking for a variant the button no longer has —
 * it fails at the type level rather than rendering something arbitrary. */
export type ActionVariant =
  | "default"
  | "secondary"
  | "text"
  | "ghost"
  | "destructive"
  | "link"

/** Which module + right a screen / field / action requires. The engine hides it
 *  by default when the caller lacks the right; `showWhenDenied: "disabled"`
 *  renders it greyed instead. (Convenience only — the host MUST re-check on the
 *  server for every fetch + action.) */
export interface ScreenGate {
  module: string
  right: ScreenRight
  showWhenDenied?: "hidden" | "disabled"
}

/** What the screen reads/writes: a module id (+ optional named data source). */
export interface ScreenBinding {
  module: string
  source?: string
}

/** One field: the record column it binds to, its input type, and the library
 *  `FieldConfig` (label / required / validation / helpText) that frames it. */
export interface RecipeField {
  column: string
  type: RecipeFieldType
  field: FieldConfig
  /** For `choice`: a key into the injected `options` map (host supplies the list). */
  optionsFrom?: string
  gate?: ScreenGate
}

/** A named action the host dispatches (e.g. "members.changeRole"). */
export interface RecipeAction {
  id: string
  label: string
  action: string
  variant?: ActionVariant
  /** Ask first (renders a confirm step before firing). */
  confirm?: { title: string; body: string; variant?: "default" | "destructive" }
  /** Named hooks the host runs around the action. */
  before?: string
  after?: string
  gate?: ScreenGate
}

/* ------------------------ blocks + custom layout ------------------------ */

/** A leaf of content, each one a library collection. Used by detail tabs and by
 *  custom layouts. */
export type RecipeBlock =
  | {
      kind: "description"
      columns?: 1 | 2
      rows: { label: string; column: string }[]
    }
  | { kind: "fields" }
  | { kind: "activity"; source: string }
  | { kind: "list"; binding: ScreenBinding; collection?: CollectionConfig }

/** The tree composed by a `custom` screen — stacks/rows of blocks. A `row`
 *  wraps (stacks) on mobile per UI-RULES; it never forces horizontal scroll. */
export type RecipeNode =
  | { node: "stack"; gap?: "sm" | "md" | "lg"; children: RecipeNode[] }
  | { node: "row"; gap?: "sm" | "md" | "lg"; children: RecipeNode[] }
  | { node: "block"; block: RecipeBlock; gate?: ScreenGate }

/** A detail-screen tab (e.g. Overview = description, Activity = activity feed). */
export interface RecipeTab {
  key: string
  label: string
  /** lucide icon name (kebab-case), optional. */
  icon?: string
  /** Count/status shown as a pill after the label (e.g. `"12"`, `"3 new"`).
   *  Pre-formatted by the host — the renderer never computes it. Omit for none. */
  badge?: string
  /** Badge tone, passed through to the Tabs primitive. Omit for the default.
   *  Kept in step with the Badge primitive's variants on purpose — a recipe is
   *  data, so an unknown tone must fail at the type level, not render wrong. */
  badgeVariant?:
    | "default"
    | "secondary"
    | "outline"
    | "destructive"
    | "success"
    | "warning"
  block: RecipeBlock
}

/** Where the detail header pulls its title/subtitle/avatar from (record columns). */
export interface ScreenHeader {
  title: string
  subtitle?: string
  /** The column holding the record's picture. Omit and the header draws NO
   *  avatar at all — not an initials circle: a screen with no picture concept
   *  should not open with two letters of its own title in a disc. */
  avatar?: string
  /** How that picture is cropped. Default "circle"; "square" for a logo or
   *  wordmark, which a circular crop renders unreadable. Ignored when `avatar`
   *  is omitted (there is nothing to crop). */
  avatarShape?: "circle" | "square"
}

/** The whole screen, as data. */
export interface ScreenRecipe {
  type: ScreenType
  /** Default "responsive" when omitted. */
  presentation?: ScreenPresentation
  binding: ScreenBinding
  /** Columns (list), form inputs (edit/add), or description rows (detail). */
  fields: RecipeField[]
  actions: RecipeAction[]
  /** Screen-level access gate (hidden by default when denied). */
  gate?: ScreenGate
  /** detail: the header + the tab set. */
  header?: ScreenHeader
  tabs?: RecipeTab[]
  /** list: how the rows render + the collection (search/filter/sort/pages). */
  display?: "table" | "list" | "cards" | "gallery"
  collection?: CollectionConfig
  /** list (display: "list"): the List surface. Omit (or "card") for the default
   * bordered surface; "none" = flat, for when the host wraps the collection in
   * its own card and wants a single clean box, not a card-in-card. */
  surface?: "card" | "none"
  /** list: the column holding each row's leading visual — an avatar, logo or
   * type mark the HOST has already rendered into the row (a `Row` value is
   * `unknown`, so a React node is a legal one). Read exactly as `fields[0]` is
   * read for the title, and drawn in the List's `leading` slot / the CardGrid's
   * `media` slot. Omit and nothing is drawn, which is every existing caller —
   * there is deliberately no default mark, because an empty grey square on
   * every row of a list that has no pictures is worse than plain text rows.
   * A column holding a plain string renders as that string, so point this at
   * the shaped node, not at a raw `logoUrl`. */
  leading?: string
  /** list (display: "gallery"): the column holding each row's picture, as a
   * plain URL STRING — deliberately not `leading`, which the list/card
   * displays read as an already-rendered node (a shaped `mark`). The kit's
   * `Gallery` needs the raw `src` itself, not a picture already wrapped in a
   * `RecordMark`, so this points at a second, plainer column. A row with
   * nothing at this column draws Gallery's own no-image register (the title
   * on soft paper) rather than an empty box — that is `Gallery`'s state, not
   * a fallback this engine invents. */
  image?: string
  /** custom: the composed tree. */
  layout?: RecipeNode
  /** confirm: the prompt. */
  confirm?: { title: string; body: string; variant?: "default" | "destructive" }
}

/* ------------------------------- rights ------------------------------- */

export interface ModuleRights {
  read: boolean
  create: boolean
  edit: boolean
  delete: boolean
}

/** Per-module rights, injected by the host (after its OWN server check). */
export type ScreenRights = Record<string, ModuleRights>

/** True when `rights` grant the gate (or there is no gate). */
export function hasRight(
  rights: ScreenRights,
  gate: Pick<ScreenGate, "module" | "right"> | undefined
): boolean {
  if (!gate) return true
  return Boolean(rights[gate.module]?.[gate.right])
}

/** How a gated element should render. */
export type GateState = "show" | "hidden" | "disabled"

export function gateState(
  rights: ScreenRights,
  gate: ScreenGate | undefined
): GateState {
  if (!gate) return "show"
  if (hasRight(rights, gate)) return "show"
  return gate.showWhenDenied === "disabled" ? "disabled" : "hidden"
}

/* ------------------------- deep-link URL grammar ------------------------- */
// PATH  = the record spine: /<module>/<id>/<childModule>/<childId>/…
//         (the host prefixes a tenant segment, e.g. /t/<teamId>).
// QUERY = the transient layer: ?panel=edit|add(&module=…) · ?confirm=<action>&id=<id> · ?tab=<key>

export interface ScreenLevel {
  module: string
  /** "" = the list/collection level (no record selected). */
  id: string
}

/** Turn the path segments (after any tenant prefix) into record levels. Pairs of
 *  (module, id); a trailing lone module is a list level (id ""). */
export function parseScreenPath(segments: string[]): ScreenLevel[] {
  const out: ScreenLevel[] = []
  for (let i = 0; i < segments.length; i += 2) {
    const module = segments[i]
    if (!module) continue
    out.push({ module, id: segments[i + 1] ?? "" })
  }
  return out
}

export interface ScreenQuery {
  panel?: "edit" | "add"
  /** the module for `panel=add`. */
  module?: string
  confirm?: string
  id?: string
  tab?: string
}

export function parseScreenQuery(
  searchParams: URLSearchParams | Record<string, string | undefined>
): ScreenQuery {
  const get = (k: string): string | undefined =>
    searchParams instanceof URLSearchParams
      ? (searchParams.get(k) ?? undefined)
      : searchParams[k]
  const q: ScreenQuery = {}
  const panel = get("panel")
  if (panel === "edit" || panel === "add") q.panel = panel
  const module = get("module")
  if (module) q.module = module
  const confirm = get("confirm")
  if (confirm) q.confirm = confirm
  const id = get("id")
  if (id) q.id = id
  const tab = get("tab")
  if (tab) q.tab = tab
  return q
}

/** Build the query string (with leading "?", or "" when empty). */
export function buildScreenQuery(state: ScreenQuery): string {
  const p = new URLSearchParams()
  if (state.panel) p.set("panel", state.panel)
  if (state.module) p.set("module", state.module)
  if (state.confirm) p.set("confirm", state.confirm)
  if (state.id) p.set("id", state.id)
  if (state.tab) p.set("tab", state.tab)
  const s = p.toString()
  return s ? `?${s}` : ""
}

/* ------------------------------ breadcrumbs ------------------------------ */

export interface Crumb {
  label: string
  href: string
  module: string
  id: string
}
