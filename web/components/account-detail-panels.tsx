"use client"

// THE COLLECTION TABS of the account record — the people linked to it, and who
// can sign in to it. There were three; "the accounts sitting under it" went on
// 17 Aug 2026, because it and the Contacts tab were answering the same question
// under two names (CHECKLIST 7.2).
//
// They live beside account-detail.tsx rather than inside it because they are the
// part of that screen that GREW: one 611-line function with seventeen hooks, in
// which the list bodies, their empty states, their per-row actions and their
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
import { Ban, KeyRound, Link2, Power, UserMinus } from "lucide-react"

import type { AccountDetail } from "@shared/types"
import { tenancy } from "@/lib/api"
import { formatDate } from "@shared/web/format"
import { useT } from "@shared/web/language"
import { AddButton } from "@/components/deep-link/screen-bits"

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
      className={`border-border/60 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${
        active ? "" : "opacity-60"
      }`}
    >
      {children}
    </li>
  )
}

/** The people attached to this account.
 *
 * TWO WAYS IN, AND BOTH EARN THEIR PLACE. New contact makes a person who did not
 * exist a minute ago; Add contact says someone we already hold is a contact here
 * too — which is the case a parent pointer cannot express, and the reason we do
 * not make somebody type a second Marta because the search missed the first.
 *
 * Until 18 Aug 2026 only the second existed, and the only way to make a person
 * at all was the Type selector on the account form. Taking that selector away
 * without this button would have left the search here pointed at a set nobody
 * could ever add to.
 *
 * Removing a contact says they are no longer a contact HERE — they keep
 * everything else they are attached to. */
export function ContactsPanel({
  accountName,
  links,
  canCreate,
  canCreatePerson,
  canArchive,
  actions: { busy, ask, act },
  onAdd,
  onNew,
  onOpen,
}: {
  accountName: string
  links: AccountDetail["links"]
  /** may LINK a person already on the books — `contacts:create` on its own. */
  canCreate: boolean
  /** may make a NEW one, which writes an accounts row as well as a link, so it
   * needs `accounts:create` too. The door decides either way (R10); this only
   * decides whether we offer a button that would come back a 403. */
  canCreatePerson: boolean
  canArchive: boolean
  actions: PanelActions
  onAdd: () => void
  onNew: () => void
  onOpen: (accountId: string) => void
}) {
  const t = useT()
  return (
    <div className="flex flex-col gap-3">
      {(canCreate || canCreatePerson) && (
        <div className="flex flex-wrap justify-end gap-2">
          {/* Distinct glyphs on purpose: two icon-only buttons that both showed a
              plus would be one button drawn twice. Create keeps the Plus
              (UI-CONVENTIONS §4); linking gets the link. */}
          {canCreate && (
            <AddButton
              label={t("Add contact")}
              onClick={onAdd}
              icon={<Link2 className="size-4" />}
            />
          )}
          {canCreatePerson && <AddButton label={t("New contact")} onClick={onNew} />}
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
                        body: "They won't be able to sign in any more. Everything they're attached to, their records, their history, stays exactly where it is, and you can switch it back on later.",
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
