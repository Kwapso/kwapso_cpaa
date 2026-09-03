"use client"

// ScreenRenderer — the config-driven SCREEN ENGINE. It renders a `ScreenRecipe`
// (lib/recipe) by COMPOSING the library's existing collections + primitives, and
// auto-hides gated fields/actions from the injected per-module rights. It does
// NOT fetch data, call APIs, store recipes, or own the router: the host injects
// `data` + `rights` + `onAction`, and the engine emits navigate/close intents the
// host maps to URL changes (the deep-link grammar in lib/recipe).

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "@shared/ui/foundations/icons"

import {
  gateState,
  type RecipeAction,
  type RecipeBlock,
  type RecipeField,
  type RecipeNode,
  type ScreenPresentation,
  type ScreenRecipe,
  type ScreenRights,
} from "./recipe"
import { defaultCollectionConfig, validateField } from "./config"
import { TAB_ICONS, kitIcon } from "./tabs-view"
import { cn } from "@shared/ui/lib/utils"
import { useT } from "@shared/web/language"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@shared/ui/components/alert-dialog/alert-dialog"
import { Button } from "@shared/ui/components/button/button"
import { ActionRow } from "@shared/ui/components/action-row/action-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/components/select/select"
import { DatePicker } from "@shared/ui/components/date-picker/date-picker"
// The FIELD comes through the app's seam, not the kit directly — the seam
// translates a config's words on the way to the screen (R33), and its import
// ban is what keeps every renderer honest, this one included.
import { Field } from "@shared/web/field"
import { FileUpload } from "@shared/ui/components/file-upload/file-upload"
import { Input } from "@shared/ui/components/input/input"
import { Notes } from "@shared/web/notes-editor/notes-editor"
import { Spinner } from "@shared/ui/components/spinner/spinner"
import { Switch } from "@shared/ui/components/switch/switch"
import { ActivityFeed } from "@shared/ui/components/activity-feed/activity-feed"
import { CardGrid } from "@shared/ui/components/card-grid/card-grid"
import { Card, CardDescription, CardHeader, CardTitle } from "@shared/ui/components/card/card"
import { Gallery, type GalleryTile } from "@shared/ui/components/gallery/gallery"
import { DotsThree } from "@shared/ui/foundations/icons"
import { CollectionFrame } from "@shared/web/screen-engine/collection-frame"
import { DataTable, type DataTableColumn } from "@shared/ui/components/data-table/data-table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@shared/ui/components/dropdown-menu/dropdown-menu"
import { DescriptionList } from "@shared/ui/components/description-list/description-list"
import { List } from "@shared/web/list-compat"
import { RecordDetail } from "@shared/ui/components/record-detail/record-detail"
import { clampRecordHeading } from "../record-heading"

/* ------------------------- host-injected contracts ------------------------- */

type Row = Record<string, unknown>

/** Everything the engine needs to render — all supplied by the host (which has
 *  already done its OWN server-side permission + data fetch). */
export interface ScreenData {
  /** The focused record (detail / edit). */
  record?: Row
  /** Rows for a list screen. */
  rows?: Row[]
  /** Option lists for `choice` fields, keyed by `RecipeField.optionsFrom`. */
  options?: Record<string, { value: string; label: string }[]>
  /** Named datasets for blocks (activity feeds, nested lists), keyed by source. */
  sets?: Record<string, Row[]>
}

export interface ScreenActionContext {
  values?: Record<string, unknown>
  id?: string
  record?: Row
}

/** What the engine asks the host to do to the URL. */
export type ScreenIntent =
  | { kind: "open"; module: string; id: string }
  | { kind: "tab"; tab: string }
  | { kind: "close" }

