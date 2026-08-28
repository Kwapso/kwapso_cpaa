"use client"

// ONE DROPDOWN VALUE, AS A RECORD (Law R2): Overview + Activity.
//
// WHY IT EXISTS. `selectable_data` has been writing activity rows since the day
// it shipped — created, renamed, made a default, deactivated, reactivated, four
// `logActivity` calls in workers/tenancy/src/lib/selectable.ts — and there was
// nowhere to read them. The manager screen is a vocabulary: a flat list of words
// under their group, with a rename box and a row menu. So every one of those
// sentences was written to a feed no screen opened, and "who retired this ticket
// type, and when" was a question the database could answer and the app could
// not. R2's clause is exactly this shape — a record with history and no tabs is
// a record whose history is invisible.
//
// IT READS ONE ROW, NOT THE LIST. `selectableOne` is a single `WHERE id = ?`
// (one D1 round trip); the vocabulary list is a capped read plus an exact
// COUNT(*) (three). Reading the list and finding the row in JavaScript is the
// shape help-detail.tsx still has, and it costs five round trips to answer a
// question about one row — on a cold deep link that is the whole wait before
// first paint. The live layer patches this key by id (web/lib/live-resources.ts
// `selectable_data`), so a teammate's rename moves the open record without a
// refetch, which is the same guarantee the list already had.

import * as React from "react"

import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { Badge } from "@shared/ui/components/badge/badge"
import { TabsView, defaultTabsConfig } from "@shared/web/screen-engine/tabs-view"
import { useRemembered } from "@shared/web/remembered"

import { ActivityPanel } from "@/components/activity-panel"
import { OverviewList } from "@/components/overview-list"
import { RecordFooter, RecordScreen, STICKY_TABS } from "@/components/record-chrome"
import { CONCEPT_ICON } from "@/lib/pages"
import { tenancy } from "@/lib/api"
import { selectableOneKey } from "@/lib/live-resources"
import { useRecordActivity } from "@/lib/use-record-activity"
import type { SelectableValue } from "@shared/types"
import { RecordMark } from "@shared/web/record-mark"
import { formatCount } from "@shared/web/format-count"
import { useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"

export function SelectableDetailScreen({ teamId, valueId }: { teamId: string; valueId: string }) {
  const t = useT()
  // Keyed by TEAM as well as row: switching teams must not hand the new team a
  // record read under the old one's fence, and the id alone cannot say which
  // team it was read for.
  const valueQ = useCached<SelectableValue | null>(selectableOneKey(teamId, valueId), () =>
    tenancy.selectableOne(valueId)
  )
  const activity = useRecordActivity("selectable_data", valueId)
  // The open tab is remembered per record for as long as this document
  // lives (web/lib/nav-memory.ts) — leaving to another section and coming
  // back lands on the tab she was reading, and a miss lands on "overview".
  const [tab, setTab] = useRemembered("tab", "overview")

  const value = valueQ.data ?? null
  // A FAILED READ SAYS SO. `data` stays undefined when the fetch REJECTS as well
  // as when it has not answered yet, so a screen that only checks `undefined`
  // shows its loading skeleton for ever on any error — which is exactly what
  // shipped: one wrong column name in the door's SQL, a 500 on every call, and a
  // screen that span quietly instead of reporting it. The error is checked
  // FIRST, because "we asked and it went wrong" is a different sentence from
  // "we are still asking".
  if (valueQ.error)
    return (
      <p className="text-destructive text-sm">
        {t("That didn't load. Refresh the page, and tell us if it keeps happening.")}
      </p>
    )
  if (valueQ.data === undefined) return <Skeleton variant="list" lines={4} />
  if (!value) return <p className="text-muted-foreground text-sm">{t("That record no longer exists.")}</p>

  // ALL FOUR ENRICHMENTS ARE OPTIONAL AND NULL ON MOST ROWS (shared/types.ts) —
  // a dropdown value is a label first. An empty string is what OverviewList
  // renders as "nothing here", so an unset field reads as blank rather than as
  // the word "null", and the row stays on the list so the shape of the record is
  // the same whichever value you opened.
  const overviewItems = [
    { label: t("Group"), value: value.type },
    { label: t("Option"), value: value.value },
    { label: t("Status"), value: value.active ? t("Active") : t("Inactive") },
    { label: t("One of the defaults"), value: value.isDefault ? t("Yes") : t("No") },
    { label: t("Emoji"), value: value.mark ?? "" },
    { label: t("German label"), value: value.nameDe ?? "" },
    { label: t("Description"), value: value.description ?? "" },
    {
      label: t("Standard days"),
      value: value.standardDays == null ? "" : String(value.standardDays),
    },
  ]

  const tabsConfig = {
    ...defaultTabsConfig,
    tabs: [
      { value: "overview", label: t("Overview"), icon: "info", badge: "", badgeVariant: "" as const },
      {
        value: "activity",
        label: t("Activity"),
        icon: CONCEPT_ICON.activity,
        // R16: the exact server COUNT(*) the feed's own door returns, through
        // the one formatCount seam — never the number of rows on screen.
        badge: formatCount(activity.total),
        badgeVariant: "" as const,
      },
    ],
  }

  return (
    <RecordScreen
      // R35 — the record's own face. A value's mark IS its face where it has
      // one (it is the glyph this very screen sets), and the initial stands in
      // where it has none, which is the same square in the same slot either way.
      leading={<RecordMark name={value.value} mark={value.mark} size="band" />}
      collectionLabel={t("Dropdown value")}
      chips={value.type ? <Badge>{value.type}</Badge> : null}
      title={value.value}
      status={[
        value.active ? t("Active") : t("Inactive"),
        value.isDefault ? t("Default") : undefined,
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      <TabsView
        className={STICKY_TABS}
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(panel) => {
          if (panel.value === "activity") return <ActivityPanel activity={activity} />
          return <OverviewList items={overviewItems} />
        }}
      />

      {/* D7 / CHECKLIST 11.3 — who made it and when, grey, at the foot. Read by
          the single-row door only, which is why the list screen has never shown
          it and this screen can. */}
      <RecordFooter audit={{ createdByName: value.createdByName, createdAt: value.createdAt }} />
    </RecordScreen>
  )
}
