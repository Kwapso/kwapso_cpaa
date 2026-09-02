# UI-CONVENTIONS.md. UI conventions (enforced)

This is the law-book for **how Brimba's screens are built**, the counterpart to
ARCHITECTURE.md (the workers + data layer) on the client side. Most of what's here
is not a style preference; it is **machine-checked**. A change that breaks a UI law
turns `npm run check` red, exactly like breaking a worker seam.

Read this before you add a screen, a form, a card, a tab, or a word of copy. If you
came here to "just add a button", you still owe this doc the action-icon mapping and
the voice section.

The one-line mental model:

> **The library (`shared/ui/`) is the lego. `web/` is the instructions for
> this particular model. Whole screens are described as _data_ (recipes) and rendered
> by the library engine; the few screens the engine can't express are host-composed
> from the same primitives. Everything speaks one dictionary and obeys one set of
> laws.**

That sentence survived the library moving into this repo unchanged, and that is the
point of §1 below: the lego and the instructions are still two different things, they
are simply kept in the same box now.

---

## 1. The library is lego. Never re-implement it in the host

Brimba's primitives and collections come from **`shared/ui/`**, a directory in this
repository. Both front ends, `web/` and `web-portal/`, import from that one place.

**One name, said once:** the library is **`shared/ui/`**, and every import path
starts with **`@shared/ui/`**, the alias both front doors map to `shared/*` in their
`tsconfig.json`. It is the **kwapso design system** — `github.com/Kwapso/design`,
vendored at the tag in `shared/ui/VERSION.json` by `scripts/sync-design.mjs` — and it
is a PINNED DEPENDENCY, not this repo's screen code: `web/test/vendored-kit.test.ts`
recomputes a content hash over every delivered byte on every check, so a hand-edit
under `shared/ui/` turns the build red. A kit change is made upstream, tagged, and
pulled (OPERATIONS.md § "The design system" is the three-command loop).

**How it got here.** Until 2026-08-22 the library was the npm package `@kwapso/ui`
from a separate repo, and this section said you could not edit it. It was vendored
for one day as an editable copy — a token remap repaints a button but cannot change
its SHAPE — and on 2026-08-25 the copy was replaced wholesale by the design kit
Aurora built to this repo's own commission (`design/DESIGN-SYSTEM-COMMISSION.md`).
The old library's config-driven BEHAVIOUR survived the swap by moving app-side:
`shared/web/screen-engine/` (screen renderer, collection frame, filter bar, the
rules engine, the config-driven TabsView) plus the seams `shared/web/field.tsx`,
`list-compat.tsx` and `notes-editor/`, all drawing through kit parts.

The host imports kit parts by tier — `controls/` (primitives), `structures/`
(assemblies), `icons/`, and for future screens `compositions/`:

```ts
// web/components/app-shell.tsx
import { Breadcrumbs } from "@shared/ui/controls/breadcrumbs/breadcrumbs"
import { ModeToggle }  from "@shared/ui/controls/mode-toggle/mode-toggle"
import { toast }       from "@shared/ui/controls/sonner/sonner"
import { Timer }       from "@shared/ui/icons"
```

The theme itself is imported, not copied, `web/app/globals.css`:

```css
/* THE theme — the tokens, both palettes and the motion utilities. ONE master
 * copy, in this repo at shared/ui/styles.css; this app never carries its own.
 * It also carries the @source line that tells Tailwind to scan the component
 * source, so this import is load-bearing twice over. */
@import "../../shared/ui/styles.css";
```

**The rule:** `web/` **assembles** recipes from library lego. It does **not**
re-implement a primitive locally because one is awkward, and it does not keep a second
copy of one in `web/components/`. Owning the library did not merge the two layers; it
moved where one of them is kept.

### When a primitive needs to change

Change it in `shared/ui/`. The fork already happened, deliberately, once — you are not
forking anything by editing a component now, you are editing this app's own code. So:

1. **Decide which layer it belongs to first.** A generic, app-agnostic control is a
   library change. A control that only makes sense in kwapso is a host component, and
   putting it in `shared/ui/` is the mistake this section exists to prevent.
2. **Change the component upstream, and delete the workaround it replaces.** The kit
   is a pinned dependency — a hand-edit under `shared/ui/` turns the build red
   (`web/test/vendored-kit.test.ts`) — so the fix is made in `Kwapso/design`,
   tagged, and pulled with `scripts/sync-design.mjs`; the workaround dies here in
   the same commit as the pull. A
   host-side override that stands in for a component fix is debt with an owner,
   not a permanent arrangement.
3. **Write the gap down if you cannot do it today.** UI-GAPS.md is still the list, and
   a host-side workaround must still be a small, *documented* seam that names the
   library change it stands in for, so somebody can find it and remove it. It used to
   be a request to another repo, then briefly a to-do in this one; since 25 Aug it is
   a to-do in the kit repo, driven from here. The two workarounds
   this section used to hold up as examples — a `.glass` opacity override and the
   engine list's double-nested card — are both gone, and how the first one ended is
   the argument for fixing components rather than overriding them: it outlived the
   library fix it was standing in for and tinted every card in both apps for nine days.
   The whole story is in the header of `shared/web/library-overrides.css`, which is
   now empty of component overrides on purpose.
4. **The upstream is `github.com/Kwapso/design`, and it is WHERE a fix goes.**
   Patch off the tag in `shared/ui/VERSION.json`, tag the fix, and pull it —
   never "fix it here anyway", because here is a pinned copy the hash guard
   protects. (The retired lineage, `@swift-struck/ui` → `@kwapso/ui`, is a
   different repo other products still stand on; nothing is pushed back to it.)
   `shared/ui/README.md` is the full statement of this.

A library gap is still a *tracked note*, never a silent second copy of a component.

### Host-composed ≠ new library component

`FormShell` (`shared/web/form-shell.tsx`) is the tell. It is a **host-side recipe
assembled from library primitives** (`Separator`, `<form>`), not a new library widget:

```tsx
// FormShell — a host-side recipe assembled from library primitives — NOT a new
// library component.
```

If you find yourself building something that *feels* like a primitive (a generic,
reusable, app-agnostic control), that's a signal it belongs in the library, surface
it. If it's this-app-specific assembly, it belongs in `web/components/`.

---

