"use client"

// HOW OFTEN, SAID AS A WHOLE SENTENCE.
//
// A step stores the pair (count, period) because that is how a person says it —
// "twice a day", "forty times a month" — and asking them to convert it in their
// head at the moment they are describing their own job is how a wrong number
// gets typed.
//
// SAYING IT BACK IS WHERE THE TRAP IS, and R28 caught it: the obvious rendering
// is `{count}× {t("a")} {t(period)}`, which asks a translator for the word "a"
// and the word "day" in isolation. Neither is a sentence, the extractor refuses
// both, and they end up translated NOWHERE — shipping in English beside German
// on a screen that looks finished. Worse, several languages cannot build that
// phrase in that order at all.
//
// So there are four whole sentences with a hole in each, which is the only shape
// a translator can actually reorder. It lives in shared/web/ because both front
// doors say it: the agency reads a step's frequency on the map, and the client
// reads the same step on their own portal.

import type { FrequencyPeriod } from "@shared/workers/savings"

/** "40 times a month" — the count and its period, as one translatable sentence. */
export function frequencyText(
  count: number,
  period: FrequencyPeriod | string,
  t: (english: string, vars?: Record<string, string | number>) => string
): string {
  const n = count.toLocaleString()
  if (period === "day") return t("{n} times a day", { n })
  if (period === "week") return t("{n} times a week", { n })
  if (period === "year") return t("{n} times a year", { n })
  return t("{n} times a month", { n })
}

/** The label a PERIOD PICKER offers — "times a month", never the bare word.
 * Same reason as above: the option is the phrase, not the noun. */
export function periodLabel(
  period: FrequencyPeriod | string,
  t: (english: string, vars?: Record<string, string | number>) => string
): string {
  if (period === "day") return t("times a day")
  if (period === "week") return t("times a week")
  if (period === "year") return t("times a year")
  return t("times a month")
}
