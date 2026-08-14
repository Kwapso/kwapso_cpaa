// THE VISUAL BLOCK CATALOGUE — the closed set of shapes the assistant may DRAW
// instead of describing, declared once so the model's prompt and the renderer can
// never disagree about what exists (Law R9, the same seam as the capability brief).
//
// WHY A CATALOGUE AND NOT A MARKDOWN DIALECT. An assistant reply is a string, and
// everything the assistant knows used to arrive as prose: "Acme 34 hours, Berg 21
// hours, Croft 9 hours" is a sentence a manager has to re-read to rank. The answer
// is not a richer markdown — it is a SMALL, NAMED set of shapes with declared data,
// because a named shape can be validated and an arbitrary one cannot.
//
// THE WIRE FORMAT IS A FENCE, on purpose:
//
//     ```kwapso:bars
//     {"title":"Hours by account","rows":[{"label":"Acme","value":34}]}
//     ```
//
// A model that has never heard of this — an older one, a different provider, a
// replayed transcript — degrades to a fenced code block, which is legible. A custom
// tag or a bare JSON line degrades to garbage in the middle of a sentence.
//
// THE JSON IS MODEL OUTPUT, SO IT IS UNTRUSTED (the same posture as a request body,
// R20). Every parser below is positional and type-checking, never a truthiness
// guard: a value is a number only when `typeof v === "number"` and finite (or a
// string that parses to one), a label is text only when `typeof v === "string"`.
// Anything else, an unknown kind, malformed JSON, or more rows than the cap and the
// whole block is REFUSED — the caller renders the raw body as inert text, never as
// markup. And the block path is SAFER than the markdown path it sits beside: the
// renderer passes these values to React as children, so nothing here ever reaches
// `dangerouslySetInnerHTML`, and no field is ever a URL, so there is no href to
// sanitise in the first place.
//
// Kinds are wire identifiers, like tool names — the user-facing words in a block are
// the model's own titles and the app's glossary terms (R6), never these.

/** The fence's language tag: ```kwapso:<kind>. */
export const BLOCK_FENCE_PREFIX = "kwapso:"

/** HARD CAPS. A block is a glance, not a report — past these the answer belongs in
 * a screen the app already has, and the model is told to say the rest in a sentence.
 * They are also the bound on what one untrusted reply can make the browser lay out. */
export const BLOCK_LIMITS = {
  /** rows / items / steps in one block. */
  rows: 12,
  /** columns in a table. */
  columns: 6,
  /** a label, cell, note or unit. */
  text: 120,
  /** a block's own title. */
  title: 80,
} as const

/* ------------------------------ the blocks ------------------------------ */

export type MetricItem = {
  label: string
  /** DISPLAY text, not a number: a headline reads "£12,400" or "3 days", and the
   * model formats those better than we can. Nothing is computed from it, so it is
   * printed and escaped, never parsed. (Contrast `bars`, below.) */
  value: string
  /** The change beside it — "up 3 since last week". Decoration; dropped if unusable. */
  delta?: string
  trend?: "up" | "down" | "flat"
}

export type BarRow = {
  label: string
  /** A REAL number, because the bar's LENGTH is computed from it. A value that
   * isn't finite would draw a bar of NaN width, so it refuses the whole block. */
  value: number
}

export type StepItem = {
  label: string
  note?: string
}

export type AgentBlock =
  | { kind: "metric"; title?: string; items: MetricItem[] }
  | { kind: "bars"; title?: string; unit?: string; rows: BarRow[] }
  | { kind: "table"; title?: string; columns: string[]; rows: string[][] }
  | { kind: "steps"; title?: string; steps: StepItem[] }

export type AgentBlockKind = AgentBlock["kind"]

/** One entry per kind: when the model should reach for it, the shape it must emit,
 * and a COMPLETE example. The example is not documentation — `agent-parity.test.ts`
 * runs the parser over every one of them, so a shape that drifted from its parser
 * turns the build red instead of teaching the model to emit something we refuse. */
export type AgentBlockSpec = {
  kind: AgentBlockKind
  /** The question this shape answers, in the app's own words. */
  when: string
  /** The JSON shape, written as the model must emit it. */
  shape: string
  /** A valid body — parsed by the parity check, copied by the model. */
  example: string
}

