"use client"

// THE PERSON BEHIND THE MEMBER ROW — rendered under the member's own detail,
// which is where the owner asked for it: "they go on each member's own page,
// visible to the team, never to a client."
//
// It sits BELOW the member recipe rather than inside it as a tab, and that is a
// decision rather than a shortcut. A tab hides one of two things behind the
// other, and these two are read together: you look up a colleague to see who
// they are AND what they hold. The member's Overview and Activity tabs above
// stay exactly what they were — the team's record of the membership — and this
// is the record of the person.
//
// Both collections are gated on `staff_profiles`, so a role without that read
// right sees nothing here at all, and the member page it hangs off is unchanged.
// There is no client-facing counterpart anywhere: the module has no portal door.

import * as React from "react"

import { Badge } from "@shared/ui/registry/primitives/badge/badge"
import { Button } from "@shared/ui/registry/primitives/button/button"
import { Card, CardContent } from "@shared/ui/registry/primitives/card/card"
import { Skeleton } from "@shared/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@shared/ui/registry/primitives/sonner/sonner"
import { Pencil, Power } from "lucide-react"

import { CertificateFormDialog, type CertificateValues } from "@/components/certificate-form-dialog"
import { RecordActionsMenu } from "@/components/record-chrome"
import { StaffProfileDialog, type StaffProfileValues } from "@/components/staff-profile-dialog"
import { OverviewList } from "@/components/overview-list"
import { ApiFailure, content } from "@/lib/api"
import { staffCertificatesKey, staffProfilesKey, totalKey } from "@/lib/live-resources"
import { usePermissions } from "@/lib/perms"
import { RecordMark } from "@shared/web/record-mark"
import { formatCount } from "@shared/web/format-count"
import { formatDate } from "@shared/web/format"
import { safeHref } from "@shared/web/rich-text"
import { primeCache, useCached, useCachedValue } from "@shared/web/store"
import type { StaffCertificate, StaffProfile } from "@shared/types"
import { useT } from "@shared/web/language"
import { AddButton } from "@/components/deep-link/screen-bits"

