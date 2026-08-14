// VISUAL BLOCKS — the untrusted-input boundary, the streaming boundary, and the
// pixels. A block's JSON is MODEL OUTPUT, so this suite is written the way the
// request-body suites are: it does not check that the parser was called, it feeds
// the parser the things a model (or anything that can talk to a model) actually
// emits and reads back what the browser would paint.
//
// Three properties are locked here, and each one has bitten a renderer somewhere:
//   1. A refused block is INERT TEXT — never markup, never silence.
//   2. A block that is still STREAMING paints nothing at all — no flicker, and no
//      half-written JSON leaking into the conversation as prose.
//   3. Every string in a block reaches the DOM as a text node. The structured path
//      is safer than the markdown path beside it, and this proves it rather than
//      claiming it.

import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AGENT_BLOCKS, BLOCK_LIMITS, parseAgentBlock } from "@shared/agent-blocks"
import { splitReply } from "@/lib/agent-segments"
import { AgentMarkdown } from "@/components/agent-markdown"

/** A reply carrying one block of `kind` with `body` as its JSON. */
const fenced = (kind: string, body: string) => ["Here you go.", "```kwapso:" + kind, body, "```", "That's the lot."].join("\n")

const kinds = <T extends { t: string }>(segs: T[]) => segs.map((s) => s.t)

describe("the block catalogue refuses what it cannot vouch for", () => {
  it("accepts every shape the prompt teaches", () => {
    for (const b of Object.values(AGENT_BLOCKS)) {
      expect(parseAgentBlock(b.kind, b.example), `${b.kind} example`).not.toBeNull()
    }
  })

  it("refuses malformed JSON, an unknown kind, and a body that isn't an object", () => {
    expect(parseAgentBlock("bars", '{"title":"Hours","rows":[{"label":"Acme"')).toBeNull()
    expect(parseAgentBlock("piechart", '{"rows":[]}')).toBeNull()
    expect(parseAgentBlock("bars", "[1,2,3]")).toBeNull()
    expect(parseAgentBlock("bars", "null")).toBeNull()
    expect(parseAgentBlock("bars", '"a string"')).toBeNull()
  })

  // Number() alone is not a check — this is the exact trap RULES.md R20 names, and
  // a bar's WIDTH is computed from this value, so a lie here draws a real picture.
  it("refuses a bar value that isn't a finite number — including the Number() traps", () => {
    for (const bad of ["true", "null", "[]", '"twelve"', '""', "{}", "1e999"]) {
      expect(
        parseAgentBlock("bars", `{"rows":[{"label":"Acme","value":${bad}}]}`),
        `value ${bad} must not become a bar`
      ).toBeNull()
    }
    // …and a real number, or a string carrying one, still works.
    expect(parseAgentBlock("bars", '{"rows":[{"label":"Acme","value":34}]}')).not.toBeNull()
    expect(parseAgentBlock("bars", '{"rows":[{"label":"Acme","value":"34"}]}')).not.toBeNull()
  })

  it("refuses an empty block and one over the row cap", () => {
    expect(parseAgentBlock("bars", '{"rows":[]}')).toBeNull()
    const many = Array.from({ length: BLOCK_LIMITS.rows + 1 }, (_, i) => `{"label":"r${i}","value":1}`)
    expect(parseAgentBlock("bars", `{"rows":[${many.join(",")}]}`)).toBeNull()
    const ok = many.slice(0, BLOCK_LIMITS.rows)
    expect(parseAgentBlock("bars", `{"rows":[${ok.join(",")}]}`)).not.toBeNull()
  })

  it("refuses a row with no label, and drops decoration it can't use", () => {
    expect(parseAgentBlock("bars", '{"rows":[{"value":1}]}')).toBeNull()
    expect(parseAgentBlock("bars", '{"rows":[{"label":"   ","value":1}]}')).toBeNull()
    // An unusable title / trend is dropped, not fatal — they decorate nothing.
    const b = parseAgentBlock("metric", '{"title":{"x":1},"items":[{"label":"A","value":"1","trend":"sideways"}]}')
    expect(b).not.toBeNull()
    expect(b).toMatchObject({ kind: "metric", items: [{ label: "A", value: "1", trend: undefined }] })
    expect(b!.title).toBeUndefined()
  })

  it("pads a short table row and drops cells no header names", () => {
    const b = parseAgentBlock(
      "table",
      '{"columns":["A","B","C"],"rows":[["1","2"],["1","2","3","4"]]}'
    )
    expect(b).toMatchObject({ rows: [["1", "2", ""], ["1", "2", "3"]] })
  })

  it("caps a very long label instead of letting one row own the panel", () => {
    const long = "x".repeat(BLOCK_LIMITS.text + 500)
    const b = parseAgentBlock("bars", `{"rows":[{"label":"${long}","value":1}]}`)
    expect(b).not.toBeNull()
    expect((b as { rows: { label: string }[] }).rows[0].label.length).toBe(BLOCK_LIMITS.text)
  })
})

