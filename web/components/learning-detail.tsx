"use client"

// Learning detail — one article as a tabbed record: Article / Overview / Activity
// (the standard every record gets). Article = the prose (library ArticleBody) + your
// own Done toggle + Deactivate/Activate. Overview = audit metadata (DescriptionList).
// Activity = the article's history via the GENERIC record-activity feed. Edit gated
// by learning:edit; deactivate by learning:delete. Host-composed, like role/help.

import * as React from "react"

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { ProgressToggle } from "@kwapso/ui/registry/primitives/progress-toggle/progress-toggle"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import { WebEmbed } from "@kwapso/ui/registry/primitives/web-embed/web-embed"
import {
  DescriptionList,
  defaultDescriptionListConfig,
} from "@kwapso/ui/registry/collections/description-list/description-list"
import {
  ActivityFeed,
  defaultActivityFeedConfig,
  type ActivityItem as ActivityFeedItem,
} from "@kwapso/ui/registry/collections/activity-feed/activity-feed"
import { Pencil, Power } from "lucide-react"

import type { Learning, SelectableValue } from "@shared/types"
import { LearningFormDialog, type LearningFormValues } from "@/components/learning-form-dialog"
import { LoadMore } from "@/components/load-more"
import { ApiFailure, content, tenancy } from "@/lib/api"
import { auditItems } from "@/lib/audit-overview"
import { formatActivityWhen } from "@/lib/format"
import { formatCount } from "@/lib/format-count"
import { RichText } from "@/components/rich-text"
import { safeHref, safeSrc } from "@/lib/rich-text"
import { usePermissions } from "@/lib/perms"
import { invalidate, primeCache, useCached } from "@/lib/store"
import { recordActivityKey, useRecordActivity } from "@/lib/use-record-activity"

// Show the linked resource IN-APP. We pick the player by the content-type keyword
// first (the team's own label, e.g. "Video file"), then fall back to the URL's
// extension. Uploaded files live under /media; anything we can't classify (a PDF,
// an embeddable page, an unknown upload) goes in a sandboxed WebEmbed frame.
//
// RENDER SAFETY: the link is typed by a person, so it is untrusted here no matter
// what the write door did — an older row, or one that arrived by import, can still
// carry `javascript:`/`data:`. Every URL therefore reaches its `src` through the
// safeSrc seam (http/https or app-relative only); a framed `javascript:` URL would
// otherwise run with THIS origin's cookies. An unsafe link renders no player at all.
export function LearningMedia({ url, contentType }: { url: string; contentType: string }) {
  const src = safeSrc(url)
  if (!src) return null
  const type = contentType.toLowerCase()
  const lower = src.toLowerCase()
  const ext = (lower.split("?")[0].split(".").pop() ?? "").trim()

  const isImage = type.includes("image") || /^(png|jpe?g|gif|webp|avif|svg)$/.test(ext)
  const isVideo = type.includes("video") || /^(mp4|webm|ogg|mov|m4v)$/.test(ext)
  const isAudio = type.includes("audio") || /^(mp3|wav|m4a|aac|oga|flac)$/.test(ext)

  if (isImage)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="max-h-96 w-full rounded-xl border object-contain" />
  if (isVideo) return <video src={src} controls className="max-h-96 w-full rounded-xl border" />
  if (isAudio) return <audio src={src} controls className="w-full" />
  // No obvious media type (a PDF, an /media upload we can't classify, or an
  // external embeddable page) → frame it.
  return <WebEmbed src={src} title="Linked resource" />
}

