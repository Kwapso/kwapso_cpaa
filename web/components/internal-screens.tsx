"use client"

// THE AGENCY'S OWN HOUSEKEEPING, as screens — the two list pages behind the
// Brand library and the Meeting purposes.
//
// Its own file, so the deep-link collection switch stays a switch — the same
// reason processes-screen.tsx exists. Everything below is the standard
// arrangement said twice rather than abstracted into one loop, and that is
// deliberate: R16 (ii) requires each collection to render a
// `<CollectionHeading sectionKey="…">` naming its own section, so a generic
// component parameterised by key would satisfy nobody reading it and nothing
// checking it. Two short, obvious blocks beat one clever one.

import * as React from "react"

import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@kwapso/ui/lib/recipe"

import { CollectionHeading } from "@/components/collection-heading"
import { SectionWithCreate } from "@/components/deep-link/screen-bits"
import { shapeBrandList, shapePurposesList } from "@/components/deep-link/shape"
import { withDataDrivenCollection } from "@/lib/screens"
import type { BrandAsset, MeetingPurpose } from "@shared/types"
import { useT } from "@shared/web/language"

/** Everything one of these screens needs from the host. The same bundle twice,
 * because they are the same screen twice. */
type InternalScreenProps<T> = {
  rows: T[]
  recipe: ScreenRecipe
  rights: ScreenRights
  total: number | undefined
  canCreate: boolean
  /** where the create button's `?panel=add` lands (the current section path). */
  onCreate: () => void
  /** the contextual "Import CSV" jump, when the caller may import. */
  onImport?: () => void
  /** the full-field CSV export door — export needs READ, which seeing this
   * screen already implies. */
  exportHref: string
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}

/** The shared body: heading with the exact server count, then the collection
 * with its create / import / export row. Takes already-shaped rows so each
 * caller keeps its own shaper (they read differently and that is the point). */
function InternalCollection({
  createLabel,
  data,
  recipe,
  rights,
  canCreate,
  onCreate,
  onImport,
  exportHref,
  onAction,
  onIntent,
  heading,
}: {
  createLabel: string
  data: ReturnType<typeof shapeBrandList>
  heading: React.ReactNode
} & Omit<InternalScreenProps<never>, "rows" | "total">) {
  const t = useT()
  const tuned = withDataDrivenCollection(recipe, data.rows ?? [])
  return (
    <div className="flex flex-col gap-6">
      {heading}
      <SectionWithCreate
        show={canCreate}
        label={createLabel}
        icon="plus"
        secondary={onImport ? { show: canCreate, label: t("Import CSV"), onClick: onImport } : undefined}
        download={{ show: (data.rows?.length ?? 0) > 0, label: t("Export CSV"), href: exportHref }}
        onCreate={onCreate}
      >
        <ScreenRenderer recipe={tuned} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
      </SectionWithCreate>
    </div>
  )
}

export function BrandLibraryScreen(props: InternalScreenProps<BrandAsset>) {
  const { rows, ...rest } = props
  return (
    <InternalCollection
      {...rest}
      createLabel="New asset"
      data={shapeBrandList(rows)}
      heading={<CollectionHeading sectionKey="brand" total={props.total} />}
    />
  )
}

export function PurposesScreen(props: InternalScreenProps<MeetingPurpose>) {
  const { rows, ...rest } = props
  return (
    <InternalCollection
      {...rest}
      createLabel="New meeting purpose"
      data={shapePurposesList(rows)}
      heading={<CollectionHeading sectionKey="purposes" total={props.total} />}
    />
  )
}
