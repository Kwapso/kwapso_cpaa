"use client"

// FormShell — the ONE layout every form/dialog uses, so create / edit screens are
// predictable and identical across modules (the owner's design-language law):
//
//   title + subtitle   ·   ─── separator ───   ·   the fields   ·   ─── separator ───   ·   action
//
// A host-side recipe assembled from library primitives — NOT a new library
// component. Pass the title as a <DialogTitle> and subtitle as a <DialogDescription>
// (so Radix Dialog a11y stays intact) and the action button(s) as `footer`.

import * as React from "react"

import { Dialog, DialogContent } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { Separator } from "@kwapso/ui/registry/primitives/separator/separator"

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
    <form className="flex flex-col" onSubmit={onSubmit}>
      <div className="flex flex-col gap-1.5 pb-4">
        {title}
        {subtitle}
      </div>
      <Separator />
      <div className="flex flex-col gap-4 py-4">{children}</div>
      <Separator />
      {/* pt-6, not pt-4, and this is the ONE value that governs it everywhere.
       * Separator is used in exactly one place across both front doors — right
       * here — so every form in the agency app AND the portal shared the same
       * 1rem gap between the hairline and the action button, and at the portal's
       * larger reading size a 42px pill sitting 17px under a full-width rule
       * reads as a collision (owner, staging, Aug 2026). 1.5rem matches the
       * dialog's own p-6, so the action row now breathes the same as the card.
       * Deliberately ASYMMETRIC with the pb-4/py-4 above: those separate text
       * from text, this one separates a heavy control from everything else.
       * Nothing to ask of the library — its Separator is a bare h-px with no
       * margin, which is correct; the spacing was always ours to set. */}
      <div className="flex flex-wrap justify-end gap-2 pt-6">{footer}</div>
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
      <DialogContent>
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
