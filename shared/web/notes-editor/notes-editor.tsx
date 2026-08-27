// MOVED FROM THE OLD LIBRARY when shared/ui became the vendored design kit
// (Kwapso/design). This is a rich-text EDITOR — contentEditable, sanitised
// HTML in and out — which is BEHAVIOUR, so it lives app-side. The kit ships a
// component also called Notes (controls/notes), and it is a different thing: a
// read-only stack of remark rows. Same word, two components; this one keeps
// the editor's contract for the 14 form dialogs that write through it, and its
// toolbar toggles are the kit's own Toggle, so it draws in the new system.
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
import { ListOrdered } from "@shared/ui/icons"
import { Bold, FillColor, Italic, List as ListIcon, Minus } from "@shared/ui/icons"

import { cn } from "@shared/ui/lib/utils"
import { useT } from "@shared/web/language"
import { Toggle } from "@shared/ui/controls/toggle/toggle"
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
  const t = useT()
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
        <Toggle size="sm" aria-label={t("Bold")} onPressedChange={() => run("bold")}>
          <Bold />
        </Toggle>
        <Toggle
          size="sm"
          aria-label={t("Italic")}
          onPressedChange={() => run("italic")}
        >
          <Italic />
        </Toggle>
        <Toggle size="sm" aria-label={t("Highlight")} onPressedChange={highlight}>
          <FillColor />
        </Toggle>
        <Toggle
          size="sm"
          aria-label={t("Bullet list")}
          onPressedChange={() => run("insertUnorderedList")}
        >
          <ListIcon />
        </Toggle>
        <Toggle
          size="sm"
          aria-label={t("Numbered list")}
          onPressedChange={() => run("insertOrderedList")}
        >
          <ListOrdered />
        </Toggle>
        <Toggle
          size="sm"
          aria-label={t("Separator")}
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
        className="min-h-24 rounded-xl border bg-transparent px-3 py-2 text-sm empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_hr]:my-2 [&_hr]:border-border [&_mark]:rounded [&_mark]:bg-primary/20 [&_mark]:px-0.5 [&_mark]:text-foreground [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
      />
    </div>
  )
}

export { Notes }