export function StaffPanel({
  teamId,
  userId,
  memberName,
}: {
  teamId: string
  userId: string
  memberName: string
}) {
  const t = useT()
  const { can } = usePermissions(teamId)
  const mayRead = can("staff_profiles", "read")
  const mayWrite = can("staff_profiles", "edit")
  const mayAdd = can("staff_profiles", "create")
  const mayArchive = can("staff_profiles", "delete")

  // Both sets are read WHOLE and picked from here: one profile per member and a
  // handful of certificates each, so the team's entire set is smaller than one
  // page of tickets — and a panel that fetched per-member would re-fetch on
  // every colleague you clicked through to.
  const profilesQ = useCached<StaffProfile[]>(mayRead ? staffProfilesKey(teamId) : null, () =>
    content.staffProfiles().then((r) => {
      primeCache(totalKey("staff_profiles", teamId), r.total)
      return r.profiles
    })
  )
  const certsQ = useCached<StaffCertificate[]>(mayRead ? staffCertificatesKey(teamId) : null, () =>
    content.staffCertificates().then((r) => {
      primeCache(totalKey("staff_certificates", teamId), r.total)
      return r.certificates
    })
  )
  const teamCertTotal = useCachedValue<number>(mayRead ? totalKey("staff_certificates", teamId) : null)

  const [profileOpen, setProfileOpen] = React.useState(false)
  const [certOpen, setCertOpen] = React.useState(false)
  const [editingCert, setEditingCert] = React.useState<StaffCertificate | null>(null)

  if (!mayRead) return null
  if (profilesQ.data === undefined || certsQ.data === undefined) return <Skeleton variant="list" lines={3} />

  // The LIVE profile if there is one; otherwise the last one that was taken
  // down. Switching one off used to make it vanish from the only screen that
  // shows it, which would have made "deactivate" mean "lose" — and nothing here
  // is ever lost. (A member can hold both: saving after one has been switched
  // off writes a fresh row rather than reviving the old one, so the newest is
  // the one to show.)
  const forMember = profilesQ.data.filter((p) => p.userId === userId)
  const profile = forMember.find((p) => p.active) ?? forMember[forMember.length - 1] ?? null
  const certificates = certsQ.data.filter((c) => c.userId === userId)

  async function saveProfile(values: StaffProfileValues) {
    const { profiles } = await content.saveStaffProfile({ userId, ...values })
    primeCache(staffProfilesKey(teamId), profiles)
    toast.success(t("Profile saved."))
  }

  async function saveCertificate(values: CertificateValues) {
    const { certificates: next } = editingCert
      ? await content.updateStaffCertificate({ id: editingCert.id, ...values })
      : await content.createStaffCertificate({ userId, ...values })
    primeCache(staffCertificatesKey(teamId), next)
    toast.success(editingCert ? t("Certificate saved.") : t("Certificate recorded."))
  }

  /** SWITCH THE PROFILE OFF, or bring it back. A colleague who leaves keeps a
   * live profile until somebody says otherwise — the door has answered this
   * since the module shipped and no screen called it, so the only way to switch
   * one off was to ask the assistant. Nothing is deleted: what was written stays
   * written, and the panel reads it back the moment it comes on again. */
  async function setProfileActive(profile: StaffProfile, active: boolean) {
    try {
      const { profiles } = await content.setStaffProfileActive(profile.id, active)
      primeCache(staffProfilesKey(teamId), profiles)
      toast.success(active ? t("Profile activated.") : t("Profile deactivated."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't update the profile."))
    }
  }

  async function archiveCertificate(cert: StaffCertificate) {
    try {
      const { certificates: next } = await content.setStaffCertificateActive(cert.id, !cert.active)
      primeCache(staffCertificatesKey(teamId), next)
      toast.success(cert.active ? t("Archived.") : t("Restored."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't update the certificate."))
    }
  }

  // Only the fields that were actually filled in. A profile half written is the
  // normal state of one, and a wall of em-dashes reads as "we know nothing about
  // this person" rather than "nobody has written this bit yet".
  const profileItems = profile
    ? [
        { label: t("In one line"), value: profile.headline },
        { label: t("Personality type"), value: profile.personalityType },
        { label: t("Best at"), value: profile.strengths },
        { label: t("Finds hard"), value: profile.weaknesses },
        { label: t("Looks up to"), value: profile.roleModels },
        { label: t("More"), value: profile.about },
      ].filter((i): i is { label: string; value: string } => !!i.value)
    : []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-medium tracking-tight">
          {t("Profile")}
          {profile && !profile.active && (
            <Badge variant="outline" className="text-muted-foreground text-badge">
              {t("Inactive")}
            </Badge>
          )}
        </h2>
        {/* ml-auto on the GROUP so a narrow phone reflows instead of clipping. */}
        <div className="ml-auto flex flex-wrap gap-2">
          {mayWrite && (
            <Button variant="outline" size="sm" onClick={() => setProfileOpen(true)} className="gap-1">
              <Pencil className="size-3.5" />
              {profile?.active ? t("Edit profile") : t("Write a profile")}
            </Button>
          )}
          {/* WHEN SOMEBODY LEAVES. Red because it takes the profile out of the
              everyday picture, and reversible — which the confirm-free restore
              beside it says out loud. What was written stays written. */}
          {mayArchive &&
            profile &&
            (profile.active ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void setProfileActive(profile, false)}
                className="text-destructive hover:text-destructive gap-1"
              >
                <Power className="size-3.5" />
                {t("Deactivate profile")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void setProfileActive(profile, true)}
                className="gap-1"
              >
                <Power className="size-3.5" />
                {t("Activate profile")}
              </Button>
            ))}
        </div>
      </div>
      <Card>
        <CardContent className="flex items-start gap-4 p-4">
          {/* THE FACE. `photoUrl` is stored, edited and round-tripped through the
              form, and was rendered by nothing at all — on the one screen in the
              app whose whole subject is a person. A circle, because a person is
              (shared/web/record-mark.tsx), and it stands whether or not there is
              a photo, so the row does not reflow the day somebody adds one. */}
          <RecordMark picture={profile?.photoUrl} name={memberName} shape="round" />
          <div className="min-w-0 flex-1">
            {profileItems.length > 0 ? (
              <OverviewList items={profileItems} />
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("Nothing written about")} {memberName} {t("yet. The team can read what goes here; no client ever can.")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-medium tracking-tight">
          {t("Certificates")}
          {/* R16: the number is the door's exact total through the ONE seam. This
              one counts the TEAM's register, which is what the door counts — a
              per-person figure would need its own COUNT(*) and this panel is not
              where somebody comes to ask it. */}
          {formatCount(teamCertTotal) ? (
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
              {formatCount(teamCertTotal)}
            </span>
          ) : null}
        </h2>
        {mayAdd && (
          <AddButton
            label={t("Record one")}
            onClick={() => {
              setEditingCert(null)
              setCertOpen(true)
            }}
          />
        )}
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          {certificates.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("Nothing recorded for")} {memberName} {t("yet.")}</p>
          ) : (
            certificates.map((c) => {
              const link = safeHref(c.fileUrl)
              return (
                <div key={c.id} className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          {c.title}
                        </a>
                      ) : (
                        c.title
                      )}
                      {!c.active && (
                        <Badge variant="outline" className="text-muted-foreground text-badge">
                          {t("Archived")}
                        </Badge>
                      )}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {[
                        c.issuer,
                        c.issuedOn ? `${t("granted")} ${formatDate(c.issuedOn)}` : null,
                        c.expiresOn ? `${t("lapses")} ${formatDate(c.expiresOn)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || t("No details recorded")}
                    </p>
                  </div>
                  {/* THE TWO ACTIONS, IN THE ROW'S OWN MENU (B2, N4). The row was
                      the certificate's name, its state, three details and two
                      labelled buttons — five units, and the buttons made it a
                      row of facts and actions interleaved. The facts stay on the
                      left where they read as a title and a meta line; the
                      actions live in one trigger on the right. */}
                  <RecordActionsMenu
                    tone="row"
                    actions={[
                      ...(mayWrite
                        ? [
                            {
                              key: "edit",
                              label: t("Edit"),
                              icon: <Pencil className="size-3.5" />,
                              onSelect: () => {
                                setEditingCert(c)
                                setCertOpen(true)
                              },
                            },
                          ]
                        : []),
                      ...(mayArchive
                        ? [
                            {
                              key: c.active ? "archive" : "restore",
                              label: c.active ? t("Archive") : t("Restore"),
                              icon: <Power className="size-3.5" />,
                              destructive: c.active,
                              onSelect: () => void archiveCertificate(c),
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <StaffProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        draftKey={`staff-profile:${userId}`}
        subjectName={memberName}
        initial={
          // A SWITCHED-OFF profile does not prefill the form: writing after one
          // has been deactivated starts a fresh record (the door writes a new row
          // rather than reviving the old one), and Activate beside it is the way
          // to get the old words back. Two buttons, two meanings.
          profile?.active
            ? {
                headline: profile.headline ?? "",
                personalityType: profile.personalityType ?? "",
                strengths: profile.strengths ?? "",
                weaknesses: profile.weaknesses ?? "",
                roleModels: profile.roleModels ?? "",
                about: profile.about ?? "",
                photoUrl: profile.photoUrl ?? "",
              }
            : undefined
        }
        onSubmit={saveProfile}
      />
      <CertificateFormDialog
        open={certOpen}
        onOpenChange={setCertOpen}
        draftKey={`certificate:${editingCert?.id ?? "new"}:${userId}`}
        subjectName={memberName}
        initial={
          editingCert
            ? {
                title: editingCert.title,
                issuer: editingCert.issuer ?? "",
                issuedOn: editingCert.issuedOn ?? "",
                expiresOn: editingCert.expiresOn ?? "",
                fileUrl: editingCert.fileUrl ?? "",
              }
            : undefined
        }
        onSubmit={saveCertificate}
      />
    </div>
  )
}