export const AGENT_BLOCKS: Record<AgentBlockKind, AgentBlockSpec> = {
  metric: {
    kind: "metric",
    when: "a few headline numbers the reader should take in at a glance — how many open tickets, hours logged this month, sprints running",
    shape: `{"title":"optional heading","items":[{"label":"what it counts","value":"the number as it should READ (formatted, with its unit or currency)","delta":"optional change, e.g. up 3 since last week","trend":"up | down | flat"}]}`,
    example: `{"title":"This month","items":[{"label":"Open tickets","value":"12","delta":"up 3 since last week","trend":"up"},{"label":"Hours logged","value":"148 h","delta":"down 6 h","trend":"down"},{"label":"Sprints running","value":"4","trend":"flat"}]}`,
  },
  bars: {
    kind: "bars",
    when: "one number compared across a handful of things — hours by account, tickets by type, revenue by sprint. Rank them yourself, biggest first",
    shape: `{"title":"optional heading","unit":"optional, e.g. h or £","rows":[{"label":"the thing","value":34}]} — value is a plain number, never a string and never carrying its unit`,
    example: `{"title":"Hours by account, last 30 days","unit":"h","rows":[{"label":"Acme Manufacturing","value":34},{"label":"Bergstrom","value":21.5},{"label":"Croft & Sons","value":9}]}`,
  },
  table: {
    kind: "table",
    when: "several records with the same handful of fields — tickets with their status and owner, contacts with their account. Keep it to the columns that answer the question",
    shape: `{"title":"optional heading","columns":["Header","Header"],"rows":[["cell","cell"]]} — every row has one cell per column, in the same order`,
    example: `{"title":"Open tickets","columns":["Reference","Ticket","Status"],"rows":[["BERG-T0412","Invoice run fails on the 1st","In progress"],["ACME-T0118","New starter needs access","New"]]}`,
  },
  steps: {
    kind: "steps",
    when: "an ordered sequence — the steps of a process, or what happens next and in what order. Use it when the ORDER is the point",
    shape: `{"title":"optional heading","steps":[{"label":"what happens","note":"optional one line under it"}]}`,
    example: `{"title":"How a new ticket is handled","steps":[{"label":"The ticket arrives","note":"Raised in the portal or by email"},{"label":"Triage","note":"Answer it, or split it into stories"},{"label":"Into a sprint"},{"label":"Resolved, and the client is told"}]}`,
  },
}

export const BLOCK_KINDS = Object.keys(AGENT_BLOCKS) as AgentBlockKind[]

/* ------------------------------ the parsers ------------------------------ */

/** Text, or nothing. `typeof` first (a number, an object and an array are all NOT
 * text here), NUL bytes stripped and whitespace collapsed the way the workers'
 * boundary validator does it, then capped. Empty after that is nothing. */
function text(v: unknown, cap: number): string | null {
  if (typeof v !== "string") return null
  const t = v.replace(/\0/g, "").replace(/\s+/g, " ").trim()
  return t ? t.slice(0, cap) : null
}

/** An optional string: absent, or unusable, means absent — never a reason to refuse
 * the whole block, because these are decoration (a note, a delta, a unit). */
function maybeText(v: unknown, cap: number): string | undefined {
  return text(v, cap) ?? undefined
}

/** A finite number, or nothing. `Number()` alone is not a check — `Number(true)` is
 * 1, `Number(null)` and `Number([])` are 0 — so the type is narrowed FIRST and only
 * a number or a non-empty string is ever passed to it. Infinity and NaN are refused,
 * which is the whole point: a bar's width is computed from this. */
function finite(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** A cell: text, or a finite number printed. Anything else is an empty cell rather
 * than a refusal — a blank square is honest, and a table is mostly text anyway. */
function cell(v: unknown): string {
  const t = text(v, BLOCK_LIMITS.text)
  if (t !== null) return t
  const n = finite(v)
  return n === null ? "" : String(n)
}

/** An array of the right size, or nothing. Under 1 is an empty block (say it in a
 * sentence instead); over the cap is a report, and the model was told the cap. */
function sizedArray(v: unknown, cap: number): unknown[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > cap) return null
  return v
}

