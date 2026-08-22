# Layer 2 — Collections

The high-leverage layer and the reason Swift Struck UI exists: **Glide-style,
data-bound views**. You hand a collection an array of records and a small config,
and it renders a polished, interactive surface.

Built collections:

- **List** — rows with title/subtitle/leading/trailing slots
- **Card grid** — responsive card layouts
- **Data table** — sortable, searchable, row actions
- **Kanban** — draggable columns, configurable group-by
- **Calendar view** — month grid of events
- **Detail view** — a single record's labelled fields
- **Stat grid** — big-number metric cards
- **Chart** — bar/line/area/pie/radar/radial
- **Checklist** — tick items off, with progress
- **Form** — config-driven create/edit forms with validation
- **Comments · Chat** — threaded comments / message thread
- **Permission matrix** — a role's access-rights grid (modules × Read/Create/Edit/Delete)
- **Collection frame** — the shared chrome (title · count · search · filter · sort · pagination)

## Rules

- **Compose from [primitives](../primitives/README.md) only** (which in turn use
  tokens). A collection should contain almost no raw markup of its own — it
  arranges primitives.
- **Data in, view out.** Collections take typed data + config as props and stay
  unopinionated about where the data came from (local, API, etc.).

## Shape of a collection

```
registry/collections/kanban/
  kanban.tsx        # the component
  logic.ts          # (optional) JSX-free pure logic, so it can be unit-tested
  kanban.test.ts    # (optional) unit tests for that logic
```

Docs are **not** co-located `.mdx` files. A collection is documented by its live
demo in the gallery (`www/app/components`), its entry in the searchable catalog
(`www/app/documentation`), and — if config-driven — a row in `CONFIG-REFERENCE.md`.
See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the full definition of done.
