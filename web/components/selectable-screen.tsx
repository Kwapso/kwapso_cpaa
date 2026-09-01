"use client"

// Choices ("selectable data", formerly "Dropdown values") manager — host-composed,
// the "Choices" tab on the app-level Settings screen (2026-09-01; it used to be a
// tab on the team area's own strip — `/t/<teamId>/dropdowns` still resolves there,
// unlinked, for anything that still points at it). Lists the team's values grouped
// by TYPE (with the standard search + status filter), and lets admins add a value
// (via the shared form dialog — Law R4, like every other create), rename one, or
// deactivate/reactivate one. Gated by the selectable_data module; the server
// re-checks every write. Library primitives only.

import * as React from "react"
import { useRemembered } from "@shared/web/remembered"

import { Badge } from "@shared/ui/components/badge/badge"
import { cn } from "@shared/ui/lib/utils"
import { Button, buttonVariants } from "@shared/ui/components/button/button"
import { Input } from "@shared/ui/components/input/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/components/select/select"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { SortControl } from "@shared/ui/components/sort-control/sort-control"
import { toast } from "@shared/ui/components/sonner/sonner"
import { Headline } from "@shared/ui/components/typography/typography"
import { Pencil, X, Check, Upload, Download, Power, Search, Shield, ShieldOff } from "@shared/ui/foundations/icons"

