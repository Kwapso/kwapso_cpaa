// Onboarding / profile updates: first name, last name, optional photo.
// Photos arrive as a data URL (the web app downsizes them first), land in R2,
// and are served by the gateway at /media/users/<id>/<random> — a capability
// URL: the door checks no session, so the KEY has to be unguessable (mediaKey).

import { logError } from "../../../../shared/workers/error-log"
import {
  dataUrlBytes,
  MAX_IMAGE_BYTES,
  mediaKey,
  parseDataUrl,
  safeMediaKey,
} from "../../../../shared/workers/image"
import { publishChange, publishUserChange } from "../../../../shared/workers/realtime"
import type { Env } from "../env"
import { logAccountActivity } from "./account-activity"
import { toSessionUser, type UserRow } from "./users"

const MAX_NAME_LENGTH = 60

/** The R2 key a stored photo URL points at — but ONLY when it is one THIS
 * person's profile wrote (`/media/users/<their own id>/<random>`).
 *
 * Everything else answers null and is left alone. A delete driven by a value
 * READ BACK OUT OF A ROW has to prove the object is ours before it reclaims it:
 * an empty column, a shape we never minted, an absolute URL, or — the one that
 * matters — a key under somebody else's prefix. The photo URL is a capability
 * (the /media door checks no session), so "the row said so" is not a good enough
 * reason to delete. The `?v=` cache-buster is stripped; safeMediaKey is the same
 * seam the serving door uses to decide what a key may even look like. */
function ownPhotoKey(imageUrl: string | null, userId: string): string | null {
  const path = (imageUrl ?? "").split("?")[0]
  const prefix = `/media/users/${userId}/`
  if (!path.startsWith(prefix)) return null
  return safeMediaKey(path.slice("/media/".length))
}

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
  /** The object the save is about to stop pointing at, read off the row BEFORE
   * anything is written — once the column moves on, nothing else in the system
   * remembers the old key and it can never be found again. */
  let replaced: string | null = null
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
    const key = mediaKey("users", user.id)
    await env.MEDIA.put(key, parsed.bytes, {
      httpMetadata: { contentType: parsed.contentType },
    })
    // …and because it is never overwritten in place, the object it REPLACES is
    // now unreachable and unowned. Nothing in this repo deleted an R2 object —
    // no cron, no lifecycle rule — so every save leaked up to MAX_IMAGE_BYTES,
    // for ever. Noted here and reclaimed below, after the row has moved.
    replaced = ownPhotoKey(user.image_url, user.id)
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

  // ONLY NOW. The row is what makes the new object the real one, so the old key
  // is reclaimed after the write succeeded and never before — a delete first,
  // then a failed write, would leave a person with no photo at all.
  //
  // FAIL SOFT, LOUDLY. A storage hiccup here must never turn a saved profile
  // into an error the person sees: their photo IS changed, and the worst case is
  // one object left behind — exactly what we had before, and no worse. It goes
  // through the one recording seam (ERROR-HANDLING.md) rather than being
  // swallowed, so a bucket that has started refusing deletes is visible.
  //
  // The one case this still leaves: two saves at the same instant both read the
  // same old key, and the loser's freshly written object is orphaned. That is
  // bounded by how many saves collide, not by how long the account lives, which
  // is the whole difference from what was here before.
  if (replaced)
    await env.MEDIA.delete(replaced).catch((e: unknown) =>
      logError(env.DB, {
        source: "auth",
        place: "profile/photo-cleanup",
        message: `could not reclaim ${replaced}: ${e instanceof Error ? e.message : String(e)}`,
        userId: user.id,
      })
    )

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