## 2. Two ways to build a screen, the engine vs. bespoke

Every screen is one of two kinds. Pick by a single question: **can the screen engine
express it?**

### 2a. Engine-expressible → a recipe (the default)

A screen is described as **data** (a `ScreenRecipe`) in `web/lib/screens.ts`, and the
library `ScreenRenderer` draws it. The host (`web/components/deep-link-screen.tsx`)
shapes app types into the flat rows/records the recipe references, supplies the
per-module rights, dispatches named actions, and owns the router.

The recipe registry, keyed `<module>.<view>`:

```ts
// web/lib/screens.ts
export const BASE_RECIPES: Record<string, ScreenRecipe> = {
  "team.detail":    teamDetailRecipe,
  "members.list":   membersListRecipe,
  "members.detail": memberDetailRecipe,
  "roles.list":     rolesListRecipe,
  "invites.list":   invitesListRecipe,
  "invites.detail": inviteDetailRecipe,
  "tickets.list":   ticketsListRecipe,
  "accounts.list":  accountsListRecipe,
  "brand.list":     brandListRecipe,
  "brand.detail":   brandDetailRecipe,
  // …and one per screen the product has grown since. Read the real list in the
  // file; a key is missing here only because this is an excerpt.
}
```

A recipe is a `type` (`list` / `detail`), a `binding`, a `gate` (module + right),
`fields`, `actions`, and, for details, the `tabs`. Example, the member detail's
Overview + Activity tabs (note this is *data*, not JSX):

```ts
// web/lib/screens.ts — memberDetailRecipe.tabs
tabs: [
  { key: "overview", label: "Overview", icon: CONCEPT_ICON.overview,
    block: { kind: "description", columns: 1, rows: [
      { label: "Role", column: "role" },
      { label: "Joined", column: "joined" },
      { label: "Email", column: "email" },
    ] } },
  { key: "activity", label: "Activity", icon: CONCEPT_ICON.activity,
    block: { kind: "activity", source: "activity" } },
]
```

Recipes are **overridable per team at runtime**: a team's JSON override (from the
config store) wins over the in-code base. `resolveRecipe()` merges override-over-base
and, critically, is **defensive**: a missing, unparseable, or shape-incomplete
override falls back to the base via `isScreenRecipe()`, so a bad override can never
blank a screen team-wide.

### 2b. Not engine-expressible → a host-composed component

When a screen needs a control the engine has no block for, the host composes it from
library primitives itself. The canonical example is **`role-detail.tsx`**: a role's
permission grid is a bespoke `PermissionMatrix` with no screen-engine block, so
`screens.ts` deliberately has **no `roles.detail` recipe**,

```ts
// web/lib/screens.ts (registry comment)
// Roles DETAIL has no recipe — its permission grid has no engine block, so the
// host composes it from the library PermissionMatrix (see role-detail.tsx).
```

The bespoke details are **not a list anybody keeps**. They are DERIVED off disk
by `recordDetailComponents()` in `web/test/rules.test.ts`, from two independent
signals: a component under `web/components/` named `*-detail.tsx`, or one that
renders an `<ActivityPanel>` (a record's own history feed, which nothing but a
record detail has any business drawing). `RECORD_DETAIL_NOT` in the registry is
the reasoned residue, rot-checked so it can only shrink. **Do not add a screen to
a list to make it obeyed — name the file `*-detail.tsx` and it is.**

Today that census catches **`role-detail`**, **`help-detail`**,
**`account-detail`**, **`contact-detail`**, **`knowledge-detail`**,
**`meeting-detail`**, **`process-detail`**, **`app-detail`**, **`sprint-detail`**
and **`story-detail`**, each a full record screen (its own header, tabs, actions)
wired by hand because it carries a control the engine doesn't render: a permission matrix / a ticket thread + status stepper / the account's
contacts, the accounts nested under it and its portal logins / a source's own words
and the switches that take it away from the assistant / prose somebody wrote before
and after a meeting / a numbered sequence of steps and the subtraction between two
versions of it. Each of those is a collection or a control with actions of its own.

The counter-example is worth naming, because it is the one that keeps this section
honest: the **brand library**'s detail is a plain recipe (`brand.detail`), not a
bespoke component. It shows a name, a category, a description, a file and an audit
block, description-list rows and an activity feed, so there is nothing for a host
to compose. Reach for bespoke when a control has no engine block, not when a screen
feels important.

The one bespoke **list** is **`selectable-screen.tsx`** (Dropdown values): it groups
values by *type*, a shape the flat `list` recipe doesn't express. Because it's
host-composed it doesn't get the recipe chrome for free, so it **assembles the same
chrome from library primitives**: a search `Input` + a status `Select` (Active default ·
Inactive · All), matching the recipe collections (roles, the brand library) so a
deactivated value is hidden by default but reachable to reactivate; and a **"New value"
button that opens a FormShell dialog** (`selectable-form-dialog.tsx`, registered in
`FORM_DIALOGS`), never an inline add row. Two rules when you hand-compose a collection:
**match the standard filter chrome** (search + status), and **every create goes through a
FormShell dialog** (Law R4, separators before the submit). Don't invent a different one.

### The decision, in one table

| The screen is…                                             | Build it as…                          | Example |
|------------------------------------------------------------|---------------------------------------|---------|
| A bounded list of shaped rows                              | a `list` recipe                        | `membersListRecipe` |
| A detail whose tabs are description-lists + activity        | a `detail` recipe                      | `memberDetailRecipe`, `inviteDetailRecipe`, `brandDetailRecipe` |
| A detail carrying a control the engine has no block for     | a host-composed component              | `role-detail`, `help-detail`, `process-detail` |
| A generic, app-agnostic control you keep re-needing         | **not here**, a component in `shared/ui/` |, |

The resolver holds both worlds together: `deep-link-screen.tsx` hands the URL to
`renderModuleContent` (`web/components/deep-link/module-content.tsx`), which renders a
`<ScreenRenderer>` for recipe screens and delegates to `<RoleDetailScreen>` /
`<HelpDetailScreen>` / `<ProcessDetailScreen>` for the bespoke ones.

### The screen engine's URL grammar

