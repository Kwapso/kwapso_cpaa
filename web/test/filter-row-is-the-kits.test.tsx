// THE FILTER ROW IS THE KIT'S, AND THE WAYS IT COULD QUIETLY STOP BEING.
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
// The rest are the ways the adoption could survive as an import and die as a
// behaviour, each one measured in a real browser on the day it was written and
// each one invisible in a screenshot. Three of them are the client's rulings of
// 2026-09-02, and the FIRST of those is here because it had already broken
// twice with nothing catching it:
//
//   · THE PANEL EXPANDS THE SPACE. An open filter panel pushes the collection
//     down and the toolbar's own pill does not change shape. Pass one made the
//     panel a flex child of the pill and drew a giant oval; pass two made it
//     `position: absolute` and it floated over the rows. Both were shipped,
//     both were caught by a person looking at a screenshot, and nothing in this
//     suite could see either. It can now: the test below opens the panel and
//     asserts the pill track's own subtree is BYTE-IDENTICAL open and closed.
//   · THE TOOLBAR SAYS A COUNT, NEVER THE FILTERS. No chip for an active facet,
//     anywhere in the row.
//   · THE THREE PILLS ARE ONE FAMILY. Filter's box matches sort's and view's,
//     derived from the kit's own source at both ends rather than pinned.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"
import { FilterBar } from "@shared/web/screen-engine/filter-bar"
import type { FacetOption, FilterFacet } from "@shared/web/screen-engine/config"
import { ToolbarRow } from "@/components/deep-link/screen-bits"

const ROOT = join(__dirname, "..", "..")
const ADAPTER = "shared/web/screen-engine/filter-bar.tsx"
const KIT_FILTER_BAR = "@shared/ui/components/filter-bar/filter-bar"
const KIT_SELECT = "@shared/ui/components/select/select"

const adapterSource = () => readFileSync(join(ROOT, ADAPTER), "utf8")
const kitSource = (rel: string) => readFileSync(join(ROOT, "shared", "ui", rel), "utf8")

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
  // which is why the "the toolbar never names one" case below is not
  // hypothetical — it is the case a chip used to have to truncate.
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
 * pressing the slot again would toggle it shut.
 *
 * TWO OPENINGS, NOT ONE, since the facets became compact fields (2026-09-02):
 * the PANEL opens off the "Filter" pill, and then the facet's own `Select`
 * opens off its trigger — on `pointerdown`, which is the one event Radix's
 * trigger listens for, so a `click` here would open nothing and every
 * assertion below would pass by never running. That is the failure this whole
 * file exists to refuse.
 *
 * The list is PORTALLED, so the option is found on `screen` rather than inside
 * the facet's own group; the facet is still addressed by its heading first, so
 * a test cannot pass by operating the facet beside it. */
async function pick(label: string, option: string) {
  if (screen.queryAllByRole("group", { name: label }).length === 0) openPanel()
  const facet = await screen.findByRole("group", { name: label })
  fireEvent.pointerDown(within(facet).getByRole("combobox"), {
    button: 0,
    ctrlKey: false,
    pointerId: 1,
    pointerType: "mouse",
  })
  const listbox = await screen.findByRole("listbox")
  fireEvent.click(within(listbox).getByRole("option", { name: option }))
}

const openPanel = () => fireEvent.click(screen.getByRole("button", { name: /^Filter/ }))

/** WHAT THE TOOLBAR SAYS — the pill's own words, which since 2026-09-02 are
 * the only thing it says about what is narrowing the list. */
const pillSays = () =>
  document.querySelector('[data-slot="filter-bar-add"]')?.textContent ?? "(no pill)"

/** The kit's own chip, which this app must now never draw one of. */
const chips = () => document.querySelectorAll('[data-slot="filter-chip"]')

const panelNode = () => document.querySelector('[data-slot="filter-bar-row"]')

