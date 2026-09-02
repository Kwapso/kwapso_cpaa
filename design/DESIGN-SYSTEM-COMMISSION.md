# COMMISSION — the Kwapso design system repository

**To the agent building this: read section 0 and section 2 before anything else.
They decide whether the result can be used at all.**

Everything in this document was derived by reading the source of the two running
applications on 2026-08-22. The counts, names and lists are facts about real
code, not estimates. Build against them literally.

---

## 0 · The one thing that must be understood first

You are not writing a specification. **You are writing code.**

A previous handover delivered a design specification: tokens, rulings, prose,
and a set of CSS classes with plain-HTML demo pages. It was rigorous and
correct, and it could not be installed, because the applications are React
component libraries and a CSS class is not a React component. The result was
that the apps got re-coloured and kept their old shape.

The test for everything you build is one sentence:

> **An engineer deletes the old component folder, drops yours in its place,
> changes no application code, and both apps run and look completely new.**

If a thing you deliver requires the engineer to make a design decision, rewrite
a call site, or invent a value, it has failed the test.

---

## 1 · What is being replaced

Two production Next.js applications share one internal component library:

| | |
|---|---|
| **Agency app** | 23 routes, 114 bespoke screen components |
| **Client portal** | 7 routes, 22 bespoke screen components |
| **Shared component library** | **91 components** (65 primitives + 26 collections), exporting **193 symbols** across **1,122 call sites** |
| **Icons in use** | **93** distinct icons |
| **Design tokens consumed** | **~85** CSS custom properties |
| **Permission modules** | 18 |

Every one of those numbers is a thing you must cover. The library is the
foundation both apps stand on; there is nothing else underneath it.

---

## 2 · The delivery contract — non-negotiable

These eight rules are what make the result installable. A delivery that breaks
any of them cannot be imported without rewriting application code, which is the
exact failure this commission exists to prevent.

**1 · React + TypeScript source, not CSS classes, not a spec.**
Every component is a `.tsx` file exporting a React component. Source files, not
a compiled bundle — the consuming apps vendor the source directly.

**2 · Exact export names.** The names in sections 6 and 7 are already written
into **1,122 call sites** across both apps. `Button` must be exported as `Button`.
Not `KwButton`, not `Button` from a namespace. Every symbol listed, spelled
identically.

**3 · Exact prop APIs.** Where a component takes a `variant` or `size`, the
string values listed in sections 6 and 7 must all work and mean what they say.
`<Button variant="secondary" size="icon">` appears in the app today; it must
appear in yours. You may **add** variants. You may not remove or rename one.

**4 · Exact token names, or a complete mapping.** The apps read the CSS custom
properties listed in section 4. Keep those names. If you must rename one,
`manifest.json` (section 12) must carry the old → new mapping for every single
one, with no gaps.

**5 · Never write a px value in a component.** Everything is `rem` against a
16px authoring base. The root renders at 15px and a user text-size control moves
it. A px value silently stops scaling.

**6 · Never give a colour its only definition inside a media query.** Light
values live on bare `:root`. Dark is defined **twice** — once under
`prefers-color-scheme: dark` for people who never chose, once under
`[data-theme="dark"]` so an explicit choice wins in both directions. The two
blocks must define an identical set of names.

**7 · Every component ships light and dark.** Dark is a token flip, not a second
drawing. No component may hardcode a colour.

**8 · Zero runtime dependencies we do not already have.** Permitted: `react`,
`react-dom`, `next`, `tailwindcss` v4, `clsx`, `tailwind-merge`,
`class-variance-authority`, `@radix-ui/*`, `recharts`, `sonner`, `next-themes`.
Anything else must be listed in `manifest.json` with a reason. No CSS-in-JS
runtime, no styled-components, no icon font.

---

## 3 · Repository shape

