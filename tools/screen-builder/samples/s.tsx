/* Dummy data for the parts screen-renderer … switch. See ./index.ts for what a sample may
 * and may not do. Keys are the kit's folder names; each `render` draws the real
 * export with made-up content and spreads `p.of("<Export>")` onto every export
 * the properties panel offers options for. */
import { Badge } from "../../../shared/ui/components/badge/badge"
import { Button } from "../../../shared/ui/components/button/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../shared/ui/components/card/card"
import { ScreenRenderer } from "../../../shared/ui/components/screen-renderer/screen-renderer"
import { ScrollArea } from "../../../shared/ui/components/scroll-area/scroll-area"
import { SearchInput } from "../../../shared/ui/components/search-input/search-input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../../../shared/ui/components/select/select"
import { Separator } from "../../../shared/ui/components/separator/separator"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../../../shared/ui/components/sheet/sheet"
import { Signature } from "../../../shared/ui/components/signature/signature"
import { Skeleton } from "../../../shared/ui/components/skeleton/skeleton"
import { Slider } from "../../../shared/ui/components/slider/slider"
import { Toaster, toast } from "../../../shared/ui/components/sonner/sonner"
import { SortControl } from "../../../shared/ui/components/sort-control/sort-control"
import { Spacer } from "../../../shared/ui/components/spacer/spacer"
import { Spinner } from "../../../shared/ui/components/spinner/spinner"
import { Split } from "../../../shared/ui/components/split/split"
import { Spreadsheet } from "../../../shared/ui/components/spreadsheet/spreadsheet"
import { StatGrid } from "../../../shared/ui/components/stat-grid/stat-grid"
import { StatusStepper } from "../../../shared/ui/components/status-stepper/status-stepper"
import { Stopwatch } from "../../../shared/ui/components/stopwatch/stopwatch"
import { Swimlane } from "../../../shared/ui/components/swimlane/swimlane"
import { Switch } from "../../../shared/ui/components/switch/switch"
import { Plus, User } from "../../../shared/ui/foundations/icons"
import type { Samples } from "./index"

const noop = () => {}

/* A signature already given: two strokes in the box's own 0–1 coordinates, a
 * scrawl and the line under it, so the field never opens empty. */
const SIGNED: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [0.12, 0.62], [0.16, 0.38], [0.2, 0.3], [0.24, 0.42], [0.27, 0.66], [0.3, 0.5],
    [0.34, 0.34], [0.38, 0.44], [0.42, 0.62], [0.47, 0.4], [0.52, 0.32], [0.56, 0.46],
    [0.6, 0.64], [0.66, 0.42], [0.72, 0.36], [0.78, 0.5], [0.84, 0.6],
  ],
  [[0.1, 0.78], [0.5, 0.74], [0.88, 0.76]],
]

const WORK_LOG = [
  "Mon · Maya Okafor · 2 h 30 · Acme Logistics · Ticket #482 · Route planner crash",
  "Mon · Tom Lindqvist · 1 h 15 · Harbour Dental · Ticket #479 · Booking form spacing",
  "Tue · Maya Okafor · 3 h 00 · Acme Logistics · Story · Driver check-in flow",
  "Tue · Priya Raman · 0 h 45 · Northwind Freight · Meeting · Sprint review",
  "Wed · Tom Lindqvist · 2 h 00 · Harbour Dental · Ticket #481 · Reminder emails",
  "Wed · Maya Okafor · 1 h 30 · Acme Logistics · Ticket #485 · Invoice export",
  "Thu · Priya Raman · 4 h 00 · Northwind Freight · Story · Customs paperwork",
  "Thu · Tom Lindqvist · 0 h 30 · Harbour Dental · To-do · Renew SSL certificate",
  "Fri · Maya Okafor · 2 h 15 · Acme Logistics · Ticket #486 · Depot map pins",
  "Fri · Priya Raman · 1 h 00 · Northwind Freight · Meeting · Kick-off, phase two",
  "Fri · Tom Lindqvist · 1 h 45 · Harbour Dental · Ticket #488 · Patient portal login",
  "Sat · Maya Okafor · 0 h 30 · Acme Logistics · To-do · Morning digest check",
]

