"use client"

// CollectionFrame — the shared "chrome" every collection wears. You hand it the
// FULL row array plus a function that renders one page of rows; it applies the
// Glide-style collection config for you:
//   • title           — an optional header
//   • filter / sort    — EXECUTED here (via selectRows) from the config's rules
//   • searchable       — a debounced SearchInput that filters the named columns
//   • userFilter       — a FilterBar of `filterFacets` (the design kit's own
//                        filter row: a chip per facet that is on, and the facet
//                        controls behind its "+ filter" slot)
//   • showCount        — a LIVE "Showing X of Y" that reacts to search + facets
//   • limit            — caps the TOTAL rows (e.g. "only ever show 50")
//   • itemsPerPage     — paginates the (filtered) rows, with a Prev/Next pager
// The data math lives in lib/collection (selectRows) so it stays unit-tested;
// one component so List, Card, Table, etc. all behave identically — no repeat.
//
// SERVER-SIDE seam: pass `serverSide` + `onQueryChange` and the frame stops
// filtering in memory — it emits the (debounced) query + facets and renders
// whatever `data` it's handed, so an app can refetch (?q= / FTS5) later.

import * as React from "react"
import { ArrowUpDown, Plus } from "@shared/ui/foundations/icons"

import { facetOptions, selectRows } from "./collection"
import { useRemembered } from "@shared/web/remembered"
import { type CollectionConfig } from "./config"
import { cn } from "@shared/ui/lib/utils"
import { useT } from "@shared/web/language"
import { Button } from "@shared/ui/components/button/button"
import { FilterBar } from "./filter-bar"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@shared/ui/components/pagination/pagination"
import { SortControl } from "@shared/ui/components/sort-control/sort-control"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@shared/ui/components/popover/popover"
import { SearchInput } from "@shared/ui/components/search-input/search-input"
import { Tooltip, TooltipTrigger, TooltipContent } from "@shared/ui/components/tooltip/tooltip"
import { Headline, Text } from "@shared/ui/components/typography/typography"
import { useDebouncedCallback } from "@shared/ui/components/use-debounce/use-debounce"
import { useIsVisible } from "./visibility"
import { ShapeStateBody, type ShapeStateCopy } from "@shared/ui/compositions/states/states"
import { CollectionFrame as KitCollectionFrame } from "@shared/ui/components/collection-frame/collection-frame"

/** THE SECTION'S OWN CREATE ACTION, published to the collection inside it.
 *
 * An empty collection is the FIRST thing a new team meets on every screen, and
 * it was a dashed box, an optional glyph and one grey sentence with no way out
 * of it — sixteen times over. The one thing a zero state has to do is name the
 * next act, and the frame could not: the create button lives in the host ABOVE
 * the collection (`SectionWithCreate`), and the frame is handed only rows and a
 * config.
 *
 * So the host publishes what it already has — the label it puts on that button,
 * its glyph, and its handler — and the frame reads it where it needs it. A
 * context rather than a prop because the frame is reached through the screen
 * engine, several layers below the host, and threading one optional action
 * through every recipe path would be the same decision written eleven times.
 * It is the arrangement R16's count arbitration already uses for the same
 * reason. A collection with no host above it (the client portal draws its own)
 * simply gets `null` and renders the sentence alone, exactly as before. */
export type CollectionCreateAction = {
  /** The host's own word for the act — already translated where it is set. */
  label: string
  /** The host's glyph, so the two buttons for one act cannot disagree. */
  icon?: React.ReactNode
  onCreate: () => void
  /**
   * THE COLLECTION'S OWN IMPORT ACT, published beside its create act — never
   * invented here. A caller passes this only where a real CSV import target
   * exists for this record type (`workers/data-ops/src/lib/targets.ts`) AND
   * the reader holds the right to run it; most nested collections have
   * neither and this stays `undefined`, which is the only way "Import a
   * list" does not appear on a screen with nothing to import (composition
   * 27.21's own doors-differ clause — the portal has no second action, and
   * an agency collection with no import target is the same absence for a
   * different reason). `SectionWithCreate`'s own `secondary` prop is this
   * same act, already gated by `secondary.show` there — this is that act,
   * carried one layer further down to where the empty body actually draws.
   */
  secondary?: { label: string; onClick: () => void }
}

const CreateActionContext = React.createContext<CollectionCreateAction | null>(null)