```
kwapso-ui-ux/
  package.json
  manifest.json               ← machine-readable contract (section 12)
  README.md
  CHANGELOG.md

  tokens/
    tokens.css                ← the ONLY file where a colour or size is decided
    tokens.json               ← generated from tokens.css
    build-tokens.mjs          ← regenerates tokens.json, fails on drift

  icons/
    <name>.svg                ← 93 files, section 8
    index.ts                  ← named React exports, one per icon

  components/
    primitives/<name>/<name>.tsx      ← 65 folders, section 6
    collections/<name>/<name>.tsx     ← 26 folders, section 7
    lib/utils.ts                      ← the `cn` helper

  compositions/
    agency/<route>.tsx        ← section 9
    portal/<route>.tsx

  motion/
    motion.css                ← section 10

  demo/                       ← a runnable page rendering EVERY component
    index.html                  in EVERY state, both themes, three scales

  docs/
    RULES.md                  ← the laws a consuming app must not break
    BUILD-A-SCREEN.md         ← how someone adds a NEW screen in this system
    BUILD-A-COMPONENT.md      ← how someone adds a NEW component
    TOKENS.md                 ← what every token means and when to reach for it
```

**Three tiers, and the split matters.** Tiers 0–2 (`tokens/`, `icons/`,
`components/`) must contain **no vocabulary from any single product** — no
"ticket", no "sprint", no "account". They are the reusable core. Tier 3
(`compositions/`) is where a specific product's screens live. A future
application takes tiers 0–2 unchanged and writes only its own tier 3.

---

## 4 · Tier 0 — tokens

`tokens/tokens.css` is the single source of truth. Every one of the following
names is read by the applications today and must exist. **Keep the names.**

**Surface and ink**
`--background` `--foreground` `--card` `--card-foreground` `--popover`
`--popover-foreground` `--muted` `--muted-foreground` `--secondary`
`--secondary-foreground` `--accent` `--accent-foreground` `--border` `--input`
`--surface-inverse` `--ink-on-inverse` `--surface-brand` `--surface-idle`
`--ink-secondary` `--ink-disabled` `--hair-faint`

**Brand and status**
`--primary` `--primary-foreground` `--destructive` `--destructive-foreground`
`--success` `--success-foreground` `--warning` `--warning-foreground`
`--warning-strong`

**Charts** — `--chart-1` … `--chart-5` and `--chart-negative`.
These are currently five slots holding **three distinct colours**, because no
chart was ever specified. Charts are among the largest things on screen. Give
them a real, designed series.

**Focus** — `--ring` `--focus` `--focus-width` `--focus-offset`.
One global rule. No per-component focus machinery.

**Shape** — `--radius` plus `--radius-sm` `--radius-md` `--radius-lg`
`--radius-xl` `--radius-2xl` `--radius-3xl` `--radius-select`.

**Elevation** — `--shadow-rest` `--shadow-lifted` `--shadow-overlay`, plus the
Tailwind aliases `--shadow-2xs` `--shadow-xs` `--shadow-sm` `--shadow-md`
`--shadow-lg` `--shadow-xl` `--shadow-2xl`.

**Type** — `--font-sans` `--font-serif`; weights `--font-weight-light`
`--font-weight-normal` `--font-weight-medium` `--font-weight-semibold`
`--font-weight-bold` `--font-weight-extrabold`; and **13 size steps**, each with
its own line-height and, above `xl`, its own letter-spacing:
`--text-micro` `--text-xs` `--text-sm` `--text-badge` `--text-base` `--text-lg`
`--text-xl` `--text-2xl` `--text-3xl` `--text-4xl` `--text-5xl` `--text-6xl`
`--text-7xl`. Plus `--tracking-eyebrow` and `--tracking-serif`.

**Motion** — `--ease` `--duration-colour` `--duration-entrance`
`--duration-overlay` and the Tailwind defaults
`--default-transition-timing-function` `--default-transition-duration`.

**Button internals** — `--btn-primary-hover` `--btn-primary-pressed`
`--btn-secondary-fill` `--btn-secondary-hover` `--btn-secondary-label`
`--btn-cancel-hover` `--btn-destructive-hover` `--btn-inverse-hover`.

