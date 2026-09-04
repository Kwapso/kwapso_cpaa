/* DUMMY DATA, BY DEFAULT, ALWAYS. Every part on the canvas appears filled — a
 * list has rows, a chart has bars, a card has a title — because an empty part
 * tells the owner nothing about what it looks like. These files are the ONE
 * place that dummy data lives, split alphabetically so six people can write
 * them without touching one another's file.
 *
 * WHAT A SAMPLE MAY AND MAY NOT DO. It draws the REAL kit export with made-up
 * content. It spreads `p.of("<Export>")` onto every export the panel offers
 * options for (a cva variant group or a typed enum/boolean prop — see
 * builder/options.ts), so the owner's choice reaches the part; the slot
 * observes which exports were asked for and the panel flags the rest. It may
 * NOT set a `className`, a style or a wrapper that changes how the part
 * looks — that would be an option Aurora did not put in the kit, which is the
 * one rule this tool exists to keep. Layout between parts is the kit's own
 * `spacer`, `container` and `split`, placed as parts.
 *
 * NO_SAMPLE is the honest way out: a part that genuinely cannot be drawn with
 * dummy data (needs a live service, a browser API the page cannot grant, a
 * hook that draws nothing) is named here WITH the reason, and the palette
 * shows it greyed with that reason. web/test/kit-catalogue.test.ts holds every
 * drawable part to "a sample, or a reason", and a reason for a part that IS
 * sampled goes red. */
import type { ReactNode } from "react"

export type PartProps = { of: (exportName: string) => Record<string, unknown> }
export type Sample = { render: (p: PartProps) => ReactNode; note?: string }
export type Samples = Record<string, Sample>

import { samples as aToC } from "./a-c"
import { samples as dToF } from "./d-f"
import { samples as gToM } from "./g-m"
import { samples as nToR } from "./n-r"
import { samples as s } from "./s"
import { samples as tToZ } from "./t-z"

export const NO_SAMPLE: Record<string, string> = {
  "use-debounce": "a hook draws nothing; it is listed so the count of parts stays honest",
  "use-virtual-rows": "a hook draws nothing; it is listed so the count of parts stays honest",
}

export const SAMPLES: Samples = { ...aToC, ...dToF, ...gToM, ...nToR, ...s, ...tToZ }
