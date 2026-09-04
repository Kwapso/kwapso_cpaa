/* Dummy data for the parts table … web-embed. See ./index.ts for what a sample may
 * and may not do. Keys are the kit's folder names; each `render` draws the real
 * export with made-up content and spreads `p.of("<Export>")` onto every export
 * the properties panel offers options for. */
import { Button } from "../../../shared/ui/components/button/button"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../shared/ui/components/table/table"
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "../../../shared/ui/components/tabs/tabs"
import { Textarea } from "../../../shared/ui/components/textarea/textarea"
import { TicketThread, type ThreadMessage } from "../../../shared/ui/components/ticket-thread/ticket-thread"
import { Tiles, type TileItem } from "../../../shared/ui/components/tiles/tiles"
import { Timeline, type TimelineEvent } from "../../../shared/ui/components/timeline/timeline"
import { Title } from "../../../shared/ui/components/title/title"
import { Toggle } from "../../../shared/ui/components/toggle/toggle"
import { ToggleGroup, ToggleGroupItem } from "../../../shared/ui/components/toggle-group/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../shared/ui/components/tooltip/tooltip"
import { Tree, type TreeGroup } from "../../../shared/ui/components/tree/tree"
import { Headline, Hint, Text } from "../../../shared/ui/components/typography/typography"
import { Video } from "../../../shared/ui/components/video/video"
import { VisibilityProvider, Visible } from "../../../shared/ui/components/visibility/visibility"
import { WebEmbed } from "../../../shared/ui/components/web-embed/web-embed"
import { CalendarBlank, Info, Kanban, ListBullets, PencilSimple, Ticket } from "../../../shared/ui/foundations/icons"
import type { Samples } from "./index"

const noop = () => {}

/* Helper data sits ABOVE the registry on purpose: the catalogue test reads
 * part names at two-space indent between `export const samples … = {` and the
 * first `}` at column 0, so a row array declared inside a sample would be fine,
 * but one declared here can never be mistaken for a part. */

const TICKETS = [
  { id: "T-1042", title: "Invoice PDF shows the wrong VAT line", account: "Acme Logistics", owner: "Maya Okafor", status: "Open" },
  { id: "T-1039", title: "Booking form times out on Safari", account: "Harbour Dental", owner: "Tom Lindqvist", status: "In progress" },
  { id: "T-1036", title: "Add a second delivery address", account: "Acme Logistics", owner: "Maya Okafor", status: "Waiting on client" },
  { id: "T-1031", title: "Recall reminders go out twice", account: "Harbour Dental", owner: "Priya Raman", status: "Open" },
  { id: "T-1027", title: "Driver app logo is blurry on Android", account: "Acme Logistics", owner: "Tom Lindqvist", status: "Closed" },
]

const THREAD: ThreadMessage[] = [
  {
    id: "m1",
    side: "theirs",
    author: "Sarah Chen",
    authorMeta: "Acme Logistics",
    initials: "SC",
    body: "The invoice PDF for order 8812 shows VAT on the shipping line twice. Our accountant flagged it this morning.",
    time: "09:14",
    daySeparator: "Tuesday 2 September",
  },
  {
    id: "m2",
    side: "mine",
    author: "Maya Okafor",
    authorMeta: "Kwapso",
    initials: "MO",
    body: "Thanks Sarah, I can see it. The shipping line is being taxed once in the template and once in the totals. I will have a fix on staging by lunch.",
    time: "09:31",
  },
  {
    id: "m3",
    side: "mine",
    author: "Maya Okafor",
    authorMeta: "Kwapso",
    initials: "MO",
    body: "Tom, the totals helper double-counts when the shipping line carries its own tax code. Can you check the export path too?",
    time: "09:33",
    internal: true,
  },
  {
    id: "m4",
    side: "mine",
    author: "Tom Lindqvist",
    authorMeta: "Kwapso",
    initials: "TL",
    body: "Fixed on staging. Regenerated invoice attached for a look before it goes live.",
    time: "11:52",
    attachments: [{ id: "a1", name: "invoice-8812-corrected.pdf", size: "84 KB" }],
    receipt: "Seen by Sarah Chen",
  },
]

const TILES: TileItem[] = [
  { id: "open", name: "Open tickets", value: "14", meta: "3 waiting on a client", dot: "info", dotLabel: "Open" },
  { id: "sprint", name: "Sprint 14", value: "62%", meta: "18 of 29 points done", dot: "brand", dotLabel: "Sprint" },
  { id: "logged", name: "Hours this week", value: "37.5", meta: "Across 4 accounts", tone: "brand" },
  { id: "blocked", name: "Blocked stories", value: "2", meta: "Both on Harbour Dental", dot: "blocked", dotLabel: "Blocked" },
]