### Text size control
Three steps must work: `data-scale="small" | "medium" | "large"` on `<html>`,
rendering the root at 13 / 15 / 17px. **The two apps deliberately default to
different steps** — the client portal sits one step larger than the agency app,
because its readers are not looking at it all day. Support both; do not force
one default.

### Typeface
Name the intended typeface **first** with a real fallback stack behind it. If a
licence prevents shipping the font files, say so in `manifest.json` and ship the
stack — but the fallback must be chosen and specified, not left to chance. A
design that renders nothing when its font fails to load is not acceptable for a
production application.

---

## 5 · States, themes, breakpoints — every component, every time

This section applies to **all 91 components**. A component that only has a
default state is not finished.

**Ten states.** default · hover · focus-visible · active/pressed · disabled ·
loading · empty · error · selected · read-only.

- **Disabled is a fill and an ink, never an opacity.** An alpha of a token is a
  colour the palette does not contain.
- **Hover is never an opacity change** either. Use a defined hover token.
- **Focus is one global rule** driven by `--focus`, `--focus-width`,
  `--focus-offset`. It follows the control's own radius.

**Two themes.** Light and dark, both real, per rule 6 and 7 above.

**Three breakpoints, and they must be specified.** Mobile, tablet, desktop.
The previous handover had no responsive specification at all. Every component
and every composition needs stated behaviour at each width — what stacks, what
scrolls, what collapses to an icon, what moves into a sheet.

**Right-to-left.** The apps offer Arabic, Urdu and Persian. Say whether the
system supports RTL. If it does, every component must; if it does not, say so
explicitly so it can be planned around.

**Accessibility.** Contrast at AA minimum for body text. Every interactive
element reachable and operable by keyboard. Focus never invisible. Any text
inside a component that a screen reader would announce must be overridable by a
prop, so it can be translated — the apps run in multiple languages and cannot
translate a string that is hardcoded inside a component.

---

## 6 · Tier 1 — the 65 primitives

Build every one. The right-hand column is how many times that component is
called directly in JSX today; **a zero does not mean unused** — many are reached
through the screen engine or reserved for the next application. The commission
is all 65.

