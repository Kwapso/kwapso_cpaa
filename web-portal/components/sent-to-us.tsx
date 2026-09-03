"use client"

// WHAT YOU'VE SENT US — the to-dos this company has already completed, and the
// documents they attached to them.
//
// THE OWNER RULED ON THIS DIRECTLY ("yes they can see it ofc!"), and the bug
// underneath it was worse than a missing screen. `completeTodo` writes
// `file_url` and `completed_at` in the SAME UPDATE, so a to-do carries a
// client's document if and only if it is completed — and every to-do list on
// both front doors filtered the completed out. A contact pressed "Send a file",
// the bytes went into the bucket, the row was correct, and the item vanished
// from the only screen that had ever shown it. The last time they saw the
// contract they had just sent us was the moment before they sent it.
//
// It renders NOTHING when the pile is empty, exactly as "Awaiting your input"
// above it does, and for the same reason: most people will land here with
// nothing in it, and a card congratulating them on that is a card they learn to
// scroll past.
//
// THE FILE IS THEIRS AND THE FENCE ALREADY PERMITS IT. `postCompleteTodo` writes
// to `env.MEDIA` — the shared bucket this gateway binds and serves at `/media/*`
// with the same key validation the agency door uses — not to the agency's own
// `/media/internal/`. So reading it back is the account fence answering yes, not
// a hole being opened.

import { Button } from "@shared/ui/components/button/button"
import { Spinner } from "@shared/ui/components/spinner/spinner"
import { fileTypeIcon } from "@shared/web/screen-engine/file-type-icon"

import { formatDate } from "@shared/web/format"
import { safeHref } from "@shared/web/rich-text"
import { CollectionHeading } from "@/components/collection-heading"
import { usePortalTodos } from "@/lib/todos"
import { useLanguage } from "@shared/web/language"

export function SentToUs() {
  const { t, lang } = useLanguage()
  const { todos, total, hasMore, loadingMore, loadMore } = usePortalTodos("done")
  const rows = todos ?? []
  if (rows.length === 0) return null

  return (
    <section className="flex flex-col gap-4">
      {/* R16: the server's exact count for the WHOLE pile, once — not the length
          of the page in front of us, which is what "Load more" keeps changing. */}
      <CollectionHeading label={t("What you've sent us")} total={total} />
      <ul className="flex flex-col gap-2">
        {rows.map((todo) => {
          // Through `safeHref` like every other file on a screen, even though
          // this path is one THIS app minted (/media/…): the seam decides, not
          // the origin of the string. A URL it refuses prints as plain text.
          const fileLink = safeHref(todo.fileUrl)
          const FileGlyph = fileTypeIcon(todo.fileName)
          return (
            <li key={todo.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] bg-surface-panel p-4">
              <div className="min-w-0">
                <p className="font-medium">{todo.title}</p>
                <p className="text-muted-foreground text-sm">
                  {/* A whole sentence with a hole, never a word joined to a
                      date — see the same note in web/components/work-panels.tsx.
                      `completedAt` is set on every row this view can return: it
                      is what puts the row in this view. */}
                  {todo.completedAt ? t("Sent {date}", { date: formatDate(todo.completedAt, lang) }) : null}
                  {todo.ref ? ` · ${todo.ref}` : ""}
                </p>
              </div>
              {todo.fileName ? (
                fileLink ? (
                  <a
                    href={fileLink}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary flex shrink-0 items-center gap-1 text-sm underline-offset-2 hover:underline"
                  >
                    <FileGlyph className="size-3.5" />
                    {todo.fileName}
                  </a>
                ) : (
                  <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-sm">
                    <FileGlyph className="size-3.5" />
                    {todo.fileName}
                  </span>
                )
              ) : null}
            </li>
          )
        })}
      </ul>
      {/* R14: the done pile only grows — a client three years in has every
          document they have ever sent us behind this button. */}
      {hasMore ? (
        <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
          {loadingMore ? <Spinner /> : null}
          {t("Show older")}
        </Button>
      ) : null}
    </section>
  )
}
