"use client"

// ScreenRenderer — the config-driven SCREEN ENGINE. It renders a `ScreenRecipe`
// (lib/recipe) by COMPOSING the library's existing collections + primitives, and
// auto-hides gated fields/actions from the injected per-module rights. It does
// NOT fetch data, call APIs, store recipes, or own the router: the host injects
// `data` + `rights` + `onAction`, and the engine emits navigate/close intents the
// host maps to URL changes (the deep-link grammar in lib/recipe).

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import {
  gateState,
  type RecipeAction,
  type RecipeBlock,
  type RecipeField,
  type RecipeFieldType,
  type RecipeNode,
  type ScreenPresentation,
  type ScreenRecipe,
  type ScreenRights,
} from "../../../lib/recipe"
import { defaultCollectionConfig, validateField } from "../../../lib/config"
import { cn } from "../../../lib/utils"
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
} from "../../primitives/alert-dialog/alert-dialog"
import { Button, buttonVariants } from "../../primitives/button/button"
import { Choice, defaultChoiceConfig } from "../../primitives/choice/choice"
import { DatePicker } from "../../primitives/date-picker/date-picker"
import { Field } from "../../primitives/field/field"
import { FileUpload } from "../../primitives/file-upload/file-upload"
import { Input } from "../../primitives/input/input"
import { Notes } from "../../primitives/notes/notes"
import { Switch } from "../../primitives/switch/switch"
import { defaultTabsConfig, TabsView } from "../../primitives/tabs/tabs"
import {
  ActivityFeed,
  defaultActivityFeedConfig,
  type ActivityItem,
} from "../activity-feed/activity-feed"
import { CardGrid } from "../card-grid/card-grid"
import { CollectionFrame } from "../collection-frame/collection-frame"
import {
  DataTable,
  defaultDataTableConfig,
  type DataTableColumn,
  type DataTableConfig,
  type RowAction,
} from "../data-table/data-table"
import {
  DescriptionList,
  defaultDescriptionListConfig,
} from "../description-list/description-list"
import { List } from "../list/list"
import {
  defaultRecordDetailConfig,
  RecordDetail,
} from "../record-detail/record-detail"

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
}

/* -------------------------------- helpers -------------------------------- */

const gapClass = { sm: "gap-2", md: "gap-4", lg: "gap-6" } as const

function initials(s: string): string {
  return (
    s
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  )
}

/** A row value, narrowed to something React can actually draw. Row values are
 *  `unknown`, so a host CAN hand us a plain object — and React throws on an
 *  object child, which would take the whole screen down. Anything undrawable
 *  renders as nothing instead. */
function asNode(value: unknown): React.ReactNode {
  if (value == null || typeof value === "boolean") return undefined
  if (typeof value === "string" || typeof value === "number") return value
  return React.isValidElement(value) ? value : undefined
}

function colType(t: RecipeFieldType): DataTableColumn["type"] {
  return t === "number" ? "number" : t === "date" ? "date" : "text"
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
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                action.confirm.variant === "destructive"
                  ? buttonVariants({ variant: "destructive" })
                  : undefined
              }
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
    "inset-x-0 bottom-0 max-h-[90svh] rounded-t-xl sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-lg sm:max-h-[85vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl",
  overlay:
    "top-1/2 left-1/2 w-full max-w-lg max-h-[85vh] -translate-x-1/2 -translate-y-1/2 rounded-xl",
  sheet: "inset-x-0 bottom-0 max-h-[90svh] rounded-t-xl",
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
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose?.()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "glass fixed z-50 flex flex-col gap-4 overflow-y-auto border p-6 shadow-xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0",
            layerContent[presentation]
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <DialogPrimitive.Title className="text-lg font-medium">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close"
              className="rounded-full opacity-70 transition-opacity outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
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
            value={String(v ?? "")}
            onChange={(d) => set(f.column, d)}
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
        return <FileUpload onChange={(files) => set(f.column, files)} />
      case "choice":
        return (
          <Choice
            options={data.options?.[f.optionsFrom ?? f.column] ?? []}
            value={v ? [String(v)] : []}
            onChange={(arr) => set(f.column, arr[0] ?? "")}
            config={{
              ...defaultChoiceConfig,
              mode: "single",
              display: "dropdown",
            }}
          />
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
              disabled:
                gateState(rights, f.gate) === "disabled" || f.field.disabled,
            }}
            htmlFor={f.column}
            error={errors[f.column]}
            ringed={f.type === "text" || f.type === "number"}
          >
            {renderInput(f)}
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
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
      </div>
    </div>
  )
}