One static shell (`deep-link-screen.tsx`) backs the whole `/t/*` tree.
`/t/<teamId>/<module>/<id>` is resolved **client-side** (a static export can't
prerender ids). Most sidebar pages also have a clean top-level URL (`/tickets`,
`/accounts`, `/brand`, …) that runs against the active team. The friendly URL segment
maps to the real permission module the server enforces:

```ts
// web/lib/screens.ts
export const MODULE_PERMISSION: Record<string, string> = {
  team: "teams", members: "team_members", roles: "member_roles",
  invites: "team_members", dropdowns: "selectable_data",
  tickets: "help", accounts: "accounts", knowledge: "knowledge",
  brand: "brand_assets", purposes: "delivery",
  // …one line per segment; read the real map in the file.
}
```

Every page listed in `TOP_LEVEL_MODULES` (`deep-link/route.ts`) has a clean top-level
URL, a sidebar page resolves the team from context, like `/home`. Three segments are
the ones whose name isn't their permission module, and each of them is deliberate:
the address says `tickets` while the right the server checks is `help`; `brand` reads
better than `brand_assets` in an address; and `purposes` gates on `delivery`, the
module key that survived when its programme half was folded onto the sprint type.
Renaming a permission STRING already written into every role's sheet in every team
database can only ever take somebody's access away. DATA-MODEL.md
§ *help + help_threads* says it once, and the other two follow the same reasoning.
`MODULE_PERMISSION` is the one place the two names meet.
A new page needs three lines: `TOP_LEVEL_MODULES` (`deep-link/route.ts`), the
gateway's top-level shell loop, and its own `web/app/<segment>/[[...rest]]/page.tsx`.

Navigation *inside* `/t/*` uses the History API, never the framework router, a static
export would otherwise full-reload and wipe the warm in-memory cache. Write UI is
URL-driven (`?panel` / `?confirm`) so Back closes it and links are shareable.

**A component file is mounted, or it is parked — never merely present.** A finished
component nothing imports is not a feature, it is a rumour: twice on 26 Aug 2026 an
outside review found one (a superseded dialog, unmounted for weeks) that every suite
walked straight past, because the reachable-screens suite walks doors to controls and
never asked whether a file is reachable at all. So `web/test/orphan-components.test.ts`
censuses every file under `web/components` off the disk: each must be imported by
something — statically, or through the one `dynamic()` split — or sit in that test's
`PARKED` list with the decision that parks it, rot-checked so a parked file that gains
an importer (or loses its file) turns the build red and the list can only shrink.
Adding a component before wiring it up is therefore a red `npm run check`, on purpose:
wire it, or park it with its reason.

---

## 3. The Laws of the Base that touch the UI

These live in **RULES.md** (the human table) pinned to **`shared/rules/registry.ts`**
(the same laws as data), and are enforced by **`web/test/rules.test.ts`**, which reads
the source *straight off disk*, so a check can't be fooled by anything but the real
code. The UI laws:

| ID | Law (plain English) | Check id |
|----|---------------------|----------|
| **R2** | Every record-detail screen exposes **Overview + Activity** tabs. | `record-detail-tabs` |
| **R3** | Collection tab strips use the library **`TabsView`**, no hand-rolled button toggles. | `no-handrolled-toggles` |
| **R4** | Every form/dialog renders through the shared **`FormShell`**. | `forms-use-formshell` |
| **R6** | Product terms live in **ONE glossary**, the app speaks one dictionary. | `glossary-wellformed` |
| **R7** | Every form dialog persists its draft per session (**`useFormDraft`**). | `forms-persist-drafts` |
| **R8** | Every tab that reveals a collection carries its count, the **team** strip (a `countCacheKey`) *and* a **record's own** tabs. | `tab-counts-derived` |

(`R1` and `R5` are the arch/data laws, mutations publish a live change; activity is
read through one generic path, covered in CACHING.md / DATA-MODEL.md. `R5`'s web half
does show up in `rules.test.ts`: the app must read record activity through the one
`recordActivity` fetcher.)

### R2, record detail = Overview + Activity, via `TabsView` + `ActivityFeed`

Every record you can open has, at minimum, an **Overview** tab (the key facts at a
glance) and an **Activity** tab (what changed and who changed it). Recipe details get
these as recipe data (see §2a). The **bespoke** details must render them themselves,
and the check verifies exactly that, reading the source for the two library names:

```ts
// web/test/rules.test.ts — the SUBJECT is read off disk, never hand-listed
for (const c of recordDetailComponents()) {          // *-detail.tsx, or renders <ActivityPanel>
  expect(c.source, `${c.name} must use library TabsView`).toContain("TabsView")
  expect(c.source, `${c.name} must render an ActivityPanel (the Activity tab)`).toContain("ActivityPanel")
}
```

The two signals are deliberately **not** the two obligations, so nothing here is
circular: a file caught by NAME is held to both with neither assumed, which is
the case that actually bites — a new `foo-detail.tsx` shipped without tabs turns
this red.

`knowledge-detail.tsx` is the shortest model to copy: a `TabsView` whose panels are
`Source` (the words themselves) / `Overview` (a description list built from
`auditItems(...)`) / `Activity` (an `ActivityFeed` fed by the generic
`useRecordActivity("knowledge_sources", id)` path). The record's own tab carries no
badge; Activity carries `formatCount(activity.total)`.

**No exceptions today.** `role-detail`, the last one, grew its tabs on 2026-07-06
(Permissions is its main tab, then Overview + Activity): **every record detail in
the app carries the tabs, machine-checked.**

And the *census* is the part that had to change, not the screens. It used to be
an inclusion list, `RECORD_DETAIL_COMPONENTS`, so R2 and R8 walked exactly the
screens somebody had remembered to type into it — and it opened twice.
`app-detail` and `process-detail` were added on 17 Aug 2026 after a tester found
faults on screens no law had ever read; `sprint-detail` and `story-detail` were
found missing on 18 Aug, having shipped tabs and an Activity panel that neither
law had ever looked at. Nothing was red either time, **because a screen no law
walks looks exactly like a screen that passes.** A law that enumerates its
subject from a hand-kept list has a hole by construction. So the list is gone;
what remains is `RECORD_DETAIL_NOT`, the reasoned residue of files the census
catches and should not, each with its reason and rot-checked in both directions.

### R3, no hand-rolled toggles

