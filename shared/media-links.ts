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
// IT IS NOT THE GATE, and after 27 Aug 2026 it is not even close to it. The gate
// is that a source whose only content is a LINK has nothing for the assistant to
// read, whatever the link points at — that rule closes a custom domain, a service
// nobody has heard of, and the one somebody will use next year, none of which a
// list can do. This predicate only chooses which SENTENCE the person reads.
//
// The distinction was earned. The first version made this the gate, and a Tella
// recording behind the owner's own domain walked straight past fifteen hostnames
// and became a source with a title, a link and no body — precisely the shape the
// whole ruling exists to prevent. A detector is a list that is wrong the moment
// somebody uses a service not on it. An empty body cannot be out of date.
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
  // Named by the owner in the original ask and missed from the brief. The link
  // that found this whole gap was a Tella one.
  "tella.tv",
  "tella.video",
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
  if (MEDIA_EXTENSIONS.some((ext) => path.endsWith(ext))) return true
  // A `/video/` SEGMENT, which is the only thing that catches a custom domain.
  //
  // The link that exposed all of this was `content.kwapso.com/video/…` — the
  // owner's OWN domain in front of a Tella recording, which no host list can ever
  // see. Measured against the 891 links already in his base: `/video/` appears in
  // exactly one of them, and it is that link. Zero false positives.
  //
  // IT IS SAFE TO BE LOOSE HERE NOW, and it would not have been before. This
  // predicate no longer decides whether a source is REFUSED — the empty-body rule
  // does that, and it does not care what the host is. All this decides is which
  // sentence the person reads. A wrong guess costs a slightly-off sentence about
  // a source that was being refused anyway.
  return path.split("/").includes("video")
}
