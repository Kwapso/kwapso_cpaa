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

import { Badge } from "@shared/ui/registry/primitives/badge/badge"

import { useCached } from "@shared/web/store"
import { delivery } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"
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
  const sprints = sprintsQ.data ?? []
  // Nothing bought yet renders nothing at all, for the same reason the to-do
  // panel does: an empty card is a card people learn to scroll past.
  if (sprints.length === 0) return null

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">{t("What you bought")}</h2>
      <ul className="flex flex-col gap-2">
        {sprints.map((s) => (
          <li key={`${s.ref ?? s.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-4">
            <div className="min-w-0">
              <p className="font-medium">
                {s.name}
                {s.completedAt && (
                  <Badge variant="success" className="ml-2 align-middle">
                    {t("Finished")}
                  </Badge>
                )}
              </p>
              <p className="text-muted-foreground text-sm">
                {[s.sprintType, dates(s)].filter(Boolean).join(" · ")}
              </p>
            </div>
            {s.storyCount > 0 && (
              <span className="text-muted-foreground shrink-0 text-sm">
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
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