const EVENTS: TimelineEvent[] = [
  { id: "e1", title: "Account opened", meta: "Acme Logistics signed the retainer", date: "3 Mar 2025", tone: "brand", toneLabel: "Milestone" },
  { id: "e2", title: "Driver app shipped", meta: "Sprint 9 · Maya Okafor", date: "21 May 2025", tone: "shipped", toneLabel: "Shipped" },
  { id: "e3", title: "Second warehouse added", meta: "Requested by Sarah Chen", date: "8 Jul 2025", tone: "info", toneLabel: "Change" },
  { id: "e4", title: "Invoice run paused", meta: "VAT line double-counted · ticket T-1042", date: "2 Sep 2025", tone: "blocked", toneLabel: "Blocked" },
  { id: "e5", title: "Quarterly review", meta: "Meeting with the Acme operations team", date: "18 Sep 2025" },
]

const TREE: TreeGroup[] = [
  {
    id: "acme",
    label: "Acme Logistics",
    children: [
      { id: "acme-driver", label: "Driver app" },
      { id: "acme-invoicing", label: "Invoicing" },
      { id: "acme-portal", label: "Customer portal" },
    ],
  },
  {
    id: "harbour",
    label: "Harbour Dental",
    children: [
      { id: "harbour-booking", label: "Online booking" },
      { id: "harbour-recalls", label: "Recall reminders" },
    ],
  },
  {
    id: "northwind",
    label: "Northwind Bakery",
    children: [{ id: "northwind-site", label: "Marketing site" }],
  },
  { id: "archive", label: "Archived accounts", disabled: true },
]

/* A poster for the video part, drawn inline so nothing is fetched. */
const VIDEO_POSTER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">' +
      '<rect width="640" height="360" fill="#e9e6df"/>' +
      '<rect x="40" y="40" width="560" height="280" rx="16" fill="#f6f4ee"/>' +
      '<text x="320" y="170" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#3b3a36">Acme Logistics · onboarding walkthrough</text>' +
      '<text x="320" y="205" font-family="sans-serif" font-size="15" text-anchor="middle" fill="#7a776f">Recorded by Maya Okafor · 4 min 12 s</text>' +
      "</svg>",
  )

/* A page for the web-embed part, carried in the URL itself so nothing is fetched. */
const EMBED_PAGE =
  "data:text/html;charset=utf-8," +
  encodeURIComponent(
    "<!doctype html><html><head><meta charset='utf-8'><style>" +
      "body{margin:0;font-family:sans-serif;background:#f6f4ee;color:#3b3a36;padding:24px}" +
      "h1{font-size:18px;margin:0 0 4px}p{margin:0 0 16px;color:#7a776f;font-size:13px}" +
      "table{border-collapse:collapse;width:100%;font-size:13px}td,th{text-align:left;padding:8px 0;border-bottom:1px solid #ddd9cf}" +
      "</style></head><body><h1>Acme Logistics · delivery board</h1><p>Shared from the client's own status page</p>" +
      "<table><tr><th>Route</th><th>Driver</th><th>Status</th></tr>" +
      "<tr><td>North loop</td><td>D. Mensah</td><td>On time</td></tr>" +
      "<tr><td>Harbour run</td><td>L. Petrov</td><td>Delayed 20 min</td></tr>" +
      "<tr><td>City centre</td><td>A. Kowalski</td><td>Delivered</td></tr></table></body></html>",
  )

