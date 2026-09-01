"use client"

// FormShell — the ONE layout every form/dialog uses, so create / edit screens are
// predictable and identical across modules (the owner's design-language law):
//
//   title + subtitle   ·   the fields, SCROLLING   ·   the action bar, PINNED
//
// A host-side recipe assembled from library primitives — NOT a new library
// component. Pass the title as a <DialogTitle> and subtitle as a <DialogDescription>
// (so Radix Dialog a11y stays intact) and the action button(s) as `footer`.
//
// ── WHY IT IS A THREE-ROW GRID (UI-RULEBOOK F2 / F3) ───────────────────────
//
// It used to be a plain `flex flex-col` with no height bound at all, and a form is
// as tall as its fields. A centred dialog centres itself with `top-1/2
// -translate-y-1/2`, so a form taller than the window grew EQUALLY off the top and
// off the bottom, and nothing scrolled: on a 1280×640 window the Edit story dialog
// measured 738px, its title clipped above the viewport and its Save button below
// it, unreachable. A tester reported it as the Save button rendering outside the
// dialog box, which is exactly what it looks like.
//
// `max-h-[85dvh]` (standalone) / `h-full` (inside `FormShellDialog`'s panel, which
// is already edge-to-edge) + `grid-rows-[auto_1fr_auto]` fixes the class of bug
// rather than the instance: the header and the action bar are `auto`, the FIELDS
// are the `1fr` row and the only thing that scrolls, so the action bar is always
// on screen no matter how many fields a module adds. `dvh` rather than `vh`
// because a phone's address bar is the difference between "pinned" and "just
// under the fold".
//
// And the two separators are gone. A free-standing hairline sitting a fixed gap
// above a 42px pill is a collision waiting for the next type-scale change (it had
// already had one: see the note on `pt-6` in library-overrides.css, a documented
// fix that never actually shipped). A `border-t` on a PADDED bar cannot collide
// with the button inside it, at any size, because the hairline is the bar's own
// edge. This removes both front doors' last use of `primitives/separator`, which
// is right: a separator divides peers, and a form's action bar is not a peer of
// its fields.
//
// ── CENTRED DIALOG → SIDE PANEL, 2026-08-31 ─────────────────────────────────
//
// `FormShellDialog` used to render on `Dialog`/`DialogContent` (centred, self-
// sizing). COMPOSITION-MISMATCHES.md reviewed swapping it for the kit's side-panel
// `templates/form-screen.tsx` and kept the dialog on purpose: that composition's
// real advantage over this shell isn't its position, it's a field-name-aware
// required-fields summary and a changed-fields dirty band, and none of this
// shell's 37 real callers track fields by name today — "a real, scoped feature to
// build, not a chrome swap behind one flag." The owner reviewed that reasoning and
// asked to proceed anyway. So this is a DELIBERATE, informed override of that
// call, not a reversal of it: `FormShellDialog` now renders on the app's own
// already-adopted `Sheet`/`SheetContent` (18 other call sites, side="right", the
// same `@radix-ui/react-dialog` primitive underneath, so every existing
// `<DialogTitle>`/`<DialogDescription>` call site keeps its a11y wiring for
// free) instead of `Dialog`/`DialogContent`. NOTHING ELSE FROM THAT REVIEW WAS
// BUILT: there is still no required-fields-by-name summary and no changed-fields
// dirty band anywhere in this shell. Only the chrome moved from the middle of the
// screen to its side; the feature gap COMPOSITION-MISMATCHES.md named is exactly
// as open after this change as it was before it.
//
// ── THE FOCUS RING'S OUTER EDGE, AND THE PANEL'S OWN WIDTH, 2026-08-31 ──────
//
// Client-reported, on the just-shipped sheet: a heavy, flush black edge on the
// TITLE field's near (start) side only when it is focused — not the ring
// `input.tsx` draws everywhere else (a hairline gap, then a thin outline,
// even on all four sides). Reproduced by mounting a real, unmodified caller
// (`InternalRecordDialog`) and reading the live box back with
// `getComputedStyle`/`getAnimations()`: the OUTLINE ITSELF was never wrong —
// one `outline: 1px solid` at a 2px offset, exactly tokens.css §8, on every
// side, at rest and mid-animation alike. `outline` cannot render unevenly by
// itself; CSS has no per-side outline. So the doubling has to be something
// ELSE painting over the near edge, or the ring's own edge being clipped
// there and nowhere else.
//
// THE ONE STRUCTURAL THING THE DIALOG NEVER HAD: `FormShellDialog`'s
// `SheetContent` carries BOTH the entrance `transform` (`.motion-sheet`,
// `translateX(...)`, still present at rest too — a CSS animation with
// `both` leaves its END keyframe's transform applied indefinitely, not
// removed) AND, until this fix, its own `overflow-hidden` — on the SAME
// element, which also sits flush against the viewport on three of its four
// sides (`inset-y-0 end-0`). A transformed element with its own overflow
// clip is exactly the shape of a known compositor pitfall: the browser can
// rasterise that element's layer to a snapshot bound to the transform's
// OWN geometry, and a ring that appears (autofocus lands the instant the
// panel mounts, before the entrance settles) can get clipped or double-
// painted a device pixel or two into the layer's own near edge. The centred
// `Dialog` this replaced never had the co-occurrence: it animates too
// (`motion-rise-in`, also `both`), but it sits margined away from every
// viewport edge, so there was nothing for the two to collide against. And
// only the NEAR (start) side is ever visible either way: the other three
// sides of the ring sit at or past the viewport boundary for a right-anchored
// sheet, so the same class of artifact on any other edge would be invisible
// against the window, not merely absent — which is why a symmetric cause
// reads as an asymmetric report.
//
// THE FIX SEPARATES THE TWO JOBS ONTO TWO ELEMENTS, which is the standard
// remedy for this pitfall: the `transform` stays on `SheetContent` (it has
// to — Radix owns that element), and `overflow-hidden` moves OFF it,
// leaving containment entirely to FormShell's own `<form
// data-slot="sheet-form">` one level in — already `overflow-hidden` and
// already sized to the exact same box (`fill` → `h-full`, `p-0` on
// `SheetContent`), so nothing is left unclipped; it is just clipped by a
// STATIC element the compositor never has to reconcile against a moving
// transform. Not a CSS override of the symptom (no new box-shadow, no
// hand-tuned inset) — the ring keeps drawing exactly where tokens.css §8
// already puts it, on a box that no longer shares a paint layer with the
// thing animating around it.
//
// THE SECOND, UNRELATED COMPLAINT ON THE SAME SCREENSHOT: "make them wider,
// consider a fix % of the screen." The panel's width lived in the vendored
// `sheet.tsx` (`w-[26.25rem]`, a flat 420px on every monitor) — fine to
// override from here via `className` (tailwind-merge, not a hand-edit of
// `shared/ui/`), wrong to leave flat. See the width comment on `SheetContent`
// below for the actual bounds chosen.
//
// ── A REAL CANCEL BUTTON, AND THE TWO RULES STOP BEING STROKES, 2026-08-31 ──
//
// Three more items off the same client pass.
//
// 1 · "on add/edit - also put the cancel button there. I know I can click
// out, but also add it." There was never a Cancel control in this shell's
// action bar — dismissal was ONLY the Sheet's own backdrop/Escape path, which
// a keyboard user or a screen reader has no way to discover and a mouse user
// on a maximised window has to travel a long way to reach. The kit's own
// `shared/ui/components/form/form.tsx` already draws exactly this job, with
// `variant="cancel"` — button.tsx's own word for "the quiet dismissal beside
// a primary" — rendered BEFORE its submit button. `CancelButton` below
// mirrors that call site byte for byte and wires to the SAME close path the
// Sheet's own `onOpenChange` already runs (busy refuses it, same as today),
// so "click out" and "press Cancel" are one decision seen through two doors,
// never two that can drift. Rendered only when a caller passes `onCancel` —
// today that is `FormShellDialog` alone; the two bare-`FormShell` callers
// (`access-tokens.tsx`'s centred `Dialog`, `web-portal/needs-name.tsx`'s
// mandatory onboarding step, which has nothing to cancel TO) pass none and
// gain nothing, which is correct for both.
//
// 2 · "the lines that separate the bottom buttons and the title, make them
// like in the screenshot: a lighter gray, not the black." Both dividers
// here were a bare Tailwind `border-t` — a STROKE, and one with no
// `border-{color}` utility naming a token, so its colour was never
// `--border` at all: Tailwind v4's own preflight leaves an unnamed border at
// `currentColor` (foreground ink), which is exactly "black" against this
// shell's paper. Every hairline drawn anywhere else in the vendored kit is an
// INSET SHADOW, never a border (`shared/ui/docs/BUILD-A-SCREEN.md`: "Separation
// is a fill or an inset shadow, never a stroke") — `FormActions` in the kit's
// own `form.tsx` draws the identical top-of-action-bar rule as
// `shadow-[var(--hairline-over)]`. Both `border-t`s below become that, which
// both fixes the reported colour (`--hair`, the pale 8%-opacity token) and
// brings this hand-built shell in line with the rule every vendored
// composition already follows.
//
// 3 · "on form's required field, put required on the left total left, not
// like now in the immediate left of the title." The marker is drawn by the
// kit's own vendored, pinned Field component (under `shared/ui/`,
// `data-slot="field-required"`, a sibling of the label in one `flex
// items-baseline gap-2` row) — hand-editing it fails
// `web/test/vendored-kit.test.ts` by design, and it exposes no prop for this.
// So this is THE OWNER'S OVERRIDE, APP-SIDE ONLY, same technique as
// `web/components/auth-card.tsx`'s: a descendant selector reaching the kit's
// own stable `data-slot`, applied from a wrapper the kit never sees. It lands
// on the ONE scrolling body div every form's fields already flow through
// (below), which is why one selector reaches every field of every one of
// this shell's 37 callers rather than 37 edits. `order-first` moves the
// marker to the row's leading edge (flex `order` matches on the element
// itself regardless of which ancestor's class named the selector); `me-auto`
// (margin-inline-end, so it mirrors correctly in Arabic, Urdu and Persian)
// pushes the label away to the row's trailing edge instead of leaving the two
// glued together at `gap-2` — "total left", genuinely separated from the
// title, not just swapped to its other side.
//
// ── THE ✕ WAS A SECOND CANCEL, AND THE SUBTITLE WENT WITH IT, 2026-08-31 ────
//
// Two more, off the same client pass, both scoped to `FormShellDialog` only
// (the bare `FormShell` callers — `access-tokens.tsx`'s centred `Dialog`,
// `web-portal/needs-name.tsx`'s onboarding step — have no Cancel button and
// are untouched).
//
// 1 · "on add/edit, we do not need the x on top (we already have the cancel
// for that)." True the moment `CancelButton` shipped, above: the Sheet's own
// top-right ✕ (`sheet.tsx`'s `OVERLAY_CLOSE`, `data-slot="sheet-close-
// button"`) and the footer's Cancel now run the SAME `close()` — two controls
// for one decision. The kit's `SheetContent` already takes a `showClose`
// prop for exactly this (`shared/ui/compositions/overlays/access-denied.tsx`
// and `components/command/command.tsx` both already pass `showClose={false}`
// when their own close affordance exists elsewhere) — a prop, not a
// hand-edit of the vendored file. Passed here so it reaches all ~37 real
// `FormShellDialog` callers from the one seam they share.
//
// 2 · "on add/edit screens we do not need subtitles." Every one of this
// shell's real callers builds its own sentence — the ticket form's "Describe
// the problem you're facing…" is one of ~37 distinct strings, never a shared
// default — but ALL of them reach the screen through this one component's
// `subtitle` prop, which is the ONLY place that value is ever rendered
// (`FormShell`'s header `{subtitle}` line, below). So rather than deleting
// the prop and its now-dead JSX from ~37 call sites (`*-form-dialog.tsx`,
// plus the two generic wrappers `InternalRecordDialog` and `RateFormDialog`
// that fan out to a further nine), `subtitle` stays in the type — every
// existing caller keeps compiling unchanged, gate #4's smallest shape — and
// is simply never forwarded to `FormShell` below. `FormShell` itself is
// untouched and still renders a subtitle for its two bare callers, neither
// of which passed one through this path.

