"use client"

// KWAPSO — the agency itself, as a page (CHECKLIST 10.1, 17 Aug 2026).
//
// Three things that had no home together: the material we make our own work
// with, the people who make it, and the details that go on a contract. The owner
// asked for it in one sentence — "as a business owner you use this all the time"
// — and that sentence is also the argument for it being a destination rather
// than a corner of Settings. Settings is where you change how the app BEHAVES.
// None of this is a setting; it is who we are.
//
// THE TABS NAVIGATE NOTHING. The brand library keeps its own screen at /brand
// with its create, import and export, because it is a real collection with real
// actions and folding it in here would mean a second copy of all three. What
// this page shows is the way IN to it, plus the newest of what is in it, so the
// page answers "where is our logo?" without a detour.
//
// Every panel gates itself: the brand list on `brand_assets:read`, the people on
// `team_members:read`, and editing the details on `teams:edit`. The page itself
// is gated by nothing, because everybody in the team may look up the company's
// phone number.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import { ChevronRight, Palette, Pencil } from "lucide-react"

import { LegalDetailsDialog } from "@/components/legal-details-dialog"
import { OverviewList } from "@/components/overview-list"
import { brandAssetsKey, listFetch } from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import type { ActiveTeam } from "@/lib/use-active-team"
import { tenancy } from "@/lib/api"
import { RecordMark } from "@shared/web/record-mark"
import { formatCount } from "@shared/web/format-count"
import type { BrandAsset, TeamMember } from "@shared/types"
import { useCached, useCachedValue } from "@shared/web/store"
import { totalKey } from "@/lib/live-resources"
import { useT } from "@shared/web/language"

export function KwapsoScreen({ active }: { active: ActiveTeam }) {
  const t = useT()
  const team = active.ctx?.team ?? null
  const teamId = team?.id ?? null
  const { can } = usePermissions(teamId)
  const [tab, setTab] = React.useState("details")
  const [editOpen, setEditOpen] = React.useState(false)

  if (!team || !teamId) return <Skeleton variant="list" lines={4} />

  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      { value: "details", label: t("Details"), icon: CONCEPT_ICON.kwapso, badge: "", badgeVariant: "" as const },
      { value: "team", label: t("The team"), icon: CONCEPT_ICON.members, badge: "", badgeVariant: "" as const },
      { value: "brand", label: t("Brand library"), icon: CONCEPT_ICON.brand, badge: "", badgeVariant: "" as const },
    ],
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium tracking-tight">{team.name}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("Who we are: our material, our team, and the details that go on a contract.")}
          </p>
        </div>
        {can("teams", "edit") && (
          <div className="flex flex-wrap gap-2 sm:ml-auto sm:shrink-0">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1">
              <Pencil className="size-3.5" />
              {t("Edit")}
            </Button>
          </div>
        )}
      </div>

      <TabsView
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(panel) => {
          if (panel.value === "team") return <TeamPanel teamId={teamId} canRead={can("team_members", "read")} />
          if (panel.value === "brand")
            return <BrandPanel teamId={teamId} canRead={can("brand_assets", "read")} />
          return (
            <OverviewList
              items={[
                { label: t("Legal name"), value: team.legalName || "—" },
                { label: t("Legal address"), value: team.legalAddress || "—" },
                { label: t("Legal numbers"), value: team.legalNumbers || "—" },
                { label: t("Phone"), value: team.phone || "—" },
              ]}
            />
          )
        }}
      />

      <LegalDetailsDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        team={team}
        draftKey={`kwapso:legal:${teamId}`}
        onSaved={active.refresh}
      />
    </div>
  )
}

/** WHO WE ARE, as people. A read-only view: adding somebody, changing a role and
 * removing one all live on the Users screen under Settings, and a second place
 * to do it would be a second place to get it wrong. */
function TeamPanel({ teamId, canRead }: { teamId: string; canRead: boolean }) {
  const t = useT()
  const membersQ = useCached<TeamMember[]>(`members:${teamId}`, () => tenancy.members().then((r) => r.members))

  if (!canRead) return <p className="text-muted-foreground text-sm">{t("You can't see the team.")}</p>
  if (membersQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the team.")}</p>
  if (membersQ.data === undefined) return <Skeleton variant="list" lines={4} />

  return (
    <ul className="divide-border flex flex-col divide-y">
      {membersQ.data.map((m) => (
        <li key={m.userId} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-3">
          {/* The same photo the member's own record, the profile menu and a
              ticket's stakeholder list all draw. This is the page called "who we
              are" and it was the one that showed nobody. */}
          <RecordMark
            picture={m.imageUrl}
            name={[m.firstName, m.lastName].filter(Boolean).join(" ") || m.email}
            shape="round"
          />
          <span className="font-medium">
            {[m.firstName, m.lastName].filter(Boolean).join(" ") || m.email}
          </span>
          <span className="text-muted-foreground text-xs">{m.roleTitle}</span>
          <span className="text-muted-foreground ml-auto text-xs">{m.email}</span>
        </li>
      ))}
    </ul>
  )
}

/** THE MATERIAL WE MAKE OUR OWN WORK WITH. The newest of it, and the way into
 * the library itself — which keeps its screen, its create, its import and its
 * export at /brand. R16: the count is the door's exact server total, read out of
 * the same sidecar the library's own heading reads. */
function BrandPanel({ teamId, canRead }: { teamId: string; canRead: boolean }) {
  const t = useT()
  const assetsQ = useCached<BrandAsset[]>(brandAssetsKey(teamId), () => listFetch.brandAssets(teamId))
  const total = useCachedValue<number>(totalKey("brand_assets", teamId))

  if (!canRead) return <p className="text-muted-foreground text-sm">{t("You can't see the brand library.")}</p>
  if (assetsQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the brand library.")}</p>
  if (assetsQ.data === undefined) return <Skeleton variant="list" lines={4} />

  const newest = assetsQ.data.filter((a) => a.active).slice(0, 6)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground text-sm">
          {t("Logos, decks, templates and photography.")} {formatCount(total)}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => softNavigate("/brand")}
          className="ml-auto gap-1"
        >
          <Palette className="size-3.5" />
          {t("Open the brand library")}
        </Button>
      </div>
      {newest.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("Nothing in the brand library yet.")}</p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {newest.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => softNavigate(`/brand/${a.id}`)}
                className="flex w-full items-center gap-2 py-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.name}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {a.category || t("No type said")}
                  </span>
                </span>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