Any tab strip / segmented toggle uses the library **`TabsView`** (icon + count badge).
The check hunts the tell-tale of a fake toggle, a `Button` whose variant flips on a
comparison, across *every* `.tsx` under `web/components`:

```ts
// web/test/rules.test.ts
const offenders = componentFiles().filter((f) => /variant=\{[^}]*===[^}]*\?/.test(read(f)))
expect(offenders, `use the library TabsView instead of hand-rolled toggles`).toEqual([])
```

Real `TabsView` usage, the Tickets list's All tickets / My tickets / Archived strip
and the Accounts list's companies-and-people strip, both in
`deep-link/collection-content.tsx`, is `variant: "line"` config with `tabs`, `badge`,
`badgeVariant`, and an `onValueChange` that drives the URL (`?tab=…`) so Back works and
a link to one scope is a link somebody can send.

### R4, every form goes through `FormShell`

One layout, everywhere: **title + subtitle · separator · fields · separator ·
action**. `FormShell` (`shared/web/form-shell.tsx`) is that layout, assembled from
library primitives. The check asserts each form dialog imports it:

```ts
// web/test/rules.test.ts — FORM_DIALOGS is the enforced list
for (const d of FORM_DIALOGS) {                       // help-form-dialog, role-form-dialog,
  const src = read(join(WEB, "components", `${d}.tsx`))//  invite-dialog, team-edit-dialog,
  expect(src, `${d} must use FormShell`).toContain("form-shell") //  internal-record-dialog, …
}
```

Inside a `FormShell`, each field is a library `<Field>` with `className={fieldSpacing}`
(a touch more label→input air than the library default). Pass the title as a
`<DialogTitle>` and the subtitle as a `<DialogDescription>` so Radix Dialog
accessibility stays intact.

### R6, the glossary is the single source of terms

Product terms live once, in **`shared/glossary.ts`**, one canonical term per concept,
each with a plain, brief definition (≤140 chars), for a 45–55-year-old manager. Copy
uses **these** words; you never invent a synonym for a concept already there. The check
proves the dictionary stays well-formed:

```ts
// web/test/rules.test.ts
expect(entry.def.length, `${key}.def must be brief (≤140 chars), never over-explained`)
  .toBeLessThanOrEqual(140)
expect(terms.has(entry.term), `duplicate term "${entry.term}"`).toBe(false)
```

The canonical terms include: **Team**, **Member**, **Role**, **Access right**
(not "permission" in copy), **Invite**, **Revoke**, **Activate / deactivate** (not
"delete"), **Archive**, **Account**, **Contact**, **Ticket**, **Conversation**,
**Stakeholder**, **Story**, **Sprint**, **Task**, **Brand asset**, **Knowledge base**,
**Source**, **Citation**, **Dropdown values**, **Import**, **Export**, **Assistant**,
**Activity**, **Overview**, **Status**. That is a sample, not the list. Read
`shared/glossary.ts`, and when writing UI copy reach for it first.

### R7, forms persist their draft per session

A half-filled form whose screen unmounts (you navigated away in the same tab) must come
back filled. Every form dialog persists via **`useFormDraft`** (backed by
`sessionStorage`, keyed by a stable `draftKey` the caller supplies, e.g.
`help:new:<teamId>` / `help:edit:<recordId>`). Cleared on submit or explicit
dismiss (Esc / backdrop / close); *preserved* on navigation. The check mirrors R4,
each `FORM_DIALOGS` entry must contain `useFormDraft`. See CACHING.md §11.

### R8, every tab that reveals a collection carries its count

There are **two** tab strips in this app, and the law covers both: the **team section
strip** (Overview · Members · Roles · Invites) and the tabs on **one record's own
screen** (Overview · Activity, plus whatever that record adds). A tab that shows a
collection carries that collection's count; a tab that shows the record itself
(Overview, a source's own words, a meeting's agenda, the permission grid) carries none,
and says so once, with its reason, in **`RECORD_TAB_COUNT_EXCEPTIONS`**.

*(This half was learned the hard way: the check walked `TEAM_SECTIONS` only, so the
team strip stayed honest while every record in the app shipped an Activity tab with
no count at all, the record tabs were built somewhere else entirely.)*

#### The team strip

Any `placement: "tab"` section that leads with a collection must declare a
**`countCacheKey`** (`web/lib/pages.ts`), and the host builds every badge by
*iterating* that field:

```ts
// web/components/deep-link-screen.tsx
for (const s of TEAM_SECTIONS) {
  if (!s.countCacheKey) continue
  const total = totalByCacheKey[s.countCacheKey]     // the door's exact COUNT(*), never rows.length
  if (total !== undefined) sectionCounts[s.key] = total
}
```

The check enforces both halves, every collection tab declares a `countCacheKey` (or is
a reasoned `TAB_COUNT_EXCEPTIONS` entry), *and* `deep-link-screen.tsx` still derives the
badges generically (it must contain `s.countCacheKey`, so no per-section literal can
creep back). Reviewed exceptions: `overview` (leads with team metadata, not a
collection) and `import` (a contextual per-target action, not a tab).

#### A record's own tabs

**Engine-recipe details** (`team.detail`, `members.detail`, `invites.detail`) are data,
so *which* tab is a collection is read off the tab's **own block**. Never a list of tab
keys someone has to remember:

```ts
// web/lib/screens.ts
export function tabCountKey(tab: RecipeTab): string | null {
  if (tab.block.kind === "activity") return tab.block.source        // the feed it names
  if (tab.block.kind === "list") return tab.block.binding.module    // the module it binds
  return null                                                       // the record itself
}
```

