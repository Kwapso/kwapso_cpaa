"use client"

// Notes — a lightweight notes / rich-text editor with a small toolbar:
// bold, italic, highlight, bullet list, numbered list, and a separator. Emits
// HTML via onChange. Good for notes & descriptions; swap in a full editor
// (e.g. Tiptap) later if you need more. Highlight wraps the selection in a
// <mark> styled from tokens, so it re-themes with everything else.
// The seeded `defaultValue` is SANITIZED before it's placed in the editor
// (allow-list of formatting tags, every attribute stripped) so stored content
// can never smuggle in executable HTML — see ./logic.

import * as React from "react"
import {
  Bold,
  Highlighter,
  Italic,
  List as ListIcon,
  ListOrdered,
  Minus,
} from "lucide-react"

import { cn } from "../../../lib/utils"
import { Toggle } from "../toggle/toggle"
import { sanitizeNotesHtml } from "./logic"

function Notes({
  defaultValue = "",
  onChange,
  placeholder = "Write something…",
  className,
}: {
  defaultValue?: string
  onChange?: (html: string) => void
  placeholder?: string
  className?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  // Seed the editor with SANITIZED initial HTML on mount (client-only). This
  // replaces a `dangerouslySetInnerHTML` that would have injected the raw
  // `defaultValue` — the XSS sink. Runs once; the editor is uncontrolled after.
  React.useEffect(() => {
    if (ref.current) ref.current.innerHTML = sanitizeNotesHtml(defaultValue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emit = () => onChange?.(ref.current?.innerHTML ?? "")
  // execCommand is deprecated but still the lightest way to do inline rich text
  // in every browser today; the top comment notes the Tiptap upgrade path.
  const run = (command: string) => {
    document.execCommand(command, false)
    ref.current?.focus()
    emit()
  }
  // Highlight: wrap the current selection in a <mark> (styled via tokens below)
  // instead of execCommand, which would bake in a literal color.
  const highlight = () => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const mark = document.createElement("mark")
    try {
      sel.getRangeAt(0).surroundContents(mark)
    } catch {
      // selection crossed element boundaries — skip rather than corrupt markup.
    }
    ref.current?.focus()
    emit()
  }

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex flex-wrap gap-1">
        <Toggle size="sm" aria-label="Bold" onPressedChange={() => run("bold")}>
          <Bold />
        </Toggle>
        <Toggle
          size="sm"
          aria-label="Italic"
          onPressedChange={() => run("italic")}
        >
          <Italic />
        </Toggle>
        <Toggle size="sm" aria-label="Highlight" onPressedChange={highlight}>
          <Highlighter />
        </Toggle>
        <Toggle
          size="sm"
          aria-label="Bullet list"
          onPressedChange={() => run("insertUnorderedList")}
        >
          <ListIcon />
        </Toggle>
        <Toggle
          size="sm"
          aria-label="Numbered list"
          onPressedChange={() => run("insertOrderedList")}
        >
          <ListOrdered />
        </Toggle>
        <Toggle
          size="sm"
          aria-label="Separator"
          onPressedChange={() => run("insertHorizontalRule")}
        >
          <Minus />
        </Toggle>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        className="min-h-24 rounded-xl border bg-transparent px-3 py-2 text-sm empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_hr]:my-2 [&_hr]:border-border [&_mark]:rounded [&_mark]:bg-primary/20 [&_mark]:px-0.5 [&_mark]:text-foreground [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
      />
    </div>
  )
}

export { Notes }
