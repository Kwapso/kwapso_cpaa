# Layer 1 — Primitives

The shadcn-style atoms: Button, Input, Label, Dialog, Select, Checkbox, and the
~60 building blocks that 90% of every app is made of. Built on Radix UI for
behavior/accessibility and styled entirely with tokens via CVA.

## Rules

- **Compose from tokens only.** No hardcoded colors or sizes — use Tailwind
  utilities that resolve to [Layer 0](../tokens/README.md).
- **Never import a collection.** Primitives sit below collections in the graph.
  (`npm run guardrails` enforces this.)
- **Variants, not new components.** A different-looking button is a CVA variant
  on `Button`, not a new `FancyButton.tsx`. This rule is what keeps the library
  from ballooning. See [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Shape of a primitive

Each primitive is one folder:

```
registry/primitives/button/
  button.tsx        # the component + its CVA variants
  logic.ts          # (optional) JSX-free pure logic, so it can be unit-tested
  button.test.tsx   # (optional) unit / render tests for the component or its logic
```

Docs are **not** co-located `.mdx` files. A primitive is documented by its live
demo in the gallery (`www/app/components`), its entry in the searchable catalog
(`www/app/documentation`), and — if config-driven — a row in `CONFIG-REFERENCE.md`.
See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the full definition of done.

## Shared hooks

A few primitives are hook-only utilities (no visual output), reused across the
library so behavior isn't re-implemented:

- **`visibility`** — `useIsVisible(config)` drives config-driven show/hide.
- **`use-debounce`** — `useDebouncedCallback(fn, delay)` is the one debounce the
  library shares (SearchInput's `onChange`, FilterBar's async `onSearch`).
