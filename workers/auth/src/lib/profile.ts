// Onboarding / profile updates: first name, last name, optional photo.
// Photos arrive as a data URL (the web app downsizes them first), land in R2,
// and are served by the gateway at /media/users/<id>/<random> — a capability
// URL: the door checks no session, so the KEY has to be unguessable (mediaKey).

import {
  dataUrlBytes,
  MAX_IMAGE_BYTES,
  mediaKey,
  ownedMediaKey,
  parseDataUrl,
  reclaimMedia,
} from "../../../../shared/workers/image"
import { publishChange, publishUserChange } from "../../../../shared/workers/realtime"
import type { Env } from "../env"
import { logAccountActivity } from "./account-activity"
import { toSessionUser, type UserRow } from "./users"

const MAX_NAME_LENGTH = 60

export type ProfileInput = {
  firstName?: string
  lastName?: string
  imageDataUrl?: string
}

export async function updateProfile(
  env: Env,
  user: UserRow,
  input: ProfileInput
): Promise<{ user: ReturnType<typeof toSessionUser> } | { error: string; message: string }> {
  const firstName = (input.firstName ?? "").trim()
  const lastName = (input.lastName ?? "").trim()
  if (!firstName || !lastName)
    return { error: "name_required", message: "First and last name are required." }
  if (firstName.length > MAX_NAME_LENGTH || lastName.length > MAX_NAME_LENGTH)
    return { error: "name_too_long", message: "That name is too long." }

  let imageUrl = user.image_url
  // The key this row points at NOW, read BEFORE anything moves. Every upload
  // mints a NEW key, so once the row moves the old object is unreachable by
  // anything except this variable — read it late and it is already an orphan.
  // Proved to be THIS person's own photo from THEIR id (ownedMediaKey), never
  // from a string a caller handed us.
  let supersededKey: string | null = null
  if (input.imageDataUrl) {
    // SIZE FIRST, and from the ENCODED text (dataUrlBytes) — this door is on the
    // client portal's allow-list and gates on the session alone, so the one thing
    // it must not do is decode a stranger's payload to find out how big it is.
    // parseDataUrl caps too; measuring here is what lets the answer say WHICH
    // refusal it is.
    if (dataUrlBytes(input.imageDataUrl) > MAX_IMAGE_BYTES)
      return { error: "image_too_large", message: "That image is too large." }
    const parsed = parseDataUrl(input.imageDataUrl)
    if (!parsed)
      return { error: "bad_image", message: "That image format isn't supported." }

    // A NEW key each time: the photo's URL is the only way to reach it, and the
    // old one keeps working for anything still holding it (the stored image_url
    // moves on). `users/<id>` alone was derivable by anyone who had seen the id.
    supersededKey = ownedMediaKey(user.image_url, "/media/", "users", user.id)
    const key = mediaKey("users", user.id)
    await env.MEDIA.put(key, parsed.bytes, {
      httpMetadata: { contentType: parsed.contentType },
    })
    // ?v= busts caches when the photo changes; the gateway ignores the query.
    imageUrl = `/media/${key}?v=${Date.now()}`
  }

  // Snapshot what actually changed, BEFORE the write, so we only log real edits
  // (not the initial onboarding fill-in, where there's nothing to "change").
  const wasOnboarded = user.onboarding_completed_at != null
  const nameChanged =
    firstName !== (user.first_name ?? "") || lastName !== (user.last_name ?? "")
  const photoChanged = Boolean(input.imageDataUrl)

  const now = new Date().toISOString()
  await env.DB.prepare(
    `UPDATE users SET
       first_name = ?, last_name = ?, image_url = ?,
       onboarding_completed_at = COALESCE(onboarding_completed_at, ?),
       updated_at = ?
     WHERE id = ?`
  )
    .bind(firstName, lastName, imageUrl, now, now, user.id)
    .run()

  // THE ROW HAS MOVED — now reclaim the photo it no longer points at. Every
  // changed photo used to leak its predecessor into the bucket forever. After,
  // and fail-soft, on purpose: see reclaimMedia.
  await reclaimMedia(env.MEDIA, [supersededKey], {
    db: env.DB,
    source: "auth",
    place: "POST /api/auth/profile — photo reclaim",
  })

  // Account-activity (best-effort): record name / photo edits to the person's
  // own history. Only once they're past onboarding — the first fill-in isn't a
  // "change". Email changes are logged in the email-change flow.
  if (wasOnboarded) {
    if (nameChanged)
      await logAccountActivity(env, user.id, {
        type: "name_changed",
        description: `Changed your name to ${firstName} ${lastName}`,
      })
    if (photoChanged)
      await logAccountActivity(env, user.id, {
        type: "photo_changed",
        description: "Updated your profile photo",
      })
  }

  // Identity fan-out (decision D): name/photo is read FRESH from this one global
  // users row everywhere it's shown, so one edit must live-update the person in
  // every place at once. Best-effort:
  //   • their OWN devices refresh their identity (profile event → re-pull me);
  //   • every team they're in re-pulls their member row, so OTHER members see the
  //     new name/photo (a row-level "members" edit on each team's channel).
  if (nameChanged || photoChanged) {
    await publishUserChange(env, user.id, "profile", user.id, "edit")
    const teams = await env.DB.prepare(
      "SELECT team_id FROM team_members WHERE user_id = ? AND deactivated_at IS NULL"
    )
      .bind(user.id)
      .all<{ team_id: string }>()
    for (const t of teams.results ?? [])
      await publishChange(env, t.team_id, "members", user.id, "edit")
  }

  const updated = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(user.id)
    .first<UserRow>()
  return { user: toSessionUser(updated as UserRow) }
}
