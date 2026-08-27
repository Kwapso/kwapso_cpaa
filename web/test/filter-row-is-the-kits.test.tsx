// THE FILTER ROW IS THE KIT'S, AND THE FOUR WAYS IT COULD QUIETLY STOP BEING.
//
// THE FINDING THAT EARNED THIS FILE (2026-08-27). The design kit has shipped
// `components/filter-bar/filter-bar.tsx` — exporting `FilterBar`,
// `SearchableFacet` and `RangeFacet` — since it landed, and NOTHING in `web/`,
// `web-portal/` or `shared/web/` imported a line of it. The app had hand-written
// its own three, under the SAME THREE NAMES, in `shared/web/screen-engine/`. So
// every other control in this app converged with the designer's build by
// construction, and this one could not: we were not drawing her component at
// all, and no check could tell, because a file called `filter-bar.tsx` exporting
// `FilterBar` is exactly what a correct adoption looks like from the outside.
//
// That is why the first assertion below is about IMPORTS rather than markup. The
// kit's own vendoring guard (`vendored-kit.test.ts`) proves the kit is
// unmodified; `kit-supplies-the-ui` (R39) proves nothing ELSE supplies a
// control. Neither can see a control the kit supplies and the app declines.
//
// The other three are the ways the adoption could survive as an import and die
// as a behaviour — each one measured in a real browser on the day it was
// written, and each one invisible in a screenshot.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"
import { FilterBar } from "@shared/web/screen-engine/filter-bar"
import type { FacetOption, FilterFacet } from "@shared/web/screen-engine/config"

const ROOT = join(__dirname, "..", "..")
const ADAPTER = "shared/web/screen-engine/filter-bar.tsx"
const KIT_FILTER_BAR = "@shared/ui/components/filter-bar/filter-bar"

/** Radix measures itself and captures the pointer; jsdom does neither, and
 * without these a panel never opens — which would make every assertion below
 * pass by never running. */
