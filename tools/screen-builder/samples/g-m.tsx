/* Dummy data for the parts gallery … mode-toggle. See ./index.ts for what a sample may
 * and may not do. Keys are the kit's folder names; each `render` draws the real
 * export with made-up content and spreads `p.of("<Export>")` onto every export
 * the properties panel offers options for. */
import { useState } from "react"

import { Badge } from "../../../shared/ui/components/badge/badge"
import { Button } from "../../../shared/ui/components/button/button"
import { Gallery } from "../../../shared/ui/components/gallery/gallery"
import { Gantt, GanttPeriodStepper } from "../../../shared/ui/components/gantt/gantt"
import { Heatmap, type HeatLevel } from "../../../shared/ui/components/heatmap/heatmap"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../../../shared/ui/components/hover-card/hover-card"
import { Image } from "../../../shared/ui/components/image/image"
import { ImportWizard, type ImportWizardStep } from "../../../shared/ui/components/import-wizard/import-wizard"
import { Input } from "../../../shared/ui/components/input/input"
import { Kanban } from "../../../shared/ui/components/kanban/kanban"
import { KpiProgress } from "../../../shared/ui/components/kpi-progress/kpi-progress"
import { Label } from "../../../shared/ui/components/label/label"
import { List } from "../../../shared/ui/components/list/list"
import { Map as KitMap } from "../../../shared/ui/components/map/map"
import { Matrix } from "../../../shared/ui/components/matrix/matrix"
import { ModeToggle } from "../../../shared/ui/components/mode-toggle/mode-toggle"
import { Text } from "../../../shared/ui/components/typography/typography"
import { Plus } from "../../../shared/ui/foundations/icons"
import type { PartProps, Samples } from "./index"

const noop = () => {}

/* A picture that needs no network: a flat SVG with a caption, as a data URL.
 * Deterministic — the same label always draws the same bytes. */
