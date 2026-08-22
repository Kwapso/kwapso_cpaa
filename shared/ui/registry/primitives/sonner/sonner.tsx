"use client"

// Toaster + toast() — small pop-up notifications (e.g. "Saved!") that slide in
// briefly, usually in a corner. Mount <Toaster /> once near the app root, then
// call `toast("…")` from anywhere to show one.

import * as React from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"

function Toaster(props: React.ComponentProps<typeof Sonner>) {
  const { theme = "system" } = useTheme()
  return (
    <Sonner
      theme={theme as "light" | "dark" | "system"}
      className="toaster group"
      toastOptions={{
        classNames: {
          // reuse the same frosted-glass finish as cards
          toast:
            "glass group-[.toaster]:rounded-xl group-[.toaster]:border group-[.toaster]:text-foreground group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
