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
// as tall as its fields. `DialogContent` centres itself with `top-1/2
// -translate-y-1/2`, so a form taller than the window grew EQUALLY off the top and
// off the bottom, and nothing scrolled: on a 1280×640 window the Edit story dialog
// measured 738px, its title clipped above the viewport and its Save button below
// it, unreachable. A tester reported it as the Save button rendering outside the
// dialog box, which is exactly what it looks like.
//
// `max-h-[85dvh]` + `grid-rows-[auto_1fr_auto]` fixes the class of bug rather than
// the instance: the header and the action bar are `auto`, the FIELDS are the `1fr`
// row and the only thing that scrolls, so the action bar is always on screen no
// matter how many fields a module adds. `dvh` rather than `vh` because a phone's
// address bar is the difference between "pinned" and "just under the fold".
//
// And the two separators are gone. A free-standing hairline sitting a fixed gap
// above a 42px pill is a collision waiting for the next type-scale change (it had
// already had one: see the note on `pt-6` in library-overrides.css, a documented
// fix that never actually shipped). A `border-t` on a PADDED bar cannot collide
// with the button inside it, at any size, because the hairline is the bar's own
// edge. This removes both front doors' last use of `primitives/separator`, which
// is right: a separator divides peers, and a form's action bar is not a peer of
// its fields.

import * as React from "react"

import { Dialog, DialogContent } from "@kwapso/ui/registry/primitives/dialog/dialog"

export function FormShell({
  title,
  subtitle,
  children,
  footer,
  onSubmit,
}: {
  /** Pass a <DialogTitle>…</DialogTitle>. */
  title: React.ReactNode
  /** Pass a <DialogDescription>…</DialogDescription>. */
  subtitle?: React.ReactNode
  /** The fields (each a <Field>). */
  children: React.ReactNode
  /** The action button(s). */
  footer: React.ReactNode
  onSubmit?: (e: React.FormEvent) => void
}) {
  return (
    // FormShell owns the WHOLE box, edge to edge: its parent gives it no padding
    // (FormShellDialog passes p-0 to DialogContent) and each region states its own,
    // so the two hairlines run the full width of the sheet instead of floating in a
    // 24px inset. That is also why the height cap can be trusted — 85dvh is the
    // dialog's height, not 85dvh plus somebody else's padding.
    <form
      className="grid max-h-[85dvh] grid-rows-[auto_1fr_auto] overflow-hidden rounded-xl"
      onSubmit={onSubmit}
    >
      <div className="flex flex-col gap-1.5 px-6 pt-6 pb-4">
        {title}
        {subtitle}
      </div>
      {/* THE ONLY THING THAT SCROLLS. overscroll-contain so reaching the end of a
          long form does not start scrolling the page behind the dialog. */}
      <div className="overflow-y-auto overscroll-contain border-t px-6 py-5">
        <div className="flex flex-col gap-4">{children}</div>
      </div>
      {/* The bar's own top edge IS the hairline — nothing to collide with. */}
      <div className="bg-card flex flex-wrap justify-end gap-2 border-t px-6 py-4">{footer}</div>
    </form>
  )
}

/** A FormShell inside a dialog — which is how nearly every form in the app appears.
 *
 * The wrapper around FormShell was written out eleven times, byte for byte: the same
 * Dialog, the same DialogContent, and the same two dismissal rules, which are the only
 * part with teeth. While a save is in flight the form CANNOT be dismissed (busy), and
 * dismissing it any other way — Esc, backdrop, the close button — DISCARDS the draft,
 * so a form the user walked away from doesn't reappear half-filled tomorrow.
 *
 * The draft itself stays at the call site: each form owns the shape of what it saves,
 * so `useFormDraft` lives there and hands `clearDraft` down. */
export function FormShellDialog({
  open,
  onOpenChange,
  busy,
  clearDraft,
  title,
  subtitle,
  children,
  footer,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A save in flight — the dialog refuses to close until it lands. */
  busy?: boolean
  /** Dismissing the form throws its draft away. */
  clearDraft?: () => void
  /** Pass a <DialogTitle>…</DialogTitle>. */
  title: React.ReactNode
  /** Pass a <DialogDescription>…</DialogDescription>. */
  subtitle?: React.ReactNode
  /** The fields (each a <Field>). */
  children: React.ReactNode
  /** The action button(s). */
  footer: React.ReactNode
  onSubmit?: (e: React.FormEvent) => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return
        if (!o) clearDraft?.()
        onOpenChange(o)
      }}
    >
      {/* p-0 gap-0: the shell inside owns every edge (see FormShell). Without
          this the dialog's own p-6 would sit OUTSIDE the height cap, so a full
          form would be 85dvh + 48px — taller than the window again — and both
          hairlines would stop 24px short of the sheet they are meant to divide. */}
      <DialogContent className="gap-0 overflow-hidden p-0">
        <FormShell onSubmit={onSubmit} title={title} subtitle={subtitle} footer={footer}>
          {children}
        </FormShell>
      </DialogContent>
    </Dialog>
  )
}

// Standard label→input spacing for a Field inside a FormShell — a touch more air
// than the library default so the label never looks glued to the input border.
export const fieldSpacing = "gap-2"