The host badges them through the **`withTabCounts(recipe, totals)`** seam at every
detail render (`module-content.tsx`), keyed by what `tabCountKey` names, so a host
supplies numbers without knowing tab keys, and the check asserts one `withTabCounts`
per rendered detail recipe (a seam nothing calls is dead code wearing a law's clothes).

**Bespoke details** (`role-detail`, `help-detail`, `knowledge-detail` and every
other file the derived census catches) build their own tabs config, so the check reads the tabs **out of the source** and requires each one to
carry a badge or be a reviewed exception. Their counts come from the one generic record
read, **`useRecordActivity(table, id)`** (`web/lib/use-record-activity.ts`), which
returns page one's rows *and* the door's exact `total`, the feed is paged, so the
loaded rows' length is a ceiling, not a total.

The **number** is always R16's: `formatCount(total)`, so zero and still-loading render
nothing rather than a "0" that reads as "nothing ever happened here".

### How the whole scheme is keystoned, `registry-integrity`

You **cannot add a law without its check, and cannot add a check without its law.** The
keystone test asserts RULES.md lists *exactly* the law ids in `RULES_REGISTRY`:

```ts
// web/test/rules.test.ts — L0, the keystone
const ids   = RULES_REGISTRY.map((r) => r.id)
const inDoc = [...md.matchAll(/^\|\s*(R\d+[a-z]?)\s*\|/gm)].map((m) => m[1])
expect(new Set(inDoc)).toEqual(new Set(ids))
```

And a companion test asserts every *enforced* law maps to a known check id. So the flow
to add a UI law is fixed: **RULES.md row ⇄ `registry.ts` entry ⇄ a real check in
`rules.test.ts`**, all three or the build is red.

```
 RULES.md (the human table)  ⇄  shared/rules/registry.ts (the law as data)
                              ⇘   ⇙
                    web/test/rules.test.ts (the check that reads source off disk)
                    keystoned by  registry-integrity (L0)
```

---

## 4. The action-icon mapping

Action buttons carry an icon (from `@shared/ui/icons`), placed **before** the label, sized **`size-3.5`**
on inline action buttons. Keep the icon-for-action mapping identical across the app.
Add a concept to the vocabulary, never a one-off icon at a call site.

| Action | Icon | Notes |
|--------|------|-------|
| Edit | `Pencil` | e.g. "Edit", "Edit details", wired (`role-detail`, `help-detail`, `knowledge-detail`) |
| Deactivate / switch off | `Power` | our deactivate-only model. Never "delete", wired |
| Remove (from team) | `UserMinus` | the canonical icon for a remove action |
| Revoke (an invite) | `Ban` | the canonical icon for a revoke action |
| Create / add | `Plus` | "New role", "New account", "Raise ticket", "Add a source", wired (`screen-bits`) |
| Import | `Upload` | "Import CSV", wired (`screen-bits`) |
| Export | `Download` | "Export CSV", wired (`screen-bits`) |
| Invite | `Mail` | the one create action with its own concept icon, wired |

### Action-button rows never clip (responsive rule)

A horizontal group of action buttons (e.g. **Export CSV · Import CSV · New role**)
must **wrap**, never clip, on a narrow screen. Use `flex flex-wrap` on the row,
`justify-end` alone (no wrap) pushes the overflow off the **left** edge, where the
container hides it, so the leftmost button silently disappears on a phone (a real
bug the owner hit). Every action-button row in the host uses `flex flex-wrap
justify-end gap-2` (`screen-bits` `SectionWithCreate`, `form-shell` footer, the
import wizard, the agent confirm panel). On a very narrow screen, dropping to
icon-only buttons is also acceptable (the mapping above). This is a **documented
convention**, not a machine-checked Law (responsive CSS is out of the rules-test
scope), but it applies everywhere buttons sit in a row.

### Mobile is not desktop-shrunk (LOCKED 2026-06-18)

The twin of the rule above, and its canon lives **here**. ARCHITECTURE.md §6 records
it as a locked decision and points at this section for how to apply it. (It is not in
the UI library's own rule-book: that book governs the library, and this is a rule about
how *this app* assembles library pieces.)

Controls placed side-by-side on desktop must **not** blindly stay side-by-side on a
phone. A multi-control row **stacks by default** (`flex-col`) and becomes a row only at
`sm:` (`sm:flex-row`), and every control gets enough width to show its placeholder or
its content (`w-full` when stacked). The failure this prevents is the quiet one: three
controls that fit a laptop share a phone's width between them, and each ends up too
narrow to read, a date field showing half a date, a select showing no placeholder at
all. Nothing looks broken, so nobody reports it.

Like its twin, this is a **documented convention, not a machine-checked Law**,
responsive CSS is outside the rules-test scope, but it applies to every multi-control
row in both front ends.

Remove and Revoke currently run through the engine's `?confirm=` route (a `destructive`
text button, not yet an icon button); when they *do* carry an icon, use `UserMinus` and
`Ban` respectively. The mapping is the law regardless of whether a given action is wired
with its icon yet. Do not pick a different icon at a call site.

Real usage (`role-detail.tsx`, `knowledge-detail.tsx`):

```tsx
<Button variant="outline" size="sm" onClick={() => setEditingOpen(true)} className="shrink-0 gap-1.5">
  <Pencil className="size-3.5" /> Edit details
</Button>
```

```tsx
<Button variant="outline" size="sm" onClick={() => void setActive(false)}
  className="text-destructive hover:text-destructive gap-1.5">
  {busyActive ? <Spinner /> : <Power className="size-3.5" />} Deactivate
</Button>
```

**Rules of thumb:**

- **Destructive = red + confirm.** Destructive actions use the destructive colour
  (`text-destructive`) *and* a confirm step (an `AlertDialog`, or a `?confirm=` URL
  route in the engine). Deactivate and Remove both do this.
- **Concept icons are one vocabulary.** Page/section/record concepts get their icon from
  `CONCEPT_ICON` in `web/lib/pages.ts` (`members: "users"`, `roles: "shield-half"`,
  `activity: "history"`, …) and reuse it at page, tab, and button level so "members"
  always looks the same.
- **Icon-only is acceptable on narrow screens**, but keep an `aria-label`.
- On a create/import row the icon sits at **`size-4`** (a larger primary button); inline
  record actions use **`size-3.5`**. Match the neighbours.

---

## 5. Voice

Write for a **45–55-year-old manager who wants things simple**. The voice is **warm,
plain, sentence case, no jargon, no emoji**, and it uses the **glossary terms**.

- **Sentence case** everywhere, titles, buttons, labels. "New account", not "New
  Account".
