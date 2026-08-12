"use client"

// One knowledge source, as a tabbed record: Source / Overview / Activity (the
// standard every record gets, R2). Source = the exact words the assistant reads
// out of it, where they came from, and the two controls that matter — correct
// it, or take it away. Overview = how it is filed, who may use it, how many
// searchable pieces it became and when it was last indexed. Activity = its
// history through the GENERIC record feed (R5).
//
// WHY THE TEXT IS SHOWN IN FULL rather than summarised: this screen is the
// answer to "what does it actually know?", and a summary of the material is a
// different thing from the material. Somebody who reads an answer they disagree
// with comes here to see the words behind it, and then takes them away.
//
// Edit is gated by knowledge:edit; taking a source away by knowledge:delete —
// the same rights the assistant is held to when it is asked to do either.

import * as React from "react"

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import {
  DescriptionList,
  defaultDescriptionListConfig,
} from "@kwapso/ui/registry/collections/description-list/description-list"
import {
  ActivityFeed,
  defaultActivityFeedConfig,
} from "@kwapso/ui/registry/collections/activity-feed/activity-feed"
import { Pencil, Power } from "lucide-react"

import type { Account, KnowledgeSource } from "@shared/types"
import { KnowledgeFormDialog, type KnowledgeFormValues } from "@/components/knowledge-form-dialog"
import { KNOWLEDGE_KIND } from "@/components/deep-link/shape"
import { LoadMore } from "@/components/load-more"
import { ApiFailure, content, tenancy } from "@/lib/api"
import { auditItems } from "@/lib/audit-overview"
import { knowledgeKey } from "@/lib/live-resources"
import { formatCount } from "@shared/web/format-count"
import { formatDateTime } from "@shared/web/format"
import { safeHref } from "@/lib/rich-text"
import { usePermissions } from "@/lib/perms"
import { invalidate, primeCache, useCached } from "@shared/web/store"
import { recordActivityKey, useRecordActivity } from "@/lib/use-record-activity"

