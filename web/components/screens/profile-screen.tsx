"use client"

// YOUR OWN PAGE — who you are, how we reach you, what language you read kwapso
// in, and what you have done.
//
// WHY IT IS NOT A TAB ON SETTINGS ANY MORE. Everything on this screen is about a
// PERSON; everything left on Settings is about the APP (the tokens a machine
// holds, the Google account this deployment may act through, the invitations
// waiting for you to accept). A tester looking for "change my name" opened
// Settings, found a strip called Account / Teams / Access, and had to guess —
// which is the owner's own note, and the reason this is a destination of its own
// reached from the profile menu, where a person already looks for themselves.
//
// It carries no team scope at all. A profile, an email address and a reading
// language belong to the person and follow them into any team they are in, so
// this screen renders directly in the shell beside /home and /settings rather
// than under /t/<teamId>.

import * as React from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/ui/controls/avatar/avatar"
import { Button } from "@shared/ui/controls/button/button"
import { List } from "@shared/web/list-compat"
import { Skeleton } from "@shared/ui/controls/skeleton/skeleton"
import { ActivityFeed } from "@shared/ui/structures/activity-feed/activity-feed"
import { Mail } from "@shared/ui/icons"

import { EmailChangeDialog } from "@/components/email-change-dialog"
import { ProfileDialog } from "@/components/profile-dialog"
import { auth } from "@/lib/api"
import { formatDateTime } from "@shared/web/format"
import { LanguageSection } from "@shared/web/language-section"
import { personName, personInitials } from "@/lib/identity"
import { useCached } from "@shared/web/store"
import type { ActiveTeam } from "@/lib/use-active-team"
import { useT } from "@shared/web/language"

export function ProfileScreen({ active }: { active: ActiveTeam }) {
  const t = useT()
  const [editing, setEditing] = React.useState(false)
  const [changingEmail, setChangingEmail] = React.useState(false)
  const { user } = active
  // The same cache key Settings used to read this under, so a person who lands
  // here from either direction sees it already warm.
  const accountActivityQ = useCached("account-activity", () => auth.activity().then((r) => r.activity))

  const name = personName({ firstName: user?.firstName, lastName: user?.lastName }) || "You"

  return (
    <>
      <div className="flex w-full flex-col gap-12">
        <section className="motion-panel-in flex flex-col gap-4">
          <List
            surface="none"
            className="rounded-xl border"
            items={[
              {
                id: "profile",
                leading: (
                  <Avatar className="size-9">
                    {user?.imageUrl && <AvatarImage src={user.imageUrl} alt={name} />}
                    <AvatarFallback>{personInitials(user?.firstName, user?.lastName)}</AvatarFallback>
                  </Avatar>
                ),
                title: name,
                trailing: (
                  <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                    {t("Edit profile")}
                  </Button>
                ),
              },
              {
                id: "email",
                leading: (
                  <div className="text-muted-foreground flex size-9 items-center justify-center">
                    <Mail className="size-4" />
                  </div>
                ),
                title: user?.email,
                trailing: (
                  <Button variant="secondary" size="sm" onClick={() => setChangingEmail(true)}>
                    {t("Change email")}
                  </Button>
                ),
              },
            ]}
          />
        </section>

        {/* Below the name, above the history: language is a setting somebody
         * changes once and then forgets, but they have to be able to FIND it
         * while reading a language they do not understand — so it sits high, and
         * its own control shows the flags rather than hiding them. */}
        <LanguageSection save={(lang) => auth.setLanguage(lang)} />

        <section className="motion-panel-in flex flex-col gap-4">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {t("Account activity")}
          </h2>
          {accountActivityQ.error ? (
            <p className="text-destructive text-sm">{t("Couldn't load your activity.")}</p>
          ) : accountActivityQ.data === undefined ? (
            <Skeleton variant="list" lines={3} />
          ) : (
            <ActivityFeed
              reverse
              emptyLabel={t("No account activity yet.")}
              items={accountActivityQ.data.map((a) => ({
                id: a.id,
                description: a.description,
                time: formatDateTime(a.createdAt),
              }))}
            />
          )}
        </section>
      </div>

      <ProfileDialog open={editing} onOpenChange={setEditing} user={user} onSaved={active.refresh} />
      <EmailChangeDialog
        open={changingEmail}
        onOpenChange={setChangingEmail}
        currentEmail={user?.email ?? ""}
        onSaved={active.refresh}
      />
    </>
  )
}
