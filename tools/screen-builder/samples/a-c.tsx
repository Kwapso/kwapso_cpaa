/* Dummy data for the parts accordion … cursor-glow. See ./index.ts for what a
 * sample may and may not do. Keys are the kit's folder names; each `render`
 * draws the real export with made-up content and spreads `p.of("<Export>")`
 * onto every export the properties panel offers options for. */
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../../shared/ui/components/accordion/accordion"
import { ActionRow } from "../../../shared/ui/components/action-row/action-row"
import { ActivityFeed } from "../../../shared/ui/components/activity-feed/activity-feed"
import { Agenda } from "../../../shared/ui/components/agenda/agenda"
import { AgentChat, Cite } from "../../../shared/ui/components/agent-chat/agent-chat"
import { Alert, AlertDescription, AlertTitle } from "../../../shared/ui/components/alert/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../../shared/ui/components/alert-dialog/alert-dialog"
import { AmbientBackground } from "../../../shared/ui/components/ambient-background/ambient-background"
import { ArticleBody } from "../../../shared/ui/components/article-body/article-body"
import { AspectRatio } from "../../../shared/ui/components/aspect-ratio/aspect-ratio"
import {
  Avatar,
  AvatarFallback,
  AvatarPresence,
  AvatarStack,
} from "../../../shared/ui/components/avatar/avatar"
import { Badge } from "../../../shared/ui/components/badge/badge"
import { Isotype, Logotype, Wordmark } from "../../../shared/ui/components/brand/brand"
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../../../shared/ui/components/breadcrumb/breadcrumb"
import { BreadcrumbFolders } from "../../../shared/ui/components/breadcrumbs/breadcrumb-folders"
import { Breadcrumbs } from "../../../shared/ui/components/breadcrumbs/breadcrumbs"
import { Button } from "../../../shared/ui/components/button/button"
import {
  CalendarView,
  type CalendarDay,
} from "../../../shared/ui/components/calendar-view/calendar-view"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../../shared/ui/components/card/card"
import { CardGrid } from "../../../shared/ui/components/card-grid/card-grid"
import { Chart } from "../../../shared/ui/components/chart/chart"
import { Chat } from "../../../shared/ui/components/chat/chat"
import { Checkbox } from "../../../shared/ui/components/checkbox/checkbox"
import { Checklist } from "../../../shared/ui/components/checklist/checklist"
import { Choice } from "../../../shared/ui/components/choice/choice"
import { Clamp } from "../../../shared/ui/components/clamp/clamp"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../../shared/ui/components/collapsible/collapsible"
import {
  CollectionFrame,
  CollectionRegister,
} from "../../../shared/ui/components/collection-frame/collection-frame"
import { ViewSwitch } from "../../../shared/ui/components/collection-frame/view-switch"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "../../../shared/ui/components/command/command"
import { Comments } from "../../../shared/ui/components/comments/comments"
import { Compare } from "../../../shared/ui/components/compare/compare"
import { Container } from "../../../shared/ui/components/container/container"
import {
  CopilotOverlay,
  CopilotTouched,
} from "../../../shared/ui/components/copilot-overlay/copilot-overlay"
import { CursorGlow } from "../../../shared/ui/components/cursor-glow/cursor-glow"
import { Image } from "../../../shared/ui/components/image/image"
import {
  Kanban,
  PencilSimple,
  Plus,
  SquaresFour,
  Table,
} from "../../../shared/ui/foundations/icons"
import type { Samples } from "./index"

const noop = () => {}

/* A placeholder photograph for the parts that frame one. Drawn in the current
 * ink at low opacity so it carries no colour of its own. */
const PHOTO =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" fill="currentColor">' +
      '<rect width="160" height="90" fill-opacity=".08"/>' +
      '<circle cx="118" cy="26" r="11" fill-opacity=".18"/>' +
      '<path d="M0 90 L52 44 L84 70 L110 52 L160 90 Z" fill-opacity=".22"/>' +
      "</svg>",
  )