beforeAll(() => {
  Object.assign(window.HTMLElement.prototype, {
    scrollIntoView: () => {},
    hasPointerCapture: () => false,
    releasePointerCapture: () => {},
    setPointerCapture: () => {},
  })
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

afterEach(cleanup)

/** The knowledge base's own shape: a closed vocabulary and a facet over rows. */
const CLIENTS: FacetOption[] = [
  { value: "a1", label: "Bergman S.A." },
  // 45 characters. The strings these facets carry are account and client names,
  // which is why the truncation case below is not hypothetical.
  { value: "a2", label: "Northwind Traders International Holdings Ltd." },
]

const FACETS: FilterFacet[] = [
  {
    field: "kind",
    label: "Type",
    control: "select",
    options: [
      { value: "meeting", label: "From a meeting" },
      { value: "note", label: "A note" },
    ],
  },
  { field: "compartment", label: "Filed under", control: "select", options: CLIENTS },
]

/** The bar as a screen holds it: the selection is the SCREEN's state, which is
 * the only way `onChange` can be observed doing what it says. */
function Harness({ facets = FACETS }: { facets?: FilterFacet[] }) {
  const [values, setValues] = React.useState<Record<string, string>>({})
  return (
    <>
      <FilterBar
        facets={facets}
        values={values}
        data={[]}
        onChange={(field, value) =>
          setValues((s) => {
            const next = { ...s }
            if (value === "") delete next[field]
            else next[field] = value
            return next
          })
        }
        onClearFacets={() => setValues({})}
      />
      <span data-testid="values">{JSON.stringify(values)}</span>
    </>
  )
}

/** Open the facet panel and choose a word. The panel opens once and stays open;
 * pressing the slot again would toggle it shut. */
async function pick(label: string, option: string) {
  if (screen.queryAllByRole("listbox").length === 0)
    fireEvent.click(screen.getByRole("button", { name: "Filter" }))
  const facet = await screen.findByRole("group", { name: label })
  fireEvent.click(within(facet).getByRole("option", { name: option }))
}

const chips = () => document.querySelectorAll('[data-slot="filter-chip"]')

describe("the app's filter row is the design kit's", () => {
  it("draws all three of the kit's own controls, and declares none of its own", () => {
    const adapter = readFileSync(join(ROOT, ADAPTER), "utf8")
    for (const name of ["FilterBar as KitFilterBar", "RangeFacet", "SearchableFacet"])
      expect(
        adapter.includes(name),
        `${ADAPTER} must draw the kit's ${name} — that is the whole point of this file`
      ).toBe(true)
    expect(adapter).toContain(KIT_FILTER_BAR)

    // …and NOBODY declares a control of their own under one of those names,
    // which is the exact shape the app shipped for months. Read off the disk,
    // not off a hand-list: the last one was three files nobody had listed.
    const roots = ["web", "web-portal", "shared/web"].map((d) => join(ROOT, d))
    const declared: string[] = []
    for (const f of sourceFiles(roots, {
      extensions: [".tsx"],
      relativeTo: ROOT,
      skipTests: true,
    })) {
      if (f.rel === ADAPTER) continue
      const src = stripComments(f.source)
      for (const name of ["FilterBar", "SearchableFacet", "RangeFacet"])
        if (new RegExp(`\\b(?:function|const|class)\\s+${name}\\b`).test(src))
          declared.push(`${f.rel}: ${name}`)
    }
    expect(
      declared,
      `these declare a filter control of their own. The kit draws all three — ` +
        `import them through ${ADAPTER} instead:\n  ${declared.join("\n  ")}`
    ).toEqual([])
  })

  it("A SELECTED FACET IS NOT MANGO — nothing here passes a colour at all", () => {
    // THE OWNER'S RULING, and the reason it is checked by ABSENCE. The old row
    // drew a selected facet as `Badge variant="default"`, which is the brand
    // fill (measured rgb(254,208,105)); the kit's file says three times over
    // that a selected facet is not one, and kit RULES.md §2.5 says mango is
    // never a status. A rendered colour cannot be measured here — jsdom
    // resolves no custom property — so what is asserted is the only thing that
    // can make the ruling untrue from this side: this file naming a colour.
    const src = stripComments(readFileSync(join(ROOT, ADAPTER), "utf8"))
    const colour = src.match(
      /\b(?:bg|text|border|fill|ring)-(?:primary|brand|surface-brand|\[var\(--(?:primary|surface-brand)\)\])|variant=/g
    )
    expect(
      colour,
      `R32 and the kit's §2.5: the filter row decides no colour. Found: ${colour?.join(", ")}`
    ).toBeNull()
  })

  it("A CHIP'S LABEL IS WRAPPED, so a long client name still gets its ellipsis", async () => {
    // THE TRAP, and it is silent. The kit's chip label is `inline-flex`, so a
    // BARE string child becomes an anonymous flex item and `text-overflow:
    // ellipsis` stops applying — the text still clips, at the identical pixel,
    // with no "…" to say it did. Measured in a browser: wrapped, the span
    // reports scrollWidth 293 against clientWidth 210 and paints the ellipsis;
    // bare, it paints nothing and looks like a name that simply ends there.
    // These facets carry client names, which is where the difference lands.
    render(<Harness />)
    await pick("Filed under", "Northwind Traders International Holdings Ltd.")
    await waitFor(() => expect(chips().length).toBe(1))

    const label = chips()[0].querySelector('[data-slot="filter-chip-label"]')
    const wrapper = label?.firstElementChild
    expect(
      wrapper,
      "the chip's label must be an ELEMENT, not a bare string — see above"
    ).toBeTruthy()
    expect(wrapper?.className).toContain("truncate")
    expect(wrapper?.textContent).toBe(
      "Filed under · Northwind Traders International Holdings Ltd."
    )
    // …and the remove control says the WHOLE thing, because the kit's own
    // fallback joins a STRING label and ours is a node: without this every chip
    // on the row would announce the same bare "Remove filter".
    expect(
      chips()[0]
        .querySelector('[data-slot="filter-chip-remove"]')
        ?.getAttribute("aria-label")
    ).toBe("Remove filter: Filed under: Northwind Traders International Holdings Ltd.")
  })

  it("ONE VALUE PER FACET — a second pick REPLACES, it does not add", async () => {
    // The kit's facet is MULTI-select and every door this feeds takes ONE value
    // per query parameter, validated positionally (R20). If the adapter ever
    // let the array grow, the extra word would be dropped on the way to the
    // door and the screen would show two chips for a filter that answered one —
    // the same class of lie as a facet that narrows the loaded page.
    render(<Harness />)
    await pick("Type", "From a meeting")
    await waitFor(() => expect(screen.getByTestId("values").textContent).toBe('{"kind":"meeting"}'))
    await pick("Type", "A note")
    await waitFor(() => expect(screen.getByTestId("values").textContent).toBe('{"kind":"note"}'))
    expect(chips().length, "one facet, one chip").toBe(1)
    // …and picking the word that is already on CLEARS it.
    await pick("Type", "A note")
    await waitFor(() => expect(screen.getByTestId("values").textContent).toBe("{}"))
    expect(chips().length).toBe(0)
  })

  it("A CHIP KEEPS ITS WORDS when the option is taken away underneath it", async () => {
    // A facet over ROWS offers what the screen is holding, so a client filtered
    // out of the loaded page — or an app archived while its filter is on —
    // takes its own option away with it. Without the words being remembered at
    // the moment they were chosen, the chip falls back to the value, and the
    // screen names a ULID at somebody.
    const { rerender } = render(<Harness />)
    await pick("Filed under", "Northwind Traders International Holdings Ltd.")
    await waitFor(() => expect(chips().length).toBe(1))

    rerender(
      <Harness
        facets={FACETS.map((f) =>
          f.field === "compartment" ? { ...f, options: [CLIENTS[0]] } : f
        )}
      />
    )
    expect(chips()[0].textContent).toBe(
      "Filed under · Northwind Traders International Holdings Ltd."
    )
  })
})
