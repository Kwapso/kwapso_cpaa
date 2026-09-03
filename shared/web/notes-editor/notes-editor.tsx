// MOVED FROM THE OLD LIBRARY when shared/ui became the vendored design kit
// (Kwapso/kwapso-ui-ux). This is a rich-text EDITOR — contentEditable, sanitised
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
//
// ── THE TOOLBAR SHOWS/HIDES, 2026-08-31 ──────────────────────────────────────
//
// Client-reported: "on the rich text component, can we show/hide the
// toolbar? or, inside the text composer, add a button to show/hide it?
// takes too much space!" This editor sits on the Scope field of the App
// form and on description fields across several other forms — one more
// 40px-tall row of six controls above every one of them, on screens where
// FormShell's own action bar is already fighting for vertical room (see the
// three-row-grid note in shared/web/form-shell.tsx).
//
// Two ways to answer "takes too much space": remove the toolbar, or make it
// optional. Removing it would take away real capability — bold, lists,
// highlight — from every one of the 14 forms that write through this editor,
// to fix a problem that is only ever felt while the toolbar is open. A
// collapse toggle keeps the capability and gives back the space the rest of
// the time, which is the better default of the two, so that is what this
// builds: a small chevron button that shows/hides the row of Toggles below
// it, COLLAPSED by default — the complaint was about space, so the state a
// person lands on should be the one that saves it.
//
// PER-MOUNT STATE, not persisted. There is no existing per-viewer preference
// store this component could reach into: `web/lib/nav-memory.ts` is
// app-side, keyed to `web/`'s own page registry, and this file lives in
// `shared/web/` for both front doors. Building a second, generic
// localStorage-backed preference seam to remember one boolean is more
// plumbing than a single toggle earns — "too much code is a defect" — so
// this resets to collapsed on every mount, the same as every other piece of
// this editor's UI state today.
//
// ── THE TOGGLE MOVES INSIDE THE BOX, 2026-08-31 ──────────────────────────────
//
// Client-reported, on the same screenshot the sheet/field fixes came off of:
// "put it in the top left corner of the text box, using a representative
// icon — also the formatting options should be like a toolbar at top but
// visually inside of the text composer." Three complaints in one, all about
// the SAME seam not reading as one control: the toggle sat on its OWN LINE
// above the box, named itself with the word "Formatting" beside a bare
// chevron, and the row of Toggles it revealed floated in the gap between
// that line and the box's own top border — a second free-standing element,
// not part of the composer it edits.
//
// So the border moves UP a level, off the contentEditable `div` and onto the
// wrapper that already holds both pieces — the shape `input.tsx`'s own note
// calls "the field hairline", now drawn around toolbar-plus-text as one box
// instead of around the text alone. The strip inside it is ALWAYS there
// (never a separate line above the border), holding one icon-only `Toggle` —
// `TextAa`, the kit's own "Aa" glyph, the one entry in its 1,383 icons that
// says "text formatting" rather than "Bold" or "Italic" specifically, which
// is why it replaces the word "Formatting" AND the bare chevron the client
// named as the two things to drop. `pressed={showToolbar}` on the SAME
// `Toggle` component the format row already uses IS the disclosure's open/
// shut state — an inverse fill when the row is showing, needing no second
// chevron glyph to say so. Expanding grows the strip to hold the format row
// alongside it, still the one docked band `--hairline-under` (never a
// `border`) separates from the text below — "a thin toolbar strip inside the
// same bordered box", read back verbatim.

import * as React from "react"
import { ListNumbers } from "@shared/ui/foundations/icons"
import { TextB, PaintBucket, TextItalic, List as ListIcon, Minus, TextAa } from "@shared/ui/foundations/icons"

import { cn } from "@shared/ui/lib/utils"
import { useT } from "@shared/web/language"
import { Toggle } from "@shared/ui/components/toggle/toggle"
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
  // COLLAPSED BY DEFAULT — see "THE TOOLBAR SHOWS/HIDES" note above.
  const [showToolbar, setShowToolbar] = React.useState(false)

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
    // THE BOX ITSELF — border moved up from the text area alone (see the
    // "TOGGLE MOVES INSIDE THE BOX" note above) so the strip below and the
    // text below THAT read as one composer, never a control floating above
    // one.
    //
    // `data-focus-shell` — THE STANDARD COMPOSITE-CONTROL SEAM
    // (tokens.css §8, "review 1A · fix 4"), not a rule invented here. This
    // box's focusable node (the contentEditable div below) is bare — no
    // border, no fill of its own — sitting inside a shell that carries all
    // three, which is exactly the shape that rule was written for (the
    // search pill, a facet's typed field). Before this pairing, the
    // contentEditable took the bare global `:focus-visible` outline itself:
    // drawn OUTSIDE its own border box at zero offset, flush against this
    // shell's `overflow-hidden` edge, so three of its four sides were
    // clipped away and only the top sliver survived — landing exactly where
    // the toolbar strip meets the text, which is the "black line separating
    // from the toolbar" the client saw, while "the general selected overline
    // is missing" was the other three sides being clipped by the same
    // `overflow-hidden`. The shell taking the ring (below) and the proxy
    // handing it over is the fix, not a rule stacked beside the clipped one.
    <div
      data-focus-shell=""
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-[var(--radius)] shadow-[var(--hairline-strong)] bg-transparent",
        className
      )}
    >
      {/* THE STRIP — always present, docked at the box's own top edge. One
          icon-only Toggle at the RIGHT corner when collapsed; the format row
          joins it, in the same strip, once expanded, still reading left to
          right ahead of it. `shadow-[var(--hairline-under)]` (never a
          `border`) is the one line separating it from the text below, drawn
          only once there is something to separate FROM.
          Client-reported, 31 Aug 2026: "move it to the right corner the
          action to activate" — `ml-auto` on the one Toggle that shows and
          hides the row is the whole change; the format buttons keep their own
          order ahead of it. */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-1 px-2 py-1",
          showToolbar && "shadow-[var(--hairline-under)]"
        )}
      >
        {showToolbar && (
          <>
            <Toggle size="sm" aria-label={t("Bold")} onPressedChange={() => run("bold")}>
              <TextB />
            </Toggle>
            <Toggle
              size="sm"
              aria-label={t("Italic")}
              onPressedChange={() => run("italic")}
            >
              <TextItalic />
            </Toggle>
            <Toggle size="sm" aria-label={t("Highlight")} onPressedChange={highlight}>
              <PaintBucket />
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
              <ListNumbers />
            </Toggle>
            <Toggle
              size="sm"
              aria-label={t("Separator")}
              onPressedChange={() => run("insertHorizontalRule")}
            >
              <Minus />
            </Toggle>
          </>
        )}
        <Toggle
          size="sm"
          pressed={showToolbar}
          onPressedChange={setShowToolbar}
          aria-label={t("Formatting")}
          className="ml-auto"
        >
          <TextAa />
        </Toggle>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-focus-proxy=""
        data-placeholder={placeholder}
        onInput={emit}
        className="min-h-24 flex-1 bg-transparent px-3 py-2 text-sm empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_hr]:my-2 [&_hr]:border-border [&_mark]:rounded [&_mark]:bg-primary/20 [&_mark]:px-0.5 [&_mark]:text-foreground [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
      />
    </div>
  )
}

export { Notes }