/** THE PUBLISHED CREATE ACTION, DRAWN — a glyph and nothing else (UI-RULEBOOK
 * B3 / CHECKLIST 11.7, client ruling 2026-08-31: "+ actions never have a
 * word, they are only the + icon"). `label` becomes the button's accessible
 * name and its tooltip, the same seam `screen-bits.tsx`'s own `AddButton`
 * draws from — one function, so the toolbar button and the filtered-empty
 * state's CTA cannot drift into two different shapes for one act. The
 * GENUINELY-empty body no longer calls this — see `CollectionEmptyState`
 * below, which carries composition 27.21's one carved-out exception: "the
 * only place a labelled create button is allowed". */
function createActionButton(action: CollectionCreateAction, className?: string) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" onClick={action.onCreate} aria-label={action.label} className={className}>
          {action.icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{action.label}</TooltipContent>
    </Tooltip>
  )
}

export function CollectionCreateActionProvider({
  action,
  children,
}: {
  action: CollectionCreateAction | null
  children: React.ReactNode
}) {
  return <CreateActionContext.Provider value={action}>{children}</CreateActionContext.Provider>
}

/** THE KIT'S OWN "NOTHING IN THIS COLLECTION YET" REGISTER, drawn to the exact
 * composition (`shared/ui/compositions/states/empty-collection.tsx`, 27.21)
 * this engine's own `useKitPanel` branch already approximated — this is that
 * approximation, finished, and pulled out so a hand-rolled nested panel
 * (work-panels.tsx and its dozen siblings) can draw the identical register
 * instead of a fourth version of "a bare grey line".
 *
 * WHY IT WAS WRONG BEFORE (the client's own screenshot, 2026-09-01): a
 * genuinely-empty collection drew ONE icon-only mango, no sentence, no way to
 * import — the plainest reading of `createActionButton` above reused for a
 * screen 27.21 explicitly carves an exception for. "The one mango" rule (B3)
 * governs every OTHER button in the app; this is composition 27.21's own
 * named exception to it: "Add the first takes the one mango — the only place
 * a labelled create button is allowed, because there is no toolbar + to lean
 * on and the screen exists to be filled."
 *
 * TWO BUTTONS, NEITHER INVENTED. `onCreate` absent (a reader with no create
 * right) draws no button at all — TEN STATES #10 in the composition's own
 * doc: "the control is then absent, never dimmed". `onImport` absent (no CSV
 * target for this record, or the reader lacks the right) likewise draws
 * nothing — never a button that would 404 or refuse. */