| Folder | Exports that must exist | Variants that must work | Direct calls |
|---|---|---|---|
| `accordion` | `Accordion` `AccordionItem` `AccordionTrigger` `AccordionContent` | — | 16 |
| `action-row` | `ActionRow` | — | 0 |
| `alert` | `Alert` `AlertTitle` `AlertDescription` | variant: default / destructive | 0 |
| `alert-dialog` | `AlertDialog` `AlertDialogTrigger` `AlertDialogContent` `AlertDialogHeader` `AlertDialogFooter` `AlertDialogTitle` `AlertDialogDescription` `AlertDialogAction` `AlertDialogCancel` | — | 96 |
| `ambient-background` | `AmbientBackground` | — | 1 |
| `aspect-ratio` | `AspectRatio` | — | 0 |
| `avatar` | `Avatar` `AvatarImage` `AvatarFallback` | — | 45 |
| `badge` | `Badge` | variant: default / secondary / outline / destructive / success / warning | 59 |
| `breadcrumb` | `Breadcrumb` `BreadcrumbList` `BreadcrumbItem` `BreadcrumbLink` `BreadcrumbPage` `BreadcrumbSeparator` `BreadcrumbEllipsis` | — | 0 |
| `breadcrumbs` | `Breadcrumbs` | — | 1 |
| `button` | `Button` | variant: default / secondary / destructive / text / ghost / link · size: default / sm / lg / icon | 150 |
| `card` | `Card` `CardHeader` `CardTitle` `CardDescription` `CardContent` `CardFooter` | — | 8 |
| `checkbox` | `Checkbox` | — | 8 |
| `choice` | `Choice` | — | 0 |
| `clamp` | `Clamp` | — | 0 |
| `collapsible` | `Collapsible` `CollapsibleTrigger` `CollapsibleContent` | — | 0 |
| `command` | `Command` `CommandDialog` `CommandInput` `CommandList` `CommandEmpty` `CommandGroup` `CommandItem` `CommandShortcut` `CommandSeparator` | — | 7 |
| `container` | `Container` | — | 0 |
| `date-picker` | `DatePicker` | — | 0 |
| `dialog` | `Dialog` `DialogTrigger` `DialogClose` `DialogContent` `DialogHeader` `DialogFooter` `DialogTitle` `DialogDescription` | — | 115 |
| `dropdown-menu` | `DropdownMenu` `DropdownMenuTrigger` `DropdownMenuGroup` `DropdownMenuSub` `DropdownMenuContent` `DropdownMenuItem` `DropdownMenuCheckboxItem` `DropdownMenuLabel` `DropdownMenuSeparator` `DropdownMenuShortcut` `DropdownMenuSubTrigger` `DropdownMenuSubContent` | — | 35 |
| `field` | `Field` | — | 154 |
| `file-upload` | `FileUpload` | — | 8 |
| `filter-bar` | `FilterBar` `RangeFacet` `SearchableFacet` | — | 1 |
| `hover-card` | `HoverCard` `HoverCardTrigger` `HoverCardContent` | — | 0 |
| `image` | `Image` | — | 0 |
| `input` | `Input` | — | 80 |
| `label` | `Label` | — | 4 |
| `map` | `Map` | — | 0 |
| `mode-toggle` | `ModeToggle` | — | 7 |
| `notes` | `Notes` | — | 16 |
| `pagination` | `Pagination` `PaginationContent` `PaginationItem` `PaginationLink` `PaginationPrevious` `PaginationNext` `PaginationEllipsis` | — | 0 |
| `popover` | `Popover` `PopoverTrigger` `PopoverAnchor` `PopoverContent` | — | 3 |
| `progress` | `Progress` | — | 2 |
| `progress-toggle` | `ProgressToggle` | — | 0 |
| `radio-group` | `RadioGroup` `RadioGroupItem` | — | 2 |
| `rating` | `Rating` | — | 0 |
| `scroll-area` | `ScrollArea` `ScrollBar` | — | 2 |
| `search-input` | `SearchInput` | — | 1 |
| `select` | `Select` `SelectGroup` `SelectValue` `SelectTrigger` `SelectContent` `SelectItem` | — | 43 |
| `separator` | `Separator` | — | 0 |
| `sheet` | `Sheet` `SheetTrigger` `SheetClose` `SheetContent` `SheetHeader` `SheetFooter` `SheetTitle` `SheetDescription` | side: top / bottom / left / right | 18 |
| `signature` | `Signature` | — | 0 |
| `skeleton` | `Skeleton` | variant: default / text / card / media / list | 92 |
| `slider` | `Slider` | — | 0 |
| `sonner` | `Toaster` (+ a `toast()` function) | — | 2 |
| `sort-control` | `SortControl` | — | 1 |
| `spacer` | `Spacer` | — | 0 |
| `spinner` | `Spinner` | size: sm | 42 |
| `status-stepper` | `StatusStepper` | — | 2 |
| `stopwatch` | `Stopwatch` | — | 0 |
| `switch` | `Switch` | — | 2 |
| `table` | `Table` `TableHeader` `TableBody` `TableFooter` `TableRow` `TableHead` `TableCell` `TableCaption` | — | 16 |
| `tabs` | `Tabs` `TabsList` `TabsTrigger` `TabsContent` `TabsView` | variant: pill / line | 21 |
| `textarea` | `Textarea` | — | 12 |
| `title` | `Title` | — | 0 |
| `toggle` | `Toggle` | variant: default / outline · size: sm / default / lg | 0 |
| `toggle-group` | `ToggleGroup` `ToggleGroupItem` | — | 3 |
| `tooltip` | `Tooltip` `TooltipTrigger` `TooltipContent` `TooltipProvider` | — | 0 |
| `typography` | `Headline` `Text` `Hint` | — | 0 |
| `use-debounce` | `useDebouncedCallback` | — | behaviour only |
| `use-virtual-rows` | `VIRTUALIZE_THRESHOLD` `SPACER_ATTR` `useVirtualRows` | — | behaviour only |
| `video` | `Video` | — | 1 |
| `visibility` | `VisibilityProvider` `useVisibilityContext` `useIsVisible` `Visible` | — | behaviour only |
| `web-embed` | `WebEmbed` | — | 0 |