import * as React from "react"

import { Button } from "@shared/ui/components/button/button"
import { Sheet, SheetContent } from "@shared/ui/components/sheet/sheet"
import { cn } from "@shared/ui/lib/utils"

import { useT } from "./language"

/** What a form's ONE button needs to know. Deliberately not a label: see
 * `FormShell`'s `submit` prop. */
export type SubmitConfig = {
  /** A save in flight — spins, and refuses a second press. */
  busy?: boolean
  /** The form is not yet answerable (a required field is empty). */
  disabled?: boolean
  /** The optional glyph before the word, from the UI-CONVENTIONS §4 mapping. */
  icon?: React.ReactNode
}

/** EVERY FORM'S BUTTON SAYS "SUBMIT" (UI-RULEBOOK F1, CHECKLIST 2.9).
 *
 * There were 31 different words for one act across 37 forms — "Save changes"
 * thirteen times, "Add it" seven, and then "Map it",
 * "Log it", "Start it", "Ask and email". They are not synonyms a person can
 * learn; they are 31 things to read before pressing the only button on the
 * screen.
 *
 * It is a PROP rather than 37 rewritten call sites on purpose: a label somebody
 * cannot pass is a label somebody cannot invent, so the thirty-second form is
 * right by construction. It also converges with the library, whose own `Form`
 * collection already defaults `submitLabel: "Submit"`.
 *
 * `footer` survives for the handful of forms whose action bar is genuinely not
 * one button (a second, differently-typed action beside it).
 *
 * ── BUSY IS NOT DISABLED, AND THE KIT HAS A WORD FOR EACH ─────────────────
 *
 * This button used to fold `busy` into `disabled`, and the kit's Button reads
 * `disabled` as an instruction to draw the disabled SKIN — one flat grey fill
 * and grey label, identical on all eight variants. So the instant you pressed
 * Submit on any of the thirty-eight forms R4 routes through this shell, the
 * one mango control on the screen went grey. It reads as "switched off", which
 * is the opposite of what is happening: the save is in flight and the press
 * WORKED.
 *
 * The kit already draws the distinction and states it as a rule (button.tsx,
 * state 6): "loading — variant fill kept, spinner, aria-busy", implemented as
 * `showDisabledSkin = disabled && !loading`. So `busy` goes to `loading` and
 * only a genuinely unanswerable form goes to `disabled`. Both still refuse the
 * press — the kit disables the element for either — and `loading` adds the
 * `aria-busy` a screen reader needs, which the old spelling never said.
 *
 * The spinner and the busy word come from the kit too: it draws its own ring
 * and swaps in `loadingLabel`, so the hand-held `<Spinner>` and the ternary
 * that chose between two labels are both gone. The two sentences are still
 * asked for at this position (R33) and are unchanged. */