export function CollectionEmptyState({
  title,
  description,
  onCreate,
  onImport,
  className,
}: {
  /** The collection's own word for what's missing — `config.emptyText`,
   * translated at the call site. */
  title: string
  /** 27.21: "One sentence naming the two routes". Defaults to the
   * composition's own words, verbatim, for a caller with nothing more
   * specific to say. */
  description?: string
  /** The one mango on this register — composition 27.21's own exception to
   * B3. Absent draws no button (a reader with no create right). */
  onCreate?: () => void
  /** The paper action beside it — absent unless a real import target exists
   * for this record AND the reader may run it. */
  onImport?: () => void
  className?: string
}) {
  const t = useT()
  return (
    <div
      data-slot="collection-empty-body"
      className={cn("flex min-w-0 flex-col items-start gap-3 py-[var(--space-7)]", className)}
    >
      <Headline as="h3" size="h3">
        {title}
      </Headline>
      <Text as="p" size="sm" tone="secondary" measure>
        {description ??
          t(
            "Records land here when someone adds one, or when a client raises a request from the portal. The first one takes a minute."
          )}
      </Text>
      {(onCreate || onImport) && (
        <div className="mt-2 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
          {onCreate && (
            <Button onClick={onCreate} className="gap-1">
              <Plus className="size-4" />
              {t("Add the first")}
            </Button>
          )}
          {onImport && (
            <Button variant="secondary" onClick={onImport}>
              {t("Import a list")}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function CollectionFrame<T>({
  config,
  data,
  searchKeys,
  renderItems,
  serverSide = false,
  onQueryChange,
  modal = false,
  memoryKey,
  className,
  state = "ready",
  copy,
  errorAction,
  useKitPanel = false,
  band,
}: {
  config: CollectionConfig
  data: T[]
  /** Object keys searched when the user types in the search box. */
  searchKeys: (keyof T)[]
  /** Render one page of rows (the frame slices them for you). */
  renderItems: (rows: T[]) => React.ReactNode
  /** When true, the frame does NOT filter/search/sort/paginate in memory — it
   * renders `data` as given and emits the query state via `onQueryChange` (the
   * app refetches). */
  serverSide?: boolean
  /** Notified (query already debounced by SearchInput) whenever the user changes
   * WHAT THEY'RE ASKING FOR — query, facets, or sort. One seam, not three: this
   * is everything a server-side host needs to build its next request. */
  onQueryChange?: (state: {
    query: string
    facetValues: Record<string, string>
    sortBy: string
    sortDir: "asc" | "desc"
  }) => void
  /** Set `true` when the collection can render inside a Dialog/Sheet, so the
   *  filter/sort popovers stay scrollable under the dialog's scroll lock. */
  modal?: boolean
  /** WHICH COLLECTION THIS IS, for the nav memory — the module a recipe binds
   * to, where a caller knows it. Two collections on one screen need two names or
   * they would hand each other their search box; a caller that says nothing gets
   * one derived from the config, which is stable for as long as the screen is.
   * Nothing is remembered at all where no host has provided a memory (the client
   * portal), so this is inert there. */
  memoryKey?: string
  className?: string
  /**
   * Loading, or a failed read. Law 4: the header (search/filter/sort) stays
   * drawn and only the rows region swaps — the same rule the record screens
   * were just migrated to (RecordScreen's `state`). Omit for a caller not yet
   * passing one; `"ready"` is the default and every existing call site keeps
   * behaving exactly as it did before this prop existed. A caller in
   * `"loading"`/`"error"` may pass `data={[]}` — it is never read as "the
   * collection is empty" the way it would have been before, because
   * `filtered.length === 0` is only consulted once `state` is `"ready"`.
   */
  state?: "ready" | "loading" | "error"
  /** Per-locale words for the loading/empty/no-results/error registers. */
  copy?: Partial<ShapeStateCopy>
  /** The one next step offered on a failed read (a Retry button, typically). */
  errorAction?: React.ReactNode
  /**
   * PROTOTYPE, ONE CALLER AT A TIME (COMPOSITION-MISMATCHES.md, the
   * CollectionFrame entry). Draws the header/toolbar/panel through the kit's
   * own `components/collection-frame/collection-frame.tsx` instead of this
   * file's hand-rolled header and the host's `CollectionCard` box — the
   * owner's ruling on the double-box question ("make the kit override
   * whatever we have"). The state-switch body (`ShapeStateBody`) is
   * UNCHANGED either way; only the chrome around it moves. Defaults to
   * `false` so every existing call site keeps its current, unreviewed-change
   * markup until this is verified and rolled out on purpose.
   */
  useKitPanel?: boolean
  /**
   * PROTOTYPE, ONE COLLECTION (Tickets). One line of standing, inside the
   * panel, above the toolbar — the kit's `band` slot
   * (`components/collection-frame/collection-frame.tsx`), which its own doc
   * says exactly one composition draws: `states/archive.tsx`'s "the band
   * states the consequences in one line: history kept, still searchable,
   * not counted in the figures." A host passes this only while its own
   * archived/put-away tab is the one open; `useKitPanel` is required
   * because the band has nowhere to go in the legacy header. See
   * COMPOSITION-MISMATCHES.md's archive entry for what this does and does
   * NOT cover — the row-ink quieting and the Status/Updated → Archived
   * by/Archived column swap are NOT this prop, and are not built here.
   */
  band?: React.ReactNode
}) {
  const t = useT()
  const createAction = React.useContext(CreateActionContext)
  // ── WHAT THIS COLLECTION WAS BEING ASKED, WHEN SHE LEFT IT ─────────────────
  //
  // The four controls in this header are the "what she had typed" and "which
  // filters were set" halves of the nav memory. They are remembered as ONE slot
  // because they are one question: a search with the filters dropped off it is
  // a different question, and restoring half of it would be worse than
  // restoring none. `slot` names this collection within the screen — see the
  // `memoryKey` prop.
  //
  // THE PAGE IS DELIBERATELY NOT IN IT. Two reasons, and they are the same
  // reason twice. A GROWING collection (R14) does not have pages: it has a
  // cursor, its rows accumulate in the shared store, and that store already
  // survives navigation — so there is nothing here to remember and a cursor
  // minted before the rows moved would be R14's silent loss, answering about a
  // window that has shifted. A BOUNDED one is paged in memory over rows that
  // are live (R15), so "page three" names a position in a list that may have
  // re-sorted under her: the same number, a different three rows. The filter is
  // the durable half of what she was doing; the offset into it is not. She
  // comes back to the top of her filtered list.
  const slot = `find:${memoryKey ?? (config.title || searchKeys.join(","))}`
  const [asked, remember] = useRemembered<{
    query: string
    facetValues: Record<string, string>
    sortBy: string
    sortDir: "asc" | "desc"
  }>(
    slot,
    () => ({ query: "", facetValues: {}, sortBy: config.sortBy, sortDir: config.sortDir }),
    (found) => {
      // A REMEMBERED FILTER WHOSE OPTION NO LONGER EXISTS. A dropdown value can
      // be retired while she is away, and a facet's choices are often derived
      // from the rows themselves — so a remembered selection is checked against
      // what this collection can actually offer TODAY, and a selection nothing
      // can satisfy is dropped rather than restored. The rest of the question
      // survives: losing one retired filter should not throw away her search.
      // A `range` facet has no option list to check against, so its value is
      // syntax rather than vocabulary and is kept.
      if (!found || typeof found !== "object") return undefined
      const was = found as Record<string, unknown>
      const facets: Record<string, string> = {}
      for (const [field, value] of Object.entries(
        (was.facetValues as Record<string, string>) ?? {}
      )) {
        const facet = config.filterFacets.find((f) => f.field === field)
        if (!facet) continue
        if (facet.control === "range") {
          facets[field] = value
          continue
        }
        const offered = facet.options ?? facetOptions(data, facet.field)
        if (offered.some((o) => o.value === value)) facets[field] = value
      }
      return {
        query: typeof was.query === "string" ? was.query : "",
        facetValues: facets,
        // A sort by a column this collection no longer offers falls back to the
        // declared one, for the same reason a retired filter does.
        sortBy:
          typeof was.sortBy === "string" &&
          (was.sortBy === config.sortBy ||
            config.sortOptions.some((o) => o.value === was.sortBy))
            ? was.sortBy
            : config.sortBy,
        sortDir: was.sortDir === "asc" || was.sortDir === "desc" ? was.sortDir : config.sortDir,
      }
    }
  )
  const { query, facetValues, sortBy, sortDir } = asked
  const setQuery = (next: string) => remember((q) => ({ ...q, query: next }))
  // The OLD SearchInput debounced internally; the kit's is a plain input, so
  // the debounce lives here now — same 300ms the old control used.
  const debouncedSetQuery = useDebouncedCallback((next: string) => setQuery(next), 300)
  const setSortBy = (next: string) => remember((q) => ({ ...q, sortBy: next }))
  const setSortDir = (next: "asc" | "desc") => remember((q) => ({ ...q, sortDir: next }))
  const [page, setPage] = React.useState(0)
  const rootRef = React.useRef<HTMLDivElement>(null)

  // A new search/facet/sort resets to the first page so results are never
  // off-screen.
  React.useEffect(() => setPage(0), [query, facetValues, sortBy, sortDir])

  // Emit the query state to the app (skip the initial mount). The query is
  // already debounced upstream by SearchInput; facet + sort changes are immediate.
  const mounted = React.useRef(false)
  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    onQueryChange?.({ query, facetValues, sortBy, sortDir })
  }, [query, facetValues, sortBy, sortDir, onQueryChange])

  const visibleConfig = useIsVisible(config)
  if (!visibleConfig) return null

  // limit → (builder filter + facets) → search → sort → paginate (see selectRows).
  // The user's live sort overrides the declared one; everything else is config.
  // serverSide: skip the in-memory pipeline entirely — render whatever `data`
  // we're given and let the app sort at the source (we only emit).
  const slice = serverSide
    ? {
        visible: data,
        filtered: data,
        total: data.length,
        pageCount: 1,
        page: 0,
      }
    : selectRows(
        data,
        { ...config, sortBy, sortDir },
        { query, searchKeys, page, facetValues }
      )
  const { visible, filtered, pageCount, page: current } = slice

  // IS ANYTHING NARROWING THIS LIST RIGHT NOW? The zero state below turns on
  // this and nothing else: a search with text in it, or one facet set. It is
  // read after `selectRows` so it describes the same pass that produced
  // `filtered`. (`asked` is taken in this file — it is the remembered question
  // itself, which is the thing this is a predicate about.)
  const narrowed = query.trim() !== "" || Object.keys(facetValues).length > 0

  // GENUINELY EMPTY, READ EARLY — client, 2 Sep 2026, verbatim: "NEVER
  // TOOLBAR ON EMPTY COLLECTION." Nothing to search, filter or sort when
  // there is nothing in the collection AND nothing is narrowing it — the
  // toolbar used to stay drawn above `CollectionEmptyState` regardless (only
  // the create button was ever suppressed here, see below), which is a
  // search box and a sort control offered over zero rows. Computed once,
  // ahead of `searchBox`/`filterBar`/`sortControl`, so both render paths
  // this file draws (the kit-panel branch below, and the app-drawn-header
  // branch further down) suppress the same three controls from the same
  // one answer instead of two copies of the same condition.
  const isEmptyState = state === "ready" && filtered.length === 0 && !narrowed

  const showFilterBar = config.userFilter && config.filterFacets.length > 0
  const showSort = config.sortable && config.sortOptions.length > 0
  const showHeader =
    config.title ||
    config.showCount ||
    config.searchable ||
    showFilterBar ||
    showSort
  const setFacet = (field: string, value: string) =>
    remember((q) => {
      const next = { ...q.facetValues }
      if (value === "") delete next[field]
      else next[field] = value
      return { ...q, facetValues: next }
    })

  // Page change: optionally scroll the collection's top back into view.
  const goTo = (p: number) => {
    setPage(p)
    if (config.scrollToTop)
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const pager =
    !serverSide && config.itemsPerPage != null && pageCount > 1 ? (
      <div className="flex items-center justify-between gap-3 pt-1">
        <Text as="span" size="caption" tone="tertiary" numeric>
          {t("Page {page} of {pages}", { page: current + 1, pages: pageCount })}
        </Text>
        <Pagination label={t("Pagination")} className="w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                label={t("Prev")}
                srLabel={t("Prev")}
                size="sm"
                disabled={current === 0}
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  goTo(current - 1)
                }}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                label={t("Next")}
                srLabel={t("Next")}
                size="sm"
                disabled={current >= pageCount - 1}
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  goTo(current + 1)
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    ) : null

  // THE PROTOTYPE BRANCH — see the `useKitPanel` doc above. Every hook and
  // every computed value above this line (asked/remember, selectRows, the
  // create-action context) is IDENTICAL on both paths; only the chrome
  // differs. The state-switch body is the same `ShapeStateBody` calls the
  // legacy branch below makes — copied rather than shared behind a helper,
  // because the two branches are not going to coexist past the prototype
  // (one will replace the other; see COMPOSITION-MISMATCHES.md).
  if (useKitPanel) {
    // THE COUNT FOLDS INTO THE SEARCH PLACEHOLDER ("Search 7 roles…") rather
    // than drawing beside it. Two reasons. First, R16: this is a FILTERED-
    // view hint, not the collection's count — a counted tab strip or
    // `CollectionHeading` already carries the collection's own total exactly
    // once elsewhere on this screen (Roles has no `config.title`; its tab
    // already says "Member roles 7"), and a second, louder Badge in the
    // kit's own `heading`+`count` slot would be the duplicate-count shape
    // R16 exists to catch. Second, and the reason it is folded into the
    // placeholder rather than drawn as a sibling caption: the kit's toolbar
    // gives the WHOLE `search` node one flex slot (`basis-full` below `sm`),
    // so a caption placed beside the input inside that one slot fights the
    // input for width and clips it on a phone — proven live, not guessed
    // (first pass genuinely did this; caught on the phone screenshot). The
    // old code had exactly this fold already, but only below `sm`; it is
    // simpler and safer to apply it at every width now that there is one
    // search node instead of two responsive ones.
    const searchPlaceholder = config.showCount
      ? config.searchPlaceholder.replace(/^Search\b/i, (m) => `${m} ${filtered.length}`)
      : config.searchPlaceholder
    // `!isEmptyState` on all three (client, 2 Sep 2026, verbatim: "NEVER
    // TOOLBAR ON EMPTY COLLECTION") — nothing to search, filter or sort
    // over zero rows with nothing narrowing them. `showFilterBar`/`showSort`
    // still gate on the recipe's own config first; this is a second,
    // independent reason to draw nothing, not a replacement for it.
    const searchBox = config.searchable && !isEmptyState ? (
      <SearchInput
        defaultValue={query}
        onChange={(e) => debouncedSetQuery(e.currentTarget.value)}
        onClear={() => debouncedSetQuery("")}
        placeholder={searchPlaceholder}
      />
    ) : null
    const filterBar = showFilterBar && !isEmptyState ? (
      <FilterBar
        facets={config.filterFacets}
        values={facetValues}
        data={data}
        onChange={setFacet}
        onClearFacets={() => remember((q) => ({ ...q, facetValues: {} }))}
        resultCount={filtered.length}
        modal={modal}
      />
    ) : null
    // THE VIEW-SWITCH SLOT, BY THE KIT'S OWN PRECEDENT: CH27.13 shares it
    // between the actual view switcher and "the sub-tab picker are controls"
    // — this frame has no view switcher, so `SortControl` takes the slot
    // rather than inventing a sixth one the component does not offer.
    const sortControl = showSort && !isEmptyState ? (
      <SortControl
        options={config.sortOptions}
        value={sortBy}
        onValueChange={setSortBy}
        direction={sortDir}
        onDirectionChange={setSortDir}
      />
    ) : null
    // GENUINELY EMPTY SUPPRESSES THE TOOLBAR'S OWN + BUTTON (`isEmptyState`,
    // computed once above alongside `narrowed` — now also what gates
    // `searchBox`/`filterBar`/`sortControl` themselves, see there). Below,
    // the GENUINELY-EMPTY branch draws `CollectionEmptyState`'s own "Add the
    // first" — a labelled button carrying the identical `createAction`. The
    // toolbar's icon-only + button pinned to the panel's `actions` slot
    // (composition 27.1's toolbar contract: "search, then filters, then view
    // switcher, then actions pinned right") would then sit right above it,
    // two controls for the one act the client's B3 rule ("the one mango")
    // exists to prevent. It stays for every OTHER state — loading, error,
    // no-results (`narrowed`), and a populated collection — where the empty
    // body is not the one being drawn.
    const createButton = createAction && !isEmptyState ? createActionButton(createAction) : null

    return (
      <KitCollectionFrame
        className={className}
        // `tone="bare"`/`inset={false}`: this frame always renders inside
        // `AppShell`'s `ScreenShell` body pane now (COMPOSITION-MISMATCHES.md,
        // the ScreenShell-family entry) — an off-beige ground that already
        // paid for its own inset. The kit's own doc for `tone` names this
        // exact nesting: "MainScreen drops this frame straight into
        // ScreenShell's off-beige body pane, and a second off-beige fill on
        // top of it would be a level of the nesting that is not there."
        tone="bare"
        inset={false}
        band={band}
        heading={config.title || undefined}
        rule={Boolean(config.title)}
        search={searchBox}
        filters={filterBar}
        viewSwitch={sortControl}
        actions={createButton}
      >
        {state === "loading" ? (
          <ShapeStateBody shape="collectionScreen" state="loading" copy={copy} />
        ) : state === "error" ? (
          <ShapeStateBody
            shape="collectionScreen"
            state="error"
            copy={copy}
            action={errorAction}
          />
        ) : filtered.length === 0 && narrowed ? (
          // NO-RESULTS stays on the plain sentence + "Clear filters" — see
          // COMPOSITION-MISMATCHES.md, the no-results half of this entry,
          // for why the kit's own richer no-results body (naming the exact
          // total, the narrowest excluding facet, and its would-show count)
          // is deliberately not built here yet: it needs computations this
          // engine doesn't have, not a copy swap.
          <ShapeStateBody
            shape="collectionScreen"
            state="empty"
            filtered
            copy={{ emptyTitle: t(config.emptyText), ...copy }}
            action={
              Object.keys(facetValues).length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => remember((q) => ({ ...q, facetValues: {} }))}
                >
                  {t("Clear filters")}
                </Button>
              )
            }
          />
        ) : filtered.length === 0 ? (
          // GENUINELY EMPTY — the finished register, `CollectionEmptyState`
          // above, matching `EmptyCollectionScreen`'s `emptyBody`
          // (states/empty-collection.tsx, 27.21) verbatim: a bold title, one
          // explanatory sentence, and up to two buttons. The figure strip and
          // zero-badged tabs are still not adopted — `CollectionConfig` has
          // no "figures" concept, and inventing one is separate, unscoped
          // work (COMPOSITION-MISMATCHES.md).
          <CollectionEmptyState
            title={copy?.emptyTitle ?? t(config.emptyText)}
            description={copy?.emptyDescription}
            onCreate={createAction?.onCreate}
            onImport={createAction?.secondary?.onClick}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {renderItems(visible)}
            {pager}
          </div>
        )}
      </KitCollectionFrame>
    )
  }

  return (
    <div ref={rootRef} className={cn("flex w-full flex-col gap-3", className)}>
      {showHeader &&
        (() => {
          const titleBlock = (
            <div className="flex items-baseline gap-2">
              {config.title && (
                <h3 className="text-sm font-medium">{config.title}</h3>
              )}
              {config.showCount && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t("Showing {shown} of {total}", { shown: visible.length, total: filtered.length })}
                </span>
              )}
            </div>
          )
          const searchBox = config.searchable ? (
            <SearchInput
              defaultValue={query}
              onChange={(e) => debouncedSetQuery(e.currentTarget.value)}
              // THE SEARCH CLEARS ITSELF (the kit's own ✕). It used to be
              // cleared by the filter row's "Clear all", which was one control
              // quietly owning two questions; the kit's bar says "Clear
              // filters" and now means only that. Cleared THROUGH the debounce
              // rather than around it, so a keystroke still in flight cannot
              // land after the ✕ and put the text back.
              onClear={() => debouncedSetQuery("")}
              placeholder={config.searchPlaceholder}
              className="w-44"
            />
          ) : null
          const filterBar = showFilterBar ? (
            <FilterBar
              facets={config.filterFacets}
              values={facetValues}
              data={data}
              onChange={setFacet}
              onClearFacets={() => remember((q) => ({ ...q, facetValues: {} }))}
              resultCount={filtered.length}
              modal={modal}
            />
          ) : null
          const sortControl = showSort ? (
            <SortControl
              options={config.sortOptions}
              value={sortBy}
              onValueChange={setSortBy}
              direction={sortDir}
              onDirectionChange={setSortDir}
            />
          ) : null

          // Mobile: fold the live count into the search placeholder (e.g.
          // "Search 3 roles…") so the header can stay ONE row with no separate
          // count line. (Only rewrites a placeholder that starts with "Search".)
          const mobilePlaceholder = config.showCount
            ? config.searchPlaceholder.replace(
                /^Search\b/i,
                (m) => `${m} ${filtered.length}`
              )
            : config.searchPlaceholder

          // THE FILTER ROW LEFT THE FUNNEL, AND THAT IS THE POINT OF THE SWAP.
          // The phone header used to hide the filters behind a funnel because
          // the old row was a strip of dropdown triggers that could not fit
          // beside a search box. The kit's bar answers the same question itself
          // and answers it the other way round — below `sm` its chips become a
          // one-line horizontal SCROLLER, and its own file says why in as many
          // words: "the moment they are hidden, people forget they are on and
          // read a filtered list as an empty one". So the funnel now holds the
          // SORT and nothing else, and what is narrowing the list is on screen
          // at every width. It cost the dot the funnel used to wear, which was
          // the app telling somebody a filter was on without telling them which.
          return (
            <>
              {/* Mobile (< sm): a stretching search field + a sort funnel,
                  left-to-right and never wrapping — the box and its trigger
                  are one control and stay glued together. Filters ride
                  directly below, in the SAME `sm:hidden` block (never a
                  fully separate element the way the old full-width sibling
                  was): the kit's own chip row is a horizontal SCROLLER at
                  this width (`filter-bar.tsx`'s own header), which cannot
                  share a line with the search box, so it is the one
                  legitimate second line here — connected to the row above
                  it rather than floating disconnected from "the toolbar",
                  and never present when there is nothing to filter. */}
              <div className="flex flex-col gap-2 sm:hidden">
                <div className="flex items-center gap-2">
                  {config.searchable ? (
                    <SearchInput
                      defaultValue={query}
                      onChange={(e) => debouncedSetQuery(e.currentTarget.value)}
                      onClear={() => debouncedSetQuery("")}
                      placeholder={mobilePlaceholder}
                      className="min-w-0 flex-1"
                    />
                  ) : (
                    <div className="min-w-0 flex-1">{titleBlock}</div>
                  )}
                  {showSort && (
                    <Popover modal={modal}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          aria-label={t("Sort")}
                          className="size-8 shrink-0"
                        >
                          <ArrowUpDown />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        className="flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-3"
                      >
                        {/* The same control the desktop layout renders (built
                            once above) — just moved into a popover, since the
                            phone header is ONE row: search + this trigger. */}
                        {sortControl}
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                {filterBar}
              </div>

              {/* ≥ sm: FILTERS NEVER ORPHAN INTO A ROW OF THEIR OWN ANY MORE
                  (client ruling, 2026-09-01 — the toolbar spec Aurora
                  approved that night): they ride in the SAME row as
                  search, wrapping only when the viewport is genuinely too
                  narrow, never a designed second tier. This file used to
                  render `filterBar` once, after both branches below, as a
                  full-width sibling row — exactly the shape the client's
                  screenshot of the Apps screen caught: search+sort on one
                  line, a stranded filter chip under it — and this file's own
                  `headerLayout` doc claimed "inline" already put "title,
                  search, and filters together on one wrapping row", which
                  the code never actually did. `filterBar` is wrapped in its
                  own non-growing flex box before it joins either row — the
                  adapter's own outer `<div>` (`filter-bar.tsx`) is `w-full`
                  by design (its chip row is meant to claim a whole line when
                  it IS the line), and a bare `w-full` child inside this flex
                  row would still claim the rest of it and push whatever
                  comes after it (sort, in "inline") onto a line of its own —
                  the same two-row shape one level down. The kit's OWN
                  toolbar (`shared/ui/components/collection-frame/
                  collection-frame.tsx`) wraps its own `filters` slot the
                  identical way, for the identical reason.
                  `headerLayout` still decides where SORT rides — "inline"
                  keeps it beside search+filters on this one row; "stacked"
                  (default) keeps it on its own row below, exactly as before
                  this fix — that split is a title/sort decision this bug is
                  not about, and it stays untouched. */}
              <div className="hidden sm:block">
                {config.headerLayout === "inline" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {titleBlock}
                    {searchBox}
                    {filterBar && (
                      <div className="flex min-w-0 flex-wrap items-center gap-2">{filterBar}</div>
                    )}
                    {sortControl}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {titleBlock}
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {searchBox}
                        {filterBar}
                      </div>
                    </div>
                    {sortControl && (
                      <div className="flex flex-wrap items-center gap-2">
                        {sortControl}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )
        })()}

      {state === "loading" ? (
        // LAW 4, THE SAME RULE THE RECORD SCREENS WERE JUST MIGRATED TO
        // (RecordScreen's `state`, 73414c58 and its rollout): the header above
        // — search, filters, sort — stays drawn from what the app already
        // knows, and only this region swaps. `filtered.length` is not
        // consulted here on purpose: a `data={[]}` passed in because the
        // fetch has not answered yet must never be read as "the collection is
        // empty", which is exactly the claim a caller with no loading state
        // had no way to avoid making.
        <ShapeStateBody shape="collectionScreen" state="loading" copy={copy} />
      ) : state === "error" ? (
        <ShapeStateBody
          shape="collectionScreen"
          state="error"
          copy={copy}
          action={errorAction}
        />
      ) : filtered.length === 0 ? (
        // ── THE ZERO STATE, AND IT IS TWO STATES ──────────────────────────
        //
        // It used to be one: a dashed box saying "No tickets yet." whether the
        // collection was genuinely empty or a search had simply matched
        // nothing. That sentence is a claim about the COLLECTION and it is
        // plainly untrue mid-search — the same fault `paged-find` names on the
        // server-side path and answers there. So what is said follows what was
        // asked, and only the genuinely-empty half offers the create action:
        // pointing at "New ticket" when a filter is hiding twelve of them would
        // be worse than the grey line it replaces.
        //
        // Drawn through the kit's own composition (`ShapeStateBody`, shape
        // "collectionScreen") rather than the hand-rolled dashed box this used
        // to be — the same register the record screens' empty/error states
        // already draw through. `filtered` picks empty vs no-results for it;
        // it is never guessed, ch27's own rule for exactly this switch.
        //
        // The action is the section's own button, published by the host above
        // (see `CollectionCreateActionProvider`) — the same word and the same
        // glyph, so the zero state cannot invent a second name for one act.
        // A NO-RESULTS zero state offers a way out where one can be run safely
        // — "Clear filters", the exact handler the filter bar's own control
        // runs — rather than the dead end of a sentence with nothing to press.
        // ONLY when a FACET is set: `SearchInput` owns its displayed text
        // itself (`defaultValue`, uncontrolled), so a button that reset the
        // remembered `query` too would tell the reader the box was cleared
        // while the letters they typed stayed on screen. A search-only
        // narrowing keeps the plain sentence, same as before this change.
        //
        // NO ICON HERE ANY MORE — `config.emptyIcon` (a per-recipe glyph) has
        // no seam into `ShapeStateBody`: the composition's own law is "it
        // never draws a mark of its own", which is the kit's considered
        // reading of ch27.21's "no empty-box drawing, no mascot … type and one
        // button carry it". Dropping the icon is that law, not a shim I could
        // not find; a recipe's `emptyIcon` is simply unread from here now.
        //
        // GENUINELY EMPTY draws through `CollectionEmptyState` now (same
        // register `useKitPanel` draws, see its own doc) rather than
        // `ShapeStateBody` — a bold title, the two-routes sentence, and up to
        // two buttons, never the icon-only mango this used to stop at.
        // NO-RESULTS is unchanged: `ShapeStateBody` + "Clear filters", because
        // a filtered-out list is a different fact and 27.22 draws it
        // differently (no mango in the body at all).
        narrowed ? (
          <ShapeStateBody
            shape="collectionScreen"
            state="empty"
            filtered
            copy={{ emptyTitle: t(config.emptyText), ...copy }}
            action={
              Object.keys(facetValues).length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => remember((q) => ({ ...q, facetValues: {} }))}
                >
                  {t("Clear filters")}
                </Button>
              )
            }
          />
        ) : (
          <CollectionEmptyState
            title={copy?.emptyTitle ?? t(config.emptyText)}
            description={copy?.emptyDescription}
            onCreate={createAction?.onCreate}
            onImport={createAction?.secondary?.onClick}
          />
        )
      ) : (
        renderItems(visible)
      )}

      {pager}
    </div>
  )
}

export { CollectionFrame }
