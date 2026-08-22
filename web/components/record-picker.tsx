"use client"

// RECORD PICKER — the ONE control in this app for "which record do you mean?",
// and the only one with a search box in it.
//
// WHY IT EXISTS. Every picker in the agency app was the library `Select`, which
// has no search of any kind: it draws its options and you scroll. On a laptop
// with twelve apps that is fine. On a phone, against twenty clients and a
// hundred and four contacts, it is a wall — reported from a phone as "any
// drop-downs are becoming impossible to search through", beside the Glide app
// that put a search bar at the top of every one of them.
//
// AND ON A PAGED COLLECTION IT WAS ALSO WRONG. The ticket form's client picker
// read `accountsKey(teamId)`, whose fetcher primes a cursor — accounts is a
// GROWING_COLLECTIONS row (R14), so that list is PAGE ONE. The picker offered
// the newest fifty companies and silently had no opinion about the rest, which
// is the other half of the same report: "not all clients or contacts are showing
// per account". A search box that filtered that array in the browser would have
// made it worse, because it would have answered "no" with confidence. So this
// control has two modes and the call site says which:
//
//   • `options`  — the whole list is already in hand (a bounded read, a team's
//                  own dropdown vocabulary). cmdk filters it in memory, instantly,
//                  for nothing. Same engine the library's own `Choice` uses.
//   • `search`   — the collection PAGES, so the question goes to the DOOR (`q`),
//                  debounced, cached per term. This is SEARCH.md layer 2, the
//                  same shape `PagedFind` uses for a list screen and
//                  `contact-link-dialog` already used for one field.
//
// NOTHING NEW IS INVENTED. It is the library's `Popover` + `Command` (cmdk), the
// documented searchable-combobox composition — the same two primitives the
// library's own `Choice` is built from. `Choice` itself cannot be used here: it
// owns its search text internally and filters in memory, so it has no way to ask
// a door. That gap is flagged in UI-GAPS.md; the day the library takes a
// server-side seam, this file collapses onto it.
//
// ON A PHONE IT IS A SHEET, NOT A POPOVER, and that is the part that is actually
// about touch. A popover is anchored to its trigger in the LAYOUT viewport,
// which the software keyboard is not in: open a picker on a field low in a form
// and the keyboard covers the list and often the search box itself, so the one
// control you must be able to see while typing is the one that disappears. Below
// `sm` this opens a bottom sheet 85dvh tall instead — its top edge sits near the
// top of the screen, the search box is pinned there, and the keyboard rises into
// the bottom of a list that scrolls. That is what Glide does on a phone, and it
// is why it works there.

import * as React from "react"

import { Button } from "@shared/ui/registry/primitives/button/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@shared/ui/registry/primitives/command/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@shared/ui/registry/primitives/popover/popover"
import { Sheet, SheetContent, SheetTitle } from "@shared/ui/registry/primitives/sheet/sheet"
import { Spinner } from "@shared/ui/registry/primitives/spinner/spinner"
import { useDebouncedCallback } from "@shared/ui/registry/primitives/use-debounce/use-debounce"
import { Check, ChevronsUpDown, X } from "lucide-react"

