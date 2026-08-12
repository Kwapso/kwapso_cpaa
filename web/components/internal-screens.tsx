"use client"

// THE AGENCY'S OWN HOUSEKEEPING, as screens — the four list pages behind
// Marketing, the Brand library and the Delivery method (which is two
// collections on one page, so it gets the only host-composed layout here).
//
// Its own file, so the deep-link collection switch stays a switch — the same
// reason processes-screen.tsx exists. Everything below is the standard
// arrangement said four times rather than abstracted into one loop, and that is
// deliberate: R16 (ii) requires each sidebar collection to render a
// `<CollectionHeading sectionKey="…">` naming its own section, so a generic
// component parameterised by key would satisfy nobody reading it and nothing
// checking it. Four short, obvious blocks beat one clever one.

import * as React from "react"

import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@kwapso/ui/lib/recipe"

import { CollectionHeading } from "@/components/collection-heading"
import { SectionWithCreate } from "@/components/deep-link/screen-bits"
import {
  shapeBrandList,
  shapeMarketingList,
  shapeProgrammesList,
  shapePurposesList,
} from "@/components/deep-link/shape"
import { withDataDrivenCollection } from "@/lib/screens"
import { formatCount } from "@shared/web/format-count"
import type { BrandAsset, MarketingPost, MeetingPurpose, Program } from "@shared/types"

/** Everything one of these screens needs from the host. The same bundle four
 * times, because they are the same screen four times. */
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
  data: ReturnType<typeof shapeMarketingList>
  heading: React.ReactNode
} & Omit<InternalScreenProps<never>, "rows" | "total">) {
  const tuned = withDataDrivenCollection(recipe, data.rows ?? [])
  return (
    <div className="flex flex-col gap-4">
      {heading}
      <SectionWithCreate
        show={canCreate}
        label={createLabel}
        icon="plus"
        secondary={onImport ? { show: canCreate, label: "Import CSV", onClick: onImport } : undefined}
        download={{ show: (data.rows?.length ?? 0) > 0, label: "Export CSV", href: exportHref }}
        onCreate={onCreate}
      >
        <ScreenRenderer recipe={tuned} data={data} rights={rights} onAction={onAction} onIntent={onIntent} />
      </SectionWithCreate>
    </div>
  )
}

export function MarketingScreen(props: InternalScreenProps<MarketingPost>) {
  const { rows, ...rest } = props
  return (
    <InternalCollection
      {...rest}
      createLabel="New post"
      data={shapeMarketingList(rows)}
      heading={<CollectionHeading sectionKey="marketing" total={props.total} />}
    />
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

/** The Delivery method screen leads with the PROGRAMMES and offers the meeting
 * purposes beside them, because a programme is what somebody arrives looking for
 * and a purpose is what they go on to. Two collections, one module, one right —
 * so the button below is a link to the other half rather than a permission
 * question. */
export function ProgrammesScreen(
  props: InternalScreenProps<Program> & { purposeCount: number | undefined; onPurposes: () => void }
) {
  const { rows, purposeCount, onPurposes, ...rest } = props
  return (
    <div className="flex flex-col gap-4">
      <InternalCollection
        {...rest}
          createLabel="New programme"
        data={shapeProgrammesList(rows)}
        heading={<CollectionHeading sectionKey="delivery" total={props.total} />}
      />
      <button
        type="button"
        onClick={onPurposes}
        className="text-muted-foreground hover:text-foreground w-fit text-sm underline-offset-4 hover:underline"
      >
        {/* R16: the number is the door's exact total through the ONE seam, and
            an unloaded total renders nothing rather than a "0" that reads as
            "there are none". */}
        Meeting purposes{formatCount(purposeCount) ? ` (${formatCount(purposeCount)})` : ""}
      </button>
    </div>
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