const LONG_NOTE =
  "Harbour Dental asked for the booking form to remember a returning patient's insurer, " +
  "which means the intake page has to look the patient up before the form renders rather " +
  "than after it is submitted. Tom checked the API on Tuesday and the lookup is quick " +
  "enough, so the change is on the form itself: one extra call on load, a spinner while it " +
  "runs, and the insurer field pre-filled when it comes back. Maya will write it up as a " +
  "story once the client confirms which insurers they want on the list, and the sprint " +
  "review on Friday is where we show them the first cut."

/* September 2026 on a Monday-first grid: 31 August sits outside at the start,
 * 1–4 October outside at the end, thirty-five cells in all. */
const SEPTEMBER: CalendarDay[] = [
  { key: "2026-08-31", label: 31, dateTime: "2026-08-31", outside: true },
  ...Array.from({ length: 30 }, (_, i) => {
    const day = i + 1
    const iso = `2026-09-${String(day).padStart(2, "0")}`
    const events: CalendarDay["events"] =
      day === 2
        ? [{ id: "e1", label: "Sprint 14 starts", dot: "building" }]
        : day === 4
          ? [
              { id: "e2", label: "Harbour Dental review", dot: "review" },
              { id: "e3", label: "Ticket #482 due", dot: "blocked" },
            ]
          : day === 11
            ? [{ id: "e4", label: "Acme kickoff", tone: "brand" }]
            : day === 16
              ? [{ id: "e5", label: "Sprint 14 ends", dot: "shipped" }]
              : day === 23
                ? [
                    { id: "e6", label: "Northwind planning", tone: "info" },
                    { id: "e7", label: "Invoice run", tone: "quiet" },
                    { id: "e8", label: "Maya away", tone: "quiet" },
                    { id: "e9", label: "Retro", tone: "quiet" },
                  ]
                : undefined
    return { key: iso, label: day, dateTime: iso, events, today: day === 4 }
  }),
  ...Array.from({ length: 4 }, (_, i) => {
    const iso = `2026-10-0${i + 1}`
    return { key: iso, label: i + 1, dateTime: iso, outside: true }
  }),
]

const AGENDA_DAYS = [
  {
    key: "2026-09-04",
    label: "Friday 4 September",
    items: [
      { id: "a1", time: "09:30", dateTime: "2026-09-04T09:30", title: "Harbour Dental sprint review", who: "Maya Okafor, Tom Lindqvist" },
      { id: "a2", time: "11:00", dateTime: "2026-09-04T11:00", title: "Ticket #482 — booking form insurer lookup", who: "Tom Lindqvist" },
      { id: "a3", time: "15:00", dateTime: "2026-09-04T15:00", title: "Weekly work log check", who: "Priya Raman" },
    ],
  },
  {
    key: "2026-09-07",
    label: "Monday 7 September",
    items: [
      { id: "a4", time: "10:00", dateTime: "2026-09-07T10:00", title: "Acme Logistics warehouse app — story grooming", who: "Maya Okafor" },
      { id: "a5", time: "14:30", dateTime: "2026-09-07T14:30", title: "Northwind Books — quarterly planning", who: "Daniel Achebe" },
    ],
  },
]

