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

/** The five audit rows, in a fixed order, for a DescriptionList.
 *
 * `t` is a PARAMETER because this is a plain function and `useT` is a hook: the
 * component that renders the list has the reader's language and hands it in —
 * the same shape `translateRecipe` and `createAppFrom` use. The five labels stay
 * English at the call to `t` because English is the catalogue's key
 * (shared/i18n.ts).
 *
 * The VALUES are not translated and must not be: four of them are a person's
 * name or a timestamp, and the fifth is a status word the caller has already put
 * through its own vocabulary. */
export function auditItems(a: AuditMeta, t: Translate): { label: string; value: string }[] {
  return [
    { label: t("Created by"), value: a.createdByName || "—" },
    { label: t("Created"), value: a.createdAt ? formatRelative(a.createdAt, t) : "—" },
    { label: t("Last edited by"), value: a.editedByName || "—" },
    { label: t("Last edited"), value: a.updatedAt ? formatRelative(a.updatedAt, t) : "—" },
    { label: t("Status"), value: a.status },
  ]
}