describe("splitting a reply — prose, blocks, and the stream", () => {
  it("reads prose around a block", () => {
    const segs = splitReply(fenced("bars", '{"rows":[{"label":"Acme","value":34}]}'))
    expect(kinds(segs)).toEqual(["text", "block", "text"])
  })

  it("a fence that closes but does NOT parse becomes inert code, never a block", () => {
    expect(kinds(splitReply(fenced("bars", "{oops")))).toEqual(["text", "code", "text"])
    expect(kinds(splitReply(fenced("piechart", '{"rows":[]}')))).toEqual(["text", "code", "text"])
  })

  // THE STREAM. Replies arrive token by token, so this runs on every delta with the
  // reply cut at an arbitrary character. No prefix may paint a block, and no prefix
  // may leak the JSON into the prose — the block appears whole or not at all.
  it("never paints a half-written block, at any point in the stream", () => {
    const full = fenced("table", AGENT_BLOCKS.table.example)
    const complete = full.length
    let firstBlockAt = -1
    for (let n = 1; n <= complete; n++) {
      const segs = splitReply(full.slice(0, n))
      const prose = segs.filter((s) => s.t === "text").map((s) => (s as { text: string }).text).join("\n")
      expect(prose, `the reply cut at ${n} chars leaked block JSON into the prose`).not.toContain("columns")
      const has = segs.some((s) => s.t === "block")
      if (has && firstBlockAt < 0) firstBlockAt = n
      // Once a block appears it must never disappear again on a LONGER prefix —
      // that is what a flicker is.
      if (firstBlockAt >= 0) expect(has, `the block vanished again at ${n} chars`).toBe(true)
    }
    // And it only ever appeared once the closing fence had actually arrived.
    expect(firstBlockAt).toBeGreaterThan(full.indexOf(AGENT_BLOCKS.table.example))
  })

  it("an unterminated fence paints the prose before it and nothing else", () => {
    const segs = splitReply('Give me a second.\n```kwapso:bars\n{"rows":[{"label":"Ac')
    expect(kinds(segs)).toEqual(["text"])
    expect((segs[0] as { text: string }).text).toContain("Give me a second.")
  })
})

describe("what the browser actually paints", () => {
  it("draws each kind from the catalogue's own example", () => {
    // bars / metric / steps / table — the content that has to survive to the DOM.
    const expected: Record<string, string> = {
      metric: "Open tickets",
      bars: "Acme Manufacturing",
      table: "BERG-T0412",
      steps: "Triage",
    }
    for (const b of Object.values(AGENT_BLOCKS)) {
      const { container } = render(<AgentMarkdown text={fenced(b.kind, b.example)} />)
      expect(container.textContent, `${b.kind} must paint its data`).toContain(expected[b.kind])
      expect(container.textContent, `${b.kind} must keep the prose around it`).toContain("That's the lot.")
    }
  })

  it("a table block becomes a real <table>, which markdown never managed", () => {
    const { container } = render(<AgentMarkdown text={fenced("table", AGENT_BLOCKS.table.example)} />)
    expect(container.querySelector("table")).not.toBeNull()
    expect(container.querySelectorAll("tbody tr").length).toBe(2)
  })

  // THE HEADLINE SAFETY CLAIM, PROVED. Every string in a block is a React child, so
  // markup in the model's output is text on the screen and nothing else.
  it("markup inside a block's data renders as text, never as elements", () => {
    const hostile = JSON.stringify({
      title: "<img src=x onerror=alert(1)>",
      rows: [{ label: "<script>alert(1)</script>", value: 5 }],
    })
    const { container } = render(<AgentMarkdown text={fenced("bars", hostile)} />)
    expect(container.querySelector("img"), "no element may be built from a block's data").toBeNull()
    expect(container.querySelector("script")).toBeNull()
    expect(container.innerHTML).not.toMatch(/<[^>]*\son\w+\s*=/i)
    // …and it is still SHOWN, escaped, so the reply isn't silently eaten.
    expect(container.textContent).toContain("<script>alert(1)</script>")
  })

  it("a REFUSED block renders as inert text — not markup, and not nothing", () => {
    const evil = '{"rows": <img src=x onerror=alert(1)> broken'
    const { container } = render(<AgentMarkdown text={fenced("bars", evil)} />)
    expect(container.querySelector("img")).toBeNull()
    expect(container.innerHTML).not.toMatch(/<[^>]*\son\w+\s*=/i)
    expect(container.querySelector("pre"), "a refused block is shown as the model wrote it").not.toBeNull()
    expect(container.textContent).toContain("broken")
    // The conversation around it is untouched.
    expect(container.textContent).toContain("That's the lot.")
  })

  it("still renders an ordinary reply with no blocks in it", () => {
    const { container } = render(<AgentMarkdown text="**Two** open tickets — see [tickets](https://x.com)." />)
    expect(container.querySelector("strong")?.textContent).toBe("Two")
    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://x.com")
  })
})