const art = (label: string, fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="${fill}"/><circle cx="252" cy="58" r="34" fill="#1A1918" fill-opacity=".14"/><rect x="20" y="24" width="120" height="10" rx="5" fill="#1A1918" fill-opacity=".22"/><rect x="20" y="44" width="80" height="10" rx="5" fill="#1A1918" fill-opacity=".14"/><text x="20" y="150" font-family="sans-serif" font-size="16" fill="#1A1918">${label}</text></svg>`,
  )}`

const WEEKS = ["W36", "W37", "W38", "W39", "W40", "W41"]

const LEVELS = (...cells: number[]) => cells as HeatLevel[]

/* The wizard's five steps are walked with Back / Continue, so the sample holds
 * the step itself; everything else on every step is fixed data. */
function ImportWizardSample({ p }: { p: PartProps }) {
  const [step, setStep] = useState<ImportWizardStep>("plan")
  const order: ImportWizardStep[] = ["upload", "plan", "review", "run", "report"]
  const at = order.indexOf(step)
  const fields = [
    { value: "name", label: "Ticket title" },
    { value: "account", label: "Account" },
    { value: "assignee", label: "Assigned to" },
    { value: "priority", label: "Priority" },
    { value: "created", label: "Raised on" },
  ]
  const columns = [
    { key: "name", header: "Ticket title", source: "Subject" },
    { key: "account", header: "Account", source: "Company" },
    { key: "assignee", header: "Assigned to", source: "Owner", unsure: true },
    { key: "priority", header: "Priority", source: "Prio" },
  ]
  const rows = [
    { id: "r1", origin: "Row 2", outcome: "added" as const, values: { name: "Checkout page times out on Safari", account: "Acme Logistics", assignee: "Maya Okafor", priority: "High" } },
    { id: "r2", origin: "Row 3", outcome: "changed" as const, values: { name: "Update opening hours on the site", account: "Harbour Dental", assignee: "Tom Lindqvist", priority: "Low" } },
    { id: "r3", origin: "Row 4", outcome: "invalid" as const, issue: "No account called “Harbor Dental”", values: { name: "Invoice PDF shows the wrong logo", account: "Harbor Dental", assignee: "Tom Lindqvist", priority: "Medium" }, issues: { account: "Did you mean Harbour Dental?" } },
    { id: "r4", origin: "Row 5", outcome: "skipped" as const, values: { name: "Newsletter signup form", account: "Acme Logistics", assignee: "", priority: "Low" } },
  ]
  return (
    <ImportWizard
      step={step}
      onStepChange={setStep}
      title="Import tickets"
      description="From the spreadsheet Harbour Dental sent on Monday."
      files={[{ id: "f1", name: "tickets-september.csv", size: 48_120, status: "done" }]}
      onFilesSelected={noop}
      onFileRemove={noop}
      accept=".csv"
      uploadPrompt="Drop the file here, or choose one"
      uploadHint="CSV, up to 10 MB"
      mappings={[
        { id: "m1", sourceLabel: "Subject", sampleLabel: "Checkout page times out on Safari", value: "name", required: true, options: fields },
        { id: "m2", sourceLabel: "Company", sampleLabel: "Acme Logistics, Harbour Dental", value: "account", required: true, options: fields },
        { id: "m3", sourceLabel: "Owner", sampleLabel: "Maya Okafor, Tom Lindqvist", value: "assignee", unsure: true, options: fields },
        { id: "m4", sourceLabel: "Prio", sampleLabel: "High, Low, Medium", value: "priority", unsure: true, options: fields },
        { id: "m5", sourceLabel: "Internal note", sampleLabel: "call back after 3pm", options: fields },
      ]}
      onMappingChange={noop}
      previewColumns={columns}
      previewRows={rows}
      includedIds={["r1", "r2"]}
      onIncludedChange={noop}
      runValue={31}
      runMax={48}
      runLabel="Writing rows"
      runMeta="31 of 48 rows written"
      onBack={() => setStep(order[Math.max(0, at - 1)])}
      onContinue={() => setStep(order[Math.min(order.length - 1, at + 1)])}
      meta="48 rows in tickets-september.csv"
      {...p.of("ImportWizard")}
    />
  )
}

export const samples: Samples = {
  gallery: {
    render: (p) => (
      <Gallery
        tiles={[
          { id: "g1", title: "Harbour Dental — homepage hero", src: art("Homepage hero", "#DCE9F2"), status: <Badge variant="status" size="pill" dot="review">In review</Badge>, meta: "2d" },
          { id: "g2", title: "Acme Logistics — tracking screen", src: art("Tracking screen", "#E3EFE1"), status: <Badge variant="status" size="pill" dot="building">With us</Badge>, meta: "5d" },
          { id: "g3", title: "Acme Logistics — driver app icon", src: art("Driver app icon", "#F6E7D3"), status: <Badge variant="status" size="pill" dot="done">Done</Badge>, meta: "1w" },
          { id: "g4", title: "Harbour Dental — appointment reminder email", src: art("Reminder email", "#EFE6DD"), status: <Badge variant="status" size="pill" dot="blocked">Blocked</Badge>, meta: "1w" },
          { id: "g5", title: "Northwind Books — autumn campaign banner", src: art("Autumn banner", "#F1E4EC"), status: <Badge variant="status" size="pill" dot="shipped">Shipped</Badge>, meta: "2w" },
          { id: "g6", title: "Northwind Books — brand guidelines", status: <Badge variant="status" size="pill" dot="archived">Archived</Badge>, meta: "3w" },
        ]}
        onTileSelect={noop}
        {...p.of("Gallery")}
      />
    ),
    note: "The last tile has no picture on purpose: the kit draws that as a state, the title on soft paper.",
  },
  gantt: {
    render: (p) => (
      <>
        <GanttPeriodStepper windowLabel="6 weeks" onPrevious={noop} onNext={noop} />
        <Gantt
          periods={WEEKS}
          currentPeriod={2}
          lanes={[
            { id: "acme", label: "Acme Logistics", bars: [{ id: "s1", label: "Sprint 14 · tracking", start: 0, span: 2, tone: "build" }, { id: "s2", label: "Sprint 15 · driver app", start: 2, span: 3, tone: "build" }] },
            { id: "harbour", label: "Harbour Dental", bars: [{ id: "s3", label: "Support retainer", start: 0, span: 6, tone: "support" }] },
            { id: "northwind", label: "Northwind Books", bars: [{ id: "s4", label: "Campaign build", start: 1, span: 2, tone: "brand" }, { id: "s5", label: "Overran by a week", start: 3, span: 1, tone: "overrun" }] },
            { id: "maya", label: "Maya Okafor", bars: [{ id: "s6", label: "Discovery · Pier 9 Café", start: 4, span: 2, tone: "inverse" }] },
            { id: "tom", label: "Tom Lindqvist", bars: [{ id: "s7", label: "Audit", start: 0, span: 1, tone: "build", disabled: true }, { id: "s8", label: "Refinement", start: 2, span: 2, tone: "support" }] },
          ]}
          onBarSelect={noop}
          {...p.of("Gantt")}
        />
      </>
    ),
    note: "Two exports, no wrapper: the stepper is drawn above the grid as a sibling. In the app it sits in the collection toolbar's period slot.",
  },
  heatmap: {
    render: (p) => (
      <Heatmap
        label="Where the work went"
        columns={["W30", "W31", "W32", "W33", "W34", "W35", "W36", "W37", "W38", "W39", "W40", "W41"]}
        totalsHeader="Total"
        rows={[
          { id: "acme", name: "Acme Logistics", cells: LEVELS(1, 2, 3, 4, 4, 3, 2, 3, 4, 4, 3, 2), total: "212h" },
          { id: "harbour", name: "Harbour Dental", cells: LEVELS(2, 2, 1, 1, 2, 2, 1, 2, 2, 1, 1, 2), total: "96h" },
          { id: "northwind", name: "Northwind Books", cells: LEVELS(0, 0, 1, 2, 3, 4, 4, 3, 1, 0, 0, 1), total: "74h" },
          { id: "pier9", name: "Pier 9 Café", cells: LEVELS(0, 0, 0, 0, 0, 1, 1, 2, 3, 3, 4, 4), total: "58h" },
          { id: "maya", name: "Maya Okafor", cells: LEVELS(3, 3, 3, 4, 4, 3, 3, 3, 4, 4, 4, 3), total: "168h" },
          { id: "tom", name: "Tom Lindqvist", cells: LEVELS(2, 3, 2, 2, 3, 3, 2, 2, 3, 2, 2, 3), total: "142h" },
        ]}
        {...p.of("Heatmap")}
      />
    ),
  },
  "hover-card": {
    render: () => (
      <HoverCard>
        <HoverCardTrigger asChild>
          <Button variant="link">Maya Okafor</Button>
        </HoverCardTrigger>
        <HoverCardContent>
          <Text as="p" size="sm">Maya Okafor</Text>
          <Text as="p" size="caption" tone="secondary">Account lead · Acme Logistics, Harbour Dental</Text>
          <Text as="p" size="caption" tone="tertiary">14 open tickets · last work log Tuesday</Text>
        </HoverCardContent>
      </HoverCard>
    ),
    note: "Opens over the page: hover the name. Radix portals the panel to the outer document, so in this preview it lands off the frame.",
  },
  image: {
    render: (p) => <Image src={art("Harbour Dental — homepage hero", "#DCE9F2")} alt="Homepage hero for Harbour Dental" {...p.of("Image")} />,
  },
  "import-wizard": {
    render: (p) => <ImportWizardSample p={p} />,
    note: "Starts on the plan step, with the two guessed columns surfaced first. Back and Continue walk all five steps.",
  },
  input: {
    render: (p) => <Input placeholder="Acme Logistics" defaultValue="Harbour Dental" aria-label="Account name" {...p.of("Input")} />,
  },
  kanban: {
    render: (p) => (
      <Kanban
        label="Tickets by stage"
        columns={[
          { id: "todo", title: "To do", dot: "review", cards: [
            { id: "t1", title: "Checkout page times out on Safari", description: "#1042 · Acme Logistics · Maya Okafor · 2d", badges: <Badge variant="status" size="pill">High</Badge> },
            { id: "t2", title: "Update opening hours on the site", description: "#1043 · Harbour Dental · Tom Lindqvist · 1d" },
            { id: "t3", title: "Newsletter signup form", description: "#1044 · Northwind Books · unassigned · 4h" },
          ], footer: <Button variant="text" size="sm" onClick={noop}><Plus />Add a ticket</Button> },
          { id: "doing", title: "With us", dot: "building", cards: [
            { id: "t4", title: "Invoice PDF shows the wrong logo", description: "#1038 · Harbour Dental · Tom Lindqvist · 3d" },
            { id: "t5", title: "Driver app crashes on launch", description: "#1035 · Acme Logistics · Maya Okafor · 5d", badges: <Badge variant="status" size="pill">High</Badge> },
          ] },
          { id: "blocked", title: "Blocked", dot: "blocked", cards: [
            { id: "t6", title: "Waiting on the print supplier", description: "#1030 · Northwind Books · Maya Okafor · 1w", disabled: true },
          ] },
          { id: "done", title: "Done", dot: "done", locked: true, cards: [
            { id: "t7", title: "Autumn campaign banner", description: "#1021 · Northwind Books · Tom Lindqvist · 2w" },
            { id: "t8", title: "Tracking screen redesign", description: "#1017 · Acme Logistics · Maya Okafor · 3w" },
          ] },
        ]}
        onMove={noop}
        onCardSelect={noop}
        footnote="Dragging a card moves the ticket and writes an activity line."
        footnoteMeta="8 tickets · 4 stages"
        {...p.of("Kanban")}
      />
    ),
  },
  "kpi-progress": {
    render: () => <KpiProgress label="Retainer used" subLabel="Harbour Dental · September" percent={78} value="31 of 40h" />,
  },
  label: {
    render: () => <Label htmlFor="sample-account-name">Account name</Label>,
  },
  list: {
    render: (p) => (
      <List
        label="Tickets"
        rows={[
          { id: "l1", initials: "AL", title: "Checkout page times out on Safari", description: "Acme Logistics · Maya Okafor", meta: "2d", count: 3, action: <Badge variant="status" size="pill" dot="review">Your answer</Badge> },
          { id: "l2", initials: "HD", title: "Update opening hours on the site", description: "Harbour Dental · Tom Lindqvist", meta: "1d", action: <Badge variant="status" size="pill" dot="building">With us</Badge>, selected: true },
          { id: "l3", initials: "NB", title: "Newsletter signup form", description: "Northwind Books · unassigned", meta: "4h", count: 1, action: <Badge variant="status" size="pill" dot="review">Your answer</Badge> },
          { id: "l4", initials: "P9", title: "Menu photography brief", description: "Pier 9 Café · Maya Okafor", meta: "1w", action: <Badge variant="status" size="pill" dot="done">Done</Badge> },
          { id: "l5", initials: "AL", title: "Driver app crashes on launch", description: "Acme Logistics · Maya Okafor", meta: "2w", action: <Badge variant="status" size="pill" dot="archived">Archived</Badge>, disabled: true },
        ]}
        onRowSelect={noop}
        {...p.of("List")}
      />
    ),
  },
  map: {
    render: (p) => (
      <KitMap
        title="Accounts by office"
        pins={[
          { id: "acme", name: "Acme Logistics", x: 28, y: 42, status: "sky", label: true },
          { id: "harbour", name: "Harbour Dental", x: 61, y: 30, status: "forest", label: true },
          { id: "northwind", name: "Northwind Books", x: 47, y: 66, status: "poppy" },
          { id: "pier9", name: "Pier 9 Café", x: 74, y: 71, status: "neutral" },
          { id: "oak", name: "Oakfield Nursery", x: 18, y: 74, status: "forest" },
        ]}
        items={[
          { id: "acme", name: "Acme Logistics", meta: "Rotterdam · 2 apps" },
          { id: "harbour", name: "Harbour Dental", meta: "Bristol · 1 app" },
          { id: "northwind", name: "Northwind Books", meta: "Leeds · 1 app" },
          { id: "pier9", name: "Pier 9 Café", meta: "Brighton · in discovery" },
          { id: "oak", name: "Oakfield Nursery", meta: "Exeter · 1 app" },
        ]}
        selectedId="harbour"
        onSelectItem={noop}
        onZoomIn={noop}
        onZoomOut={noop}
        inViewLabel="In view · 5 of 7"
        missingLabel="Two accounts have no address and are not on the map. They are in the list view."
        {...p.of("Map")}
      />
    ),
    note: "The kit draws no tiles — this is its own muted plate, with pins placed as percentages. No network is used.",
  },
  matrix: {
    render: (p) => (
      <Matrix
        label="Hours logged by member"
        columns={WEEKS}
        rows={[
          { id: "maya", label: "Maya Okafor", cells: [32, 28, 35, 30, 31, 29], total: 185 },
          { id: "tom", label: "Tom Lindqvist", cells: [24, 26, 22, 30, 27, 25], total: 154 },
          { id: "priya", label: "Priya Raman", cells: [18, 20, 19, 21, 16, 20], total: 114, selected: true },
          { id: "jonas", label: "Jonas Weber", cells: [12, 14, 10, 0, 0, 8], total: 44, disabled: true },
        ]}
        footer={{ label: "All members", cells: [86, 88, 86, 81, 74, 82], total: 497 }}
        caption="Hours logged, six weeks to 11 October 2026."
        {...p.of("Matrix")}
      />
    ),
  },
  "mode-toggle": {
    render: (p) => <ModeToggle {...p.of("ModeToggle")} />,
    note: "Really switches the theme, but on the builder's own document: the kit writes data-theme to document.documentElement and this preview is an iframe.",
  },
}
