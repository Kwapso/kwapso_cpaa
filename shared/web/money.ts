// WHOLE CENTS → WHAT A PERSON WOULD SAY. One line, one seam, both front ends.
//
// It exists because there are now three places money renders on the agency's own
// side — a sprint's price, an account's rate card, our own internal rate card —
// and three copies of `(cents / 100).toLocaleString(…)` is three chances for one
// screen to show 1,250.5 where its neighbour shows 1,250.50.
//
// PURE, AND ABOUT NOTHING. It takes a number and a currency word; it knows no
// table, no door and no audience. That is what makes it safe to share across the
// R23 fence: the law that keeps our own cost away from a client login is about
// which files reach `internal-money.ts`, and a function that formats an integer
// reaches nothing. What it must never grow is a rate, a default, or a subtraction
// — the moment it knows what the number MEANS, it stops being a formatter.

/** Two decimal places always, thousands grouped, the currency after it when the
 * row carries one. `1250` → "12.50"; `1250` + "EUR" → "12.50 EUR".
 *
 * Two places even on a round figure, because a column of rates where some rows
 * say "60" and others "62.50" is a column nobody can scan. */
export function moneyText(cents: number, currency?: string | null): string {
  const amount = (cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return currency ? `${amount} ${currency}` : amount
}

/** The same figure said as a rate — what a person reads on a rate card. The
 * "an hour" is here rather than at each call site so the two cards can never
 * describe the same number two different ways. */
export function rateText(centsPerHour: number, currency?: string | null): string {
  return `${moneyText(centsPerHour, currency)} an hour`
}