/** An object that is a plain record — not null, not an array. */
function record(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

const TRENDS = ["up", "down", "flat"] as const

/** PARSE ONE BLOCK, or refuse it.
 *
 * `kind` and `body` both come off the wire, so neither is trusted: the kind is
 * matched against the catalogue's own keys (an unknown one is not a block), and the
 * body is JSON-parsed inside a try. `null` means "this is not a block" — the caller
 * renders the raw text, which is why a refusal is never a blank space.
 *
 * REFUSAL IS THE STRICT PATH; forgiveness only where it cannot lie. A missing
 * required field, a non-finite bar value or a row count outside the caps refuses the
 * whole block. A ragged table row is PADDED at the end (a blank cell says nothing,
 * where a rejected table says nothing at all), and unusable decoration is dropped. */
export function parseAgentBlock(kind: string, body: string): AgentBlock | null {
  if (!Object.prototype.hasOwnProperty.call(AGENT_BLOCKS, kind)) return null

  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return null
  }
  const o = record(raw)
  if (!o) return null
  const title = maybeText(o.title, BLOCK_LIMITS.title)

  if (kind === "metric") {
    const list = sizedArray(o.items, BLOCK_LIMITS.rows)
    if (!list) return null
    const items: MetricItem[] = []
    for (const entry of list) {
      const r = record(entry)
      if (!r) return null
      const label = text(r.label, BLOCK_LIMITS.text)
      const value = text(r.value, BLOCK_LIMITS.text) ?? (finite(r.value) === null ? null : String(finite(r.value)))
      if (label === null || value === null) return null
      const trend = TRENDS.find((t) => t === r.trend)
      items.push({ label, value, delta: maybeText(r.delta, BLOCK_LIMITS.text), trend })
    }
    return { kind, title, items }
  }

  if (kind === "bars") {
    const list = sizedArray(o.rows, BLOCK_LIMITS.rows)
    if (!list) return null
    const rows: BarRow[] = []
    for (const entry of list) {
      const r = record(entry)
      if (!r) return null
      const label = text(r.label, BLOCK_LIMITS.text)
      const value = finite(r.value)
      if (label === null || value === null) return null
      rows.push({ label, value })
    }
    return { kind, title, unit: maybeText(o.unit, BLOCK_LIMITS.text), rows }
  }

  if (kind === "table") {
    const heads = sizedArray(o.columns, BLOCK_LIMITS.columns)
    const body_ = sizedArray(o.rows, BLOCK_LIMITS.rows)
    if (!heads || !body_) return null
    const columns: string[] = []
    for (const h of heads) {
      const t = text(h, BLOCK_LIMITS.text)
      if (t === null) return null
      columns.push(t)
    }
    const rows: string[][] = []
    for (const entry of body_) {
      if (!Array.isArray(entry)) return null
      // Padded, not refused: the header says how many columns there are, so a short
      // row gains blanks at the END (which shifts nothing) and a long one loses the
      // cells no header names. A whole table thrown away over one missing cell is a
      // worse answer than a table with one blank square in it.
      rows.push(Array.from({ length: columns.length }, (_, i) => cell(entry[i])))
    }
    return { kind, title, columns, rows }
  }

  const list = sizedArray(o.steps, BLOCK_LIMITS.rows)
  if (!list) return null
  const steps: StepItem[] = []
  for (const entry of list) {
    const r = record(entry)
    if (!r) return null
    const label = text(r.label, BLOCK_LIMITS.text)
    if (label === null) return null
    steps.push({ label, note: maybeText(r.note, BLOCK_LIMITS.text) })
  }
  return { kind: "steps", title, steps }
}

/* ------------------------------- the brief ------------------------------- */

/** THE MODEL'S HALF OF THE CATALOGUE, GENERATED FROM IT (Law R9).
 *
 * The system prompt cannot advertise a shape the renderer refuses, or hide one it
 * draws, because both halves are read out of `AGENT_BLOCKS` — the same seam that
 * makes the capability brief impossible to disagree with the Import screen. Every
 * example below is run through `parseAgentBlock` by the parity check, so the prompt
 * can only ever teach the model something the app will actually paint. */
export function blockBrief(): string {
  const lines: string[] = []
  lines.push(
    "SHOWING, NOT JUST TELLING — you can DRAW an answer. When a reply is a set of numbers, a comparison, a handful of records or an ordered sequence, emit one fenced block and the app renders it as a real component on the screen. The rules never change: the fence is ```" +
      BLOCK_FENCE_PREFIX +
      "<kind> on its own line, the body is ONE JSON object and nothing else, the closing ``` is on its own line, and only the kinds listed below exist. At most " +
      BLOCK_LIMITS.rows +
      " rows in a block — if there are more, show the ones that answer the question and say the rest in a sentence. Still write like a person: a block replaces a paragraph of figures, never the whole reply, so lead into it and say what it means underneath. If none of these shapes fits the answer, just write normally — a forced block is worse than a good sentence, and never invent a kind that isn't here."
  )
  for (const b of Object.values(AGENT_BLOCKS)) {
    lines.push("")
    lines.push(`${b.kind} — ${b.when}.`)
    lines.push(`shape: ${b.shape}`)
    lines.push("example:")
    lines.push("```" + BLOCK_FENCE_PREFIX + b.kind)
    lines.push(b.example)
    lines.push("```")
  }
  return lines.join("\n")
}