export function LearningDetailScreen({ teamId, learningId }: { teamId: string; learningId: string }) {
  const learningQ = useCached<Learning[]>(`learning:${teamId}`, () =>
    content.learning().then((r) => r.learning)
  )
  const item = learningQ.data?.find((l) => l.id === learningId) ?? null

  // The generic record feed (Law R5) + the exact server total its tab badges
  // (R8 for the place, R16 for the number — never the loaded page's length).
  const activity = useRecordActivity("learning", learningId)
  const selectableQ = useCached<SelectableValue[]>(`selectable:${teamId}`, () =>
    tenancy.selectable().then((r) => r.values)
  )
  const categoryOptions = (selectableQ.data ?? [])
    .filter((v) => v.type === "Learning category")
    .map((v) => v.value)
  const contentTypeOptions = (selectableQ.data ?? [])
    .filter((v) => v.type === "File type")
    .map((v) => v.value)

  const { can } = usePermissions(teamId)
  const canEdit = can("learning", "edit")
  const canDeactivate = can("learning", "delete")

  const [tab, setTab] = React.useState("article")
  const [editingOpen, setEditingOpen] = React.useState(false)
  const [busyDone, setBusyDone] = React.useState(false)
  const [busyActive, setBusyActive] = React.useState(false)

  function patchItem(next: Partial<Learning>) {
    const cur = learningQ.data
    if (!cur) return
    primeCache(
      `learning:${teamId}`,
      cur.map((l) => (l.id === learningId ? { ...l, ...next } : l))
    )
  }

  async function toggleDone() {
    if (!item) return
    const next = !item.done
    setBusyDone(true)
    try {
      await content.markLearningDone(learningId, next)
      patchItem({ done: next })
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't update your progress.")
    } finally {
      setBusyDone(false)
    }
  }

  async function updateDetails(values: LearningFormValues) {
    const { learning: nextList } = await content.updateLearning({
      id: learningId,
      title: values.title,
      category: values.category || null,
      contentType: values.contentType || null,
      contentLink: values.contentLink || null,
      body: values.body || null,
    })
    primeCache(`learning:${teamId}`, nextList)
    invalidateActivity()
    toast.success("Article updated.")
  }

  function invalidateActivity() {
    // Refresh the Activity tab after an edit/(de)activate. Drop the key rather
    // than re-fetching by hand: the ONE fetcher behind useRecordActivity re-primes
    // the tab's total in the same round-trip, so the rows and the badge can't
    // disagree (a hand-rolled refetch used to refresh the rows and leave the
    // count behind).
    invalidate(recordActivityKey("learning", learningId))
  }

  async function setActive(activeNext: boolean) {
    setBusyActive(true)
    try {
      const { learning: nextList } = await content.setLearningActive(learningId, activeNext)
      primeCache(`learning:${teamId}`, nextList)
      invalidateActivity()
      toast.success(activeNext ? "Article activated." : "Article deactivated.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't update the article.")
    } finally {
      setBusyActive(false)
    }
  }

  if (learningQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the article.</p>
  if (learningQ.data === undefined) return <Skeleton variant="list" lines={4} />
  if (!item) return <p className="text-muted-foreground text-sm">That article doesn&apos;t exist.</p>

  const overviewItems = [
    { label: "Category", value: item.category || "" },
    { label: "Content type", value: item.contentType || "" },
    { label: "Link", value: item.contentLink || "" },
    ...auditItems({
      createdByName: item.creatorName,
      createdAt: item.createdAt,
      editedByName: item.editorName,
      updatedAt: item.updatedAt,
      status: item.active ? "Active" : "Inactive",
    }),
  ]

  // The article's linked resource, checked at the render boundary (see LearningMedia).
  const resourceHref = safeHref(item.contentLink)

  const activityItems: ActivityFeedItem[] = activity.rows.map((a) => ({
    id: a.id,
    description: a.description,
    actor: a.actorName ?? undefined,
    timestamp: formatActivityWhen(a.createdAt),
  }))

  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      { value: "article", label: "Article", icon: "book-open", badge: "", badgeVariant: "" as const },
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
                Inactive
              </Badge>
            )}
            {item.required && (
              <Badge variant="secondary" className="text-[10px]">
                Required
              </Badge>
            )}
          </h1>
          {item.category && <p className="text-muted-foreground mt-1 text-sm">{item.category}</p>}
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
                  items={activityItems}
                />
                <LoadMore
                  listKey={activity.listKey}
                  fetchPage={activity.fetchPage}
                  label="Load more activity"
                />
              </div>
            )
          return (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                {item.body ? (
                  <RichText html={item.body} />
                ) : (
                  <p className="text-muted-foreground text-sm">No content yet.</p>
                )}
                {item.contentLink &&
                  (resourceHref ? (
                    <div className="flex flex-col gap-2">
                      <LearningMedia url={item.contentLink} contentType={item.contentType ?? ""} />
                      <a
                        href={resourceHref}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary inline-flex w-fit items-center gap-1 text-sm underline-offset-2 hover:underline"
                      >
                        Open the linked resource
                      </a>
                    </div>
                  ) : (
                    // Say so rather than showing a dead link — an address we won't
                    // open is a fact about the article, not a thing to hide.
                    <p className="text-muted-foreground text-sm">
                      The linked resource isn&apos;t a web address we can open safely.
                    </p>
                  ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {item.active && <ProgressToggle done={!!item.done} onToggle={() => void toggleDone()} />}
                {busyDone && <Spinner />}
                {canDeactivate &&
                  (item.active ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void setActive(false)}
                      disabled={busyActive}
                      className="text-destructive hover:text-destructive gap-1.5"
                    >
                      {busyActive ? <Spinner /> : <Power className="size-3.5" />}
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => void setActive(true)}
                      disabled={busyActive}
                      className="gap-1.5"
                    >
                      {busyActive ? <Spinner /> : <Power className="size-3.5" />}
                      Activate
                    </Button>
                  ))}
              </div>
            </div>
          )
        }}
      />

      <LearningFormDialog
        open={editingOpen}
        onOpenChange={setEditingOpen}
        draftKey={`learning:edit:${learningId}`}
        teamId={teamId}
        categoryOptions={categoryOptions}
        contentTypeOptions={contentTypeOptions}
        initial={{
          title: item.title,
          category: item.category ?? "",
          contentType: item.contentType ?? "",
          contentLink: item.contentLink ?? "",
          body: item.body ?? "",
        }}
        onSubmit={updateDetails}
      />
    </div>
  )
}
