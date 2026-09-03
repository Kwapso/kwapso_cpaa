"use client"

// WAITING ON YOU — the to-dos we have asked this company for, and the two things
// a contact does about one: mark it done, and send the file we asked for
// (SCOPE ch.06, two of the six things a contact can do).
//
// IT SITS ON HOME, above their own requests, and the order is the argument. The
// first question a client's screen should answer is "is anyone waiting on ME",
// because that is the one they can do something about in the next minute. Their
// own tickets are the second question: those are waiting on us.
//
// WHEN THE LIST IS GENUINELY EMPTY, it renders NOTHING — not an empty card
// saying "no outstanding items". Most people will land here with nothing
// outstanding, and a panel congratulating them on it is a panel they learn to
// scroll past, which is how the day it DOES have something in it gets missed.
//
// BUT THAT IS ONLY TRUE ONCE THE ANSWER IS IN. This used to check emptiness
// before loading or error at all, so a client with real outstanding items saw
// nothing for the length of the request — indistinguishable from "you're all
// caught up" — and forever if the fetch failed. Loading and error are handled
// first now, and each says its own honest thing before the empty case ever
// gets asked.

import * as React from "react"

import { Button } from "@shared/ui/components/button/button"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { Spinner } from "@shared/ui/components/spinner/spinner"
import { toast } from "@shared/ui/components/sonner/sonner"
import { Check, Paperclip } from "@shared/ui/foundations/icons"

import { readFileAsDataUrl } from "@shared/web/file"
import { formatDate } from "@shared/web/format"
import { invalidate } from "@shared/web/store"
import { ApiFailure, delivery } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"
import { usePortalTodos } from "@/lib/todos"
import { ErrorPanel } from "@/components/error-panel"
import { useLanguage } from "@shared/web/language"
import { RichText } from "@shared/web/rich-text-view"

/** What a browser will turn into a data URL for us. Generous for a logo or a
 * signed PDF; the door caps it again at 10 MB, which is the cap that counts. */
const MAX_FILE_BYTES = 10 * 1024 * 1024

export function WaitingOnYou() {
  const { t, lang } = useLanguage()
  // THE DOOR ANSWERS THE NARROWER QUESTION NOW, and that is not a tidy-up.
  // This used to fetch the to-do list and keep the rows with no `completedAt`,
  // which was honest while the door handed back every row it had. The list PAGES
  // now (R14), so a filter here would be a filter over page one — quietly
  // answering "nothing outstanding" about everything past the cursor.
  const { todos, loading, error, refresh, hasMore, loadingMore, loadMore } = usePortalTodos("open")
  const [busy, setBusy] = React.useState<string | null>(null)
  const pickers = React.useRef<Record<string, HTMLInputElement | null>>({})

  // LOADING AND ERROR, BEFORE EMPTINESS. This used to check `open.length === 0`
  // first and return nothing at all — which reads as "you're all caught up"
  // whether that's true, still loading, or the read just failed. A client with
  // real outstanding items deserves to see that something is coming (or that it
  // didn't), not the same silence as having nothing outstanding.
  if (error && !todos)
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">{t("Awaiting your input")}</h2>
        <ErrorPanel
          title={t("We couldn't check what's waiting on you.")}
          description={t("Check your connection and try again.")}
          onRetry={refresh}
        />
      </section>
    )
  if (loading && !todos)
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">{t("Awaiting your input")}</h2>
        <Skeleton className="h-20 w-full rounded-[var(--radius)]" />
      </section>
    )

  const open = todos ?? []
  if (open.length === 0) return null

  async function complete(id: string, file?: File) {
    setBusy(id)
    try {
      if (file && file.size > MAX_FILE_BYTES) {
        toast.error(t("That file is too big, 10 MB is the most we can take."))
        return
      }
      const attachment = file ? { dataUrl: await readFileAsDataUrl(file), name: file.name } : undefined
      await delivery.completeTodo(id, attachment)
      // BOTH LISTS MOVE: the item leaves this one and joins "What you've sent
      // us" below, with the file on it. Their counts go with them (R16).
      invalidate(cacheKeys.todos)
      invalidate(cacheKeys.todosTotal)
      invalidate(cacheKeys.todosDone)
      invalidate(cacheKeys.todosDoneTotal)
      toast.success(t("Thank you, that's off your list."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't mark that done."))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">{t("Awaiting your input")}</h2>
      {/* THIS ONE STAYS HAND-ROLLED, and the kit's `List` was tried and reverted.
       *
       * A `ListRow` is a title, a quiet line, and ONE action pinned to the
       * inline end of a row that does not wrap. This row has two full-width
       * actions ("Send a file" and "Done") plus a rich-text detail, and at 375
       * the pinned pair leaves the words 55px — measured, in the walk, which is
       * why this is written down rather than remembered. `flex-wrap` here puts
       * the buttons on their own line instead, which is the only arrangement
       * that fits.
       *
       * Company contacts and the delivery block DID move to `List`: one action,
       * short meta, no wrap needed. */}
      <ul className="flex flex-col gap-2">
        {open.map((todo) => (
          <li key={todo.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] bg-surface-panel p-4">
            <div className="min-w-0">
              <p className="font-medium">{todo.title}</p>
              {todo.detail && <RichText html={todo.detail} className="text-muted-foreground" />}
              <p className="text-muted-foreground text-sm">
                {todo.dueOn ? `By ${formatDate(todo.dueOn, lang)}` : t("No date on it")}
                {todo.ref ? ` · ${todo.ref}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {/* The file picker is hidden and driven by the button beside it —
                  one visible control per action, and the same control both
                  attaches and completes, because "send it" and "tick it" are one
                  act from where the client is standing. */}
              <input
                ref={(el) => {
                  pickers.current[todo.id] = el
                }}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) complete(todo.id, file)
                  e.target.value = ""
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                className="gap-1"
                disabled={busy === todo.id}
                onClick={() => pickers.current[todo.id]?.click()}
              >
                <Paperclip className="size-3.5" />
                {t("Send a file")}
              </Button>
              <Button size="sm" className="gap-1" disabled={busy === todo.id} onClick={() => complete(todo.id)}>
                <Check className="size-3.5" />
                {busy === todo.id ? t("Saving…") : t("Done")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {/* R14: the door pages, so this is how the rest is reached. Rare here —
          the open pile is short by nature — and present because "rare" is not
          "never", and a list that silently stops at fifty is the bug this whole
          lane is about. */}
      {hasMore ? (
        <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
          {loadingMore ? <Spinner /> : null}
          {t("Show older")}
        </Button>
      ) : null}
    </section>
  )
}
