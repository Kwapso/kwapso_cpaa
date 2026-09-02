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
} from "@shared/workers/image"
import { publishChange, publishUserChange } from "@shared/workers/realtime"
import type { Env } from "../env"
import { logAccountActivity } from "./account-activity"
import { toSessionUser, type UserRow } from "./users"

const MAX_NAME_LENGTH = 60

/** Already validated at the door (index.ts). Kept as strings rather than
 * `unknown` so this file can read them plainly — the door is where the proof
 * happens, and R20's scan can see it there. */
export type ProfileInput = {
  firstName?: string
  lastName?: string
  imageDataUrl?: string
}

/** SET THE LANGUAGE THIS PERSON READS kwapso IN.
 *
 * Its own function, and its own door, rather than a fourth field on the profile
 * form above. Two reasons, and both are about failure rather than tidiness:
 *
 *   • `updateProfile` REFUSES without a first and last name. A person choosing
 *     Spanish has not asked to be told their name is missing, and a half-
 *     onboarded person would be unable to change language at all.
 *   • Riding on the profile form would mean the switcher posts the name back
 *     alongside the language. With two tabs open that is a lost update: the tab
 *     that switched language would quietly restore whatever name it loaded with.
 *
 * `language` is already proven to be one of LANGUAGES at the door (R20), so this
 * writes it plainly. The publish is the same identity fan-out a name change
 * makes: the person's OTHER devices re-pull `me` and re-render in the new
 * language without a reload. Nobody else's screen changes, because nobody else
 * reads it. */
export async function setLanguage(
  env: Env,
  user: UserRow,
  language: string
): Promise<{ user: ReturnType<typeof toSessionUser> }> {
  // R17: the current-language predicate rides the UPDATE. Choosing the language
  // you already read in moves zero rows, so it writes no history and sends no
  // ping — a switcher somebody clicks twice is silent the second time.
  const result = await env.DB.prepare(
    "UPDATE users SET language = ?, updated_at = ? WHERE id = ? AND COALESCE(language, '') <> ?"
  )
    .bind(language, new Date().toISOString(), user.id, language)
    .run()

  if (result.meta.changes > 0)
    await publishUserChange(env, user.id, "profile", user.id, "edit")

  const updated = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(user.id)
    .first<UserRow>()
  return { user: toSessionUser(updated as UserRow) }
}

/** HOW BIG THIS PERSON WANTS THE APP. The twin of `setLanguage` above, and it
 * keeps the same two promises: R17's predicate rides the UPDATE, so choosing the
 * size you already read at moves zero rows and sends no ping; and the publish is
 * the identity fan-out, so the person's OTHER devices re-pull `me` and re-render
 * at the new size without a reload. Nobody else's screen changes, because nobody
 * else reads it. `scale` is already proven to be one of SCALE_STEPS at the door
 * (R20), so this writes it plainly. */
export async function setScale(
  env: Env,
  user: UserRow,
  scale: string
): Promise<{ user: ReturnType<typeof toSessionUser> }> {
  const result = await env.DB.prepare(
    "UPDATE users SET scale = ?, updated_at = ? WHERE id = ? AND COALESCE(scale, '') <> ?"
  )
    .bind(scale, new Date().toISOString(), user.id, scale)
    .run()

  if (result.meta.changes > 0)
    await publishUserChange(env, user.id, "profile", user.id, "edit")

  const updated = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(user.id)
    .first<UserRow>()
  return { user: toSessionUser(updated as UserRow) }
}

/** WHICH SPINE THIS PERSON WANTS THE SIDEBAR PAINTED IN. The same twin shape
 * as `setScale`, one field along: R17's predicate rides the UPDATE, so
 * choosing the spine you already have moves zero rows and sends no ping; and
 * the publish is the identity fan-out, so the person's OTHER devices re-pull
 * `me` and re-paint the rail without a reload. Nobody else's screen changes,
 * because nobody else reads it. `spine` is already proven to be one of
 * SPINE_VALUES at the door (R20), so this writes it plainly. */
export async function setSpine(
  env: Env,
  user: UserRow,
  spine: string
): Promise<{ user: ReturnType<typeof toSessionUser> }> {
  const result = await env.DB.prepare(
    "UPDATE users SET spine = ?, updated_at = ? WHERE id = ? AND COALESCE(spine, '') <> ?"
  )
    .bind(spine, new Date().toISOString(), user.id, spine)
    .run()

  if (result.meta.changes > 0)
    await publishUserChange(env, user.id, "profile", user.id, "edit")

  const updated = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(user.id)
    .first<UserRow>()
  return { user: toSessionUser(updated as UserRow) }
}

export async function updateProfile(
  env: Env,
  user: UserRow,
  input: ProfileInput
): Promise<{ user: ReturnType<typeof toSessionUser> } | { error: string; message: string }> {
  // DEFENSIVE, even though the door now validates first. `??` only substitutes
  // null/undefined, so `(1 ?? "").trim()` is a TypeError — a 500 and a row in the
  // GLOBAL error log, from any signed-in caller at either front door. The door is
  // where the clean 400 is decided; this is what stops the CLASS coming back
  // through the next caller of an exported lib, which is exactly how the field
  // escaped R20's scanner in the first place.
  const firstName = typeof input.firstName === "string" ? input.firstName.trim() : ""
  const lastName = typeof input.lastName === "string" ? input.lastName.trim() : ""
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
  // A TYPE check, not a truthiness one, for the same reason as the names above:
  // `dataUrlBytes({})` reaches `.indexOf` on an object and throws.
  if (typeof input.imageDataUrl === "string" && input.imageDataUrl) {
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
  // The same type check the upload branch makes, so "a photo changed" can never
  // be true for a value that was never a photo.
  const photoChanged = typeof input.imageDataUrl === "string" && input.imageDataUrl !== ""

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
    place: "POST /api/auth/profile, photo reclaim",
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