- **No emoji IN COPY.** Not in a sentence, a heading, a button, a label, a placeholder,
  a toast or an email. That is the whole of the original rule and it still holds: emoji
  in prose is what makes a business app read like a chat message.

  **A TYPE MARK is not copy, and it is allowed** (see §4). It is the small pictograph
  that sits in the leading slot of a row where a kit icon would otherwise sit, marking
  what KIND of record this is: a bug on a fix, a question mark on a question, a gem on an
  implementation sprint. It qualifies only if all four are true, it occupies an icon
  slot rather than appearing inside a sentence, it is `aria-hidden` so a screen reader
  never announces it, it is always accompanied by the type WORD nearby, and it is set on
  the Dropdown values screen rather than written into a component.

  **WHERE the mark belongs, extended 18 Aug 2026 (UI-RULEBOOK N11).** Not only on a
  record detail. The owner asked for glyphs on the main screens too, so the mark also sits
  on the nav rail (already, from `CONCEPT_ICON`), on a tab strip (`TabsView` takes an
  `icon` per tab), beside a `CollectionHeading` title, on a group heading inside a
  collection, and in the leading slot of any **host-composed** row (the library `List` has
  `item.leading`; Home and Settings use it today). It CANNOT go on a **recipe-driven** row:
  `ScreenRenderer.renderList` builds `{ id, title, subtitle }` and passes no `leading`
  (UI-GAPS #16). Do not work around that by putting the glyph inside the title string,
  which is the one shape this rule refuses. There, the word carries the meaning on its own
  until the library ships the slot.

  **Why the rule moved, on 17 Aug 2026.** The owner asked for these twice, in writing,
  and Aurora asked for the same thing independently after counting how long it took her
  to tell a question from an issue in a list of forty. The agency's own legacy data has
  carried a glyph and a colour on every ticket type, story type and sprint type for
  years. A rule that forbids the thing the business already does, in the words of the
  people it is for, is a rule that has stopped describing reality, so it was changed
  deliberately rather than worked around quietly. A colour alone was the alternative and
  it loses to a pictograph at a glance, which was the entire request.
- **Use the dictionary.** "Activate / deactivate", never "delete". "Access right", not
  "permission", in user-facing copy. "Ticket", "Conversation", "Stakeholder" as defined.
- **Warm and concrete.** Real examples from the code:
  - Empty states: *"No members yet."*, *"No tickets yet."*, *"Nothing in the brand
    library yet."*
  - Placeholders that teach: *"Primary logo (dark)"*, *"When to use it, and when not
    to."*, *"Why we meet, and who is in the room."*
  - Explain the *why*, briefly: *"Anything you put here is something the assistant may
    use to answer questions — and it will name this source when it does."*
  - Reassure on a scary action: *"Members who have it keep their access, but you can't
    give it to anyone new. You can activate it again later."*, *"It stops showing as
    live and nothing is deleted — its history stays, and you can put it back at any
    time."*
- **Say what a control does, not how it's implemented.** No worker names, no "D1", no
  "publishChange" in the UI. Ever.

When in doubt, read `shared/glossary.ts` and copy its tone.

---

## 6. Cards, one-row collection headers, and dynamic search/filters

### Collections are boxed as one unit

A collection, its title, search, filters, and rows, reads as a single card. The host
wraps engine lists in **`CollectionCard`** (`screen-bits.tsx`), and a list with a
host-rendered create button uses **`SectionWithCreate`** (the create/import row sits
*above* the boxed collection, right-aligned).

### Search and filters are data-driven, hidden when empty

Every bounded list searches its already-cached rows **client-side, zero new requests**
(SEARCH.md · Layer 1). A list recipe turns this on with `listCollection(...)`
(`searchable: true`, an `inline` header, and optional `filterFacets`). But we **never
render dead UI**, `withDataDrivenCollection()` tunes the chrome to the actual rows
before render:

```ts
// web/lib/screens.ts
if (rows.length === 0) {
  // no rows → hide search + filters entirely; the empty state stands alone
  return { ...recipe, collection: { ...collection, searchable: false, userFilter: false } }
}
const facets = collection.filterFacets.filter((f) =>
  rows.some((row) => row[f.field] != null && String(row[f.field]).trim() !== "")
) // keep a facet only if at least one row carries a value — an all-empty facet is a useless dropdown
```

So: **empty list → no search bar, no filters** (just the empty message).
**Rows present → search on, and a filter facet appears only when its column has values.**
`filterFacets` reference real columns on the *shaped* rows (e.g. members filter by
`role`, roles by `state`, help by `status`, the brand library by `category` and
`state`); their options are auto-derived from the data, so a facet never offers a
value no row carries.

### One-row headers

Collection headers use `headerLayout: "inline"`, title, search, and filters on a
single row, not stacked. (The library's `surface="none"` on the engine list is the
in-flight change that lets `CollectionCard` be the single clean box rather than a
card-in-a-card. See the tracked note in `screen-bits.tsx`.)

---

## 7. The living background and immovable, contentless pages

### Living background

Every screen renders over the library's **`AmbientBackground`**, mounted once in
`web/app/layout.tsx`:

```tsx
// web/app/layout.tsx
import { AmbientBackground } from "@shared/ui/controls/ambient-background/ambient-background"
// …
<AmbientBackground />
```

Because the living background shows through, floating surfaces have
to be readable over a moving field — and that is settled **in the component**, not
by a host override: all eight floating surfaces (`dialog`, `sheet`, `alert-dialog`,
`popover`, `dropdown-menu`, `hover-card`, `select`, `command`) carry an opaque
`bg-card` or `bg-popover` in `shared/ui/controls/` (the kit's own rule is paper,
not glass — the frosted `.glass` this paragraph used to describe is gone from kit
and host alike). The host override that
used to stand in for this is gone too; §1 and the header of
`shared/web/library-overrides.css` explain why it had to go rather than be re-tuned.
**One caveat worth knowing:** upstream guarded that with a census test that fails if a
ninth floating surface ships without an opaque fill, and the vendored copy carries the
kit's delivered source, never its test suite. So here that
rule is held by the eight components themselves and by whoever reads this paragraph. If
a floating surface is added upstream, it gets its opaque fill there.

### Immovable, contentless pages

The app should feel like a **native shell**, not a zoomable web page. The viewport is
locked in `layout.tsx`:

```ts
// web/app/layout.tsx
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false,
  // "the design language has no zoomable surfaces"
}
```

The shell frame is fixed and doesn't scroll away: the desktop sidebar and the mobile
top bar + bottom tab bar (`AppShell`) are persistent; only the `<main>` content region
scrolls. The frame never moves, the page never pinch-zooms, and the background stays
alive underneath, that's the "immovable, contentless page" feel.

---

## 8. Checklist, before you ship a UI change

- [ ] New primitive-shaped control? **Build it upstream in `Kwapso/design`, tag, and
      pull** (`scripts/sync-design.mjs`) — `shared/ui/` is a PINNED dependency and a
      hand-edit under it turns the build red (`web/test/vendored-kit.test.ts`). A
      kwapso-only control belongs in `web/components/`; never keep a second copy of
      a kit component there.
- [ ] New screen? Recipe if the engine can express it; a host-composed component only if
      it carries a control the engine has no block for (like `role-detail`).
- [ ] New component file? It is **mounted** (something imports it) or **parked** with
      its reason in `web/test/orphan-components.test.ts`'s `PARKED` list (§2) — the
      census fails the build on a component nothing imports.
- [ ] New record detail? It has **Overview + Activity** tabs (R2), recipe data, or, if
      bespoke, `TabsView` + `ActivityFeed`, and it's registered (or a reasoned
      exception) in `shared/rules/registry.ts`.
