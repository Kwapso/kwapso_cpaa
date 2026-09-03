"use client"

// WHAT YOU BOUGHT — the sprints, as named blocks with dates and how much of each
// is finished (.plans/BUILD-1 §7: "sprints as a named block with dates — it is
// what they bought").
//
// A COUNT, NEVER A LIST. "3 of 8 done" is the whole of what a client learns
// about the work inside a block: no titles, no assignees, no dates on the pieces
// — because those together are "which staff member is doing it", and the portal
// never says that (SCOPE ch.06). The door this reads answers in a shape that has
// nowhere to put any of it, so the restraint is structural rather than a
// component declining to draw fields it was handed.
//
// AND NO PRICE. What they were charged lives on the Value screen, behind their
// own account's price-visibility switch, and there is one door for it. A number
// here would be a second route to the same figure with none of that reasoning
// attached.

import { Badge } from "@shared/ui/components/badge/badge"
import { List } from "@shared/ui/components/list/list"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"

import { useCached } from "@shared/web/store"
import { delivery } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"
import { ErrorPanel } from "@/components/error-panel"
import { useT } from "@shared/web/language"

type Sprints = Awaited<ReturnType<typeof delivery.sprints>>["sprints"]

/** "12 May → 6 June", or whichever half we have. A block with neither is still
 * worth showing: it is work they bought, and the dates may not be settled. */
function dates(s: Sprints[number]): string {
  const from = s.startsOn?.slice(0, 10)
  const to = s.endsOn?.slice(0, 10)
  if (from && to) return `${from} → ${to}`
  return from ?? to ?? "Dates to be confirmed"
}

export function DeliveryBlock() {
  const t = useT()
  const sprintsQ = useCached<Sprints>(cacheKeys.delivery, () => delivery.sprints().then((r) => r.sprints))

  // ERROR AND LOADING COME FIRST — this used to go straight to
  // `sprintsQ.data ?? []` and treat every one of "still loading", "the read
  // failed" and "genuinely nothing bought yet" as the same silent nothing.
  if (sprintsQ.error && !sprintsQ.data)
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">{t("What you bought")}</h2>
        <ErrorPanel
          title={t("We couldn't load what you bought.")}
          description={t("Check your connection and try again.")}
          onRetry={sprintsQ.refresh}
        />
      </section>
    )
  if (sprintsQ.loading && !sprintsQ.data)
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">{t("What you bought")}</h2>
        <Skeleton className="h-20 w-full rounded-[var(--radius)]" />
      </section>
    )

  const sprints = sprintsQ.data ?? []
  // Nothing bought yet renders nothing at all, for the same reason the to-do
  // panel does: an empty card is a card people learn to scroll past.
  if (sprints.length === 0) return null

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">{t("What you bought")}</h2>
      {/* The kit's row — see the note in company-screen.tsx. */}
      <List
        variant="rows"
        label={t("What you bought")}
        rows={sprints.map((s) => ({
          id: `${s.ref ?? s.name}`,
          title: (
            <span>
              {s.name}
              {s.completedAt && (
                <Badge variant="success" className="ml-2 align-middle">
                  {t("Finished")}
                </Badge>
              )}
            </span>
          ),
          description: [s.sprintType, dates(s)].filter(Boolean).join(" · "),
          meta:
            s.storyCount > 0 ? (
              <span>
                {/* ONE ENTRY WITH TWO HOLES (R28), the same one the ticket rows
                    and the agency's sprint list use. It read `{n} of {m}
                    {t("done")}`: `of` was a bare JSX text node the extractor
                    refuses as a non-sentence, so the middle word of a line on
                    the CLIENT's own screen was English in every
                    language, and `done` was a fragment nobody could reorder
                    around two numbers. */}
                {t("{done} of {total} done", {
                  done: s.doneStoryCount,
                  total: s.storyCount,
                })}
              </span>
            ) : undefined,
        }))}
      />
    </section>
  )
}