The last four are behaviour, not appearance — they must still exist and export
those names, but they carry no design.

---

## 7 · Tier 2 — the 26 collections

These are the assemblies. They are where the product actually lives, and they
are the part a token remap cannot touch. Each one needs a full design: its
layout, its density, its row treatment, its header, its loading state, its empty
state, its error state, and its behaviour at all three breakpoints.

| Folder | Export | What it is | Direct calls |
|---|---|---|---|
| `activity-feed` | `ActivityFeed` | a record's history, newest first | 3 |
| `agent-chat` | `AgentChat` | the AI assistant conversation, streaming | 1 |
| `article-body` | `ArticleBody` | long-form written content | 0 |
| `calendar-view` | `CalendarView` | month grid, day cell, event chip, agenda | 0 |
| `card-grid` | `CardGrid` | a wall of record cards | 0 |
| `chart` | `Chart` | bar, line, area — axis, grid, legend, tooltip, empty, negative | 5 |
| `chat` | `Chat` | message thread, both sides, composer, attachments | 0 |
| `checklist` | `Checklist` | ordered tasks with completion | 0 |
| `collection-frame` | `CollectionFrame` | the shell every list sits in — heading, count, tabs, actions | 1 |
| `comments` | `Comments` | threaded discussion with mentions | 2 |
| `copilot-overlay` | `CopilotOverlay` | floating launcher, right-hand sheet, the ring it draws round a control it drove | 0 |
| `data-preview-table` | `DataPreviewTable` | imported rows before they are committed | 0 |
| `data-table` | `DataTable` | the real table — sort, select, sticky header, row hover, pagination | 0 |
| `description-list` | `DescriptionList` | label/value pairs on a record | 2 |
| `detail-view` | `DetailView` | a record's overview panel | 0 |
| `form` | `Form` | the form shell every form in both apps renders through | 0 |
| `import-wizard` | `ImportWizard` | upload → plan → review → run → per-row report | 0 |
| `kanban` | `Kanban` | columns, draggable cards | 0 |
| `list` | `List` | the primary collection row | 7 |
| `permission-matrix` | `PermissionMatrix` (+ `RIGHTS`, `WRITE_RIGHTS`) | a grid of modules × four rights | 1 |
| `progress-dashboard` | `ProgressDashboard` | progress across many items | 0 |
| `record-detail` | `RecordDetail` | the four-region record anatomy — header band, sticky tab strip, panel, audit footer | 0 |
| `run-steps` | `RunSteps` | a sequence executing, with per-step state | 1 |
| `screen-renderer` | `ScreenRenderer` | renders a whole screen from a declarative recipe | 17 |
| `stat-grid` | `StatGrid` | the strip of headline numbers | 3 |
| `ticket-thread` | `TicketThread` | the client-facing conversation | 1 |

**`ScreenRenderer` is the most important single item in this list.** It draws 17
screens from a data recipe. Whatever it renders is what most of the agency app
looks like.

---

## 8 · Icons — 93, not 30

The applications use **93 distinct icons**. A previous delivery supplied 30. An
icon set that covers a third of the surface cannot be adopted, because the
remaining two thirds would have to come from a different set and the two would
not match.

Deliver all 93 as SVG, `fill="currentColor"`, on one grid, in five sizes
(16/20/22/24/32), with a React export per icon. Keep these names — they are the
names the code uses.

**Actions (the mapping is fixed by house rules and must not be reassigned):**
`Pencil` (edit) · `Power` (deactivate) · `UserMinus` (remove) · `Ban` (revoke) ·
`Plus` (create) · `Upload` (import)