import { useIsPhone } from "@/lib/use-is-phone"
import { useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"
import { RecordMark } from "@shared/web/record-mark"

/** One row in the list. `hint` is the second line — an email, a code, the client
 * a person belongs to: whatever makes two people called Marta tellable apart.
 *
 * AND THE THING'S OWN FACE (R35). A record is known by its picture as much as by
 * its name, and until 19 Aug 2026 this type had nowhere to put one — so all
 * thirty-three pickers in the app offered a column of bare words, while the very
 * same records carried logos and glyphs on the list two clicks away. Two pickers
 * worked around it by writing the emoji into `label`, which is a pictograph
 * inside a sentence and the one shape UI-CONVENTIONS §5 refuses.
 *
 * The three fields are `RecordMark`'s own, passed straight through, so a picker
 * row and a collection row are drawn by the same component and cannot drift:
 * `picture` is a stored path (a logo, a photo), `mark` is the type's glyph, and
 * the record's own `label` is the last resort — its first letter. All optional:
 * a role, a meeting purpose and a process version genuinely have no picture, and
 * an option with none renders exactly what it rendered before. */
export type PickerOption = {
  value: string
  label: string
  hint?: string
  /** the stored path to this record's own picture, if it has one */
  picture?: string | null
  /** the record type's glyph — a ticket type's emoji, an app's stage mark */
  mark?: string | null
  /** a person in their own right is a circle; a client, an app, a thing is not */
  shape?: "square" | "round"
}

export function RecordPicker({
  id,
  ariaLabel,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  options,
  search,
  searchKey,
  selectedLabel,
  emptyOption,
  disabled,
  clearable = true,
  className,
}: {
  /** the id the Field's label points at */
  id?: string
  /** The control's name where NO label points at it — an inline picker that
   * stands on its own rather than inside a `Field`. With a label, leave it off:
   * two names on one control is one too many. */
  ariaLabel?: string
  /** the chosen value ("" or the `emptyOption`'s value when nothing is chosen) */
  value: string
  onChange: (value: string) => void
  /** what the closed control says when nothing is chosen */
  placeholder: string
  /** the search box's own placeholder, in the screen's words */
  searchPlaceholder: string
  /** what the list says when the search matched nothing */
  emptyText: string
  /** CLIENT MODE — the whole list, already loaded. Bounded reads only.
   *
   * In SERVER mode it is optional and means something narrower: the list the
   * screen already holds, painted while the door's first answer is on its way,
   * and consulted for the LABEL of a record being edited. It is never searched.
   */
  options?: PickerOption[]
  /** SERVER MODE — ask the door. Debounced (200ms) and cached per term, so a
   * keystroke is not a request and backspacing lands on a warm answer. */
  search?: (term: string) => Promise<PickerOption[]>
  /** SERVER MODE — the cache prefix for this picker's answers. Must be
   * team-scoped, like every key in the app, so a team switch cannot show the
   * last team's people. */
  searchKey?: string
  /** SERVER MODE — the label of the value already chosen, for the closed
   * control. Without it (and without a matching row in `options`) a record being
   * EDITED shows its own id until the door happens to return it. */
  selectedLabel?: string
  /** The "leave it off" row, where a form has one ("No app", "Ours, no client").
   * Rendered first, and it is what the clear X goes back to. */
  emptyOption?: { value: string; label: string }
  disabled?: boolean
  /** Show the clear X beside the control when something is chosen. */
  clearable?: boolean
  /** Width/placement of the control in its own row. The list follows the
   * trigger's width, so this is the only size anything needs. */
  className?: string
}) {
  const t = useT()
  const phone = useIsPhone()
  const [open, setOpen] = React.useState(false)
  // What is TYPED, and what the door has been ASKED, are two different values on
  // purpose: the box has to keep up with the keyboard while the request does not.
  const [text, setText] = React.useState("")
  const [term, setTerm] = React.useState("")
  const askDoor = useDebouncedCallback(setTerm, 200)
  // The label of whatever was picked in this session — so the closed control can
  // name a record the door is no longer returning (the search box has moved on).
  const [picked, setPicked] = React.useState<string | null>(null)

  const serverSide = !!search && !!searchKey
  const found = useCached<PickerOption[]>(
    open && serverSide ? `${searchKey}:${term}` : null,
    () => (search as (term: string) => Promise<PickerOption[]>)(term)
  )

  // Reopening starts clean — otherwise the second open of a picker shows the
  // first one's search still in the box and its answer still under it.
  React.useEffect(() => {
    if (!open) {
      setText("")
      setTerm("")
    }
  }, [open])

  // TYPED BUT NOT YET ASKED. The box runs ahead of the request by up to 200ms,
  // and in that gap the previous answer is on screen under new words — which
  // looks exactly like a search that returned the wrong rows. So the gap shows
  // that it is still looking, rather than showing a stale list confidently.
  const typing = serverSide && text.trim() !== term
  const rows = serverSide
    ? typing
      ? []
      : (found.data ?? options ?? [])
    : (options ?? [])
  const chosen = !!value && value !== emptyOption?.value
  const label = chosen
    ? (rows.find((o) => o.value === value)?.label ??
      options?.find((o) => o.value === value)?.label ??
      picked ??
      selectedLabel ??
      value)
    : placeholder

  function choose(next: string) {
    onChange(next)
    setPicked(rows.find((o) => o.value === next)?.label ?? null)
    setOpen(false)
  }

  function clear() {
    onChange(emptyOption?.value ?? "")
    setPicked(null)
  }

  const row = (o: PickerOption) => (
    <CommandItem
      key={o.value}
      // cmdk filters on the item's own `value`, so it is the id (unique — two
      // clients may share a name) and the words a person would type ride along
      // as `keywords`. In server mode nothing is filtered here at all.
      value={o.value}
      keywords={o.hint ? [o.label, o.hint] : [o.label]}
      onSelect={() => choose(o.value)}
      // 44px is the touch floor (UI-RULEBOOK S6); a desktop row stays compact.
      className="min-h-11 items-start gap-2 py-2.5 sm:min-h-0 sm:py-1.5"
    >
      <Check className={value === o.value ? "mt-0.5 opacity-100" : "mt-0.5 opacity-0"} />
      {/* THE RECORD'S OWN FACE, in the slot an icon would take (R35). Drawn only
          when the option carries one, so a list of roles or versions is exactly
          as dense as it was. `size="row"` is the same box the collections use —
          a picker row and a list row are the same record at the same size. */}
      {(o.picture || o.mark) && (
        <RecordMark
          picture={o.picture}
          mark={o.mark}
          name={o.label}
          shape={o.shape}
          size="row"
          className="mt-0.5 size-6 text-sm"
        />
      )}
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{o.label}</span>
        {o.hint && <span className="text-muted-foreground truncate text-xs">{o.hint}</span>}
      </span>
    </CommandItem>
  )

  const list = (
    <Command
      // SERVER MODE FILTERS NOTHING HERE. The door already answered the question;
      // running cmdk's own matcher over its reply would filter the answer by the
      // same words a second time, and drop any row whose match was in a field the
      // door searched and the label does not show.
      shouldFilter={!serverSide}
      // In the SHEET the palette owns the whole 85dvh and the list is the part
      // that scrolls; in the POPOVER it is as tall as its contents, up to the
      // library's own ceiling. Without the distinction the popover has no height
      // bound at all — a search matching thirty rows grew a list off the top of
      // the window and took its own search box with it.
      className={phone ? "h-full" : ""}
    >
      <CommandInput
        value={text}
        onValueChange={(next) => {
          setText(next)
          if (serverSide) askDoor(next.trim())
        }}
        placeholder={searchPlaceholder}
        className="pr-8"
      />
      <CommandList
        className={
          phone ? "max-h-none flex-1 overflow-y-auto overscroll-contain" : "overscroll-contain"
        }
      >
        {serverSide ? (
          <ServerRows
            loading={typing || (found.loading && !found.data)}
            error={!!found.error}
            count={rows.length}
            emptyText={emptyText}
          />
        ) : (
          <CommandEmpty>{emptyText}</CommandEmpty>
        )}
        <CommandGroup>
          {emptyOption && (
            <CommandItem
              value={emptyOption.value}
              keywords={[emptyOption.label]}
              onSelect={() => {
                clear()
                setOpen(false)
              }}
              className="text-muted-foreground min-h-11 py-2.5 sm:min-h-0 sm:py-1.5"
            >
              <Check className={chosen ? "opacity-0" : "opacity-100"} />
              {emptyOption.label}
            </CommandItem>
          )}
          {rows.map(row)}
        </CommandGroup>
      </CommandList>
    </Command>
  )

  const trigger = (
    <Button
      id={id}
      aria-label={ariaLabel}
      type="button"
      variant="secondary"
      role="combobox"
      aria-expanded={open}
      disabled={disabled}
      // Square, not pill: this is a form control sitting in a column of inputs,
      // and the library's own Select trigger is the shape a person reads as one.
      className="min-h-9 min-w-0 flex-1 justify-between rounded-xl px-3 font-normal"
    >
      <span className={chosen ? "truncate" : "text-muted-foreground truncate"} title={label}>
        {label}
      </span>
      <ChevronsUpDown className="opacity-50" />
    </Button>
  )

  return (
    <div className={className ? `flex items-center gap-1 ${className}` : "flex w-full items-center gap-1"}>
      {phone ? (
        <>
          <div className="flex min-w-0 flex-1" onClick={() => !disabled && setOpen(true)}>
            {trigger}
          </div>
          <Sheet open={open} onOpenChange={setOpen}>
            {/* 85dvh from the BOTTOM: the top edge lands near the top of the
                screen, which is the one band a software keyboard never covers,
                and the search box is pinned there. `dvh` because a phone's
                address bar is the difference between "pinned" and "off screen". */}
            <SheetContent
              side="bottom"
              className="flex h-[85dvh] flex-col gap-0 rounded-t-xl p-0"
            >
              <SheetTitle className="sr-only">{searchPlaceholder}</SheetTitle>
              {list}
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <Popover
          open={open}
          onOpenChange={setOpen}
          // ALWAYS MODAL, both because it must be and because it should be.
          // Must: a picker usually lives in a form DIALOG, whose scroll lock
          // preventDefaults wheel and touch on everything outside its own
          // subtree — and a portaled popover is outside it, so without this the
          // list opens and will not scroll (popover.tsx says so in its header).
          // Should: on an ordinary page this is the behaviour of the control it
          // replaces — Radix `Select` blocks outside pointer events too — and a
          // picker closes the moment you choose, so nothing is trapped for long.
          modal
        >
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[var(--radix-popover-trigger-width)] p-0"
          >
            {list}
          </PopoverContent>
        </Popover>
      )}
      {clearable && chosen && !disabled && (
        // A SIBLING of the trigger, never nested inside it: Button's base class
        // carries `[&_svg]:pointer-events-none`, so an X drawn inside the trigger
        // is invisible to hit-testing and the click just opens the list.
        <button
          type="button"
          aria-label={t("Clear")}
          onClick={clear}
          className="text-muted-foreground hover:text-foreground size-9 shrink-0 rounded-full"
        >
          <X className="mx-auto size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}

/** WHAT A SERVER-SEARCHED LIST SAYS WHEN IT HAS NO ROWS, and why it is three
 * sentences rather than one. "Nothing matched" is a claim about a collection,
 * and it is only true once the door has answered: said while the request is in
 * flight it is a confident wrong answer, which is exactly the failure this whole
 * component was written for. So an unanswered list says it is looking, a failed
 * one says it failed, and only an answered, empty one says nothing matched. */
function ServerRows({
  loading,
  error,
  count,
  emptyText,
}: {
  loading: boolean
  error: boolean
  count: number
  emptyText: string
}) {
  const t = useT()
  // Rows on screen say everything these sentences would. Checked FIRST so a
  // background refetch over a list somebody is already reading is silent.
  if (count > 0) return null
  if (loading)
    return (
      <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
        <Spinner size="sm" />
        {t("Searching…")}
      </div>
    )
  if (error)
    return (
      <div className="text-muted-foreground py-6 text-center text-sm">
        {t("Couldn't search just now. Try again.")}
      </div>
    )
  return <div className="text-muted-foreground py-6 text-center text-sm">{emptyText}</div>
}
