"use client"

// THE THREE COLLECTION TABS of the account record — the people linked to it, the
// accounts sitting under it, and who can sign in to it.
//
// They live beside account-detail.tsx rather than inside it because they are the
// part of that screen that GREW: one 611-line function with seventeen hooks, in
// which three list bodies, their empty states, their per-row actions and their
// confirms were interleaved with the record's own header, dialogs and data
// reads. Each of these is one list, one question.
//
// They own no data and no permissions of their own. Everything they need is
// handed in — the rows the host already fetched, the rights it already resolved,
// and the two verbs below. The host stays the only thing that knows how to read
// or write an account, which is what keeps the record's tabs (R2/R8) and its
// counts (R16) in one place.

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Ban, ChevronRight, KeyRound, Plus, Power, UserMinus } from "lucide-react"

import type { Account, AccountDetail } from "@shared/types"
import { LoadMore } from "@/components/load-more"
import { ACCOUNT_TYPE } from "@/components/deep-link/shape"
import { tenancy } from "@/lib/api"
import { formatDate } from "@shared/web/format"
import { childrenKey } from "@/lib/live-resources"
import { useT } from "@shared/web/language"

/** A destructive action waiting for a yes. One dialog in the host serves all of
 * them — they differ only in their words and what they run. `run` answers
 * whether it worked, so a refusal leaves the dialog open beside the message
 * rather than closing as if it had happened. */
export type Confirm = { title: string; body: string; action: string; run: () => Promise<boolean> }

/** The two verbs a panel borrows from the host: put a question in front of the
 * person, and do a thing (telling them plainly if it was refused). */
export type PanelActions = {
  busy: boolean
  ask: (c: Confirm) => void
  act: (what: () => Promise<unknown>, done: string, fallback: string) => Promise<boolean>
}

/** A row in one of these lists: bordered, and visibly faded when it is switched
 * off. Every list here shows inactive rows rather than hiding them — nothing in
 * this app is deleted, so "not a contact now" is a state, not an absence. */
function Row({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <li
      className={`border-border/60 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
        active ? "" : "opacity-60"
      }`}
    >
      {children}
    </li>
  )
}

/** The people attached to this account. Adding one is a link, never a new
 * person; removing one says they are no longer a contact HERE — they keep
 * everything else they are attached to. */