**The remaining 87:**
`AlarmClock` `AlarmClockOff` `AppWindow` `ArchiveRestore` `Archive` `ArrowDown`
`ArrowLeft` `ArrowRight` `ArrowUp` `ArrowUpDown` `ArrowUpRight` `BadgeCheck`
`Banknote` `Building2` `CalendarClock` `CalendarDays` `CalendarRange`
`CalendarSync` `ChartNoAxesColumn` `Check` `CheckCheck` `ChevronLeft`
`ChevronRight` `ChevronsUpDown` `CircleStop` `ClipboardCheck` `ClipboardCopy`
`Clock` `Copy` `CornerDownRight` `Download` `ExternalLink` `Eye` `EyeOff`
`FileSpreadsheet` `FileText` `GitBranch` `Hammer` `History` `Home` `House`
`Inbox` `KeyRound` `Languages` `LibraryBig` `LifeBuoy` `Link` `Link2`
`ListOrdered` `ListTodo` `Loader2` `Lock` `LogOut` `Mail` `MailOpen`
`MoreHorizontal` `Package` `Palette` `PanelLeftClose` `PanelLeftOpen`
`Paperclip` `PenLine` `PiggyBank` `Play` `RefreshCw` `RotateCcw` `Route`
`Search` `SearchX` `Send` `Settings` `Settings2` `Share` `Shield` `ShieldOff`
`Sparkles` `SquareArrowOutUpRight` `Timer` `Trash2` `TriangleAlert` `Undo2`
`UserCheck` `UserPlus` `UserRound` `Users` `Video` `X`

If your icon language does not have a natural form for one of these, still ship
that name — pick the closest form and note the substitution in `manifest.json`.
A missing name is a blank space on a screen; a substituted one is a design
choice we can review.

---

## 9 · Tier 3 — the compositions

This is the part that makes it look new. Everything above is materials; this is
architecture.

**Agency app — 23 routes**
`/` · `/home` · `/login` · `/onboarding` · `/profile` · `/settings` ·
`/members` · `/roles` · `/invitations` · `/accounts` · `/apps` · `/brand` ·
`/knowledge` · `/kwapso` · `/meetings` · `/processes` · `/purposes` ·
`/sprints` · `/stories` · `/tasks` · `/tickets` · `/time` · `/t/[...path]`

**Client portal — 7 routes**
`/` · `/home` · `/login` · `/company` · `/deliverables` · `/impact` · `/tickets`

**The recurring shapes**, each of which needs designing once and applies many
times:

1. **Record chrome** — transparent header band, sticky tab strip, opaque panel,
   audit footer. Applies to 14 screens.
2. **Collection screen** — heading, exact count, tabs, filters, search, sort,
   rows, "load more", empty state.
3. **Stat strip** — headline numbers with mini charts, where a panel renders
   *nothing* if the viewer lacks the right to see it.
4. **Status stepper hero** — a 7-stage progression and a 4-stage one, drawn
   above the tab strip.
5. **Form screen** — every form in both apps renders through one shell.
6. **The assistant** — launcher, sheet, streaming reply, typed result blocks
   (metric / progress / table / flow), and a confirmation panel listing proposed
   actions before they run.
7. **Sign-in** — email, six-digit code entry, Google, and the splash that
   follows.
8. **Import wizard** — five steps, including a per-row failure report.
9. **Search results** — facets, sort, exact count, paging.
10. **Portal home** — "waiting on you" rows, delivery progress blocks, a savings
    figure that must always render its explanation beside it.
11. **Portal conversation** — bubbles, composer, attachments, an approval band.
12. **Empty, loading and error** versions of every one of the above.

**The two apps are deliberately different.** The agency app is dense, wide, and
used all day by staff. The portal is narrow, calm, larger type, and used
occasionally by clients. They should read as one family and never as one screen
with a different logo.

---

## 10 · Motion

Currently: one easing curve and three durations, and nothing else specified.
That is a floor, not a design.

Specify, with values: page and route transitions · dialog and sheet
entrance/exit · dropdown and popover open/close · toast in/out · skeleton to
content · list row insert/remove/reorder · tab change · accordion expand ·
streaming text arrival · progress and stepper advance · button press · hover ·
focus · drag and drop · pull to refresh.

Every duration and curve comes from a token. Honour `prefers-reduced-motion`.

---