export interface ScreenRendererProps {
  recipe: ScreenRecipe
  data: ScreenData
  /** Per-module rights, injected by the host. */
  rights: ScreenRights
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  /** Override the recipe's presentation. */
  presentation?: ScreenPresentation
  /** The host maps these to URL changes (it owns the router). */
  onIntent?: (intent: ScreenIntent) => void
  className?: string
  /**
   * Loading, or a failed read — forwarded to a `type: "list"` recipe's
   * `CollectionFrame` (law 4: the header stays, only the rows region swaps).
   * `"ready"` (the default) is exactly today's behaviour, so every existing
   * caller is unaffected until it starts passing this. Not yet threaded
   * through `type: "detail"` recipes or a `list` BLOCK nested inside a custom
   * layout — this is the list-screen half of the same rollout the record
   * screens already got (73414c58 and its follow-ups).
   */
  state?: "ready" | "loading" | "error"
  /**
   * PROTOTYPE, ONE COLLECTION (Tickets — see COMPOSITION-MISMATCHES.md's
   * archive entry). Forwarded to a `type: "list"` recipe's `CollectionFrame`
   * — `useKitPanel` draws the kit's own header/toolbar/panel chrome instead
   * of this engine's hand-rolled one, and `band` is the kit's one-line
   * "standing" slot above the toolbar, inside the panel (a host passes it
   * only while its own archived/put-away tab is the open one). Both default
   * to off/undefined, so every existing caller is unaffected.
   */
  useKitPanel?: boolean
  band?: React.ReactNode
  /**
   * THE HOST'S OWN ACTIVITY PANEL, for a recipe's `activity` block.
   *
   * A record's history is the same thing on a recipe screen as on a bespoke
   * one, and the app already has ONE component for it —
   * `web/components/activity-panel.tsx` (`<ActivityPanel>`): the feed, its
   * empty/loading/error registers, the note composer, and — the part that
   * matters most — the "Load more activity" pager INSIDE the tab. Law R2's own
   * check names that component by hand for every bespoke detail.
   *
   * The engine cannot import it. `ActivityPanel` lives under `web/`, reaches
   * the app-side `@/lib` alias, and `shared/web/` is rendered by BOTH front
   * doors, where `@/` resolves to two different folders — so the panel comes
   * IN through this prop rather than the engine going out to fetch it. The
   * host is the half that knows the record's feed, its cache key and its next
   * page anyway.
   *
   * Omitted, the block falls back to a plain kit `ActivityFeed` with this
   * app's own words on all three registers — correct, translated, and pagerless.
   * The pager is the one thing the fallback CANNOT have: nothing here knows a
   * list key or how to fetch a second page. A host that hangs one below the
   * whole `<ScreenRenderer>` instead puts "Load more activity" under the
   * Overview tab as well, which is the shape this prop exists to retire.
   */
  renderActivity?: (source: string) => React.ReactNode
}

/** Everything a block needs to draw itself. One bundle rather than seven
 *  positional arguments: `renderBlock` is reached from three places (a custom
 *  layout's leaf, a detail tab's body, a detail's untabbed panel) and every one
 *  of them has to forward all of it. */
interface BlockCtx {
  t: (english: string) => string
  recipe: ScreenRecipe
  data: ScreenData
  rights: ScreenRights
  onIntent?: ScreenRendererProps["onIntent"]
  state?: ScreenRendererProps["state"]
  renderActivity?: ScreenRendererProps["renderActivity"]
}

/* -------------------------------- helpers -------------------------------- */

const gapClass = { sm: "gap-2", md: "gap-4", lg: "gap-6" } as const

// NO LOCAL `initials()` ANY MORE. This file used to carry its own, taking the
// FIRST TWO words of a name — while `web/lib/identity.ts`, whose header calls
// itself the one source "so every screen renders the same person the same way
// (no per-component drift)", takes FIRST + LAST. "Anna Maria Kowalski" was
// therefore `AK` on every list row and `AM` in this engine's record header:
// two answers to one question, in the one place a person sees both at once.
//
// It is DELETED rather than replaced with an import, because the 2026-09-01
// ruling below ("no images on title") took away its only caller — the record
// mark's initials fallback. So the drift is closed the cleanest way there is:
// one implementation left in the app, and no second module to keep in step.

/** A row value, narrowed to something React can actually draw. Row values are
 *  `unknown`, so a host CAN hand us a plain object — and React throws on an
 *  object child, which would take the whole screen down. Anything undrawable
 *  renders as nothing instead. */
function asNode(value: unknown): React.ReactNode {
  if (value == null || typeof value === "boolean") return undefined
  if (typeof value === "string" || typeof value === "number") return value
  return React.isValidElement(value) ? value : undefined
}

// (The old DataTable formatted by a column `type`; the kit's columns render
// through a `cell` function instead, so the type only shapes the INPUT now.)

/** THE COLOUR OF A CONFIRM'S GO-AHEAD BUTTON. Red unless the recipe says
 *  otherwise, which is `shared/web/use-confirm.tsx`'s rule written down for the
 *  one dialog shape that hook cannot serve (see `ScreenConfirm`). That hook's
 *  own words: "a confirm pairs with the DESTRUCTIVE (red) colour" — a
 *  reversible toggle that undoes itself one press later is deliberately neither
 *  red nor confirmed, so anything that reaches a confirm step IS the other
 *  case. `variant: "default"` on the recipe is the deliberate exception, and
 *  stays available because a recipe is data a team can override. */
function confirmVariant(v: "default" | "destructive" | undefined): "default" | "destructive" {
  return v === "default" ? "default" : "destructive"
}

/** A gated action button. Renders nothing when hidden, greyed when disabled, and
 *  wraps a confirm step (AlertDialog) when the action asks to confirm first. */
