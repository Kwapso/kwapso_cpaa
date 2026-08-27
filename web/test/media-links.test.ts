// WHAT COUNTS AS A LINK TO A VIDEO, and what deliberately does not.
//
// The predicate both sides stand on: the door refuses on it and the form
// explains on it while somebody is typing. Two copies would be two answers to
// one question, so there is one — and it is tested here rather than through
// either caller, because what it gets wrong is the thing neither caller can see.
//
// IT IS A COURTESY ON TOP OF A FLOOR, not the floor itself. Recognising a URL as
// video buys a better sentence and the transcript box; NOT recognising one is
// never permission to store something unreadable. So the false negatives below
// are acceptable and the false positives are not: refusing a runbook because its
// URL has "loom" in the path would take a real source away from somebody.

import { describe, expect, it } from "vitest"

import { isVideoLink } from "@shared/media-links"

describe("a link to a video, recognised", () => {
  it("the players a person actually pastes", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=abc123",
      "https://youtu.be/abc123",
      "https://www.loom.com/share/2f1c8a",
      "https://vimeo.com/76543210",
      "https://kwapso.wistia.com/medias/abc",
      "https://us02web.zoom.us/rec/share/xyz",
      "http://www.dailymotion.com/video/x8abc",
    ])
      expect(isVideoLink(url), url).toBe(true)
  })

  it("and a link straight at a recording, wherever it is hosted", () => {
    // The one shape with no host to recognise — a private bucket, somebody's own
    // server — and the reason the extension list exists beside the host list.
    for (const url of [
      "https://files.bergman.example/standup-2026-03-04.mp4",
      "https://cdn.example.org/a/b/call.m4a",
      "https://example.com/recording.WEBM",
    ])
      expect(isVideoLink(url), url).toBe(true)
  })
})

describe("and what must NOT be taken for one", () => {
  it("an ordinary link is an ordinary link", () => {
    for (const url of [
      "https://docs.example.com/runbook",
      "https://drive.google.com/file/d/abc/view",
      "https://kwapso.app/t/1/tickets/9",
    ])
      expect(isVideoLink(url), url).toBe(false)
  })

  // A HOST THAT MERELY CONTAINS THE NAME. `notyoutube.com` and
  // `youtube.com.phishing.example` are not YouTube, and a substring match would
  // have called both of them video — which is how a rule meant to help somebody
  // starts refusing their material.
  it("a host that only looks like one", () => {
    for (const url of [
      "https://notyoutube.com/watch?v=1",
      "https://youtube.com.example.net/watch?v=1",
      "https://myvimeography.example/post",
    ])
      expect(isVideoLink(url), url).toBe(false)
  })

  it("and anything that is not a link at all", () => {
    // A person writing a NOTE about a video has not handed us one to refuse.
    for (const value of ["", "   ", "we watched the loom recording", "youtube", "ftp://example.com/a.mp4"])
      expect(isVideoLink(value), JSON.stringify(value)).toBe(false)
  })
})