describe("the app's filter row is the design kit's", () => {
  it("every control in the filter row is one the kit draws, and none is ours", () => {
    const adapter = adapterSource()
    for (const name of ["FilterBar as KitFilterBar", "RangeFacet"])
      expect(
        adapter.includes(name),
        `${ADAPTER} must draw the kit's ${name} — that is the whole point of this file`
      ).toBe(true)
    expect(adapter).toContain(KIT_FILTER_BAR)
    // THE COMPACT FACET FIELD IS THE KIT'S `Select` (client ruling,
    // 2026-09-02). It used to be the kit's `SearchableFacet`, an
    // always-expanded heading + search pill + checkbox list, which is what her
    // screenshot caught hanging under the Apps toolbar where her artifact
    // draws one short field reading "Any client". The kit's filter-bar file
    // ships no compact facet, so the adapter composes one from the kit's own
    // select — and the assertion moves with it rather than being dropped,
    // because the thing this file refuses is a HAND-ROLLED control, not a
    // particular kit export. A `SelectTrigger` written out here in divs would
    // look identical and be exactly the regression of 2026-08-27 again.
    expect(
      adapter.includes(KIT_SELECT),
      `${ADAPTER}'s compact facet must be the kit's Select, never a hand-rolled trigger`
    ).toBe(true)

    // …and NOBODY declares a control of their own under one of those names,
    // which is the exact shape the app shipped for months. Read off the disk,
    // not off a hand-list: the last one was three files nobody had listed.
    // `SelectFacet` is on the list for the same reason the other three are —
    // it is the adapter's own name for the compact field, and a second one
    // anywhere else would be the same drift under a newer word.
    const roots = ["web", "web-portal", "shared/web"].map((d) => join(ROOT, d))
    const declared: string[] = []
    for (const f of sourceFiles(roots, {
      extensions: [".tsx"],
      relativeTo: ROOT,
      skipTests: true,
    })) {
      if (f.rel === ADAPTER) continue
      const src = stripComments(f.source)
      for (const name of ["FilterBar", "SearchableFacet", "RangeFacet", "SelectFacet"])
        if (new RegExp(`\\b(?:function|const|class)\\s+${name}\\b`).test(src))
          declared.push(`${f.rel}: ${name}`)
    }
    expect(
      declared,
      `these declare a filter control of their own. The kit draws all three — ` +
        `import them through ${ADAPTER} instead:\n  ${declared.join("\n  ")}`
    ).toEqual([])
  })

  it("A SELECTED FACET IS NOT MANGO — the filter row decides no colour", () => {
    // THE OWNER'S RULING, and the reason it is checked by ABSENCE. The old row
    // drew a selected facet as `Badge variant="default"`, which is the brand
    // fill (measured rgb(254,208,105)); the kit's file says three times over
    // that a selected facet is not one, and kit RULES.md §2.5 says mango is
    // never a status. A rendered colour cannot be measured here — jsdom
    // resolves no custom property — so what is asserted is the only thing that
    // can make the ruling untrue from this side: this file naming a colour.
    const src = stripComments(adapterSource())
    const colour = src.match(
      /\b(?:bg|text|border|fill|ring)-(?:primary|brand|surface-brand|\[var\(--(?:primary|surface-brand)\)\])/g
    )
    expect(
      colour,
      `R32 and the kit's §2.5: the filter row names no colour. Found: ${colour?.join(", ")}`
    ).toBeNull()

    // THE BLANKET `variant=` BAN IS NARROWED, and this is the narrowing rather
    // than a hole in it. It was a proxy for "no colour", because the breach it
    // was written against was `Badge variant="default"` — the brand fill under
    // a neutral-sounding word. Since the chips went (client ruling,
    // 2026-09-02) this row draws exactly one Button, the panel's "Clear
    // filters", and a Button cannot be drawn without a variant: `Button`'s own
    // default IS the mango. So the check now READS the word instead of banning
    // the prop, which is strictly stronger — `variant="default"` was invisible
    // to the old regex the moment it was written as `variant={x}` and is not
    // spellable at all under this one.
    const NEUTRAL = new Set(["secondary", "ghost", "text", "link"])
    const named = [...src.matchAll(/variant="([a-zA-Z]+)"/g)].map((m) => m[1])
    const dynamic = src.match(/variant=\{/g)
    expect(
      dynamic,
      "a computed variant cannot be read here — name the neutral one in the markup"
    ).toBeNull()
    expect(
      named.filter((v) => !NEUTRAL.has(v)),
      `only a neutral variant may appear in the filter row. Found: ${named.join(", ")}`
    ).toEqual([])
  })

  it("THE TOOLBAR SAYS A COUNT AND NEVER THE FILTERS — no chip, at any width", async () => {
    // CLIENT RULING, 2026-09-02, verbatim: "when activce filters, do not
    // display them in the toolbar. only a count niside the filter pill (like
    // in artifact)". The kit's chip half is not rendered at all — and that is
    // asserted with a LONG client name on, because the chip it replaces
    // existed precisely to carry strings this size and had its own truncation
    // bug for it. A count cannot clip.
    render(<Harness />)
    expect(pillSays()).toBe("Filter")

    await pick("Filed under", "Northwind Traders International Holdings Ltd.")
    await waitFor(() =>
      expect(screen.getByTestId("values").textContent).toBe('{"compartment":"a2"}')
    )

    expect(chips().length, "the toolbar draws no chip for an active facet").toBe(0)

    // THE COUNT EARNS ITS PLACE ONLY WHEN THE PANEL IS SHUT: open, the fields
    // are their own explanation, so the pill stays the bare word.
    expect(pillSays()).toBe("Filter")
    openPanel()
    await waitFor(() => expect(pillSays()).toBe("Filter (1)"))

    // …and with the panel shut the WHOLE toolbar says that and nothing else.
    // Scoped to the kit bar's own root rather than to the document, because
    // the value is of course on screen while the panel is OPEN — that is the
    // field the person is looking at. The ruling is about the toolbar, and
    // this is the toolbar: no chip, no facet name, no client name, one count.
    const toolbar = document.querySelector('[data-slot="filter-bar"]')
    expect(toolbar, "the kit's bar draws the row").toBeTruthy()
    expect(
      toolbar!.textContent,
      "the toolbar reports a count and never what the filters are"
    ).toBe("Filter (1)")

    // …and a SECOND facet moves the COUNT rather than adding a second thing to
    // the row, which is the shape a chip cluster could not have: two chips is
    // two nodes and a wider toolbar, two filters is one string one character
    // longer.
    await pick("Type", "From a meeting")
    openPanel()
    await waitFor(() => expect(pillSays()).toBe("Filter (2)"))
    expect(chips().length).toBe(0)
    expect(document.querySelector('[data-slot="filter-bar"]')!.textContent).toBe("Filter (2)")
  })

  it("ONE VALUE PER FACET — a second pick REPLACES, it does not add", async () => {
    // The kit's facet is MULTI-select and every door this feeds takes ONE value
    // per query parameter, validated positionally (R20). If the adapter ever
    // let the array grow, the extra word would be dropped on the way to the
    // door and the pill would count two filters for a question that answered
    // one — the same class of lie as a facet that narrows the loaded page.
    render(<Harness />)
    await pick("Type", "From a meeting")
    await waitFor(() => expect(screen.getByTestId("values").textContent).toBe('{"kind":"meeting"}'))
    await pick("Type", "A note")
    await waitFor(() => expect(screen.getByTestId("values").textContent).toBe('{"kind":"note"}'))
    openPanel()
    await waitFor(() => expect(pillSays(), "one facet, one count").toBe("Filter (1)"))

    // …and TURNING THE FACET OFF is its own row, "Any type", which is what the
    // field says while nothing is on. It used to be "pick the word that is
    // already on"; a compact select (2026-09-02) has no such gesture — picking
    // the chosen row again is a no-op in every select in the app, and inventing
    // an exception here would make this one control behave unlike the rest. The
    // value that reaches the caller is still `""`, never the sentinel the row
    // carries so Radix will accept it.
    await pick("Type", "Any type")
    await waitFor(() => expect(screen.getByTestId("values").textContent).toBe("{}"))
    openPanel()
    await waitFor(() => expect(pillSays()).toBe("Filter"))
  })

  it("AN OPTION TAKEN AWAY UNDER AN ACTIVE FACET still cannot make the row lie", async () => {
    // A facet over ROWS offers what the screen is holding, so a client filtered
    // out of the loaded page — or an app archived while its filter is on —
    // takes its own option away with it. That used to be a real hazard: the
    // chip fell back to the raw value and the screen named a ULID at somebody,
    // and the adapter carried a `said` ref remembering every picked label to
    // survive it. Since the toolbar names nothing (2026-09-02) the hazard is
    // gone by construction and the ref went with it — this asserts the
    // property that replaced it, so nobody re-adds a naming control without
    // re-adding the memory too.
    const { rerender } = render(<Harness />)
    await pick("Filed under", "Northwind Traders International Holdings Ltd.")
    await waitFor(() =>
      expect(screen.getByTestId("values").textContent).toBe('{"compartment":"a2"}')
    )

    rerender(
      <Harness
        facets={FACETS.map((f) =>
          f.field === "compartment" ? { ...f, options: [CLIENTS[0]] } : f
        )}
      />
    )
    openPanel()
    await waitFor(() =>
      expect(pillSays(), "the facet is still on, and still counted").toBe("Filter (1)")
    )
    expect(
      document.querySelector('[data-slot="filter-bar-add"]')?.textContent,
      "the pill reports a NUMBER — never the value whose words just went away"
    ).not.toContain("a2")
  })

  it("THE PANEL EXPANDS THE SPACE, and the toolbar pill does not change shape", async () => {
    // THE REGRESSION THAT HAS NOW HAPPENED TWICE, and the reason this test
    // exists at all. Client, 2026-09-02: "the expanded toolbar shoudl not be
    // an overlay, but literaly expand the space". The two earlier shapes each
    // got half of it:
    //
    //   PASS ONE — the panel was a flex child of the toolbar's own
    //   `rounded-pill` track. It expanded the space, and a 999px-radius box
    //   that tall draws a giant oval with the controls scattered round it.
    //   Client: "lol what is this shit".
    //   PASS TWO — `position: absolute`. The pill kept its shape and the panel
    //   floated over the rows instead of moving them, which is the ruling
    //   above, reversed.
    //
    // Both shipped green. The property that separates the fix from either is
    // STRUCTURAL and is asserted structurally: the panel is a normal-flow
    // sibling BENEATH the track, inside a wrapping column, so the track's own
    // box cannot be touched by how tall the panel gets. jsdom lays nothing
    // out, so "the pill's height does not change" is proved the only way that
    // is honest here — the track's subtree is byte-identical open and closed,
    // and the panel is not in it.
    render(
      <ToolbarRow search={<input aria-label="Search" />} filters={<Harness />} />
    )

    const column = document.querySelector('[data-slot="filter-panel-column"]')
    expect(column, "the toolbar must be wrapped in a filter-panel column").toBeTruthy()
    const track = column!.firstElementChild as HTMLElement
    expect(
      track.className,
      "the column's first child is the fixed-shape pill track"
    ).toContain("rounded-pill")

    const closed = track.outerHTML
    expect(panelNode(), "nothing is open yet").toBeNull()

    openPanel()
    const panel = panelNode()
    expect(panel, "the panel opens").toBeTruthy()

    // i · THE PILL DID NOT MOVE. Its whole subtree is what it was.
    expect(
      track.outerHTML,
      "opening the panel changed the pill track's own markup — pass one put the " +
        "panel inside it and the track was drawn as a giant oval"
    ).toBe(closed)
    expect(track.contains(panel!), "the panel must never be inside the pill").toBe(false)

    // ii · IT IS IN FLOW, UNDER THE TRACK. Not an overlay: no positioning, no
    // stacking, no floating-surface elevation, and it FOLLOWS the track in the
    // same column, which is what makes it push the collection down.
    expect(
      panel!.className,
      "pass two floated the panel over the rows — an in-flow panel positions nothing"
    ).not.toMatch(/(?:^|\s)(?:absolute|fixed|sticky|top-full|inset-x-0|z-\d+)(?:\s|$)/)
    expect(panel!.className).not.toContain("shadow-[var(--shadow-overlay)]")
    expect(column!.contains(panel!), "the panel lives in the column, beside the track").toBe(true)
    expect(
      track.compareDocumentPosition(panel!) & Node.DOCUMENT_POSITION_FOLLOWING,
      "…and beneath it, never before it"
    ).toBeTruthy()

    // iii · AND IT CLOSES BACK TO EXACTLY THE SAME TOOLBAR.
    openPanel()
    await waitFor(() => expect(panelNode()).toBeNull())
    expect(track.outerHTML).toBe(closed)
  })

  it("EVERY PILL TRACK THAT HOSTS THE BAR PUBLISHES A PANEL OUTLET", () => {
    // The panel renders IN PLACE when no host published an outlet, which is
    // correct for a plain block and for the harnesses above — and is pass
    // one's shape, so a `rounded-pill` host that forgets the column gets the
    // giant oval back. Censused off the disk rather than hand-listed: the
    // hosts were found by grep the last time this row moved, that grep found
    // four, and this census found three more the same day.
    const files = sourceFiles(["web", "web-portal", "shared/web"].map((d) => join(ROOT, d)), {
      extensions: [".tsx"],
      relativeTo: ROOT,
      skipTests: true,
    })
      .filter((f) => f.rel !== ADAPTER)
      .map((f) => ({ rel: f.rel, src: stripComments(f.source) }))

    const publishes = (src: string) => /<FilterPanel(?:Column|Provider)[\s/>]/.test(src)
    const draws = (src: string) => /<FilterBar[\s/>]/.test(src)

    // i · A BAR DRAWN HERE has somewhere to put its panel — either an outlet
    //     in this file, or a `filters={…}` slot, which hands the bar to a
    //     toolbar whose own file answers for it (`ToolbarRow`, the kit's
    //     `CollectionFrame`). Most screens are the second kind and should be:
    //     a screen does not own toolbar geometry.
    const orphaned = files
      .filter((f) => draws(f.src) && !publishes(f.src) && !/filters=\{/.test(f.src))
      .map((f) => f.rel)
    expect(
      orphaned,
      `these draw <FilterBar> outside a toolbar slot and publish no outlet, so its open ` +
        `panel lands wherever the pill is:\n  ${orphaned.join("\n  ")}`
    ).toEqual([])

    // ii · AND EVERY PILL TRACK THAT CARRIES FILTERS publishes one, because
    //      the `rounded-pill` box is the one the panel's height must never
    //      reach. This is the clause that would have failed on pass one.
    const pillHosts = files.filter(
      (f) => /rounded-pill/.test(f.src) && (draws(f.src) || /\{filters\}/.test(f.src))
    )
    expect(
      pillHosts.length,
      "found no pill toolbar hosting the filter bar — the census broke"
    ).toBeGreaterThan(2)
    const unwrapped = pillHosts.filter((f) => !publishes(f.src)).map((f) => f.rel)
    expect(
      unwrapped,
      `these draw a rounded-pill toolbar around the filter bar with no column under it. ` +
        `An open panel would grow the pill's own box and draw it as a giant oval (2 Sep ` +
        `2026). Wrap the track in <FilterPanelColumn>:\n  ${unwrapped.join("\n  ")}`
    ).toEqual([])
  })

  it("THE FILTER PILL'S BOX IS THE SORT AND VIEW PILLS' BOX", () => {
    // CLIENT RULING, 2026-09-02, verbatim: "the filter button-pill it's still
    // differnet than the other 2. fix and uniform it". Both ends of this are
    // DERIVED from the kit's own source, so it cannot pass by agreeing with a
    // number somebody typed here: the sort and view pills draw through the
    // kit's `SelectTrigger` and take its padding and its type step, and
    // `ViewSwitch` is where the weight is written down.
    const trigger = kitSource("components/select/select.tsx")
    const view = kitSource("components/collection-frame/view-switch.tsx")
    const kitBar = kitSource("components/filter-bar/filter-bar.tsx")
    const adapter = adapterSource()

    const padding = trigger.match(/px-\[var\(--space-[\w-]+\)\]/)?.[0]
    const weight = view.match(/font-\[var\(--font-weight-medium\)\]/)?.[0]
    expect(padding, "the kit's select trigger no longer states its inline padding").toBeTruthy()
    expect(weight, "ViewSwitch no longer states its label weight").toBeTruthy()
    expect(trigger, "the kit's select trigger no longer states its type step").toContain("text-sm")

    // The kit's own "+ filter" chip, which is the pill the app draws.
    const addChip = kitBar.match(/const CHIP_ADD = \[([\s\S]*?)\];/)?.[1]
    expect(addChip, "the kit's CHIP_ADD could not be read — the derivation broke").toBeTruthy()

    for (const cls of [padding!, "text-sm", weight!]) {
      // ROT-CHECK. The upstream fix is for the kit's own chip to take these
      // three the way it already took its height and its fill; the day it
      // does, this override is dead code and must go rather than sit here
      // restating what the kit now says.
      expect(
        addChip!.includes(cls),
        `the kit's CHIP_ADD now carries \`${cls}\` itself — delete the app-side ` +
          `override in ${ADAPTER}, the gap it was closing is closed`
      ).toBe(false)
      expect(
        adapter,
        `the Filter pill must match the sort and view pills on \`${cls}\``
      ).toContain(`[&_[data-slot=filter-bar-add]]:${cls}`)
    }

    // WHAT THE KIT ALREADY AGREES ON IS NOT RESTATED. Height, radius and fill
    // are identical on all three pills in the kit's own source; an override
    // repeating them would be three more lines free to drift out of step with
    // the very thing they claim to match.
    for (const already of ["h-[var(--control-height-button)]", "rounded-pill", "--btn-secondary-fill"])
      expect(
        addChip!.includes(already) && !adapter.includes(`filter-bar-add]]:${already}`),
        `\`${already}\` is the kit's job on all three pills — it must not be restated in ${ADAPTER}`
      ).toBe(true)

    // AND THE STALE HOVER IS GONE. The adapter used to force `--accent` onto
    // this pill, which was right while the kit drew it `bg-transparent` (a 5%
    // wash tinting the page behind it) and wrong the moment it became an
    // opaque `--btn-secondary-fill` pill: the wash REPLACES the fill instead
    // of tinting it, so against the dark palette the pill DIMMED on hover
    // where the other two lit up.
    expect(
      adapter.includes("filter-bar-add]]:hover:bg-accent"),
      `the kit hovers this pill to --btn-secondary-hover, the same token the other two use`
    ).toBe(false)
    expect(addChip!).toContain("--btn-secondary-hover")
  })
})