function SubmitButton({ submit }: { submit: SubmitConfig }) {
  const t = useT()
  return (
    <Button
      type="submit"
      loading={submit.busy}
      loadingLabel={t("Submitting…")}
      disabled={submit.disabled}
      className="gap-1"
    >
      {submit.icon}
      {t("Submit")}
    </Button>
  )
}

/** The quiet dismissal beside Submit. See the "A REAL CANCEL BUTTON" note
 * above for why `variant="cancel"` and why it mirrors `shared/ui/components/
 * form/form.tsx`'s own Cancel call site. Disabled exactly when Submit is
 * busy — the same rule `FormShellDialog`'s `onOpenChange` already enforces
 * for the backdrop/Escape path, restated here so the visible button agrees
 * with the invisible one. */
function CancelButton({ onCancel, busy }: { onCancel: () => void; busy?: boolean }) {
  const t = useT()
  return (
    <Button type="button" variant="cancel" disabled={busy} onClick={onCancel}>
      {t("Cancel")}
    </Button>
  )
}

export function FormShell({
  title,
  subtitle,
  children,
  footer,
  submit,
  onSubmit,
  fill,
  onCancel,
}: {
  /** Pass a <DialogTitle>…</DialogTitle>. */
  title: React.ReactNode
  /** Pass a <DialogDescription>…</DialogDescription>. */
  subtitle?: React.ReactNode
  /** The fields (each a <Field>). */
  children: React.ReactNode
  /** Extra action(s) beside the submit button. Most forms pass none. */
  footer?: React.ReactNode
  /** The form's one button. Every form should pass this rather than a footer. */
  submit?: SubmitConfig
  onSubmit?: (e: React.FormEvent) => void
  /**
   * `FormShellDialog` only — never set this from a form. That wrapper's panel is
   * already edge-to-edge, so the shell fills it (`h-full`) instead of sizing to
   * content under an 85dvh cap. Every one of this shell's 37 real callers still
   * only ever passes title/subtitle/children/footer/submit/onSubmit.
   */
  fill?: boolean
  /**
   * Closes the panel — the same path a click outside it or Escape already
   * runs. Renders a `CancelButton` beside Submit when present; omitted (as
   * both bare-`FormShell` callers do) draws none, exactly today's shape.
   * See the "A REAL CANCEL BUTTON" note at the top of this file.
   */
  onCancel?: () => void
}) {
  return (
    // FormShell owns the WHOLE box, edge to edge: its parent gives it no padding
    // (FormShellDialog passes p-0 to SheetContent, and `data-slot="sheet-form"`
    // below opts this element out of SheetContent's own blanket per-child
    // flex-1/overflow/padding rule, which exists for callers that DON'T bring
    // their own header/body/footer split) and each region states its own, so the
    // two hairlines run the full width of the panel instead of floating in a 24px
    // inset. That is also why the height cap can be trusted — 85dvh (or, filled,
    // the panel's own full height) is this element's height, not that plus
    // somebody else's padding.
    //
    // THIS `overflow-hidden` IS NOW THE ONLY ONE ON THE FILLED PATH (see the
    // "FOCUS RING'S OUTER EDGE" note at the top of this file). `SheetContent`
    // used to carry a second, redundant `overflow-hidden` of its own, on the
    // SAME element Radix animates with a `transform` — this `<form>` never
    // moves (only its ANIMATED ancestor does), so clipping content here
    // instead cannot collide with that transform the way clipping there
    // could.
    <form
      data-slot="sheet-form"
      className={cn(
        "grid grid-rows-[auto_1fr_auto] overflow-hidden rounded-[var(--radius)]",
        fill ? "h-full" : "max-h-[85dvh]",
      )}
      onSubmit={onSubmit}
    >
      <div className="flex flex-col gap-2 px-6 pt-6 pb-4">
        {title}
        {subtitle}
      </div>
      {/* THE ONLY THING THAT SCROLLS. overscroll-contain so reaching the end of a
          long form does not start scrolling the page behind the dialog.
          shadow-[var(--hairline-over)] rather than `border-t`: see "THE ACTION
          BAR GAINS A CANCEL BUTTON" note at the top of this file — a bare
          `border-t` names no colour token and Tailwind resolves that to
          `currentColor` (ink), not the pale `--hair` every other hairline in
          the kit draws.
          THE REQUIRED-MARKER OVERRIDE (same note, point 3): every `Field` in
          every form flows through this one div, so the descendant selector
          reaches all of them from here rather than at 37 call sites. It
          targets the vendored kit's own stable `data-slot="field-required"`
          and touches nothing else — the hand-edit ban
          (`web/test/vendored-kit.test.ts`) is on `shared/ui/`'s own files,
          never on a selector reaching them from outside. */}
      <div
        className={cn(
          "overflow-y-auto overscroll-contain px-6 py-5 shadow-[var(--hairline-over)]",
          "[&_[data-slot=field-required]]:order-first [&_[data-slot=field-required]]:me-auto",
        )}
      >
        <div className="flex flex-col gap-4">{children}</div>
      </div>
      {/* The bar's own top edge IS the hairline, nothing to collide with —
          drawn the same inset-shadow way as the divider above it now. */}
      <div className="bg-card flex flex-wrap items-center justify-end gap-2 px-6 py-4 shadow-[var(--hairline-over)]">
        {footer}
        {onCancel ? <CancelButton onCancel={onCancel} busy={submit?.busy} /> : null}
        {submit && <SubmitButton submit={submit} />}
      </div>
    </form>
  )
}