export function ContactsPanel({
  accountName,
  links,
  canCreate,
  canArchive,
  actions: { busy, ask, act },
  onAdd,
  onOpen,
}: {
  accountName: string
  links: AccountDetail["links"]
  canCreate: boolean
  canArchive: boolean
  actions: PanelActions
  onAdd: () => void
  onOpen: (accountId: string) => void
}) {
  const t = useT()
  return (
    <div className="flex flex-col gap-3">
      {canCreate && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" onClick={onAdd} className="gap-1.5">
            <Plus className="size-4" />
            {t("Add contact")}
          </Button>
        </div>
      )}
      {links.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("No contacts yet.")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {links.map((l) => (
            <Row key={l.id} active={l.active}>
              <button
                type="button"
                onClick={() => onOpen(l.personAccountId)}
                className="hover:text-primary min-w-0 flex-1 truncate text-left text-sm underline-offset-2 hover:underline"
              >
                {l.personName}
              </button>
              {l.relationship && (
                <span className="text-muted-foreground text-xs">{l.relationship}</span>
              )}
              {l.isMainStakeholder && (
                <Badge variant="secondary" className="text-[10px]">
                  {t("Main contact")}
                </Badge>
              )}
              {!l.active && <span className="text-muted-foreground text-xs">{t("Not a contact now")}</span>}
              {canArchive &&
                (l.active ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      ask({
                        title: `Remove ${l.personName} from ${accountName}?`,
                        body: "They stay in your accounts, with everything they're attached to. You're only saying they're no longer a contact here.",
                        action: "Remove contact",
                        run: () =>
                          act(
                            () => tenancy.setLinkActive(l.id, false),
                            "Contact removed.",
                            "Couldn't remove that contact."
                          ),
                      })
                    }
                    className="text-destructive hover:text-destructive gap-1.5"
                    aria-label={`Remove ${l.personName}`}
                  >
                    <UserMinus className="size-3.5" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => tenancy.setLinkActive(l.id, true),
                        "Contact added back.",
                        "Couldn't add that contact back."
                      )
                    }
                    className="gap-1.5"
                    aria-label={`Add ${l.personName} back`}
                  >
                    <Power className="size-3.5" /> {t("Add back")}
                  </Button>
                ))}
            </Row>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The accounts sitting under this one. R14: a holding company can hold more
 * than one page of businesses, and the tab badge counts all of them — so the
 * list under it must be able to reach all of them. */
export function ChildrenPanel({
  accountId,
  // Not `children`: that name belongs to JSX, and a list of records is not the
  // content between the tags.
  accounts,
  onOpen,
}: {
  accountId: string
  accounts: Account[]
  onOpen: (accountId: string) => void
}) {
  const t = useT()
  return (
    <div className="flex flex-col gap-3">
      {accounts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("Nothing sits under this account yet.")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {accounts.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onOpen(c.id)}
                className={`border-border/60 hover:bg-muted/50 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                  c.active ? "" : "opacity-60"
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                <span className="text-muted-foreground text-xs">
                  {ACCOUNT_TYPE[c.accountType]}
                </span>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <LoadMore
        listKey={childrenKey(accountId)}
        label={t("Load more accounts")}
        fetchPage={(c: string) =>
          tenancy
            .accounts({ parentId: accountId, cursor: c })
            .then((r) => ({ rows: r.accounts, nextCursor: r.nextCursor }))
        }
      />
    </div>
  )
}

/** The login switch. Only rendered for someone who may see logins at all — the
 * host hides the tab itself otherwise. Taking access away never removes anyone:
 * their records and their history stay exactly where they are. */
export function PortalAccessPanel({
  portalUsers,
  canGrant,
  canRevoke,
  actions: { busy, ask, act },
  onGrant,
}: {
  portalUsers: AccountDetail["portalUsers"]
  canGrant: boolean
  canRevoke: boolean
  actions: PanelActions
  onGrant: () => void
}) {
  const t = useT()
  return (
    <div className="flex flex-col gap-3">
      {canGrant && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" onClick={onGrant} className="gap-1.5">
            <KeyRound className="size-4" />
            {t("Give access")}
          </Button>
        </div>
      )}
      {portalUsers.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("Nobody here can sign in yet. Give access to someone and they'll see this account's own work.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {portalUsers.map((p) => (
            <Row key={p.id} active={p.active}>
              <span className="min-w-0 flex-1 truncate text-sm">
                {p.email ?? "Someone with a login"}
              </span>
              <span className="text-muted-foreground text-xs">
                {p.active ? "Can sign in" : "Access taken away"}
                {p.grantedByName ? ` · by ${p.grantedByName}` : ""}
                {p.grantedAt ? ` · ${formatDate(p.grantedAt)}` : ""}
              </span>
              {canRevoke &&
                (p.active ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      ask({
                        title: t("Take this login away?"),
                        body: "They won't be able to sign in any more. Everything they're attached to — their records, their history — stays exactly where it is, and you can switch it back on later.",
                        action: "Take access away",
                        run: () =>
                          act(
                            () => tenancy.setPortalAccessActive(p.id, false),
                            "Access taken away.",
                            "Couldn't change that login."
                          ),
                      })
                    }
                    className="text-destructive hover:text-destructive gap-1.5"
                    aria-label={t("Take access away")}
                  >
                    <Ban className="size-3.5" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => tenancy.setPortalAccessActive(p.id, true),
                        "Access switched back on.",
                        "Couldn't change that login."
                      )
                    }
                    className="gap-1.5"
                    aria-label={t("Switch access back on")}
                  >
                    <Power className="size-3.5" /> {t("Switch back on")}
                  </Button>
                ))}
            </Row>
          ))}
        </ul>
      )}
    </div>
  )
}
