"use client"

// TEMPORARY PLACEHOLDER — flagged in UI-GAPS.md (#1).
// The library has no one-time-code input yet. This stand-in composes six
// library Inputs (auto-advance, backspace, paste). Once the library
// ships `code-input`, this file gets DELETED and imports swap to the library.
//
// It sits in shared/web/ — the most permanent folder in the repo — and NOT in
// web/components/temp/ beside auth-card, for one reason: both front ends sign in
// with it (the agency app and the client portal), and a file two workspaces
// import cannot live inside one of them. The folder no longer carries the
// "this is a stand-in" signal, so this comment has to. It is still temporary.

import * as React from "react"

import { Input } from "@shared/ui/controls/input/input"

export function CodeInput({
  length = 6,
  value,
  onChange,
  disabled = false,
}: {
  length?: number
  value: string
  onChange: (code: string) => void
  disabled?: boolean
}) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? "")

  function setDigit(index: number, digit: string) {
    const next = digits.slice()
    next[index] = digit
    onChange(next.join(""))
  }

  function handleChange(index: number, raw: string) {
    const clean = raw.replace(/\D/g, "")
    if (clean.length > 1) {
      // A paste landed here: spread it across the boxes.
      onChange(clean.slice(0, length))
      refs.current[Math.min(clean.length, length) - 1]?.focus()
      return
    }
    setDigit(index, clean)
    if (clean && index < length - 1) refs.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus()
    }
  }

  return (
    <div className="flex justify-center gap-2">
      {digits.map((digit, i) => (
        <Input
          key={i}
          ref={(el: HTMLInputElement | null) => {
            refs.current[i] = el
          }}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1} of ${length}`}
          // A CODE CELL IS A BOX, NOT A PILL, and the kit says so in as many
          // words: code-input cells are 24px, explicitly NOT the 6px selection
          // exception, because "a code cell is a box". It has to say so here
          // because the cell is built from the library `Input`, and an input IS
          // a pill in this system — so without the override the six cells
          // render as six circles. 44 x 52 and tabular, per the kit's spec.
          className="h-13 w-11 rounded-[var(--radius)] px-0 text-center text-lg font-medium tabular-nums"
        />
      ))}
    </div>
  )
}