export function KnowledgeDetailScreen({
  teamId,
  sourceId,
}: {
  teamId: string
  sourceId: string
}) {
  const sourcesQ = useCached<KnowledgeSource[]>(knowledgeKey(teamId), () =>
    content.knowledge().then((r) => r.sources)
  )
  // THE LIST ROW IS NOT THE RECORD, and on this screen that distinction is load-
  // bearing. A source can be a 300-page contract, so the LIST deliberately does
  // not carry the material (a page of fifty of them would be tens of megabytes
  // on the way to a screen showing titles) — it carries the summary. This screen
  // is the one that shows the words, so it ALWAYS reads the source by id.
  //
  // The list row is still used, as the instant paint: title, kind, filing and
  // state appear from cache while the material arrives (CACHING.md, cache-first).
  // Taking the row as the whole record instead is the trap EDGE-CASES.md calls
  // "list cache as detail source", and it would have shown an empty document.
  const inPage = sourcesQ.data?.find((s) => s.id === sourceId) ?? null
  const oneQ = useCached<KnowledgeSource | null>(`knowledge:one:${sourceId}`, () =>
    content.knowledgeOne(sourceId)
  )
  const item = oneQ.data ?? inPage ?? null

  // The generic record feed (R5) + the exact server total its tab badges (R8 for
  // the place, R16 for the number — never the loaded page's length).
  const activity = useRecordActivity("knowledge_sources", sourceId)
  // The accounts a source may be filed under. Bounded by the same paged door the
  // accounts screen reads; the picker offers page one, which is every account in
  // any team that is not already past a screenful.
  const accountsQ = useCached<Account[]>(`accounts:${teamId}`, () =>
    tenancy.accounts().then((r) => r.accounts)
  )
  const accountNames = new Map((accountsQ.data ?? []).map((a) => [a.id, a.name]))

  const { can } = usePermissions(teamId)
  const canEdit = can("knowledge", "edit")
  const canRemove = can("knowledge", "delete")

  const [tab, setTab] = React.useState("source")
  const [editingOpen, setEditingOpen] = React.useState(false)
  const [busyActive, setBusyActive] = React.useState(false)

  function patchLists(next: KnowledgeSource | null) {
    if (!next) return
    primeCache(`knowledge:one:${sourceId}`, next)
    const cur = sourcesQ.data
    if (cur) primeCache(knowledgeKey(teamId), cur.map((s) => (s.id === sourceId ? next : s)))
    // The Activity tab's rows AND its badge come from one fetcher, so dropping
    // the key re-primes both — a hand-rolled refetch used to refresh the rows
    // and leave the count behind.
    invalidate(recordActivityKey("knowledge_sources", sourceId))
  }

  async function saveDetails(values: KnowledgeFormValues) {
    const { source } = await content.updateKnowledge({
      id: sourceId,
      title: values.title,
      body: values.body || null,
      sourceUrl: values.sourceUrl || null,
      accountId: values.accountId || null,
      visibility: values.visibility,
    })
    patchLists(source)
    toast.success("Source updated.")
  }

  async function setActive(activeNext: boolean) {
    setBusyActive(true)
    try {
      const { source } = await content.setKnowledgeActive(sourceId, activeNext)
      patchLists(source)
      toast.success(
        activeNext ? "The assistant can use this again." : "The assistant will no longer use this."
      )
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't update the source.")
    } finally {
      setBusyActive(false)
    }
  }

  if (sourcesQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the source.</p>
  if (sourcesQ.data === undefined) return <Skeleton variant="list" lines={4} />
  if (!item && oneQ.data === undefined && !inPage) return <Skeleton variant="list" lines={4} />
  if (!item) return <p className="text-muted-foreground text-sm">That source doesn&apos;t exist.</p>

  const mirrored = item.originRowId !== null
  const filedUnder = item.accountId ? (accountNames.get(item.accountId) ?? "A client") : "The agency"
  const overviewItems = [
    { label: "Kind", value: KNOWLEDGE_KIND[item.kind] ?? item.kind },
    { label: "Filed under", value: filedUnder },
    {
      label: "Who can use it",
      value: item.visibility === "private" ? "Only you" : "Anyone who can read the knowledge base",
    },
    {
      label: "Searchable pieces",
      // An indexed source with no pieces is a real state (its text was empty),
      // and saying "0" is the honest reading of it.
      value: item.indexedAt ? String(item.chunkCount) : "Not indexed yet",
    },
    { label: "Last indexed", value: item.indexedAt ? formatDateTime(item.indexedAt) : "—" },
    ...auditItems({
      createdByName: item.creatorName,
      createdAt: item.createdAt,
      editedByName: item.editorName,
      updatedAt: item.updatedAt,
      status: item.active ? "In use" : "Not in use",
    }),
  ]

  const link = safeHref(item.sourceUrl)

  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      { value: "source", label: "Source", icon: "file-text", badge: "", badgeVariant: "" as const },
      { value: "overview", label: "Overview", icon: "info", badge: "", badgeVariant: "" as const },
      {
        value: "activity",
        label: "Activity",
        icon: "history",
        badge: formatCount(activity.total),
        badgeVariant: "" as const,
      },
    ],
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="truncate">{item.title}</span>
            {!item.active && (
              <Badge variant="outline" className="text-muted-foreground text-[10px]">
                Not in use
              </Badge>
            )}
            {item.visibility === "private" && (
              <Badge variant="secondary" className="text-[10px]">
                Private to you
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {KNOWLEDGE_KIND[item.kind] ?? item.kind} · {filedUnder}
          </p>
        </div>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditingOpen(true)}
            className="shrink-0 gap-1.5"
          >
            <Pencil className="size-3.5" />
            Edit
          </Button>
        )}
      </div>

      <TabsView
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(t) => {
          if (t.value === "overview")
            return (
              <DescriptionList
                config={{ ...defaultDescriptionListConfig, columns: 1 }}
                items={overviewItems}
              />
            )
          if (t.value === "activity")
            return (
              // R14: the badge above counts the WHOLE history, so the feed under
              // it must be able to reach all of it — page one, then Load more.
              <div className="flex flex-col gap-4">
                <ActivityFeed
                  config={{ ...defaultActivityFeedConfig, emptyText: "No activity yet." }}
                  items={activity.items}
                />
                <LoadMore listKey={activity.listKey} fetchPage={activity.fetchPage} label="Load more activity" />
              </div>
            )
          return (
            <div className="flex flex-col gap-6">
              {mirrored && (
                <p className="text-muted-foreground text-sm">
                  Kept in step with the record it came from — its words change when that record does.
                </p>
              )}
              {item.bodyTruncated ? (
                <p className="text-muted-foreground text-sm">
                  Showing the first part of {Math.round(item.bodyBytes / 1000).toLocaleString()} KB of
                  material. Every word of it is searchable — this is the screen being kind to itself.
                </p>
              ) : null}
              {item.body ? (
                // The material itself, as text. Deliberately NOT rendered as
                // rich text: what is shown here has to be what the assistant
                // reads, and the assistant reads the plain words.
                <p className="text-sm whitespace-pre-wrap">{item.body}</p>
              ) : (
                <p className="text-muted-foreground text-sm">No text yet.</p>
              )}
              {item.sourceUrl &&
                (link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary inline-flex w-fit items-center gap-1 text-sm underline-offset-2 hover:underline"
                  >
                    Open where this came from
                  </a>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    The link on this source isn&apos;t a web address we can open safely.
                  </p>
                ))}
              {canRemove && (
                <div className="flex flex-wrap items-center gap-2">
                  {item.active ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void setActive(false)}
                      disabled={busyActive}
                      className="text-destructive hover:text-destructive gap-1.5"
                    >
                      {busyActive ? <Spinner /> : <Power className="size-3.5" />}
                      Stop using this
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => void setActive(true)} disabled={busyActive} className="gap-1.5">
                      {busyActive ? <Spinner /> : <Power className="size-3.5" />}
                      Use this again
                    </Button>
                  )}
                  <span className="text-muted-foreground text-xs">
                    {item.active
                      ? "The assistant stops reading it. Nothing is deleted, and the sweep won't put it back."
                      : "Nothing was deleted — this puts it back in front of the assistant."}
                  </span>
                </div>
              )}
            </div>
          )
        }}
      />

      <KnowledgeFormDialog
        open={editingOpen}
        onOpenChange={setEditingOpen}
        draftKey={`knowledge:edit:${sourceId}`}
        accountOptions={(accountsQ.data ?? []).map((a) => ({ id: a.id, name: a.name }))}
        textOwnedElsewhere={mirrored}
        initial={{
          title: item.title,
          body: item.body ?? "",
          sourceUrl: item.sourceUrl ?? "",
          accountId: item.accountId ?? "",
          visibility: item.visibility,
        }}
        onSubmit={saveDetails}
      />
    </div>
  )
}
