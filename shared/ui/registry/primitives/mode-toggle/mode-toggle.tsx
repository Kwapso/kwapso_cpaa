"use client"

// ModeToggle — the light/dark switch. next-themes owns the theme state and writes
// the `dark` class that every token in styles.css keys off; this button only
// flips it.

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "../button/button"

/** A light/dark toggle. Relies on <ThemeProvider> being mounted above it. */
function ModeToggle() {
  const { setTheme, resolvedTheme } = useTheme()

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
    </Button>
  )
}

export { ModeToggle }
