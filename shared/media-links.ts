// A LINK TO A VIDEO IS NOT A SOURCE — it is a link to one.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
//
// Every unreadable thing that ever reached this knowledge base failed the same
// way: it was ACCEPTED, stored, and quietly never read. 131 files of logo
// artwork went into the index that way. Every PDF in the base scored 0.000 on
// letter-shaped tokens that way. `image/*` has been opaque since the beginning
// that way. In none of those cases was the person told.
//
// A video link would have been the next one. So the owner ruled on 27 Aug 2026
// that it is REFUSED instead — and that the refusal carries the fix:
//
//   > it should warn the user that whenever we are trying to import something
//   > into the knowledge base and it's some kind of video or YouTube link, it
//   > gives a hint plus a text box to paste the transcript ourselves. Otherwise,
//   > it does not accept the source.
//
// So: readable, or refused with the remedy in hand. Never a row that looks
// filed and answers nothing.
//
// ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
//
// It is NOT a gate on a domain list, and the difference matters. Recognising a
// URL as video buys a better sentence and the transcript box; failing to
// recognise one is not permission to store something unreadable. The honest
// refusal is the floor and this is the courtesy on top of it.
//
// And it fetches NOTHING. There is no scrape here, on purpose: the owner ruled
// against depending on endpoints nobody promises us — not YouTube's `timedtext`,
// not Loom's `GetVideoSSR`. "No auth" is not "supported", and a silent break
// there means videos stop being readable with nobody noticing until somebody
// asks a question the video would have answered.
//
// Shared because BOTH sides need the same answer: the door refuses on it, and
// the form explains on it while somebody is still typing. Two copies of this
// list would be two answers to one question.

/** Hosts whose pages are a video player and nothing else we can read. Matched on
 * the registrable host, so `www.` and any subdomain are covered without a
 * wildcard that would also catch `notyoutube.com`. */
const VIDEO_HOSTS = [
  "youtube.com",
  "youtu.be",
  "loom.com",
  "vimeo.com",
  "wistia.com",
  "wistia.net",
  "vidyard.com",
  "dailymotion.com",
  "twitch.tv",
  "streamable.com",
  "bunny.net",
  "descript.com",
  "riverside.fm",
  "zoom.us",
]

/** File extensions that ARE a video or an audio recording, wherever they are
 * hosted. A link straight at an `.mp4` is the same problem with no host to
 * recognise — and it is the one shape that reaches this from a private bucket or
 * somebody's own server. */
const MEDIA_EXTENSIONS = [
  ".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".mpg", ".mpeg",
  ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg",
]

/** IS THIS A LINK TO SOMETHING WE CANNOT READ BY FOLLOWING IT?
 *
 * False for anything that is not a URL at all: this decides whether to offer the
 * transcript box, and a person typing a note about a video has not given us a
 * link to refuse. */
export function isVideoLink(url: string): boolean {
  const raw = (url ?? "").trim()
  if (!raw) return false
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return false
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "")
  if (VIDEO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true
  const path = parsed.pathname.toLowerCase()
  return MEDIA_EXTENSIONS.some((ext) => path.endsWith(ext))
}
