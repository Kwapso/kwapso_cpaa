// The ONE consistent audit block every record's Overview tab shows, so "metadata"
// reads the same everywhere (RULES/feedback 2026-06-30).
//
// IT TAKES THE CALLER'S `t`, because five labels and two relative times are
// seven sentences a person reads and this is a plain function with no hook in
// scope. The labels were extracted into the catalogue (they are `label:`
// properties) and then rendered from the raw English anyway — translated, and
// never asked for.
import { formatRelative, type Translate } from "@shared/web/format"

export type AuditMeta = {
  createdByName?: string | null
  createdAt?: string | null
  editedByName?: string | null
  updatedAt?: string | null
  status: string
}

/** The five audit rows, in a fixed order, for a DescriptionList. */
export function auditItems(a: AuditMeta, t: Translate): { label: string; value: string }[] {
  return [
    { label: t("Created by"), value: a.createdByName || "—" },
    { label: t("Created"), value: a.createdAt ? formatRelative(a.createdAt, t) : "—" },
    { label: t("Last edited by"), value: a.editedByName || "—" },
    { label: t("Last edited"), value: a.updatedAt ? formatRelative(a.updatedAt, t) : "—" },
    { label: t("Status"), value: a.status },
  ]
}