function ActionButton({
  action,
  rights,
  onAction,
  ctx,
}: {
  action: RecipeAction
  rights: ScreenRights
  onAction: ScreenRendererProps["onAction"]
  ctx: ScreenActionContext
}) {
  const t = useT()
  const gs = gateState(rights, action.gate)
  if (gs === "hidden") return null
  const disabled = gs === "disabled"

  if (action.confirm && !disabled) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant={action.variant}>{action.label}</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{action.confirm.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {action.confirm.body}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              /* RED, THROUGH THE COMPONENT'S OWN PROP — client ruling,
                 2026-08-31, verbatim: "in the confirmation screen, the
                 archive/cancel whatever destructive action on confirmation
                 screen, make the button red." `shared/web/use-confirm.tsx` is
                 how the other thirteen confirm dialogs in the app obey it, and
                 `confirmVariant` below is this engine's copy of its reasoning:
                 a confirm step guards an action somebody is being asked to
                 think twice about, so red is the default and `variant:
                 "default"` is the recipe's explicit way out.

                 It used to be a `buttonVariants({ variant: "destructive" })`
                 CLASSNAME handed to a component that ALSO takes a `variant`
                 prop and defaults it to "default" — two full sets of the same
                 utilities in one `cn()`, resolved by tailwind-merge rather
                 than by anybody's decision. A prop cannot lose that race. */
              variant={confirmVariant(action.confirm.variant)}
              onClick={() => onAction(action.id, ctx)}
            >
              {action.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <Button
      variant={action.variant}
      disabled={disabled}
      onClick={() => onAction(action.id, ctx)}
    >
      {action.label}
    </Button>
  )
}

/* ------------------------------- the layer ------------------------------- */

// Responsive = bottom sheet on mobile, centered card on desktop. The other modes
// force one. Built on the same Radix dialog the library's Dialog/Sheet use.
const layerContent: Record<ScreenPresentation, string> = {
  responsive:
    "inset-x-0 bottom-0 max-h-[90svh] rounded-t-[var(--radius)] sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-lg sm:max-h-[85vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius)]",
  overlay:
    "top-1/2 left-1/2 w-full max-w-lg max-h-[85vh] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius)]",
  sheet: "inset-x-0 bottom-0 max-h-[90svh] rounded-t-[var(--radius)]",
  fullscreen: "inset-0 rounded-none",
}

function ScreenLayer({
  presentation,
  title,
  onClose,
  children,
}: {
  presentation: ScreenPresentation
  title: string
  onClose?: () => void
  children: React.ReactNode
}) {
  const t = useT()
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose?.()
      }}
    >
      <DialogPrimitive.Portal>
        {/* The scrim colour is restated, not imported: `shared/ui/components/
            dialog/dialog.tsx` builds the exact same expression into its own
            module-private `SCRIM` (kit-stated as charcoal at 36%, unchanged in
            both palettes — GAPS-A.md OVL-2), but does not export it. A literal
            `bg-black/50` used to sit here instead — un-tokenised (R32) and
            visibly cooler/darker than every other overlay's scrim (`Dialog`,
            `Sheet`, `AlertDialog`) side by side. Kept at this layer's own
            z-50, not the kit modal's z-60: only the colour is meant to match,
            not the stacking. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--kw-charcoal)_36%,transparent)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "bg-card fixed z-50 flex flex-col gap-4 overflow-y-auto p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0",
            layerContent[presentation]
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <DialogPrimitive.Title className="text-lg font-medium">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={t("Close")}
              /* motion.css §13, first line: "Hover is a fill swap and nothing
                 else. Not an opacity" — an alpha of a token is a colour the
                 palette does not contain. This faded the whole glyph from 70%
                 to 100%; it moves the INK now, between two named tones. */
              className="text-ink-secondary motion-hover hover:text-foreground rounded-pill"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/* ------------------------------- the form -------------------------------- */

function ScreenForm({
  recipe,
  data,
  rights,
  onAction,
}: {
  recipe: ScreenRecipe
  data: ScreenData
  rights: ScreenRights
  onAction: ScreenRendererProps["onAction"]
}) {
  const fields = recipe.fields.filter(
    (f) => gateState(rights, f.gate) !== "hidden"
  )
  const [values, setValues] = React.useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {}
    for (const f of fields) init[f.column] = data.record?.[f.column] ?? ""
    return init
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const set = (col: string, v: unknown) =>
    setValues((s) => ({ ...s, [col]: v }))

  function fire(action: RecipeAction) {
    const next: Record<string, string> = {}
    for (const f of fields) {
      if (["text", "number", "date", "choice"].includes(f.type)) {
        const msg = validateField(String(values[f.column] ?? ""), f.field)
        if (msg) next[f.column] = msg
      }
    }
    setErrors(next)
    if (Object.keys(next).length === 0) {
      onAction(action.id, { values, id: data.record?.id as string | undefined })
    }
  }

  function renderInput(f: RecipeField) {
    const disabled =
      gateState(rights, f.gate) === "disabled" || f.field.disabled
    const v = values[f.column]
    switch (f.type) {
      case "switch":
        return (
          <Switch
            id={f.column}
            checked={Boolean(v)}
            disabled={disabled}
            onCheckedChange={(c) => set(f.column, c)}
          />
        )
      case "date":
        return (
          <DatePicker
            value={v ? new Date(String(v)) : null}
            onValueChange={(d) => set(f.column, d ? d.toISOString().slice(0, 10) : "")}
          />
        )
      case "notes":
        return (
          <Notes
            defaultValue={String(v ?? "")}
            onChange={(html) => set(f.column, html)}
          />
        )
      case "image":
        return <FileUpload onFilesSelected={(files) => set(f.column, files)} />
      case "choice":
        // The OLD library's Choice in "dropdown" mode was an option list; the
        // kit's Choice is a selectable card and its option dropdown is Select.
        return (
          <Select value={v ? String(v) : undefined} onValueChange={(next) => set(f.column, next)}>
            <SelectTrigger id={f.column} disabled={disabled}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(data.options?.[f.optionsFrom ?? f.column] ?? []).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      default:
        return (
          <Input
            id={f.column}
            type={f.type === "number" ? "number" : "text"}
            value={String(v ?? "")}
            disabled={disabled}
            onChange={(e) => set(f.column, e.target.value)}
          />
        )
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="grid gap-4">
        {fields.map((f) => (
          <Field
            key={f.column}
            config={{
              ...f.field,
              disabled: gateState(rights, f.gate) === "disabled" || f.field.disabled,
            }}
            htmlFor={f.column}
            error={errors[f.column]}
          >
            {renderInput(f)}
          </Field>
        ))}
      </div>
      <ActionRow align="end" className="gap-2">
        {recipe.actions
          .filter((a) => gateState(rights, a.gate) !== "hidden")
          .map((a) => (
            <Button
              key={a.id}
              variant={a.variant}
              disabled={gateState(rights, a.gate) === "disabled"}
              onClick={() => fire(a)}
            >
              {a.label}
            </Button>
          ))}
      </ActionRow>
    </div>
  )
}

/* ------------------------------- the blocks ------------------------------- */

function renderBlock(block: RecipeBlock, ctx: BlockCtx): React.ReactNode {
  const { t, recipe, data, rights, onIntent } = ctx
  const record = data.record ?? {}
  switch (block.kind) {
    // NO CARD HERE. Both reachable callers of this case — `renderDetail`'s
    // `panel` and its per-tab `content` — land inside the kit's
    // `RecordDetail`, which already wraps the whole panel in ONE `Card` at
    // the DEFAULT variant (`bg-surface-panel`); that OUTER seam is the real
    // fix, and it stands. A second `Card` here, added 2026-08-31 as the
    // app-side twin of `web/components/overview-list.tsx`'s same-night
    // change, put a white `variant="raised"` box INSIDE that panel — a
    // container inside a container, which the client's screenshot rejected
    // outright the same night. The fact list's `<dl>` renders straight onto
    // the panel again, exactly as it did before that change.
    case "description":
      return (
        <DescriptionList
          layout={(block.columns ?? 2) === 1 ? "rows" : "grid"}
          items={block.rows.map((r) => ({
            id: r.column,
            label: r.label,
            value: record[r.column] as React.ReactNode,
          }))}
        />
      )
    case "fields":
      return (
        <DescriptionList
          layout="rows"
          items={recipe.fields
            .filter((f) => gateState(rights, f.gate) !== "hidden")
            .map((f) => ({
              id: f.column,
              label: f.field.label,
              value: record[f.column] as React.ReactNode,
            }))}
        />
      )
    // A RECORD'S HISTORY, THROUGH THE HOST'S OWN PANEL WHERE THERE IS ONE.
    // `renderActivity` hands back `<ActivityPanel>` — the same component every
    // bespoke detail draws, pager and all — and its own prop doc says why the
    // engine cannot simply import it.
    //
    // The fallback below is what a host that passes nothing still gets, and it
    // is no longer a bare feed. It used to be exactly that: no `emptyLabel`, no
    // `loading`, no `error`, so an empty history fell through to the KIT'S own
    // hardcoded English ("No history yet", "History unavailable") — words the
    // translation walk cannot see, because it never opens `shared/ui/` (R28,
    // `VENDORED_UI` in scripts/lib/i18n-source.mjs). Somebody reading the app in
    // German was told in English that there was nothing to read. The three
    // sentences here are the app's own, word for word the ones
    // `web/components/activity-panel.tsx` already says, so the two feeds cannot
    // drift apart and the catalogue gains nothing new.
    case "activity": {
      if (ctx.renderActivity) return ctx.renderActivity(block.source)
      return (
        <ActivityFeed
          emptyLabel={t("No activity yet.")}
          /* "It has not arrived" and "it went wrong" are different sentences,
             and the kit already knows how to draw both — they were simply
             never wired here. A host that does not thread `state` (every one
             of them, today) lands on `undefined`, which is the exact
             behaviour this block had before. */
          loading={ctx.state === "loading"}
          error={ctx.state === "error"}
          errorLabel={t("Couldn't load activity")}
          errorBody={t("We couldn't load this record's activity. Try again in a moment.")}
          items={((data.sets?.[block.source] ?? []) as unknown as Array<{
            id: string
            description: string
            actor?: string
            initials?: string
            timestamp?: string
            dateTime?: string
          }>).map((a) => ({
            id: a.id,
            description: a.description,
            actor: a.actor,
            initials: a.initials,
            time: a.timestamp,
            dateTime: a.dateTime,
          }))}
        />
      )
    }
    case "list": {
      const rows =
        data.sets?.[block.binding.source ?? block.binding.module] ?? []
      return (
        <CollectionFrame
          config={block.collection ?? { ...defaultCollectionConfig }}
          data={rows}
          /* WHICH collection this is, for the nav memory — a screen can carry
             several, and the module it binds to is the name that tells them
             apart. */
          memoryKey={block.binding.source ?? block.binding.module}
          searchKeys={["title", "name", "label"]}
          renderItems={(page) => (
            <List
              surface="none"
              items={page.map((row) => ({
                id: String(row.id ?? ""),
                title: String(
                  row.title ?? row.name ?? row.label ?? row.id ?? ""
                ),
                subtitle: row.subtitle as React.ReactNode,
              }))}
              onItemClick={(it) =>
                onIntent?.({
                  kind: "open",
                  module: block.binding.module,
                  id: it.id,
                })
              }
            />
          )}
        />
      )
    }
  }
}

function renderNode(node: RecipeNode, ctx: BlockCtx): React.ReactNode {
  if (node.node === "stack") {
    return (
      <div className={cn("flex w-full flex-col", gapClass[node.gap ?? "md"])}>
        {node.children.map((c, i) => (
          <React.Fragment key={i}>{renderNode(c, ctx)}</React.Fragment>
        ))}
      </div>
    )
  }
  if (node.node === "row") {
    // Stacks on mobile (flex-col), lays out in a wrapping row on sm+ — never
    // forces horizontal scroll (UI-RULES: multi-control rows stack on mobile).
    return (
      <div
        className={cn(
          "flex w-full flex-col sm:flex-row sm:flex-wrap",
          gapClass[node.gap ?? "md"]
        )}
      >
        {node.children.map((c, i) => (
          <div key={i} className="min-w-0 flex-1">
            {renderNode(c, ctx)}
          </div>
        ))}
      </div>
    )
  }
  // a block leaf
  if (gateState(ctx.rights, node.gate) === "hidden") return null
  return renderBlock(node.block, ctx)
}

/* ------------------------------ the screens ------------------------------ */

function renderList(
  t: (english: string) => string,
  recipe: ScreenRecipe,
  data: ScreenData,
  rights: ScreenRights,
  onAction: ScreenRendererProps["onAction"],
  onIntent?: ScreenRendererProps["onIntent"],
  state?: ScreenRendererProps["state"],
  useKitPanel?: ScreenRendererProps["useKitPanel"],
  band?: ScreenRendererProps["band"]
): React.ReactNode {
  const fields = recipe.fields.filter(
    (f) => gateState(rights, f.gate) !== "hidden"
  )
  const rows = data.rows ?? []
  const display = recipe.display ?? "table"
  const open = (row: Row) =>
    onIntent?.({
      kind: "open",
      module: recipe.binding.module,
      id: String(row.id ?? ""),
    })

  if (display === "table") {
    // Only the VISIBLE (un-gated) actions populate the ⋯ column — so the menu
    // never appears empty when every action is gated away.
    const rowActions = recipe.actions.filter((a) => gateState(rights, a.gate) !== "hidden")
    // The kit's rule (ch26 §3): "a row's name is always the first, widest
    // column and always clickable". THE KIT'S OWN DataTable DRAWS THAT BUTTON
    // — `onRowSelect` + `recordColumnKey` turn the record cell into the press
    // target, filling the cell so the whole name is the hit area. The engine
    // used to hand-roll one inside `cell`, and its hover was an underline on
    // the name; the kit's is the whole row washing (`TableRow`'s
    // `hover:bg-accent`), which is the client's own ruling of 2026-08-26 read
    // off two live screenshots and written into data-table.tsx. So the row
    // display had a hover the client ruled against, on every recipe-driven
    // table in both front doors, while the `list` and `cards` displays below
    // already let the kit own it (`List onItemClick`, `Card interactive`).
    const columns: Array<DataTableColumn<Row>> = fields.map((f) => ({
      key: f.column,
      header: f.field.label,
      sortable: true,
      cell: (row) => asNode(row[f.column]) ?? String(row[f.column] ?? ""),
    }))
    if (rowActions.length > 0)
      // The old table had a row-actions config; the kit rules an actions
      // column is simply a column, so the ⋯ menu is one — drawn from the
      // kit's own DropdownMenu.
      columns.push({
        key: "__actions",
        header: "",
        align: "end",
        cell: (row) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("Actions")}>
                <DotsThree className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {rowActions.map((a) => (
                <DropdownMenuItem
                  key={a.id}
                  onSelect={() => onAction(a.id, { id: String(row.id ?? ""), record: row })}
                >
                  {a.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      })
    return (
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row, i) => String(row.id ?? i)}
        /* Omitted, not passed as a no-op, when there is nothing to open —
           the kit draws a dead focusable control otherwise, and its own prop
           note asks for exactly this. A recipe with no visible fields has no
           record cell either, and `recordColumnKey` would then fall through
           to the ⋯ actions column: a button inside a button. */
        onRowSelect={fields.length > 0 && onIntent ? (row) => open(row) : undefined}
        recordColumnKey={fields[0]?.column}
        className="w-full"
      />
    )
  }

  // The row's leading visual, read exactly as `fields[0]` is read for the title.
  // No `recipe.leading` = `undefined` = the slot is not rendered at all, so a
  // caller that omits it gets byte-identical markup (see the guardrail test).
  const leadingOf = (row: Row): React.ReactNode =>
    recipe.leading ? asNode(row[recipe.leading]) : undefined

  return (
    <CollectionFrame
      config={recipe.collection ?? { ...defaultCollectionConfig }}
      data={rows}
      memoryKey={recipe.binding.module}
      searchKeys={fields.map((f) => f.column)}
      state={state}
      useKitPanel={useKitPanel}
      band={band}
      renderItems={(page) =>
        display === "gallery" ? (
          /* The one view where an image leads (Gallery, components/gallery).
             A row with nothing at `recipe.image` draws the tile's own
             no-picture register (its title on soft paper) rather than an
             empty box — that is the composition's own state, read straight
             off `GalleryTile.src` being undefined, not a fallback built
             here. `onTileSelect` opens the record exactly as a list row or
             a card does. */
          <Gallery
            label={recipe.collection?.title}
            tiles={page.map(
              (row): GalleryTile => ({
                id: String(row.id ?? ""),
                title: String(row[fields[0]?.column ?? "id"] ?? ""),
                src: recipe.image ? (row[recipe.image] as string | undefined) : undefined,
              })
            )}
            onTileSelect={(tile) =>
              onIntent?.({ kind: "open", module: recipe.binding.module, id: tile.id })
            }
          />
        ) : display === "cards" ? (
          /* The kit's CardGrid is the LAYOUT; the cards are children. A card
             still opens its record exactly as a list row does — the whole
             card is the press target, drawn from the kit's own Card.

             `interactive` is the kit's own word for "this card is a target",
             and it is what buys the `--accent` hover wash and motion.css's
             `motion-hover-lift`. This used to say `className="cursor-pointer"`
             instead: the cursor changed and nothing else did, so every card
             collection in the app — accounts, apps, knowledge, the lot — was a
             grid of boxes that did not react to being pointed at. The kit had
             the prop the whole time. */
          <CardGrid>
            {page.map((row) => {
              const id = String(row.id ?? "")
              return (
                // RAISED, BECAUSE THE CARD BEHIND THIS ONE IS A PANEL.
                // A grid card is drawn inside `CollectionCard`, which is a
                // `<Card>` at the default variant — `bg-surface-panel`. This one
                // was too, so it was `var(--surface-panel)` against
                // `var(--surface-panel)`: contrast 1.000, and not a coincidence
                // of two tokens that happen to share a value but the SAME token
                // on both sides, so 1.000 in every palette present and future.
                // Measured on /knowledge on 2026-08-28: 51 cards, 50 of them
                // nested, 50 of 50 rgb(247,242,235) on rgb(247,242,235) — the
                // one collection in the app given cards deliberately (R35, so
                // the source's own glyph has room to be seen) drawing no cards
                // at all. `raised` is the kit's answer by name: `bg-card` plus
                // `--shadow-rest`, and its own header says it "only reads as
                // raised when it sits inside a --surface-panel band", which is
                // exactly where this sits.
                <Card
                  key={id}
                  role="button"
                  tabIndex={0}
                  variant="raised"
                  interactive
                  onClick={() =>
                    onIntent?.({ kind: "open", module: recipe.binding.module, id })
                  }
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onIntent?.({ kind: "open", module: recipe.binding.module, id })
                    }
                  }}
                >
                  <CardHeader>
                    {leadingOf(row)}
                    <CardTitle>{String(row[fields[0]?.column ?? "id"] ?? "")}</CardTitle>
                    <CardDescription>{String(row[fields[1]?.column ?? ""] ?? "")}</CardDescription>
                  </CardHeader>
                </Card>
              )
            })}
          </CardGrid>
        ) : (
          <List
            surface={recipe.surface}
            items={page.map((row) => ({
              id: String(row.id ?? ""),
              title: String(row[fields[0]?.column ?? "id"] ?? ""),
              subtitle: String(row[fields[1]?.column ?? ""] ?? ""),
              leading: leadingOf(row),
            }))}
            onItemClick={(it) => {
              const row = page.find((r) => String(r.id ?? "") === it.id)
              if (row) open(row)
            }}
          />
        )
      }
    />
  )
}

/** The glyph a recipe tab draws, resolved EXACTLY as `tabs-view.tsx`'s own
 *  `tabIcon` resolves one for every other strip in the app: the shared
 *  vocabulary first, keyed on the tab's identity — so a recipe's Overview is
 *  the same `info` and its Activity the same `clock-counter-clockwise` a
 *  bespoke detail draws, without either file naming a glyph — then the
 *  recipe's own icon name for a key the vocabulary has never seen.
 *
 *  One table, one order, both strips. A name the kit cannot draw resolves to
 *  null and the tab keeps its word, which is `kitIcon`'s own behaviour. */
function tabGlyph(tab: { key: string; icon?: string }): React.ReactNode {
  const named = TAB_ICONS[tab.key] ?? (tab.icon || undefined)
  return named ? kitIcon(named) : undefined
}

function renderDetail(
  blockCtx: BlockCtx,
  onAction: ScreenRendererProps["onAction"]
): React.ReactNode {
  const { recipe, data, rights, onIntent } = blockCtx
  const record = data.record ?? {}
  const header = recipe.header
  const title = header
    ? String(record[header.title] ?? "")
    : recipe.binding.module
  const subtitle = header?.subtitle
    ? String(record[header.subtitle] ?? "")
    : undefined
  const ctx: ScreenActionContext = {
    id: record.id as string | undefined,
    record,
  }

  const actions = recipe.actions.length ? (
    <>
      {recipe.actions.map((a) => (
        <ActionButton
          key={a.id}
          action={a}
          rights={rights}
          onAction={onAction}
          ctx={ctx}
        />
      ))}
    </>
  ) : undefined

  // The kit's RecordDetail carries its OWN tab strip (the four-region record
  // chrome), so a recipe's tabs become ITS tabs rather than a TabsView laid
  // inside it. The colour-coded badge is not in the kit's tab model; the count
  // survives when the badge was a number.
  //
  // AND THE ICON IS BACK. Client ruling, 2026-09-02, verbatim: "yes, they
  // should have icons. They should be exactly like the line tabs. We will only
  // have one variation of tabs with icons." Every OTHER strip in the app —
  // the thirteen bespoke record details, every collection strip — resolves one
  // through `tabs-view.tsx`'s `TAB_ICONS`; this mapping used to drop `t.icon`
  // on the floor, so the recipe screens (the team's own landing page among
  // them) drew bare words beside strips that drew glyphs. `tabGlyph` resolves
  // the same table in the same order, and hands the result to the kit's own
  // `RecordDetailTab.icon` slot — the pass-through the kit added for exactly
  // this ruling, which `TabsTrigger` already sizes and spaces (`gap-2`,
  // `[&_svg]:size-[var(--icon-button)]`). Nothing here draws the tab.
  const detailTabs =
    recipe.tabs && recipe.tabs.length > 0
      ? recipe.tabs.map((t) => ({
          value: t.key,
          label: t.label,
          icon: tabGlyph(t),
          count: t.badge && /^\d+$/.test(t.badge) ? Number(t.badge) : undefined,
          content: renderBlock(t.block, blockCtx),
        }))
      : undefined
  const panelBody = detailTabs
    ? undefined
    : renderBlock({ kind: "fields" }, blockCtx)

  // NO MARK ON A RECORD TITLE — CLIENT RULING, 2026-09-01, VERBATIM: "for now
  // there are no - under no case - images on title. remove it everywhere."
  //
  // This engine used to build an `<Avatar>` here whenever the recipe declared a
  // picture column, and hand it to `RecordDetail`'s `mark`. Two recipes feed it
  // a real picture (`web/lib/screens.ts`: the team's logo on `team.detail`, a
  // member's photo on `members.detail`), so the app's own landing screen and
  // every member page kept drawing one for days after the ruling — because the
  // ruling was implemented in the BESPOKE path only, where
  // `web/components/record-chrome.tsx` marks its `mark`/`leading` props "NO
  // LONGER READ BY THIS COMPONENT" and hands the kit nothing. Same ruling, same
  // outcome, both paths.
  //
  // `ScreenHeader.avatar` / `avatarShape` stay on the recipe type for exactly
  // the reason record-chrome keeps its two: the recipes that declare them are
  // in another file, the ruling says "for now", and removing the fields would
  // force an edit at every declaring site to delete something already inert.
  // Nothing in this engine reads them any more — see their own doc comments.
  //
  // The row/tile/picker marks this ruling never reached are untouched:
  // `recipe.leading` still fills a list row's leading slot (R35), and
  // `recipe.image` still feeds the gallery display. It is TITLES that carry no
  // picture.

  return (
    <RecordDetail
      /* Clamped to two lines, the same decision the bespoke details make —
         shared/web/record-heading.tsx carries the reasoning. */
      title={clampRecordHeading(title)}
      meta={subtitle}
      actions={actions}
      tabs={detailTabs}
      onTabChange={(v) => onIntent?.({ kind: "tab", tab: v })}
      panel={panelBody}
      className="w-full"
    />
  )
}

/** A whole-screen confirm recipe (`type: "confirm"`), rendered as its own
 *  AlertDialog layer.
 *
 *  WHY THIS IS NOT `shared/web/use-confirm.tsx`, the app's canonical confirm.
 *  That hook OWNS the dialog's open state (`ask()` opens it, a successful `run`
 *  closes it) and takes a `run: () => Promise<boolean>` so a refusal can leave
 *  the dialog standing beside its error toast. Neither fits here: this dialog's
 *  openness IS the recipe being on screen — the URL put it there and
 *  `onIntent({ kind: "close" })` takes it away — and the engine's one action
 *  seam is `onAction(id, ctx): void`, deliberately fire-and-forget, so there is
 *  no promise to await and no refusal to hear about. Calling a hook from a
 *  layer whose lifetime the host controls would give the same dialog two owners.
 *
 *  So it MATCHES that hook instead, clause by clause: red through the
 *  component's own `variant` prop (see `confirmVariant`), Cancel disabled while
 *  the action is away, and the go-ahead button replaced by a spinner and
 *  "Working…" the moment it is pressed. That last one is the bug, not the
 *  polish: this dialog does not close itself on press (it is `open` outright,
 *  not Radix-managed), so before the latch below a second click fired the same
 *  write a second time. */
function ScreenConfirm({
  t,
  recipe,
  rights,
  onAction,
  onClose,
}: {
  t: (english: string) => string
  recipe: ScreenRecipe
  rights: ScreenRights
  onAction: ScreenRendererProps["onAction"]
  onClose?: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const c = recipe.confirm ?? { title: t("Are you sure?"), body: "" }
  // THE ACTION'S OWN GATE IS READ HERE TOO. This used to take `actions[0]`
  // whatever it was: a reader without the right saw, and could press, the
  // go-ahead button on a door the server would refuse — the engine's
  // defence-in-depth (`gateState`) applied to every other action on every
  // other screen type and to this one alone did not. The first action the
  // reader may actually take is the one this dialog offers; when they may
  // take none, the dialog is Cancel and nothing else, which is ch24.6's rule
  // that permissions HIDE rather than disable.
  const primary = recipe.actions.find((a) => gateState(rights, a.gate) === "show")
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose?.()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{c.title}</AlertDialogTitle>
          <AlertDialogDescription>{c.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onClose}>
            {t("Cancel")}
          </AlertDialogCancel>
          {primary && (
            <AlertDialogAction
              variant={confirmVariant(c.variant)}
              disabled={busy}
              onClick={(e) => {
                // Radix would close the dialog on this press. It must not: the
                // write is in flight and the host is what takes this layer
                // away, so closing here would swap a busy button for a screen
                // that looks like nothing happened.
                e.preventDefault()
                if (busy) return
                setBusy(true)
                onAction(primary.id, {})
              }}
            >
              {busy ? <Spinner /> : null}
              {busy ? t("Working…") : primary.label}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/* ------------------------------ the engine ------------------------------ */

function ScreenRenderer({
  recipe,
  data,
  rights,
  onAction,
  presentation,
  onIntent,
  className,
  state,
  useKitPanel,
  band,
  renderActivity,
}: ScreenRendererProps) {
  const t = useT()
  const mode: ScreenPresentation =
    presentation ?? recipe.presentation ?? "responsive"

  // Screen-level gate: a denied screen renders nothing (the host should have
  // routed away — this is the engine defending in depth).
  if (recipe.gate && gateState(rights, recipe.gate) !== "show") return null

  // confirm renders its own AlertDialog layer.
  if (recipe.type === "confirm") {
    return (
      <ScreenConfirm
        t={t}
        recipe={recipe}
        rights={rights}
        onAction={onAction}
        onClose={() => onIntent?.({ kind: "close" })}
      />
    )
  }

  const blockCtx: BlockCtx = { t, recipe, data, rights, onIntent, state, renderActivity }

  const content =
    recipe.type === "list" ? (
      renderList(t, recipe, data, rights, onAction, onIntent, state, useKitPanel, band)
    ) : recipe.type === "detail" ? (
      renderDetail(blockCtx, onAction)
    ) : recipe.type === "edit" || recipe.type === "add" ? (
      <ScreenForm
        recipe={recipe}
        data={data}
        rights={rights}
        onAction={onAction}
      />
    ) : recipe.type === "custom" && recipe.layout ? (
      renderNode(recipe.layout, blockCtx)
    ) : null

  // edit/add are always layers; overlay/sheet/fullscreen force a layer for any type.
  const isLayer =
    recipe.type === "edit" ||
    recipe.type === "add" ||
    mode === "overlay" ||
    mode === "sheet" ||
    mode === "fullscreen"

  if (isLayer) {
    const title =
      recipe.type === "edit"
        ? "Edit"
        : recipe.type === "add"
          ? "Add"
          : recipe.header
            ? String(
                data.record?.[recipe.header.title] ?? recipe.binding.module
              )
            : recipe.binding.module
    return (
      <ScreenLayer
        presentation={mode}
        title={title}
        onClose={() => onIntent?.({ kind: "close" })}
      >
        {content}
      </ScreenLayer>
    )
  }

  return <div className={cn("w-full", className)}>{content}</div>
}

export { ScreenRenderer }