import type { SortOption } from "@shared/web/screen-engine/config"
import type { SelectableValue } from "@shared/types"
import { ApiFailure, tenancy } from "@/lib/api"
import { RecordActionsMenu } from "@/components/record-chrome"
import { SelectableFormDialog } from "@/components/selectable-form-dialog"
import { usePermissions } from "@/lib/perms"
import { primeCache, useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"
import { AddButton, CollectionCard, ToolbarRow } from "@/components/deep-link/screen-bits"
import { useVirtualRows } from "@shared/ui/components/use-virtual-rows/use-virtual-rows"
import { useConfirm } from "@shared/web/use-confirm"
import { CollectionHeading } from "@/components/collection-heading"

/** WHAT A DROPDOWN VALUE MAY BE ORDERED BY. "Value" reorders the words INSIDE
 * one group (the group itself stays put, alphabetical); "Group" reorders the
 * GROUPS themselves (Ticket type before Sprint type, or the other way round)
 * and leaves what's inside each one exactly where it was. Two different
 * questions, and this is the whole vocabulary — a value has no date, no
 * count, nothing else this screen could sort by (SelectableValue carries a
 * word, a type, a default flag and an active flag, and none of the other
 * three reads as an ORDER). */
const VALUE_SORTS: SortOption[] = [
  { value: "value", label: "Value" },
  { value: "group", label: "Group" },
]

/** Shared by every row, virtualized or not — one function so the two render
 * paths cannot draw a value two different ways. */
interface RowContext {
  teamId: string
  onOpen?: (id: string) => void
  canEdit: boolean
  canDelete: boolean
  editingId: string | null
  editValue: string
  editMark: string
  savingId: string | null
  setEditingId: (id: string | null) => void
  setEditValue: (v: string) => void
  setEditMark: (v: string) => void
  saveRename: (id: string) => void
  setDefault: (v: SelectableValue, next: boolean) => void
  setActive: (v: SelectableValue, next: boolean) => void
  t: ReturnType<typeof useT>
}

function ValueRow({
  v,
  ctx,
  rowRef,
  posinset,
  setsize,
}: {
  v: SelectableValue
  ctx: RowContext
  rowRef?: React.Ref<HTMLLIElement>
  /** This row's 1-based position in the FULL (unwindowed) list, and the full
   * count — the reason both exist at all: with only a handful of rows in the
   * DOM, a screen reader has no other way to say "row 214 of 400". Both
   * omitted on the unvirtualized path, where the DOM's own order and length
   * already say the whole thing (ARIA's own guidance for `aria-posinset` /
   * `aria-setsize`: only needed when not every item is present in the DOM). */
  posinset?: number
  setsize?: number
}) {
  const {
    teamId, onOpen, canEdit, canDelete, editingId, editValue, editMark, savingId,
    setEditingId, setEditValue, setEditMark, saveRename, setDefault, setActive, t,
  } = ctx
  return (
    <li
      ref={rowRef}
      aria-posinset={posinset}
      aria-setsize={setsize}
      className={`flex items-center gap-2 px-3 py-2 ${v.active ? "" : "opacity-60"}`}
    >
      {editingId === v.id ? (
        <>
          <Input
            value={editMark}
            onChange={(e) => setEditMark(e.target.value)}
            aria-label={t("Emoji")}
            placeholder={t("Emoji")}
            maxLength={4}
            className="h-8 w-16 shrink-0 text-center"
          />
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            aria-label={t("Option")}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="h-8"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void saveRename(v.id)}
            loading={savingId === v.id}
            loadingLabel={null}
            aria-label={t("Save")}
          >
            <Check className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditingId(null)}
            aria-label={t("Cancel")}
          >
            <X className="size-4" />
          </Button>
        </>
      ) : (
        <>
          {/* THE TYPE MARK, where it is SET (CHECKLIST 11.8). It
              sits in the leading icon slot and is `aria-hidden`,
              with the word right beside it, two of the four
              conditions UI-CONVENTIONS §5 puts on a type mark, and
              this screen is the third one (it is data, set here). */}
          {v.mark && (
            <span aria-hidden className="w-5 shrink-0 text-base leading-none">
              {v.mark}
            </span>
          )}
          {/* THE WORD OPENS ITS RECORD. A real href so the row can
              be middle-clicked, copied and opened in a new tab,
              with the plain left click intercepted into the
              History-API move — the pattern app-tiles.tsx uses,
              and the reason it is a pattern rather than a bare
              anchor is that a bare anchor to an in-app path is a
              full page reload of the whole shell. */}
          {onOpen ? (
            <a
              href={`/t/${teamId}/dropdowns/${v.id}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
                  return
                e.preventDefault()
                onOpen(v.id)
              }}
              className="flex-1 text-sm underline-offset-2 hover:underline"
            >
              {v.value}
            </a>
          ) : (
            <span className="flex-1 text-sm">{v.value}</span>
          )}
          {!v.active && (
            <Badge variant="secondary" className="shrink-0">
              {t("Inactive")}
            </Badge>
          )}
          {/* ONE OF THE DEFAULTS — a word the app shipped with, and
              the reason the Deactivate action is not on this row.
              `is_default` has been on every seeded value since the
              table was written and was read by nothing at all. */}
          {v.isDefault && (
            <Badge variant="secondary" className="shrink-0">
              {t("Default")}
            </Badge>
          )}
          {/* THE TWO ACTIONS, IN THE ROW'S OWN MENU (B2). The row
              was `mark · value · "Inactive" · Edit · Power`:
              two facts, a state and two actions in one sweep,
              which is N4's other worked example. Facts on the
              line, the state as a badge at the end of it, the
              actions in the trailing slot — and never interleaved.
              H 5 → 3. */}
          <RecordActionsMenu
            tone="row"
            actions={[
              ...(v.active && canEdit
                ? [
                    {
                      key: "rename",
                      label: t("Rename"),
                      icon: <Pencil className="size-3.5" />,
                      onSelect: () => {
                        setEditingId(v.id)
                        setEditValue(v.value)
                        setEditMark(v.mark ?? "")
                      },
                    },
                  ]
                : []),
              ...(canEdit
                ? [
                    v.isDefault
                      ? {
                          key: "undefault",
                          label: t("Stop treating as a default"),
                          icon: <ShieldOff className="size-3.5" />,
                          onSelect: () => void setDefault(v, false),
                        }
                      : {
                          key: "default",
                          label: t("Make it a default"),
                          icon: <Shield className="size-3.5" />,
                          onSelect: () => void setDefault(v, true),
                        },
                  ]
                : []),
              // DEACTIVATE STANDS DOWN ON A DEFAULT rather than
              // offering itself and failing at the door. The door
              // refuses it either way (that is the real defence,
              // and it holds for the agent and MCP too); this is
              // so a person is never offered a button that cannot
              // work. Take the default mark off and it comes back.
              ...(canDelete && !v.isDefault
                ? [
                    v.active
                      ? {
                          key: "deactivate",
                          label: t("Deactivate"),
                          icon: <Power className="size-3.5" />,
                          destructive: true,
                          onSelect: () => void setActive(v, false),
                        }
                      : {
                          key: "activate",
                          label: t("Activate"),
                          icon: <Power className="size-3.5" />,
                          onSelect: () => void setActive(v, true),
                        },
                  ]
                : []),
            ]}
          />
        </>
      )}
    </li>
  )
}

/** One type's own rows. VIRTUALIZED PER GROUP, not across the whole screen —
 * `useVirtualRows` assumes one row height for the whole list it is given, and
 * a flattened list would mix group-header rows (a different height) into
 * that assumption. Each group's own items ARE uniform, so this is the grain
 * that keeps the hook's guarantee true. A group under the threshold renders
 * exactly as it always did — same markup, no scroll box, `virtualized: false`
 * — so nothing about a short group's page position or print layout changes.
 *
 * THE SCROLL BOX ONLY APPEARS ONCE VIRTUALISED. Windowing only saves anything
 * inside a HEIGHT-BOUNDED container: unbounded, the browser would still be
 * asked to lay out (if not paint) every row as the page grows to fit them.
 * `max-h-[28rem]` is roughly nine rows at the 56px fallback height — enough
 * to browse a handful of screens' worth before scrolling, on any group large
 * enough to need it at all. */
function GroupValues({ items, ctx }: { items: SelectableValue[]; ctx: RowContext }) {
  const v = useVirtualRows<HTMLUListElement>({ count: items.length })

  if (!v.virtualized) {
    return (
      <ul className="divide-border divide-y rounded-[var(--radius)] bg-surface-panel">
        {items.map((item) => (
          <ValueRow key={item.id} v={item} ctx={ctx} />
        ))}
      </ul>
    )
  }

  return (
    <ul
      ref={v.scrollRef}
      className="divide-border divide-y rounded-[var(--radius)] bg-surface-panel max-h-[28rem] overflow-y-auto"
    >
      {/* THE SPACERS ARE `<li>`s, not `<div>`s wrapping one — a `<ul>`'s only
          valid direct children are `<li>`, and a reader's list-item count
          depends on that structure staying true even for the two rows that
          carry no content. Both are `aria-hidden`, from `use-virtual-rows`'s
          own `SPACER_ATTR` contract, so neither is announced as an empty
          list item. */}
      <li {...v.startSpacerProps} />
      {v.rows.map((index) => (
        <ValueRow
          key={items[index].id}
          v={items[index]}
          ctx={ctx}
          posinset={index + 1}
          setsize={items.length}
          rowRef={index === v.startIndex ? (v.measureRef as unknown as React.Ref<HTMLLIElement>) : undefined}
        />
      ))}
      <li {...v.endSpacerProps} />
    </ul>
  )
}

export function SelectableScreen({
  teamId,
  onImport,
  onOpen,
  standalone = true,
}: {
  teamId: string
  /** Host-provided soft-nav to the import wizard (pre-targeted to dropdown values). */
  onImport?: () => void
  /** Host-provided soft-nav to ONE value's record (Overview + Activity, Law R2).
   * The host owns the URL shape, exactly as it does for the import wizard above —
   * this screen knows a value has a record and not where the record lives. */
  onOpen?: (id: string) => void
  /** Whether this is a whole page (`/t/<teamId>/dropdowns`, still resolves for
   * anything unlinked that points at it — module-content.tsx) or one tab of the
   * Settings screen (settings-screen.tsx, "Choices"). A page names and counts
   * itself through the registry's own `CollectionHeading` (R16 ii); a tab
   * already has its own name on the strip above it, so a second, page-sized
   * heading inside the panel would be the count and the title said twice. */
  standalone?: boolean
}) {
  const t = useT()
  const { can } = usePermissions(teamId)
  const valuesQ = useCached<SelectableValue[]>(`selectable:${teamId}`, () =>
    tenancy.selectable().then((r) => r.values)
  )

  const canCreate = can("selectable_data", "create")
  const canEdit = can("selectable_data", "edit")
  const canDelete = can("selectable_data", "delete")

  // Add via the shared form dialog (Law R4); the screen just toggles it open.
  const [addOpen, setAddOpen] = React.useState(false)
  // Inline rename state (one row at a time).
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [savingId, setSavingId] = React.useState<string | null>(null)
  const [editValue, setEditValue] = React.useState("")
  // The emoji, editable at last. The door has parsed and written it since the
  // day it shipped and this screen never sent one, so a value's emoji could be
  // chosen when it was created and never changed again.
  const [editMark, setEditMark] = React.useState("")
  // Collection filter chrome — the SAME shape the other collections (roles,
  // learning, help) use: a text search + a status filter defaulting to Active, so
  // deactivated values hide until you ask for them (then show greyed with Activate).
  // Remembered with the screen — see web/lib/nav-memory.ts.
  const [query, setQuery] = useRemembered("search", "")
  const [status, setStatus] = React.useState<"active" | "inactive" | "all">("active")
  // Sort — "Value" (default, A→Z inside each group) or "Group" (reorders the
  // group headings themselves). Not remembered with the screen: it is a view
  // preference over a short list a person re-derives in one glance, the same
  // weight `status` above already gets.
  const [sort, setSort] = React.useState<{ by: string; dir: "asc" | "desc" }>({
    by: "value",
    dir: "asc",
  })
  // Deactivating a value is the red half — one confirm dialog
  // (shared/web/use-confirm.tsx); reactivating stays confirm-free.
  const { ask: askDeactivate, run: runActive, dialog: deactivateDialog } = useConfirm()

  const values = valuesQ.data ?? []
  // The add form's group datalist offers EVERY existing type (not just the filtered
  // ones), so you can always add to any group.
  const types = Array.from(new Set(values.map((v) => v.type))).sort()
  // The list is the filtered set, grouped by type.
  const q = query.trim().toLowerCase()
  const filtered = values.filter(
    (v) =>
      (status === "all" || (status === "active" ? v.active : !v.active)) &&
      (q === "" || v.value.toLowerCase().includes(q) || v.type.toLowerCase().includes(q))
  )
  // "Value" sorts what's INSIDE each group; "Group" sorts the group headings
  // themselves and leaves each one's own order alone — two different
  // questions, never mixed into one comparator.
  const dirMul = sort.dir === "desc" ? -1 : 1
  const sortedFiltered =
    sort.by === "value"
      ? [...filtered].sort((a, b) => a.value.localeCompare(b.value) * dirMul)
      : filtered
  const grouped = Array.from(new Set(sortedFiltered.map((v) => v.type)))
    .sort((a, b) => a.localeCompare(b) * (sort.by === "group" ? dirMul : 1))
    .map((t) => ({ type: t, items: sortedFiltered.filter((v) => v.type === t) }))

  // Create — the dialog calls this; it throws on failure so the dialog surfaces the
  // reason and stays open, and closes itself on success.
  async function addValue(type: string, value: string, mark: string) {
    const { values: next } = await tenancy.createSelectable(type, value, mark || undefined)
    primeCache(`selectable:${teamId}`, next)
    toast.success(`Added "${value}".`)
  }

  async function saveRename(id: string) {
    if (!editValue.trim() || savingId) return
    // THE ROW SAYS IT IS SAVING. A rename crosses the gateway, the worker, six
    // reads and writes over the D1 REST door and a realtime ping before the list
    // comes back, and the checkmark used to sit there looking unpressed for all
    // of it — so the first thing a person did was press it again. The wait got
    // shorter this round; this is the half that makes it FEEL shorter, and the
    // half that stops the second click.
    setSavingId(id)
    try {
      const { values: next } = await tenancy.updateSelectable(id, editValue, editMark)
      primeCache(`selectable:${teamId}`, next)
      setEditingId(null)
      toast.success(t("Renamed."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't rename that value."))
    } finally {
      setSavingId(null)
    }
  }

  /** Mark a value as one of the team's defaults, or take the mark off. The mark
   * is what stops `setActive` retiring a word the app shipped with. */
  async function setDefault(v: SelectableValue, next: boolean) {
    try {
      const { values: rows } = await tenancy.setSelectableDefault(v.id, next)
      primeCache(`selectable:${teamId}`, rows)
      toast.success(next ? t("Marked as a default.") : t("No longer a default."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't change that."))
    }
  }

  // Deactivate / reactivate one value. A deactivated value is switched off, not deleted:
  // it stays visible here (greyed, with an Activate button) so it's never a dead end,
  // and drops out of the form pickers. Same key the pickers read, so both refresh.
  // Deactivating is the red half, so it asks first; reactivating does not.
  function setActive(v: SelectableValue, next: boolean) {
    if (!next) {
      askDeactivate({
        title: t('Deactivate "{value}"?', { value: v.value }),
        body: t("It drops out of the pickers everywhere it's offered. Anything already using it keeps it, and you can turn it back on any time."),
        action: t("Deactivate"),
        run: () =>
          runActive(
            () => tenancy.setSelectableActive(v.id, false).then(({ values: list }) => primeCache(`selectable:${teamId}`, list)),
            t('Deactivated "{value}".', { value: v.value }),
            t("Couldn't update that value.")
          ),
      })
      return
    }
    void runActive(
      () => tenancy.setSelectableActive(v.id, true).then(({ values: list }) => primeCache(`selectable:${teamId}`, list)),
      t('Activated "{value}".', { value: v.value }),
      t("Couldn't update that value.")
    )
  }

  if (valuesQ.error)
    return <p className="text-destructive text-sm">{t("Couldn't load dropdown values.")}</p>
  if (valuesQ.data === undefined) return <Skeleton variant="list" lines={5} />

  // Bundled once so `GroupValues`/`ValueRow` take one prop instead of
  // fourteen — every group reads the SAME state and handlers, never its own.
  const rowCtx: RowContext = {
    teamId, onOpen, canEdit, canDelete, editingId, editValue, editMark, savingId,
    setEditingId, setEditValue, setEditMark, saveRename, setDefault, setActive, t,
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        {/* THE REGISTRY'S OWN HEADING, standalone only (R16 ii) — the "Choices"
            page names and counts itself here; the "Choices" TAB on Settings
            already carries that name on the strip above this panel, so a
            second, page-sized title inside it would say the name and the
            count twice (R16). Embedded, only the description line stays. */}
        {standalone ? (
          <CollectionHeading sectionKey="dropdowns" total={values.length} />
        ) : (
          <Headline as="h2" size="h4">{t("Choices")}</Headline>
        )}
        <p className="text-muted-foreground mt-1 text-sm">
          {t("The options behind your team's dropdowns. Ticket types, Sprint types and more. Pick a group, or start a new one.")}
        </p>
      </div>

      {canCreate && (
        <SelectableFormDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          types={types}
          onSubmit={addValue}
          draftKey={`selectable-add:${teamId}`}
        />
      )}

      {/* THE CANONICAL SHAPE — title, then ONE card holding the toolbar (search
          + status filter, LEFT) and the rows, with New/Import/Export at the
          FAR RIGHT of that SAME toolbar row (client ruling, 2026-08-31: an
          action button never gets a row of its own, separate from the
          search/filter it belongs beside). This screen has no tab strip
          (single-view, like Roles and Processes), so the toolbar is the first
          thing inside the card — drawn through `<ToolbarRow>` (screen-bits.tsx)
          rather than the two hand-rolled rows this used to be, one of them
          floating ABOVE the card with the actions and one below it with the
          search — so the button cannot drift back onto its own row. */}
      <CollectionCard>
        {(values.length > 0 || canCreate) && (
          <ToolbarRow
            className="mb-4"
            search={
              values.length > 0 && (
                <>
                  <div className="relative w-full sm:w-56">
                    <Search
                      className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2"
                      aria-hidden
                    />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t("Search values…")}
                      className="h-9 pl-8"
                      aria-label={t("Search dropdown values")}
                    />
                  </div>
                  <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                    <SelectTrigger className="h-9 w-full sm:w-40" aria-label={t("Filter by status")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">{t("Active")}</SelectItem>
                      <SelectItem value="inactive">{t("Inactive")}</SelectItem>
                      <SelectItem value="all">{t("All")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <SortControl
                    options={VALUE_SORTS.map((o) => ({ ...o, label: t(o.label) }))}
                    value={sort.by}
                    onValueChange={(by) => setSort({ by, dir: "asc" })}
                    direction={sort.dir}
                    onDirectionChange={(dir) => setSort((s) => ({ ...s, dir }))}
                    label={t("Sort by")}
                  />
                </>
              )
            }
            actions={
              <>
                {values.length > 0 && (
                  <a
                    href="/api/tenancy/selectable/export"
                    className={cn(buttonVariants({ variant: "secondary" }), "gap-1")}
                  >
                    <Download className="size-4" aria-hidden /> {t("Export CSV")}
                  </a>
                )}
                {canCreate && onImport && (
                  <Button variant="secondary" onClick={onImport} className="gap-1">
                    <Upload className="size-4" aria-hidden /> {t("Import CSV")}
                  </Button>
                )}
                {canCreate && <AddButton label={t("New value")} onClick={() => setAddOpen(true)} />}
              </>
            }
          />
        )}

        {grouped.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {values.length === 0
              ? t("No values yet. Add your first above.")
              : t("No values match your search or filter.")}
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {grouped.map((g) => (
              <div key={g.type} className="flex flex-col gap-2">
                <h2 className="text-sm font-medium">{g.type}</h2>
                <GroupValues items={g.items} ctx={rowCtx} />
              </div>
            ))}
          </div>
        )}
      </CollectionCard>

      {deactivateDialog}
    </div>
  )
}