/** A FormShell inside a side panel — which is how nearly every form in the app
 * appears (see the "CENTRED DIALOG → SIDE PANEL" note at the top of this file).
 *
 * The wrapper around FormShell was written out eleven times, byte for byte: the same
 * Sheet, the same SheetContent, and the same dismissal rule, which is the only part
 * with teeth: while a save is in flight the form CANNOT be dismissed (busy).
 *
 * A DISMISSED FORM KEEPS WHAT YOU TYPED. It did not, and the argument for throwing it
 * away was that "a form the user walked away from doesn't reappear half-filled
 * tomorrow" — which was answering a worry the storage had already answered. Drafts
 * live in sessionStorage: they die with the tab and are wiped on sign-out, so tomorrow
 * was never on the table. What the rule actually did was punish the commonest accident
 * there is, and on a phone it is barely an accident at all — the backdrop is most of
 * the screen. The owner, reporting it: "I type in three little input components, shut
 * it by mistake, reopen the same form three seconds later, and the changes are gone."
 *
 * So the draft is cleared on SUBMIT, where a real record has superseded it — by the
 * form itself, which already did that. The shell used to take a `clearDraft` prop for
 * the dismiss path; with no dismiss path to serve it was a prop nothing read, so it
 * is gone and every call site is one line shorter.
 *
 * The draft itself stays at the call site: each form owns the shape of what it saves,
 * so `useFormDraft` lives there and hands `clearDraft` down. */
