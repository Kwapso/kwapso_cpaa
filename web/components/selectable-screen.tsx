"use client"

// Dropdown values ("selectable data") manager — host-composed, a tab on the team
// Settings area. Lists the team's values grouped by TYPE (with the standard search +
// status filter), and lets admins add a value (via the shared form dialog — Law R4,
// like every other create), rename one, or deactivate/reactivate one. Gated by the
// selectable_data module; the server re-checks every write. Library primitives only.

import * as React from "react"

import { Badge } from "@shared/ui/registry/primitives/badge/badge"
import { Button } from "@shared/ui/registry/primitives/button/button"
import { Input } from "@shared/ui/registry/primitives/input/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/registry/primitives/select/select"
import { Skeleton } from "@shared/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@shared/ui/registry/primitives/sonner/sonner"
import { Pencil, X, Check, Upload, Download, Power, Search, Shield, ShieldOff, Loader2 } from "lucide-react"

import type { SelectableValue } from "@shared/types"
import { ApiFailure, tenancy } from "@/lib/api"
import { RecordActionsMenu } from "@/components/record-chrome"
import { SelectableFormDialog } from "@/components/selectable-form-dialog"
import { usePermissions } from "@/lib/perms"
import { primeCache, useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"
import { AddButton } from "@/components/deep-link/screen-bits"

export function SelectableScreen({
  teamId,
  onImport,
}: {
  teamId: string
  /** Host-provided soft-nav to the import wizard (pre-targeted to dropdown values). */
  onImport?: () => void
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
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState<"active" | "inactive" | "all">("active")

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
  const grouped = Array.from(new Set(filtered.map((v) => v.type)))
    .sort()
    .map((t) => ({ type: t, items: filtered.filter((v) => v.type === t) }))

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
  async function setActive(v: SelectableValue, next: boolean) {
    try {
      const { values: list } = await tenancy.setSelectableActive(v.id, next)
      primeCache(`selectable:${teamId}`, list)
      toast.success(next ? `Activated "${v.value}".` : `Deactivated "${v.value}".`)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't update that value."))
    }
  }

  if (valuesQ.error)
    return <p className="text-destructive text-sm">{t("Couldn't load dropdown values.")}</p>
  if (valuesQ.data === undefined) return <Skeleton variant="list" lines={5} />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">
            {t("Dropdown values")}
            {/* HOW MANY, BESIDE THE HEADING — because a count is a RESULT and a
                heading is where this app says how big a collection is. It used
                to sit at the head of the filter bar, on the same band as the
                search box and the status Select, which are CAUSES. Three units,
                one band, two different questions, and that is N4's own worked
                example of the "twisted" fault: the eye reads left to right
                expecting one idea and gets an answer followed by two controls
                that produce it. Nothing about the number changed — this is a
                bounded collection read whole, so it is an honest count of the
                rows in hand rather than a page length. */}
            {values.length > 0 && (
              <span className="text-muted-foreground ml-2 text-base font-normal tabular-nums">
                {filtered.length === values.length
                  ? values.length
                  : t("{shown} of {total}", {
                      shown: filtered.length,
                      total: values.length,
                    })}
              </span>
            )}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("The options behind your team's dropdowns. Ticket types, Sprint types and more. Pick a group, or start a new one.")}
          </p>
        </div>
        {/* Actions — New value / Import / Export. flex-wrap so the buttons never
         * clip on a phone (UI-CONVENTIONS action-row rule). New records go through
         * the shared form dialog (Law R4), never an inline row. */}
        <div className="flex flex-wrap justify-end gap-2">
          {values.length > 0 && (
            <Button asChild variant="outline" className="gap-1">
              <a href="/api/tenancy/selectable/export">
                <Download className="size-4" aria-hidden /> {t("Export CSV")}
              </a>
            </Button>
          )}
          {canCreate && onImport && (
            <Button variant="outline" onClick={onImport} className="gap-1">
              <Upload className="size-4" aria-hidden /> {t("Import CSV")}
            </Button>
          )}
          {canCreate && (
            <AddButton label={t("New value")} onClick={() => setAddOpen(true)} />
          )}
        </div>
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

      {/* Filter bar. Search + status, matching the other collections. Deactivated
       * values are hidden under the Active default; switch to Inactive/All to see and
       * reactivate them. flex-wrap so the controls never clip on a phone. */}
      {values.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
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
              <ul className="divide-border divide-y rounded-xl border">
                {g.items.map((v) => (
                  <li
                    key={v.id}
                    className={`flex items-center gap-2 px-3 py-2 ${
                      v.active ? "" : "opacity-60"
                    }`}
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
                          disabled={savingId === v.id}
                          aria-label={t("Save")}
                        >
                          {savingId === v.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Check className="size-4" />
                          )}
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
                        <span className="flex-1 text-sm">{v.value}</span>
                        {!v.active && (
                          <Badge variant="outline" className="shrink-0">
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
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
