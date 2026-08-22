"use client"

// RAISE A TICKET — one box, one button.
//
// The agency's version of this form also offers a Type dropdown (drawn from the
// team's editable "Ticket type" values) and a link to manage those values. Neither
// belongs here: choosing a category is a job the client shouldn't have to do to
// ask for help, and the dropdown door isn't on the portal's surface at all. The
// agency can type the ticket after it lands.
//
// R4: renders through the shared FormShell — the same one the agency app uses,
// imported rather than copied.
// R7: the draft survives navigating away. Someone typing a careful description
// on a phone must not lose it to a stray tap.

import * as React from "react"

import {
  DialogDescription,
  DialogTitle,
} from "@shared/ui/registry/primitives/dialog/dialog"
import { Field } from "@shared/web/field"
import { Notes } from "@shared/ui/registry/primitives/notes/notes"
import { toast } from "@shared/ui/registry/primitives/sonner/sonner"
import { defaultFieldConfig } from "@shared/ui/lib/config"
import { Plus } from "lucide-react"

import { FormShellDialog, fieldSpacing } from "@shared/web/form-shell"
import { richTextValue } from "@shared/web/rich-text"
import { useFormDraft } from "@shared/web/use-form-draft"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/registry/primitives/select/select"

import { ApiFailure, appModules } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"
import type { AppModule } from "@shared/types"
import { useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"

const descField = { ...defaultFieldConfig, label: "What do you need?", required: true }
// WHICH PART OF WHICH SYSTEM (Aurora, 19 Aug 2026). ONE question, not two, and
// that is the whole design of this control: the agency's form asks for the app
// and then the section, because a staff member files against any of 28 systems.
// A client has one or two, and their sections are grouped under them here — so
// picking "Documents" under "Padelbase" answers BOTH, and the pair can never
// disagree. Aurora's own note is what says it is answerable at all: "it's not
// difficult to identify the module — most of the times it's the active page on
// the sidebar".
const moduleField = (required: boolean) => ({
  ...defaultFieldConfig,
  label: "What is it about?",
  required,
  hint: "The part of your system this is about. It helps us route it to the right person.",
})

export function RaiseTicketDialog({
  open,
  onOpenChange,
  onSubmit,
  draftKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: { description: string; appId?: string; moduleId?: string }) => Promise<void>
  /** stable id for per-session draft persistence (CACHING.md §11) */
  draftKey: string
}) {
  const t = useT()
  const [values, setValues, clearDraft] = useFormDraft(draftKey, { description: "", moduleId: "" }, open)
  const [busy, setBusy] = React.useState(false)

  // THE SECTIONS OF THIS CLIENT'S OWN APPS. The door is fenced to the accounts
  // this person may stand in, so nothing here needs narrowing: what comes back
  // is already only their systems. Read only while the form is open — a picker
  // nobody has opened costs nothing.
  const modulesQ = useCached<AppModule[]>(open ? cacheKeys.appModules : null, () =>
    appModules.list().then((r) => r.modules)
  )
  const mine = (modulesQ.data ?? []).filter((m) => m.active)
  // GROUPED BY THE APP THEY BELONG TO, so one list answers both halves.
  const byApp = React.useMemo(() => {
    const groups = new Map<string, { appName: string; modules: AppModule[] }>()
    for (const m of mine) {
      const group = groups.get(m.appId) ?? { appName: m.appName, modules: [] }
      group.modules.push(m)
      groups.set(m.appId, group)
    }
    return [...groups.values()].sort((a, b) => a.appName.localeCompare(b.appName))
  }, [mine])
  // Required only where it can be answered: a client whose apps have no sections
  // written down yet is not asked a question with no answers (the same rule the
  // agency form keeps, and it tightens by itself as the sections get written).
  const moduleRequired = mine.length > 0
  const chosen = mine.find((m) => m.id === values.moduleId) ?? null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      // BOTH HALVES, from the one answer. The door checks that the module
      // belongs to the app, so sending the module's own app is the only pair
      // that can be right.
      await onSubmit({
        description: richTextValue(values.description),
        appId: chosen?.appId,
        moduleId: chosen?.id,
      })
      clearDraft()
      onOpenChange(false)
      toast.success(t("Sent. We'll come back to you here."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't send that. Try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormShellDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      clearDraft={clearDraft}
      onSubmit={submit}
      title={<DialogTitle>{t("Ask us something")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("Tell us what's going on in your own words. You'll get the reply right here.")}
        </DialogDescription>
      }
      submit={{
        busy: busy,
        disabled: !richTextValue(values.description) || (moduleRequired && !chosen),
        icon: <Plus className="size-3.5" />,
      }}
    >
      {moduleRequired ? (
        <Field config={moduleField(true)} htmlFor="ticket-module" className={fieldSpacing}>
          <Select
            value={values.moduleId || undefined}
            onValueChange={(moduleId) => setValues((v) => ({ ...v, moduleId }))}
            disabled={busy}
          >
            <SelectTrigger id="ticket-module" className="w-full">
              <SelectValue placeholder={t("Choose a part of your system")} />
            </SelectTrigger>
            <SelectContent>
              {byApp.map((group) => (
                <SelectGroup key={group.appName}>
                  <p className="text-muted-foreground px-2 py-1.5 text-xs font-medium">{group.appName}</p>
                  {group.modules.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.mark ? `${m.mark} ` : ""}
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      <Field config={descField} htmlFor="ticket-desc" className={fieldSpacing}>
        <Notes
          key={open ? "open" : "shut"}
          defaultValue={values.description}
          onChange={(html) => setValues((v) => ({ ...v, description: html }))}
          placeholder={t("For example: the new booking page is showing last month's prices.")}
          className="min-h-32"
        />
      </Field>
    </FormShellDialog>
  )
}