- [ ] Any tab strip / toggle uses the library **`TabsView`** (R3), no `variant={x===y?…}`.
- [ ] New form? Through **`FormShell`** (R4) *and* **`useFormDraft`** (R7), added to
      `FORM_DIALOGS`.
- [ ] New collection tab? A team tab declares a **`countCacheKey`**; a **record-detail**
      tab carries its collection's count (recipe → `withTabCounts`; bespoke → its own
      badge). A tab that shows no collection earns a reasoned
      **`RECORD_TAB_COUNT_EXCEPTIONS`** line (R8).
- [ ] Every new product word is in **`shared/glossary.ts`** (R6), one term, one brief
      definition — and the copy uses it.
- [ ] Action buttons carry the **right icon** (Pencil / Power / UserMinus / Ban / Plus /
      Upload), `size-3.5` inline; destructive = red + confirm.
- [ ] Copy is warm, plain, sentence case, no jargon, no emoji.
- [ ] Search/filters are wired through `listCollection` + `withDataDrivenCollection` so
      they **hide when empty**.
- [ ] **The screen is inside the glance budget** (§9): no band over 4 units (6 in a
      table), no more than 3 blocks before the primary content, and no width of its own.
- [ ] **Every gap is one of the five** (`gap-1` / `gap-2` / `gap-4` / `gap-6` /
      `gap-10`), every radius is `rounded-xl` or `rounded-full`, every colour is a token.
- [ ] `npm run check` is green (TypeScript + the full test suite, including
      `web/test/rules.test.ts`).

---

## 9. Density: the glance budget