export const samples: Samples = {
  table: {
    render: (p) => (
      <Table>
        <TableCaption>Tickets touched this week</TableCaption>
        <TableHeader {...p.of("TableHeader")}>
          <TableRow>
            <TableHead>Ticket</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {TICKETS.map((t) => (
            <TableRow key={t.id} {...p.of("TableRow")}>
              <TableCell>{t.id}</TableCell>
              <TableCell>{t.title}</TableCell>
              <TableCell>{t.account}</TableCell>
              <TableCell>{t.owner}</TableCell>
              <TableCell>{t.status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>5 tickets</TableCell>
            <TableCell />
            <TableCell>2 accounts</TableCell>
            <TableCell>3 people</TableCell>
            <TableCell>2 open</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    ),
  },
  tabs: {
    render: (p) => (
      <Tabs defaultValue="open">
        <TabsList aria-label="Tickets" {...p.of("TabsList")}>
          <TabsTrigger value="open">
            Open
            <TabsCount count={14} />
          </TabsTrigger>
          <TabsTrigger value="waiting">
            Waiting on client
            <TabsCount count={3} />
          </TabsTrigger>
          <TabsTrigger value="closed">
            Closed
            <TabsCount count={128} />
          </TabsTrigger>
          <TabsTrigger value="archived" disabled>
            Archived
          </TabsTrigger>
        </TabsList>
        <TabsContent value="open">Fourteen open tickets across Acme Logistics and Harbour Dental. Maya Okafor owns eight of them.</TabsContent>
        <TabsContent value="waiting">Three tickets are waiting on a reply from the client side.</TabsContent>
        <TabsContent value="closed">One hundred and twenty-eight tickets closed since March.</TabsContent>
        <TabsContent value="archived">Nothing archived yet.</TabsContent>
      </Tabs>
    ),
  },
  textarea: {
    render: (p) => (
      <Textarea
        aria-label="Notes"
        placeholder="Write a note…"
        defaultValue={
          "Met the Acme operations team on Tuesday. They want the second warehouse live before the October peak, and Sarah asked for the driver app to show the next three stops instead of one."
        }
        {...p.of("Textarea")}
      />
    ),
  },
  "ticket-thread": {
    render: (p) => (
      <TicketThread
        messages={THREAD}
        banner="Ticket T-1042 · Invoice PDF shows the wrong VAT line"
        onSend={noop}
        onAttach={noop}
        onInternalChange={noop}
        audience="Sarah Chen and two others at Acme Logistics will see this"
        {...p.of("TicketThread")}
      />
    ),
  },
  tiles: {
    render: (p) => <Tiles label="This week" items={TILES} {...p.of("Tiles")} />,
  },
  timeline: {
    render: (p) => <Timeline label="Account history" events={EVENTS} {...p.of("Timeline")} />,
  },
  title: {
    render: (p) => (
      <Title
        eyebrow="Account"
        actions={
          <Button variant="secondary">
            <PencilSimple size={14} aria-hidden="true" />
            Edit
          </Button>
        }
        {...p.of("Title")}
      >
        Acme Logistics
      </Title>
    ),
  },
  toggle: {
    render: (p) => (
      <Toggle defaultPressed aria-label="Show closed tickets" {...p.of("Toggle")}>
        <Ticket size={16} aria-hidden="true" />
        Show closed tickets
      </Toggle>
    ),
  },
  "toggle-group": {
    render: () => (
      <ToggleGroup type="single" defaultValue="list" aria-label="View">
        <ToggleGroupItem value="list" aria-label="List">
          <ListBullets size={16} aria-hidden="true" />
          List
        </ToggleGroupItem>
        <ToggleGroupItem value="board" aria-label="Board">
          <Kanban size={16} aria-hidden="true" />
          Board
        </ToggleGroupItem>
        <ToggleGroupItem value="calendar" aria-label="Calendar">
          <CalendarBlank size={16} aria-hidden="true" />
          Calendar
        </ToggleGroupItem>
      </ToggleGroup>
    ),
  },
  tooltip: {
    render: () => (
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>
            <Button variant="secondary">
              <Info size={14} aria-hidden="true" />
              Why is this blocked?
            </Button>
          </TooltipTrigger>
          <TooltipContent>Waiting on Harbour Dental to confirm the recall wording.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ),
    note: "Held open with the kit's own `open` prop; the bubble opens over the page beside its trigger, as it does in the app.",
  },
  tree: {
    render: (p) => (
      <Tree label="Accounts and their projects" groups={TREE} defaultOpen={["acme", "harbour"]} onSelect={noop} {...p.of("Tree")} />
    ),
  },
  typography: {
    render: (p) => (
      <>
        <Headline {...p.of("Headline")}>Sprint 14 review</Headline>
        <Text {...p.of("Text")}>
          Eighteen of twenty-nine points are done. The driver app's next-three-stops view shipped on Thursday, and the
          invoicing fix for Acme Logistics is on staging waiting for Sarah Chen to confirm.
        </Text>
        <Hint {...p.of("Hint")}>Last updated by Maya Okafor on Tuesday.</Hint>
      </>
    ),
  },
  video: {
    render: (p) => (
      <Video poster={VIDEO_POSTER} {...p.of("Video")}>
        Your browser cannot play this video.
      </Video>
    ),
    note: "No network source: the frame carries an inline poster drawn as a data URL, with the usual fallback text as its child so the part draws its player rather than its empty state.",
  },
  visibility: {
    render: (p) => (
      <VisibilityProvider {...p.of("VisibilityProvider")}>
        <Visible fallback="The work log loads when this comes into view…">
          Work log · Maya Okafor · 3.5 h on T-1042 (Acme Logistics) · 2 h on the Harbour Dental booking form
        </Visible>
        <Visible once={false}>
          {(visible) => (visible ? "This block is in view right now." : "This block is out of view.")}
        </Visible>
      </VisibilityProvider>
    ),
    note: "Two `Visible` wrappers under one provider: the first swaps its fallback for content once seen, the second reports in and out of view as you scroll.",
  },
  "web-embed": {
    render: (p) => (
      <WebEmbed src={EMBED_PAGE} title="Acme Logistics delivery board" {...p.of("WebEmbed")} />
    ),
    note: "No network source: the frame shows a small page carried in a data URL, so the part draws a real embed without fetching anything.",
  },
}