export const samples: Samples = {
  accordion: {
    render: () => (
      <Accordion type="single" collapsible defaultValue="scope">
        <AccordionItem value="scope">
          <AccordionTrigger>What is in the Acme Logistics retainer?</AccordionTrigger>
          <AccordionContent>
            Forty hours a month across the warehouse app and the driver portal, with support tickets
            answered within one working day.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="hours">
          <AccordionTrigger>What happens to unused hours?</AccordionTrigger>
          <AccordionContent>
            They roll into the next month, up to one month's worth. Anything beyond that is written
            off at the quarter.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="who">
          <AccordionTrigger>Who is on the account?</AccordionTrigger>
          <AccordionContent>
            Maya Okafor leads it, Tom Lindqvist builds, and Priya Raman covers tickets on Fridays.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    ),
  },
  "action-row": {
    render: (p) => (
      <ActionRow {...p.of("ActionRow")}>
        <Button variant="cancel">Cancel</Button>
        <Button variant="secondary">
          <PencilSimple className="size-3.5" />
          Edit
        </Button>
        <Button>Save changes</Button>
      </ActionRow>
    ),
  },
  "activity-feed": {
    render: (p) => (
      <ActivityFeed
        label="Recent activity"
        onSelect={noop}
        items={[
          { id: "1", time: "2m", dateTime: "2026-09-04T10:12:00Z", actor: "Maya Okafor", initials: "MO", description: "Maya Okafor moved ticket #482 to In review", meta: "Harbour Dental" },
          { id: "2", time: "1h", dateTime: "2026-09-04T09:05:00Z", actor: "Tom Lindqvist", initials: "TL", variant: "inverse", description: "Tom Lindqvist logged 3h 20m on the booking form story", meta: "Sprint 14" },
          { id: "3", time: "3h", dateTime: "2026-09-04T07:40:00Z", actor: "Priya Raman", initials: "PR", variant: "brand", description: "Priya Raman closed 4 tickets for Acme Logistics" },
          { id: "4", time: "1d", dateTime: "2026-09-03T15:30:00Z", actor: "Daniel Achebe", initials: "DA", variant: "quiet", description: "Daniel Achebe invited Sam Whitfield to Northwind Books", meta: "Client login" },
          { id: "5", time: "2d", dateTime: "2026-09-02T11:00:00Z", actor: "Maya Okafor", initials: "MO", description: "Maya Okafor started Sprint 14", meta: "16 stories", disabled: true },
        ]}
        {...p.of("ActivityFeed")}
      />
    ),
  },
  agenda: {
    render: (p) => <Agenda days={AGENDA_DAYS} onItemSelect={noop} {...p.of("Agenda")} />,
  },
  "agent-chat": {
    render: (p) => (
      <AgentChat
        header
        heading="Assistant"
        onSend={noop}
        onAttach={noop}
        messages={[
          { id: "m1", role: "user", content: "Which Harbour Dental tickets are still waiting on us?" },
          {
            id: "m2",
            role: "assistant",
            content: (
              <>
                Two are waiting on the agency. Ticket #482, the insurer lookup on the booking form, is
                in review with Tom
                <Cite for="s1" />. Ticket #479, the missing reminder email, has no owner yet
                <Cite for="s2" />. The other three were answered this week.
              </>
            ),
            sources: [
              { id: "s1", collection: "Tickets", record: "#482 Booking form insurer lookup", confidence: 0.94, href: "#" },
              { id: "s2", collection: "Tickets", record: "#479 Reminder email not sent", confidence: 0.81, href: "#" },
            ],
            footnote: "Read 5 tickets for Harbour Dental",
          },
          { id: "m3", role: "user", content: "Assign #479 to Priya." },
        ]}
        {...p.of("AgentChat")}
      />
    ),
  },
  alert: {
    render: (p) => (
      <Alert {...p.of("Alert")}>
        <AlertTitle>Acme Logistics is 6 hours over this month's retainer</AlertTitle>
        <AlertDescription>
          The extra time will be billed at the account rate unless the hours are moved to next month
          before the invoice run on the 23rd.
        </AlertDescription>
      </Alert>
    ),
  },
  "alert-dialog": {
    note: "Opens over the page; press the button to see it.",
    render: () => (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">Switch off this login</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch off Sam Whitfield's login?</AlertDialogTitle>
            <AlertDialogDescription>
              Sam will no longer be able to sign in to the Northwind Books portal. Their tickets and
              comments stay where they are, and you can switch the login back on later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it on</AlertDialogCancel>
            <AlertDialogAction variant="destructive">Switch off</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
  },
  "ambient-background": {
    note: "The part fills its positioned parent and sits behind it, so it is drawn inside a plain sized <div> here; that box is not part of the kit.",
    render: (p) => (
      <div className="relative isolate h-48">
        <AmbientBackground {...p.of("AmbientBackground")} />
      </div>
    ),
  },
  "article-body": {
    render: (p) => (
      <ArticleBody eyebrow="Process map" heading="How a ticket moves from Harbour Dental to done" {...p.of("ArticleBody")}>
        <p>
          A ticket arrives through the client portal or by email. Whoever is covering tickets that
          day reads it, gives it a priority and, if it needs building, turns it into a story on the
          account's board.
        </p>
        <h3>Who does what</h3>
        <ul>
          <li>Priya Raman answers within one working day and sets the priority.</li>
          <li>Tom Lindqvist builds anything that becomes a story.</li>
          <li>Maya Okafor tells the client when it is done and closes the ticket.</li>
        </ul>
        <p>
          Nothing is deleted along the way. A ticket that turns out to be a duplicate is closed with
          a note pointing at the one it duplicates, so the history stays readable.
        </p>
      </ArticleBody>
    ),
  },
  "aspect-ratio": {
    render: () => (
      <AspectRatio ratio={16 / 9}>
        <Image src={PHOTO} alt="The warehouse floor at Acme Logistics" ratio={null} lazy={false} />
      </AspectRatio>
    ),
  },
  avatar: {
    render: (p) => (
      <>
        <Avatar {...p.of("Avatar")}>
          <AvatarFallback aria-label="Maya Okafor">MO</AvatarFallback>
          <AvatarPresence aria-label="Online" />
        </Avatar>{" "}
        <AvatarStack aria-label="Working on Sprint 14">
          <Avatar {...p.of("Avatar")}>
            <AvatarFallback aria-label="Tom Lindqvist">TL</AvatarFallback>
          </Avatar>
          <Avatar variant="inverse" {...p.of("Avatar")}>
            <AvatarFallback aria-label="Priya Raman">PR</AvatarFallback>
          </Avatar>
          <Avatar variant="brand" {...p.of("Avatar")}>
            <AvatarFallback aria-label="Daniel Achebe">DA</AvatarFallback>
          </Avatar>
        </AvatarStack>
      </>
    ),
  },
  badge: {
    render: (p) => <Badge {...p.of("Badge")}>Open</Badge>,
  },
  brand: {
    render: () => (
      <>
        <Isotype />
        <Logotype />
        <Wordmark />
      </>
    ),
  },
  breadcrumb: {
    render: (p) => (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#" {...p.of("BreadcrumbLink")}>
              Accounts
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbEllipsis label="Two more levels" />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="#" {...p.of("BreadcrumbLink")}>
              Tickets
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>#482 Booking form insurer lookup</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    ),
  },
  breadcrumbs: {
    render: () => (
      <>
        <Breadcrumbs
          maxItems={4}
          items={[
            { key: "home", label: "Home", href: "#" },
            { key: "accounts", label: "Accounts", href: "#" },
            { key: "acme", label: "Acme Logistics", href: "#" },
            { key: "sprints", label: "Sprints", href: "#" },
            { key: "s14", label: "Sprint 14", href: "#" },
            { key: "story", label: "Driver portal sign-in" },
          ]}
        />
        <BreadcrumbFolders
          items={[
            { key: "kb", label: "Knowledge base", href: "#" },
            { key: "harbour", label: "Harbour Dental", href: "#" },
            { key: "process", label: "Process maps", href: "#" },
            { key: "intake", label: "Patient intake", href: "#" },
            { key: "insurers", label: "Insurer lookup" },
          ]}
        />
      </>
    ),
  },
  button: {
    render: (p) => <Button {...p.of("Button")}>Save changes</Button>,
  },
  "calendar-view": {
    render: (p) => (
      <CalendarView
        monthLabel="September 2026"
        monthNote="Sprint 14"
        onPrevious={noop}
        onNext={noop}
        days={SEPTEMBER}
        agenda={AGENDA_DAYS}
        onSelectDay={noop}
        onSelectEvent={noop}
        onSelectItem={noop}
        footnote="Times are in the team's own time zone."
        legend="9 events"
        {...p.of("CalendarView")}
      />
    ),
  },
  card: {
    render: (p) => (
      <Card {...p.of("Card")}>
        <CardHeader>
          <CardTitle>Acme Logistics</CardTitle>
          <CardDescription>Account since March 2025 · 14 open tickets</CardDescription>
        </CardHeader>
        <CardContent>Three people on the client side, two on ours. Last touched on Tuesday.</CardContent>
        <CardFooter>
          <Badge>Retainer</Badge>
          <Button variant="secondary" size="sm">
            <PencilSimple className="size-3.5" />
            Edit
          </Button>
        </CardFooter>
      </Card>
    ),
  },
  "card-grid": {
    render: (p) => (
      <CardGrid label="Accounts" {...p.of("CardGrid")}>
        <Card>
          <CardHeader>
            <CardTitle>Acme Logistics</CardTitle>
            <CardDescription>14 open tickets · 2 sprints running</CardDescription>
          </CardHeader>
          <CardContent>Warehouse app and driver portal, on a forty-hour retainer.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Harbour Dental</CardTitle>
            <CardDescription>5 open tickets · 1 sprint running</CardDescription>
          </CardHeader>
          <CardContent>Patient booking site. Review this Friday with the practice manager.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Northwind Books</CardTitle>
            <CardDescription>2 open tickets · planning</CardDescription>
          </CardHeader>
          <CardContent>Online shop and stock system. Quarterly planning on the 23rd.</CardContent>
        </Card>
      </CardGrid>
    ),
  },
  chart: {
    render: (p) => (
      <Chart
        label="Hours by month"
        summary="Hours billed against hours logged, April to September 2026"
        xKey="month"
        data={[
          { month: "Apr", billed: 132, logged: 148 },
          { month: "May", billed: 141, logged: 150 },
          { month: "Jun", billed: 118, logged: 136 },
          { month: "Jul", billed: 156, logged: 161 },
          { month: "Aug", billed: 149, logged: 172 },
          { month: "Sep", billed: 62, logged: 71 },
        ]}
        series={[
          { key: "billed", label: "Billed" },
          { key: "logged", label: "Logged" },
        ]}
        {...p.of("Chart")}
      />
    ),
  },
  chat: {
    render: (p) => (
      <Chat
        label="Ticket #482"
        authorNames
        onSend={noop}
        messages={[
          { id: "c1", author: "Sam Whitfield", initials: "SW", body: "Hi — the booking form is asking returning patients for their insurer every time. Can it remember it?", time: "Tue 09:14", dateTime: "2026-09-01T09:14" },
          { id: "c2", mine: true, author: "Priya Raman", initials: "PR", body: "It can. We would look the patient up when the form loads and fill the insurer in. Tom is checking how quick the lookup is.", time: "Tue 10:02", dateTime: "2026-09-01T10:02", receipt: "Read" },
          { id: "c3", author: "Sam Whitfield", initials: "SW", body: "Great. Here is the list of insurers we accept.", time: "Tue 10:30", dateTime: "2026-09-01T10:30", attachments: [{ id: "f1", name: "insurers-2026.pdf", meta: "84 KB", href: "#" }] },
          { id: "c4", mine: true, author: "Priya Raman", initials: "PR", body: "Thanks — it is on the sprint for Friday's review.", time: "Tue 10:41", dateTime: "2026-09-01T10:41", receipt: "Sent" },
        ]}
        {...p.of("Chat")}
      />
    ),
  },
  checkbox: {
    render: (p) => <Checkbox defaultChecked aria-label="Include archived tickets" {...p.of("Checkbox")} />,
  },
  checklist: {
    render: (p) => (
      <Checklist
        label="Sprint 14 checklist"
        showProgress
        onToggle={noop}
        items={[
          { id: "1", label: "Confirm the insurer list with Harbour Dental", done: true, owner: "Priya Raman", when: "Tue", dateTime: "2026-09-01" },
          { id: "2", label: "Write the booking form story", done: true, owner: "Maya Okafor", when: "Wed", dateTime: "2026-09-02" },
          { id: "3", label: "Build the lookup on form load", owner: "Tom Lindqvist", when: "Thu", dateTime: "2026-09-03", meta: "In review" },
          { id: "4", label: "Show the first cut at the sprint review", owner: "Maya Okafor", when: "Fri", dateTime: "2026-09-04" },
          { id: "5", label: "Close ticket #482 and tell the client", owner: "Priya Raman", disabled: true },
        ]}
        {...p.of("Checklist")}
      />
    ),
  },
  choice: {
    render: (p) => (
      <Choice
        label="Email me when a ticket is answered"
        description="One email per ticket, sent to the address on your login."
        {...p.of("Choice")}
      >
        <Checkbox defaultChecked />
      </Choice>
    ),
  },
  clamp: {
    render: (p) => <Clamp {...p.of("Clamp")}>{LONG_NOTE}</Clamp>,
  },
  collapsible: {
    render: () => (
      <Collapsible defaultOpen>
        <CollapsibleTrigger>Show the three archived sprints</CollapsibleTrigger>
        <CollapsibleContent>
          <ul>
            <li>Sprint 11 · Driver portal sign-in · closed 3 July</li>
            <li>Sprint 12 · Warehouse stock counts · closed 24 July</li>
            <li>Sprint 13 · Delivery slot picker · closed 14 August</li>
          </ul>
        </CollapsibleContent>
      </Collapsible>
    ),
  },
  "collection-frame": {
    note: "The register is what a collection shows instead of its rows; turn the frame's `empty` option on to see it.",
    render: (p) => (
      <CollectionFrame
        eyebrow="Acme Logistics"
        heading="Tickets"
        count={14}
        countLabel="tickets"
        tabs={[
          { value: "open", label: "Open", count: 14 },
          { value: "waiting", label: "Waiting on client", count: 3 },
          { value: "closed", label: "Closed", count: 212 },
        ]}
        viewSwitch={
          <ViewSwitch
            value="cards"
            onValueChange={noop}
            views={[
              { value: "cards", label: "Cards", icon: <SquaresFour size={16} /> },
              { value: "table", label: "Table", icon: <Table size={16} /> },
              { value: "board", label: "Board", icon: <Kanban size={16} /> },
            ]}
            {...p.of("ViewSwitch")}
          />
        }
        actions={
          <Button>
            <Plus className="size-3.5" />
            New ticket
          </Button>
        }
        emptyState={
          <CollectionRegister
            eyebrow="Nothing waiting"
            title="Every Acme ticket has been answered"
            body="New tickets from the client portal land here the moment they are raised."
            actions={
              <Button variant="secondary">
                <Plus className="size-3.5" />
                Raise one for them
              </Button>
            }
            {...p.of("CollectionRegister")}
          />
        }
        {...p.of("CollectionFrame")}
      >
        <CardGrid label="Open tickets">
          <Card>
            <CardHeader>
              <CardTitle>#482 Booking form insurer lookup</CardTitle>
              <CardDescription>In review · Tom Lindqvist</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>#479 Reminder email not sent</CardTitle>
              <CardDescription>Open · unassigned</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>#471 Driver app logs out overnight</CardTitle>
              <CardDescription>Waiting on client · Priya Raman</CardDescription>
            </CardHeader>
          </Card>
        </CardGrid>
      </CollectionFrame>
    ),
  },
  command: {
    note: "The palette surface is drawn inline; the dialog form opens over the page when its `open` option is on.",
    render: (p) => (
      <>
        <Command label="Find a record">
          <CommandInput label="Search records" placeholder="Search tickets, accounts, people…" shortcut="⌘K" />
          <CommandList>
            <CommandEmpty label="Nothing matches" />
            <CommandGroup heading="Tickets">
              <CommandItem value="#482 Booking form insurer lookup" onSelect={noop} {...p.of("CommandItem")}>
                #482 Booking form insurer lookup
                <CommandShortcut>Harbour Dental</CommandShortcut>
              </CommandItem>
              <CommandItem value="#479 Reminder email not sent" onSelect={noop}>
                #479 Reminder email not sent
                <CommandShortcut>Harbour Dental</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Accounts">
              <CommandItem value="Acme Logistics" onSelect={noop}>
                Acme Logistics
              </CommandItem>
              <CommandItem value="Northwind Books" onSelect={noop}>
                Northwind Books
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              <CommandItem value="New ticket" onSelect={noop}>
                New ticket
                <CommandShortcut>N</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
        <CommandDialog open={false} onOpenChange={noop} {...p.of("CommandDialog")}>
          <CommandInput label="Search records" placeholder="Search tickets, accounts, people…" />
          <CommandList>
            <CommandEmpty label="Nothing matches" />
            <CommandGroup heading="Tickets">
              <CommandItem value="#482 Booking form insurer lookup" onSelect={noop}>
                #482 Booking form insurer lookup
              </CommandItem>
              <CommandItem value="#479 Reminder email not sent" onSelect={noop}>
                #479 Reminder email not sent
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </>
    ),
  },
  comments: {
    render: (p) => (
      <Comments
        onSend={noop}
        onMentionSelect={noop}
        onActionSelect={noop}
        onMarkRead={noop}
        items={[
          {
            id: "k1",
            author: "Maya Okafor",
            initials: "MO",
            timestamp: "Tuesday 10:15",
            body: "Tom, can you check how long the insurer lookup takes before we promise it for Friday?",
            mentions: [{ id: "tom", label: "Tom Lindqvist" }],
            actions: [{ id: "reply", label: "Reply" }],
            replies: [
              {
                id: "k2",
                author: "Tom Lindqvist",
                initials: "TL",
                timestamp: "Tuesday 11:40",
                body: "Under 300ms on the test data. Fine to run on form load.",
                actions: [{ id: "reply", label: "Reply" }],
              },
            ],
          },
          {
            id: "k3",
            author: "Priya Raman",
            initials: "PR",
            timestamp: "Wednesday 09:02",
            body: "Client confirmed the insurer list, attached to the ticket. Story is ready to build.",
            mentions: [{ id: "you", label: "Maya Okafor", self: true }],
            actions: [{ id: "reply", label: "Reply" }],
            unread: true,
          },
          {
            id: "k4",
            author: "Daniel Achebe",
            initials: "DA",
            timestamp: "Thursday 16:20",
            body: "Sprint review moved to 09:30 so the practice manager can join.",
            resolved: true,
          },
        ]}
        {...p.of("Comments")}
      />
    ),
  },
  compare: {
    render: (p) => (
      <Compare
        label="Accounts side by side"
        labels={["Retainer", "Open tickets", "Sprints run", "Hours this month", "Account lead"]}
        columns={[
          { id: "acme", name: "Acme Logistics", values: ["40h / month", 14, 14, "46h 20m", "Maya Okafor"] },
          { id: "harbour", name: "Harbour Dental", values: ["20h / month", 5, 6, "18h 05m", "Priya Raman"] },
          { id: "northwind", name: "Northwind Books", values: ["Project", 2, 2, undefined, "Daniel Achebe"] },
        ]}
        {...p.of("Compare")}
      />
    ),
  },
  container: {
    render: (p) => (
      <Container {...p.of("Container")}>
        <Card>
          <CardHeader>
            <CardTitle>Harbour Dental</CardTitle>
            <CardDescription>Inside the page's measure — the container sets the width, the card fills it.</CardDescription>
          </CardHeader>
          <CardContent>Patient booking site on a twenty-hour retainer. Sprint review this Friday.</CardContent>
        </Card>
      </Container>
    ),
  },
  "copilot-overlay": {
    note: "The launcher is drawn in flow here; its panel opens over the page when pressed or when `open` is on.",
    render: (p) => (
      <>
        <CopilotTouched {...p.of("CopilotTouched")}>
          <Badge>Priority: High</Badge>
        </CopilotTouched>
        <CopilotOverlay
          launcherPosition="static"
          onAsk={noop}
          onProposalSelect={noop}
          footnote="Answers come from your own tickets, stories and notes."
          messages={[
            { id: "q1", from: "reader", body: "What is still open for Harbour Dental?", receipt: "10:12" },
            {
              id: "q2",
              from: "assistant",
              body: "Two tickets are waiting on the agency: #482 is in review with Tom and #479 has no owner yet.",
              basis: "Read 5 tickets · Harbour Dental",
              proposals: [
                { id: "assign", label: "Assign #479 to Priya" },
                { id: "open", label: "Open #482" },
              ],
            },
          ]}
          {...p.of("CopilotOverlay")}
        />
      </>
    ),
  },
  "cursor-glow": {
    note: "The glow follows the pointer over the page. It fills a positioned parent, so it is drawn inside a plain sized <div> here; that box is not part of the kit.",
    render: () => (
      <div className="relative isolate h-48">
        <CursorGlow />
      </div>
    ),
  },
}