export const samples: Samples = {
  "screen-renderer": {
    render: (p) => (
      <ScreenRenderer
        eyebrow="Accounts"
        title="Acme Logistics"
        meta="Account since March 2025 · owner Maya Okafor"
        count={14}
        headerActions={[
          {
            kind: "node",
            id: "new-ticket",
            props: {
              children: (
                <Button>
                  <Plus size={14} aria-hidden="true" />
                  New ticket
                </Button>
              ),
            },
          },
        ]}
        hero={[
          {
            kind: "node",
            id: "figures",
            props: {
              children: (
                <StatGrid
                  surface="bare"
                  items={[
                    { id: "open", label: "Open tickets", value: "14", delta: "+4", deltaDirection: "up", support: "two are overdue" },
                    { id: "hours", label: "Hours this month", value: "128 h", support: "of 160 agreed" },
                    { id: "sprint", label: "Sprint progress", value: "72%", delta: "+9", deltaDirection: "up" },
                  ]}
                />
              ),
            },
          },
        ]}
        tabs={[
          { value: "overview", label: "Overview", count: 14 },
          { value: "activity", label: "Activity", count: 6 },
          { value: "people", label: "People", count: 5 },
        ]}
        toolbar={[
          { kind: "node", id: "search", props: { children: <SearchInput defaultValue="" placeholder="Search tickets" onClear={noop} /> } },
          {
            kind: "node",
            id: "sort",
            props: {
              children: (
                <SortControl
                  size="sm"
                  hideLabel
                  options={[
                    { value: "updated", label: "Last updated" },
                    { value: "title", label: "Title" },
                  ]}
                  onValueChange={noop}
                  onDirectionChange={noop}
                />
              ),
            },
          },
        ]}
        body={[
          { kind: "heading", id: "heading", props: { eyebrow: "This week", children: "Open tickets" } },
          {
            kind: "text",
            id: "intro",
            props: { children: "Three raised by the client, one by us. Two are past the agreed response time." },
          },
          {
            kind: "node",
            id: "ticket-482",
            span: "half",
            props: {
              children: (
                <Card>
                  <CardHeader>
                    <CardTitle>#482 · Route planner crashes on empty depot</CardTitle>
                    <CardDescription>Raised Tuesday by Dana Whitfield · Maya Okafor</CardDescription>
                  </CardHeader>
                  <CardContent>Reproduced on staging. Fix is in review; release planned for Thursday.</CardContent>
                </Card>
              ),
            },
          },
          {
            kind: "node",
            id: "ticket-485",
            span: "half",
            props: {
              children: (
                <Card>
                  <CardHeader>
                    <CardTitle>#485 · Invoice export drops the VAT line</CardTitle>
                    <CardDescription>Raised Wednesday by Dana Whitfield · Tom Lindqvist</CardDescription>
                  </CardHeader>
                  <CardContent>Waiting on a sample invoice from the client before we can confirm.</CardContent>
                </Card>
              ),
            },
          },
        ]}
        footer={[{ kind: "text", id: "pager", props: { children: "1–2 of 14" } }]}
        emptyTitle="No tickets yet"
        emptyDescription="When the client raises one it will appear here."
        errorTitle="We can’t show the tickets right now"
        errorDescription="Try again in a moment."
        {...p.of("ScreenRenderer")}
      />
    ),
  },
  "scroll-area": {
    render: (p) => (
      <div style={{ display: "grid", height: "12rem" }}>
        <ScrollArea {...p.of("ScrollArea")}>
          <ul>
            {WORK_LOG.map((line) => (
              <li key={line} className="py-2 text-sm">
                {line}
              </li>
            ))}
          </ul>
        </ScrollArea>
      </div>
    ),
    note: "Wrapped in a 12rem grid box: a scroll area takes its height from its parent and has none of its own, so without a bounded parent nothing scrolls.",
  },
  "search-input": {
    render: (p) => (
      <SearchInput defaultValue="Harbour Dental" shortcut="⌘K" onClear={noop} onChange={noop} {...p.of("SearchInput")} />
    ),
  },
  select: {
    render: (p) => (
      <Select defaultValue="maya">
        <SelectTrigger aria-label="Assign to" {...p.of("SelectTrigger")}>
          <SelectValue placeholder="Assign to" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="maya" icon={<User size={16} aria-hidden="true" />}>
              Maya Okafor
            </SelectItem>
            <SelectItem value="tom" icon={<User size={16} aria-hidden="true" />}>
              Tom Lindqvist
            </SelectItem>
            <SelectItem value="priya" icon={<User size={16} aria-hidden="true" />}>
              Priya Raman
            </SelectItem>
            <SelectItem value="nobody" disabled>
              Unassigned
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    ),
    note: "The list opens over the page: the kit portals it to the document body, so it cannot sit inline on the canvas.",
  },
  separator: {
    render: (p) => <Separator label="Earlier this week" {...p.of("Separator")} />,
  },
  sheet: {
    render: (p) => (
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="secondary">Open ticket #482</Button>
        </SheetTrigger>
        <SheetContent {...p.of("SheetContent")}>
          <SheetHeader>
            <SheetTitle>#482 · Route planner crashes on empty depot</SheetTitle>
            <SheetDescription>Acme Logistics · raised Tuesday by Dana Whitfield · Maya Okafor</SheetDescription>
          </SheetHeader>
          <p>
            Opening the route planner with a depot that has no vehicles throws on the map layer. Reproduced on
            staging; the fix is in review and the release is planned for Thursday.
          </p>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="secondary">Close</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    ),
    note: "Opens over the page: the kit portals the drawer to the document body, so the trigger is what sits on the canvas. Press it to see the side you chose.",
  },
  signature: {
    render: (p) => (
      <Signature label="Sign-off" placeholder="Sign here" defaultValue={SIGNED} onValueChange={noop} {...p.of("Signature")} />
    ),
  },
  skeleton: {
    render: (p) => <Skeleton variant="text" lines={4} {...p.of("Skeleton")} />,
  },
  slider: {
    render: () => <Slider defaultValue={[35]} max={100} step={5} thumbLabels={["Hours this sprint"]} onValueChange={noop} />,
  },
  sonner: {
    render: () => (
      <>
        <Toaster />
        <Button onClick={() => toast("Saved")}>Save changes</Button>
      </>
    ),
    note: "The toast appears over the page when the button is pressed; the Toaster itself draws nothing until then.",
  },
  "sort-control": {
    render: (p) => (
      <SortControl
        options={[
          { value: "updated", label: "Last updated" },
          { value: "title", label: "Title" },
          { value: "account", label: "Account" },
          { value: "priority", label: "Priority" },
        ]}
        defaultValue="updated"
        defaultDirection="desc"
        onValueChange={noop}
        onDirectionChange={noop}
        {...p.of("SortControl")}
      />
    ),
  },
  spacer: {
    render: (p) => <Spacer {...p.of("Spacer")} />,
    note: "A measured hole: it paints nothing, which is the whole part.",
  },
  spinner: {
    render: (p) => <Spinner label="Loading tickets" {...p.of("Spinner")} />,
  },
  split: {
    render: (p) => (
      <Split
        records={[
          { id: "482", number: "#482", title: "Route planner crashes on empty depot", meta: "Maya Okafor · 2d ago" },
          { id: "485", number: "#485", title: "Invoice export drops the VAT line", meta: "Tom Lindqvist · 1d ago" },
          { id: "486", number: "#486", title: "Depot map pins offset on zoom", meta: "Maya Okafor · 6h ago" },
          { id: "488", number: "#488", title: "Patient portal login loops", meta: "Tom Lindqvist · 3h ago" },
          { id: "490", number: "#490", title: "Customs paperwork PDF is blank", meta: "Priya Raman · 1h ago" },
        ]}
        defaultSelectedId="482"
        onSelectionChange={noop}
        onOpen={noop}
        listFooter={<span className="text-caption text-ink-tertiary">1–5 of 24</span>}
        detail={
          <Card>
            <CardHeader>
              <CardTitle>#482 · Route planner crashes on empty depot</CardTitle>
              <CardDescription>Acme Logistics · raised Tuesday by Dana Whitfield · Maya Okafor</CardDescription>
            </CardHeader>
            <CardContent>
              Opening the route planner with a depot that has no vehicles throws on the map layer. Reproduced on
              staging; the fix is in review and the release is planned for Thursday.
            </CardContent>
          </Card>
        }
        {...p.of("Split")}
      />
    ),
    note: "Below the kit's 900px threshold the pane is hidden and a row press opens the record instead; widen the frame to see both panes.",
  },
  spreadsheet: {
    render: (p) => (
      <Spreadsheet
        label="Hours by ticket"
        labelHeader="Ticket"
        columns={["Module", "Hours", "Rate", "Amount", "Owner", "Status"]}
        rows={[
          { id: "482", label: "#482 Route planner", cells: ["Tickets", "6.5", "95", "617.50", "Maya Okafor", "In review"] },
          { id: "485", label: "#485 Invoice export", cells: ["Tickets", "2.0", "95", "190.00", "Tom Lindqvist", "Waiting"] },
          { id: "486", label: "#486 Depot map pins", cells: ["Tickets", "4.25", "95", "403.75", "Maya Okafor", "In progress"] },
          { id: "s12", label: "Driver check-in", cells: ["Stories", "12.0", "110", "1,320.00", "Maya Okafor", "Planned"] },
          { id: "m04", label: "Sprint review", cells: ["Meetings", "1.0", "0", "0.00", "Priya Raman", "Done"] },
          { id: "t07", label: "Renew SSL certificate", cells: ["To-dos", "0.5", "95", "47.50", "Tom Lindqvist", "Done"], disabled: true },
        ]}
        onCellCommit={noop}
        getCellLabel={(row, _rowIndex, columnIndex) =>
          `${typeof row.label === "string" ? row.label : "row"}, ${["Module", "Hours", "Rate", "Amount", "Owner", "Status"][columnIndex]}`
        }
        {...p.of("Spreadsheet")}
      />
    ),
  },
  "stat-grid": {
    render: (p) => (
      <StatGrid
        label="This month"
        items={[
          { id: "open", label: "Open tickets", value: "14", delta: "+4", deltaDirection: "up", support: "two are overdue" },
          { id: "hours", label: "Hours logged", value: "128 h", support: "of 160 agreed", delta: "−6", deltaDirection: "down" },
          { id: "sprint", label: "Sprint progress", value: "72%", delta: "+9", deltaDirection: "up", tone: "brand" },
          { id: "meetings", label: "Meetings this week", value: "5", support: "across 3 accounts", deltaDirection: "flat", delta: "0" },
        ]}
        {...p.of("StatGrid")}
      />
    ),
  },
  "status-stepper": {
    render: (p) => (
      <StatusStepper
        label="Ticket progress"
        stages={[
          { id: "raised", label: "Raised" },
          { id: "triaged", label: "Triaged" },
          { id: "planned", label: "Planned" },
          { id: "in-progress", label: "In progress" },
          { id: "in-review", label: "In review" },
          { id: "released", label: "Released" },
          { id: "closed", label: "Closed" },
        ]}
        current={3}
        onStageSelect={noop}
        {...p.of("StatusStepper")}
      />
    ),
  },
  stopwatch: {
    render: (p) => <Stopwatch leading="Ticket #482" elapsed={1_534_000} onRunningChange={noop} {...p.of("Stopwatch")} />,
    note: "Shows a fixed 25:34 so the canvas is deterministic; the disc still toggles the running state.",
  },
  swimlane: {
    render: (p) => (
      <Swimlane
        label="Work by account"
        columns={[
          { id: "backlog", title: "Backlog" },
          { id: "in-progress", title: "In progress" },
          { id: "review", title: "In review" },
          { id: "done", title: "Done" },
        ]}
        lanes={[
          {
            id: "acme",
            label: "Acme Logistics",
            cards: [
              { id: "a1", columnId: "backlog", title: "Depot map pins offset on zoom", stage: "Ticket", badges: <Badge>Bug</Badge> },
              { id: "a2", columnId: "in-progress", title: "Driver check-in flow", stage: "Story", badges: <Badge>Sprint 12</Badge> },
              { id: "a3", columnId: "review", title: "Route planner crashes on empty depot", stage: "Ticket" },
              { id: "a4", columnId: "done", title: "Invoice export VAT line", stage: "Ticket" },
            ],
          },
          {
            id: "harbour",
            label: "Harbour Dental",
            cards: [
              { id: "h1", columnId: "backlog", title: "Patient portal login loops", stage: "Ticket", badges: <Badge>Bug</Badge> },
              { id: "h2", columnId: "in-progress", title: "Reminder emails", stage: "Ticket" },
              { id: "h3", columnId: "review", title: "Booking form spacing", stage: "Ticket" },
              { id: "h4", columnId: "done", title: "Renew SSL certificate", stage: "To-do" },
            ],
          },
          {
            id: "northwind",
            label: "Northwind Freight",
            cards: [
              { id: "n1", columnId: "backlog", title: "Customs paperwork PDF is blank", stage: "Ticket" },
              { id: "n2", columnId: "in-progress", title: "Customs paperwork", stage: "Story", badges: <Badge>Sprint 12</Badge> },
              { id: "n3", columnId: "review", title: "Kick-off notes, phase two", stage: "Meeting" },
              { id: "n4", columnId: "done", title: "Sprint review", stage: "Meeting" },
            ],
          },
        ]}
        onCardSelect={noop}
        {...p.of("Swimlane")}
      />
    ),
  },
  switch: {
    render: () => <Switch defaultChecked aria-label="Send me the morning digest" onCheckedChange={noop} />,
  },
}