export function FormShellDialog({
  open,
  onOpenChange,
  busy,
  title,
  // subtitle intentionally not destructured — accepted in the type below for
  // every existing caller's sake, never read. See the note on the prop.
  children,
  footer,
  submit,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A save in flight — the dialog refuses to close until it lands. */
  busy?: boolean
  /** Pass a <DialogTitle>…</DialogTitle>. */
  title: React.ReactNode
  /**
   * Accepted for every existing caller's sake, but never rendered — see the
   * "THE ✕ WAS A SECOND CANCEL, AND THE SUBTITLE WENT WITH IT" note at the
   * top of this file (2026-08-31, client feedback: add/edit dialogs don't
   * need a subtitle). `FormShell` itself still renders one for its two bare
   * callers; only this wrapper drops it.
   */
  subtitle?: React.ReactNode
  /** The fields (each a <Field>). */
  children: React.ReactNode
  /** Extra action(s) beside the submit button. Most forms pass none. */
  footer?: React.ReactNode
  /** The form's one button (F1). */
  submit?: SubmitConfig
  onSubmit?: (e: React.FormEvent) => void
}) {
  // ONE close path, shared by the backdrop, Escape, AND the Cancel button —
  // see "A REAL CANCEL BUTTON" at the top of this file. `busy` refuses all
  // three the same way; before the Cancel button existed this was inlined in
  // `onOpenChange` alone, with nothing else to share it with.
  function close() {
    if (busy) return
    // NOTHING IS DISCARDED HERE. Closing a form is not a decision to throw
    // away what you typed — see the header.
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (busy) return
        onOpenChange(o)
      }}
    >
      {/* side="right": the app's other 18 Sheet call sites all open from the
          same edge. WIDTH, 2026-08-31: the kit's own default (`w-[26.25rem]`,
          420 flat) is overridden here rather than in the vendored `sheet.tsx` —
          a fixed pixel measure on "I have a very big monitor" read as
          "ridiculous", so the panel now SCALES: `clamp(26.25rem, 34vw, 40rem)`
          keeps today's 420px as the FLOOR (small screens are no worse off),
          tracks 34% of the viewport in between, and stops at 640px — a notch
          above the kit's own `templates/form-screen.tsx` "edit" panel
          (`32rem`/512px), which is this app's one reference for "generous, not
          absurd" without adopting that composition (COMPOSITION-MISMATCHES.md).
          `max-w-[min(100%,40rem)]` replaces the kit's own `max-w-full`: on a
          view narrower than the 420px floor a plain `max-w-full` still caps at
          100vw (that half of the mobile full-bleed rule is untouched), and
          `min(...)` adds the SAME 640px ceiling on the wide end so the two
          bounds can never fight. Neither new class sets `mx-auto` or the bare
          token `w-full`, so R29's positional scan (which fires on exactly that
          trio on one line) still does not see a page container here — a sheet
          keeps its own measure on purpose; verified by re-running
          `one-page-width` after this change, not assumed.
          p-0: SheetContent's own per-child rule already skips FormShell (its
          `data-slot="sheet-form"`). overflow-hidden is DELIBERATELY NOT set
          here any more — see the note on FormShell's own `<form>` above for why
          clipping moved off this element.
          showClose={false}: the panel's own top-right ✕ is withdrawn — see
          "THE ✕ WAS A SECOND CANCEL" note at the top of this file. The footer's
          CancelButton (below) is the one dismiss control now; the kit's own
          `showClose` prop is exactly the seam `access-denied.tsx` and
          `command.tsx` already use for the same reason, so this is not a
          hand-edit of vendored `sheet.tsx`. */}
      <SheetContent
        side="right"
        showClose={false}
        className="w-[clamp(26.25rem,34vw,40rem)] max-w-[min(100%,40rem)] p-0"
      >
        <FormShell
          fill
          onSubmit={onSubmit}
          title={title}
          footer={footer}
          submit={submit}
          onCancel={close}
        >
          {children}
        </FormShell>
      </SheetContent>
    </Sheet>
  )
}

// Standard label→input spacing for a Field inside a FormShell — a touch more air
// than the library default so the label never looks glued to the input border.
export const fieldSpacing = "gap-2"