/* ------------------------------- the blocks ------------------------------- */

function renderBlock(
  block: RecipeBlock,
  recipe: ScreenRecipe,
  data: ScreenData,
  rights: ScreenRights,
  onIntent?: ScreenRendererProps["onIntent"]
): React.ReactNode {
  const record = data.record ?? {}
  switch (block.kind) {
    case "description":
      return (
        <DescriptionList
          items={block.rows.map((r) => ({
            label: r.label,
            value: record[r.column] as React.ReactNode,
          }))}
          config={{
            ...defaultDescriptionListConfig,
            columns: block.columns ?? 2,
          }}
        />
      )
    case "fields":
      return (
        <DescriptionList
          items={recipe.fields
            .filter((f) => gateState(rights, f.gate) !== "hidden")
            .map((f) => ({
              label: f.field.label,
              value: record[f.column] as React.ReactNode,
            }))}
          config={defaultDescriptionListConfig}
        />
      )
    case "activity":
      return (
        <ActivityFeed
          items={(data.sets?.[block.source] ?? []) as unknown as ActivityItem[]}
          config={defaultActivityFeedConfig}
        />
      )
    case "list": {
      const rows =
        data.sets?.[block.binding.source ?? block.binding.module] ?? []
      return (
        <CollectionFrame
          config={block.collection ?? { ...defaultCollectionConfig }}
          data={rows}
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

function renderNode(
  node: RecipeNode,
  recipe: ScreenRecipe,
  data: ScreenData,
  rights: ScreenRights,
  onIntent?: ScreenRendererProps["onIntent"]
): React.ReactNode {
  if (node.node === "stack") {
    return (
      <div className={cn("flex w-full flex-col", gapClass[node.gap ?? "md"])}>
        {node.children.map((c, i) => (
          <React.Fragment key={i}>
            {renderNode(c, recipe, data, rights, onIntent)}
          </React.Fragment>
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
            {renderNode(c, recipe, data, rights, onIntent)}
          </div>
        ))}
      </div>
    )
  }
  // a block leaf
  if (gateState(rights, node.gate) === "hidden") return null
  return renderBlock(node.block, recipe, data, rights, onIntent)
}

/* ------------------------------ the screens ------------------------------ */

function renderList(
  recipe: ScreenRecipe,
  data: ScreenData,
  rights: ScreenRights,
  onAction: ScreenRendererProps["onAction"],
  onIntent?: ScreenRendererProps["onIntent"]
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
    const actions: RowAction<Row>[] = recipe.actions
      .filter((a) => gateState(rights, a.gate) !== "hidden")
      .map((a) => ({
        label: a.label,
        onSelect: (row) =>
          onAction(a.id, { id: String(row.id ?? ""), record: row }),
      }))
    const config: DataTableConfig = {
      ...defaultDataTableConfig,
      ...recipe.collection,
      columns: fields.map((f) => ({
        key: f.column,
        header: f.field.label,
        type: colType(f.type),
        sortable: true,
        align: "left" as const,
      })),
      rowActions: actions.length > 0,
    }
    return (
      <DataTable
        data={rows}
        config={config}
        actions={actions}
        onRowClick={open}
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
      searchKeys={fields.map((f) => f.column)}
      renderItems={(page) =>
        display === "cards" ? (
          <CardGrid
            items={page.map((row) => ({
              id: String(row.id ?? ""),
              title: String(row[fields[0]?.column ?? "id"] ?? ""),
              description: String(row[fields[1]?.column ?? ""] ?? ""),
              media: leadingOf(row),
              // ALWAYS INSET, because `leading` is always a record's MARK — a
              // small face or glyph, never a photo that wants the card's full
              // width. The renderer is the thing that knows which of the two it
              // is passing, so it is the thing that says.
              mediaFit: "inset" as const,
            }))}
            // A CARD OPENS ITS RECORD, exactly as a list row does. `CardGrid` has
            // taken `onItemClick` since it was written and this passed none, so a
            // recipe that chose `display: "cards"` got a grid of records nothing
            // could open — the same collection, inert, for choosing a layout. It
            // is also what turns the cards interactive: `CardGrid` reads
            // `Boolean(onItemClick)` for its own hover and focus affordances, so
            // without it the cards did not even look clickable.
            onItemClick={(item) =>
              onIntent?.({
                kind: "open",
                module: recipe.binding.module,
                id: item.id,
              })
            }
          />
        ) : (
          <List
            surface={recipe.surface}
            items={page.map((row) => ({
              id: String(row.id ?? ""),
              title: String(row[fields[0]?.column ?? "id"] ?? ""),
              subtitle: String(row[fields[1]?.column ?? ""] ?? ""),
              leading: leadingOf(row),
            }))}
            onItemClick={open}
          />
        )
      }
    />
  )
}

function renderDetail(
  recipe: ScreenRecipe,
  data: ScreenData,
  rights: ScreenRights,
  onAction: ScreenRendererProps["onAction"],
  onIntent?: ScreenRendererProps["onIntent"]
): React.ReactNode {
  const record = data.record ?? {}
  const header = recipe.header
  const title = header
    ? String(record[header.title] ?? "")
    : recipe.binding.module
  const subtitle = header?.subtitle
    ? String(record[header.subtitle] ?? "")
    : undefined
  const avatarSrc = header?.avatar ? String(record[header.avatar] ?? "") : ""
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

  const body =
    recipe.tabs && recipe.tabs.length > 0 ? (
      <TabsView
        config={{
          ...defaultTabsConfig,
          variant: "line",
          fullWidth: true,
          tabs: recipe.tabs.map((t) => ({
            value: t.key,
            label: t.label,
            icon: t.icon ?? "",
            badge: t.badge ?? "",
            badgeVariant: t.badgeVariant ?? "",
          })),
        }}
        onValueChange={(v) => onIntent?.({ kind: "tab", tab: v })}
        renderPanel={(tab) => {
          const t = recipe.tabs?.find((x) => x.key === tab.value)
          return t ? renderBlock(t.block, recipe, data, rights, onIntent) : null
        }}
      />
    ) : (
      renderBlock({ kind: "fields" }, recipe, data, rights, onIntent)
    )

  return (
    <RecordDetail
      config={defaultRecordDetailConfig}
      title={title}
      subtitle={subtitle}
      avatarSrc={avatarSrc || undefined}
      // Initials ONLY when the recipe declares an avatar column. Three of the
      // host's five recipe details have no picture concept at all, and each was
      // opening with two letters of its own title in a circle.
      avatarFallback={header?.avatar ? initials(title) : undefined}
      avatarShape={header?.avatarShape}
      actions={actions}
      className="w-full"
    >
      {body}
    </RecordDetail>
  )
}

function renderConfirm(
  recipe: ScreenRecipe,
  onAction: ScreenRendererProps["onAction"],
  onClose?: () => void
): React.ReactNode {
  const c = recipe.confirm ?? { title: "Are you sure?", body: "" }
  const primary = recipe.actions[0]
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose?.()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{c.title}</AlertDialogTitle>
          <AlertDialogDescription>{c.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          {primary && (
            <AlertDialogAction
              className={
                c.variant === "destructive"
                  ? buttonVariants({ variant: "destructive" })
                  : undefined
              }
              onClick={() => onAction(primary.id, {})}
            >
              {primary.label}
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
}: ScreenRendererProps) {
  const mode: ScreenPresentation =
    presentation ?? recipe.presentation ?? "responsive"

  // Screen-level gate: a denied screen renders nothing (the host should have
  // routed away — this is the engine defending in depth).
  if (recipe.gate && gateState(rights, recipe.gate) !== "show") return null

  // confirm renders its own AlertDialog layer.
  if (recipe.type === "confirm") {
    return renderConfirm(recipe, onAction, () => onIntent?.({ kind: "close" }))
  }

  const content =
    recipe.type === "list" ? (
      renderList(recipe, data, rights, onAction, onIntent)
    ) : recipe.type === "detail" ? (
      renderDetail(recipe, data, rights, onAction, onIntent)
    ) : recipe.type === "edit" || recipe.type === "add" ? (
      <ScreenForm
        recipe={recipe}
        data={data}
        rights={rights}
        onAction={onAction}
      />
    ) : recipe.type === "custom" && recipe.layout ? (
      renderNode(recipe.layout, recipe, data, rights, onIntent)
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