## 11 · Universality — this must outlive these two apps

The point of this repository is that the next application does not have to think
about design at all. So:

- **Tiers 0–2 carry no product vocabulary.** No component may be named or
  documented in terms of tickets, sprints, accounts or clients. `List`, not
  `TicketList`.
- **Every product-specific thing lives in tier 3**, in a folder named for that
  product.
- **`docs/BUILD-A-SCREEN.md` is a required deliverable, not a nicety.** It must
  be possible for someone who has never seen the system to build a new screen
  that looks native, by following that document, without asking a designer.
  Same for `BUILD-A-COMPONENT.md`.
- **Version and tag every release.** Consuming apps pin to a tag. A design
  change reaches an app only when someone deliberately bumps it.
- **`demo/` must render every component in every state, in both themes, at all
  three text scales.** This is how completeness is checked, by us and by you.

---

## 12 · `manifest.json` — how delivery is verified

This file is the acceptance test. It is checked mechanically against the
applications before anything is imported. If it is complete and correct, the
import is a mechanical operation. If it has gaps, the gaps are found in seconds
instead of after the work has shipped.

```jsonc
{
  "name": "kwapso-ui-ux",
  "version": "1.0.0",
  "tokens": {
    "declared": ["--background", "--foreground", "…"],
    "renamedFrom": { "--old-name": "--new-name" }
  },
  "components": {
    "Button": {
      "file": "components/primitives/button/button.tsx",
      "props": { "variant": ["default","secondary","destructive","text","ghost","link"],
                 "size": ["default","sm","lg","icon"] },
      "states": ["default","hover","focus","active","disabled","loading"]
    }
  },
  "icons": ["Pencil", "Plus", "…"],
  "iconSubstitutions": { "RequestedName": "reason" },
  "compositions": { "agency": ["home","tickets","…"], "portal": ["home","…"] },
  "themes": ["light","dark"],
  "scales": { "small": "13px", "medium": "15px", "large": "17px" },
  "breakpoints": { "mobile": "…", "tablet": "…", "desktop": "…" },
  "rtl": true,
  "extraDependencies": { "package": "why it is needed" },
  "notDelivered": [ { "item": "…", "reason": "…" } ]
}
```

**`notDelivered` is mandatory and may be empty.** If something in this
commission is not being delivered, it goes there with a reason. An honest gap is
manageable; a silent one is what turns a green build into a broken screen.

---

## 13 · Do not

- **Do not deliver a specification.** Deliver code that runs.
- **Do not rename an export or drop a variant.** 1,122 call sites depend on
  them.
- **Do not hardcode a colour, a px, or a font size** anywhere outside
  `tokens/tokens.css`.
- **Do not define a colour only inside a media query.**
- **Do not use opacity for a disabled or hover state.**
- **Do not build a component that cannot be translated** — any user-facing
  string inside a component must be overridable by a prop.
- **Do not skip the empty, loading and error states.** They are most of what a
  real application shows.
- **Do not ship a partial icon set.**
- **Do not leave a gap unrecorded.** `notDelivered` exists for exactly this.
- **Do not ask the consuming engineer to make a design decision.** If a question
  is unresolved, resolve it, or record it in `notDelivered` with your
  recommendation.

---

## 14 · Order of work

Build in this order. Each step is usable on its own, and each is verifiable
before the next begins.

1. `tokens/tokens.css` + `tokens.json` + the build script, both themes, three
   scales.
2. `icons/` — all 93, five sizes, React exports.
3. `motion/motion.css`.
4. The 65 primitives, each with all ten states, both themes.
5. `demo/` rendering steps 1–4 exhaustively. **Stop here and hand over for
   review.** This is the natural first checkpoint, and it is where a mistake is
   cheapest to fix.
6. The 26 collections, each with layout, density, loading, empty and error.
7. The compositions — the recurring shapes in section 9 first, then the routes.
8. `docs/` — the four documents.
9. `manifest.json`, tag, changelog.

---

*Derived from the source of both applications on 2026-08-22. Every count, name
and list in this document is a fact about running code.*