**The canon is [UI-RULEBOOK.md §12](UI-RULEBOOK.md#12-density-the-glance-budget-n1-to-n12)
(rules N1 to N12).** This section is the short version, so nobody has to open two books to
add a button.

The complaint this answers, in the owner's words: *"in one given glance, the amount of
cognitive load applied on the user should be low"*, and *"it is feeling a bit twisted,
like there is too much to do"*. Those are two faults. **Too much** is a count. **Twisted**
is a grouping failure, where things sitting next to each other are not about each other,
so the eye keeps regrouping and never settles.

**The metric.** Five measures, twenty points each, one hundred total. Higher is calmer.
Every input is a count you take off the JSX, so two people measuring the same screen get
the same number.

| | Measure | Budget |
|---|---|---|
| **H** | units on the busiest horizontal band | **≤ 4** (a table row: ≤ 6, because its column header does the labelling) |
| **V** | blocks before the primary content | **≤ 3** |
| **G** | units above the fold, `3 + 2(V−1) + T + min(5, rows) × H` | **≤ 25** |
| **F** | bands and boundaries that group correctly, over all of them | **1.0** |
| **S** | content width ÷ the width content may fill, at 1440 | **≥ 0.90** |

85 and up is *calm*, 70 to 84 *fine*, 55 to 69 *busy*, under 55 *overwhelming*. **An
overwhelming screen is a defect in the same way too much code is a defect.** The app
measured 75.9 across 53 screens on 18 Aug 2026; the table and the ordered work list are in
`.session-notes/ui-rearrangement-plan.md`.

**An information unit** is one thing the eye decodes on its own: a heading, a
label-and-value pair (one unit, not two), a badge, a button, an avatar or type mark, a
standalone number, an input, a date, a meaningful icon. A glyph beside its own word rides
with the word and is not a unit.

**The seven rules you will actually reach for.**

1. **One width.** `max-w-[1600px]` lives in `web/components/deep-link-screen.tsx` and
   nowhere else. A screen never sets its own width. Gutters are `px-4 sm:px-6 lg:px-10`,
   once, in `app-shell.tsx`. Card padding `p-4`, panel padding `p-6`. (N8)
2. **Five gaps, each with a meaning.** `gap-1` parts of one thing · `gap-2` siblings in a
   group · `gap-4` rows in a block · **`gap-6` between blocks, the gap that says "these
   are separate"** · `gap-10` between titled page sections. Nothing between them, nothing
   outside them. (N7)
3. **One cue per boundary, and a container is earned.** A block gets a container only when
   it holds a collection of two or more rows or a form of two or more fields. Everything
   else is bare on the page with `gap-6` around it. Never two cues on one boundary. (N6)
4. **The surface step is measured.** Two surfaces read as separate at **ΔL\* ≥ 8**; a
   hairline reads as a line at **ΔL\* ≥ 4** from both surfaces. Light mode's page-to-card
   step is 3.22 and dark mode's is 10.32, which is exactly why the owner finds dark mode
   clearer, so **a card keeps its hairline** and never gets a shadow. Never hard-code a
   colour: it resolves through a token. (N5)
5. **Two radii.** `rounded-xl` for a surface, `rounded-full` for a pill. Every other step
   already computes to the same 24px, so writing one of them is a source-only mistake and
   a free fix. (N9)
6. **The control follows the option count.** 2 to 6 mutually exclusive options that change
   the VIEW are tabs; that set a VALUE are chips (or radio when each needs a sentence).
   **7 or more is a dropdown.** Not mutually exclusive is a filter facet or checkboxes.
   And the override that beats both: **a chip row that wraps at 1440 is a dropdown.** (N10)
7. **A glyph on every destination and every collection heading**, not only on detail
   screens. The nav rail, the tab strips, `CollectionHeading`, group headings and any
   host-composed row can all carry one today. A **recipe-driven** row cannot, because
   `ScreenRenderer.renderList` has no `leading` slot (UI-GAPS #16), and the workaround, a
   pictograph inside the title string, is the one shape §5 refuses. There, the word carries
   the meaning alone. (N11)

**When a screen is over budget, do these in order and stop when it passes** (N12): widen
it → split the busiest band → move actions into the three-dot menu → push non-primary
blocks below the primary content → take away containers → fix the gaps → collapse the
control. Deleting a feature is not on the list.

## Collection counts, one number, one place, one seam (LAW R16)
Every screen that shows a collection shows its count **exactly once**:

- **The number** is an exact server `COUNT(*)` (the list door returns `total`),
  rendered through the ONE seam `shared/web/format-count.ts`, `formatCount` floors
  and abbreviates at every magnitude (`1.3k` · `24k` · `1.2m`), renders NOTHING
  for zero/loading, and never grows a `+` (only a capped filtered-search total
  does, via `formatSearchTotal`). Never `rows.length`, a capped list's length is
  a ceiling (that is how a 24,011-row catalogue once advertised "1000").
- **The place** is a tab badge where the screen has a counted tab, else a
  `CollectionHeading` (`<h1>` + count chip, title from the module registry). A
  count may NEVER hinge on an unrelated permission, the lesson was earned on the
  Learning screen, whose count vanished for non-curators because it rode the
  curator-only tab strip. Learning has since been removed from the app; the rule it
  taught has not, and sidebar collections carry a heading so their count no longer
  depends on a strip a reader may not be allowed to see.
- **The arbitration** is the React context in `web/components/counted-tabs.tsx`
  (`CountedTabs` marks a badged tab's panel; `CountedAbove` marks a counted sibling
  strip). The `CollectionHeading` calls the hook ABOVE its early return and renders
  null when a tab already carries the count, so the same number never shows twice.
  It is a context, not a prop, because "does a counted strip exist?" is a
  per-permission answer every caller would otherwise re-derive and get wrong.

## One mark, one placeholder — a record's picture, everywhere

**Every record shows its picture, and where it has none it shows a deliberate mark
in the same box, at the same size, in the same slot.** One component says it:
`shared/web/record-mark.tsx` (`RecordMark` for the square or circle, `RecordCover`
for a wide banner), imported by BOTH front doors.

It exists because a census on 19 Aug 2026 found **seventeen implementations** of
"what to draw when there is no picture", collapsing to **thirteen visibly
different answers** — one letter in a circle, two letters in a circle, an emoji on
a muted square, a letter on a muted square, a big letter on a wide block, a bare
emoji with no box, a kit glyph in a filled square, the same glyph in an
unfilled one, a coloured dot, and, on most rows in the app, nothing at all. None
was wrong on its own screen. Drift like that is only ever visible in aggregate,
and nobody sees the aggregate, which is why nobody had filed it.

**The rule, applied by kind** — consistency means one rule applied consistently,
not one picture everywhere:

| The record is… | Shape | Its picture | With no picture |
|---|---|---|---|
| a **person** (a contact, a member, a staff profile) | `rounded-full` | `object-cover` — a face fills a circle | their initial |
| a **company**, an **app**, an **asset** | `rounded-xl` | `object-contain` — a wordmark is shown WHOLE | the type's own glyph, else its initial |
| anything with no picture concept | `rounded-xl` | — | the type's own glyph, else its initial |

**Four sizes, each one decided once, and none hand-rolled:** `choice` (a checklist's
own checkbox row, 24px — the kit's own `--avatar-sm`), `row` (the leading slot of an
ordinary row, 36px), `tile` (a card in a tile grid, 48px), `band` (the square in a
record's header, `RecordScreen`'s `leading`, 56–72px). `choice` was added 2026-08-31:
`row` was never the smallest box this component could draw, and a checklist that
hand-rolled a smaller className to get one was fighting the `size` prop for the same
box — this file's own repeated failure mode. A size passed as a class name would put
two Tailwind size rules on one element and leave the winner to stylesheet order; the
fix is always a new NAMED size decided here, never a className at the call site.

**A picture that fails to load falls back to the mark.** That is the whole reason
this holds state rather than being a ternary: `logoUrl` being SET is not the same
fact as the bytes still being there. Every stored path in this app is one
cancelled Glide subscription, one un-reclaimed object or one hand-pasted URL away
from a 404, and a 404 in an `<img>` is the browser's torn-paper glyph. Before the
seam, exactly ONE component in either front end had an `onError` fallback.

**Through `safeSrc`, always** — R20's render-side twin, and the URL census
(`web/test/rich-text.test.ts`) now reads `shared/web/` as well as `web/`, because
a component both doors render is the same defect twice over. The prop is called
`picture`, not `src`, so a component prop is never mistaken for a DOM attribute.

**Where a mark still cannot go:** a **recipe-driven** row. `ScreenRenderer.renderList`
builds `{ id, title, subtitle }` and passes no `leading` (UI-GAPS #16), so the four
recipe lists whose rows arrive carrying a picture — accounts, apps, members, the
brand library — render as text. The workaround, a glyph inside the title string, is
the one shape §5 refuses. And the library's `RecordDetail` draws a circular
initials avatar on every recipe detail whether the record is a person or not
(UI-GAPS #25). Both are one-line changes in `shared/ui/`, which this repo now owns —
so neither is a wait on anybody, and neither is worked around with a second copy of a
component here.

## Action-button rows never clip (C4) · the brand mark is never clipped (C5)

- **Action rows:** `flex flex-wrap` on the row (a narrow phone REFLOWS) and
  `ml-auto` on the action GROUP. Never `justify-end` on the parent alone, which
  pushes overflow off the LEFT edge where the container hides it. This is the
  house rule for every detail header, form footer and toolbar.
- **The brand mark** always sits in a rounded box, so it renders `object-contain`
  (never `object-cover`, which crops the corners). Generated icons draw the mark
  at `LOGO_SAFE_RATIO` (0.76) of the square, inside the largest circle the square
  contains, and `scripts/gen-icons.mjs` derives its log line from that constant,
  so the log can't claim a size it didn't draw.
