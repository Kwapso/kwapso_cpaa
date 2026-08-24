"use client"

// ThemeProvider — Layer 0, now a passthrough. The old library's provider
// wrapped next-themes, which wrote a `.dark` CLASS on <html>. The design kit
// (shared/ui, Kwapso/design) keys every token off `data-theme` instead, and
// its ModeToggle owns the attribute + localStorage("theme") itself — the
// kit's own header rules next-themes OUT (its "system" state writes a
// concrete attribute, which would stop `:root:not([data-theme="light"])`
// from ever doing its job). So there is no theme LIBRARY any more: the
// mechanism is the kit's, and this component only injects the one thing the
// kit says belongs to the app shell — the pre-paint boot script that applies
// a stored choice before first paint (kit: controls/mode-toggle, "THE FLASH,
// AND WHOSE JOB IT IS"). It keeps the old provider's name and tolerates its
// old props so no layout or future call site has to change.

import * as React from "react"

const BOOT = `try{var m=localStorage.getItem("theme");if(m==="light"||m==="dark"){document.documentElement.setAttribute("data-theme",m);document.documentElement.style.colorScheme=m;}}catch(e){}`

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      {children}
    </>
  )
}
