// THE SCREENS ARE REACHABLE, AND A DOOR HAS A BUTTON.
//
// Three invariants, all earned by things this repo actually shipped:
//
//   1. EVERY SIDEBAR DESTINATION DECLARES WHICH HALF OF THE RAIL IT IS IN, and
//      the shell partitions the rail from that field rather than naming pages.
//      The owner's ruling is two groups with a divider — daily on top,
//      occasional below — and he rejected both alternatives put to him. A rule
//      like that survives exactly as long as the next person adding a section
//      remembers it, unless the registry makes it un-forgettable.
//
//   2. EVERY SIDEBAR DESTINATION ACTUALLY RESOLVES. A section in the registry is
//      a link in the rail, and a link needs four things to work: a permission
//      module, a place in TOP_LEVEL_MODULES (or tapping it leaves the History
//      API and full-reloads, throwing away the warm cache the entire caching
//      model stands on), a page shell under web/app (or a reload 404s), and the
//      gateway forwarding its sub-paths (or a deep link to a record 404s).
//      Every one of those four was broken for at least one live section when
//      this check was written: Knowledge base and Work were missing from
//      TOP_LEVEL_MODULES, and Marketing, Brand library, Delivery method and
//      Meeting purposes had no page shell at all — four sidebar links that
//      404'd on reload, in a green build.
//
//   3. A SHIPPED DOOR HAS A CONTROL. The work engine shipped a ticket's
//      reference number, its archive door and its drag-rank door, and a person
//      could reach none of the three: the reference rendered on no screen, and
//      the two doors had no caller anywhere in the front end. Nothing was
//      broken — the tests passed, the machine surface worked, and the
//      capability did not exist for the people the app is for. So every
//      non-GET route on the two workers the agency app talks to must be CALLED
//      from web/ or web-portal/, or be a named line saying who it is for.

import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"

import { NAV, TEAM_SECTIONS } from "../lib/pages"
import { BASE_RECIPES, MODULE_PERMISSION } from "../lib/screens"
import { TOP_LEVEL_MODULES } from "../components/deep-link/route"

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, "..")
const ROOT = join(WEB, "..")
const read = (p: string) => readFileSync(p, "utf8")

/** Every destination in the left rail — the universal anchors plus the team's
 * own sidebar pages. Derived from the two registries, never listed here. */
const RAIL = [
  ...NAV.filter((n) => !n.need).map((n) => ({ what: `NAV "${n.slug}"`, group: n.group })),
  ...TEAM_SECTIONS.filter((s) => s.placement === "sidebar").map((s) => ({
    what: `section "${s.key}"`,
    group: s.group,
  })),
]

describe("the screens are reachable", () => {
  // 1 — THE RAIL IS TWO GROUPS, and the registry is what says which.
  it("nav-groups: every rail destination declares its half, and the shell derives them", () => {
    expect(RAIL.length, "the rail derivation found nothing — it has gone blind").toBeGreaterThan(5)
    const ungrouped = RAIL.filter((d) => d.group !== "daily" && d.group !== "occasional")
    expect(
      ungrouped.map((d) => d.what),
      `a rail destination with no group lands in the occasional half by accident rather than by decision — give it \`group: "daily"\` or \`group: "occasional"\` in lib/pages.ts: ${ungrouped.map((d) => d.what).join(", ")}`
    ).toEqual([])

    // BOTH halves have to be occupied, or the divider the owner asked for never
    // draws and the ruling is silently undone by a registry edit.
    for (const half of ["daily", "occasional"] as const)
      expect(
        RAIL.filter((d) => d.group === half).length,
        `the ${half} half of the rail is empty — the divider only exists between two groups`
      ).toBeGreaterThan(0)

    // …and the SHELL must partition by that field rather than naming pages. A
    // hand-listed group in the component would leave the registry describing a
    // rail it no longer controls.
    const shell = read(join(WEB, "components", "app-shell.tsx"))
    expect(shell, "app-shell must build the rail groups from each destination's own group field").toContain(
      'i.group === g'
    )
  })

  // 2 — A LINK IN THE RAIL GOES SOMEWHERE.
  it("sidebar-destinations: every sidebar section resolves end to end", () => {
    const gateway = read(join(ROOT, "workers", "gateway", "src", "index.ts"))
    const sidebar = TEAM_SECTIONS.filter((s) => s.placement === "sidebar")
    expect(sidebar.length, "the sidebar scan found no sections — it has gone blind").toBeGreaterThan(5)

    for (const s of sidebar) {
      // (a) the URL segment maps to the permission module the server enforces —
      // without it the deep-link host NotFounds the page it just linked to.
      expect(
        MODULE_PERMISSION[s.segment],
        `sidebar section "${s.key}" (/${s.segment}) has no MODULE_PERMISSION entry — the host would refuse the page the rail links to`
      ).toBe(s.module)

      // (b) it is an in-app path, so `go()` moves to it through the History API.
      expect(
        TOP_LEVEL_MODULES,
        `"/${s.segment}" is a sidebar page but not a TOP_LEVEL_MODULE — every tap on it leaves the History API and FULL-RELOADS, throwing away the warm cache`
      ).toContain(s.segment)

      // (c) the static export has a shell for it, or a reload / a pasted link 404s.
      expect(
        existsSync(join(WEB, "app", s.segment, "[[...rest]]", "page.tsx")),
        `"/${s.segment}" is a sidebar page with no web/app/${s.segment}/[[...rest]]/page.tsx — the link works inside the app and 404s on reload`
      ).toBe(true)

      // (d) the gateway serves that shell for any sub-path, or a deep link to a
      // record under it 404s.
      expect(
        new RegExp(`"${s.segment}"`).test(gateway),
        `the gateway does not forward /${s.segment}/* to its shell — a deep link to one of its records 404s on load`
      ).toBe(true)

      // (e) …and something actually RENDERS it. Four registries can all agree a
      // section exists while the render switch has no branch for it, and then
      // the rail links to a page that answers NotFound.
      //
      // It is a real failure, not a hypothetical one: the Time section shipped
      // its registries in one commit and its screen in the same one, and for the
      // length of that commit the branch sat BELOW `renderCollection`'s
      // `<module>.list` recipe guard — which every other collection passes and a
      // host-composed one cannot. Every test was green, because the four checks
      // above are about registries and none of them opens the screen.
      //
      // A collection is drawn either by a branch in the switch or by a recipe;
      // this asks for one of the two, which is the weakest claim that still
      // catches a destination nothing draws.
      const collections = read(join(WEB, "components", "deep-link", "collection-content.tsx"))
      const hasBranch = new RegExp(`module === "${s.segment}"`).test(collections)
      const hasRecipe = `${s.segment}.list` in BASE_RECIPES
      expect(
        hasBranch || hasRecipe,
        `sidebar section "${s.key}" has no branch in renderCollection AND no "${s.segment}.list" recipe — the rail links to a page that renders NotFound`
      ).toBe(true)
    }
  })

  // 3 — A DOOR THAT CHANGES SOMETHING HAS SOMETHING THAT PRESSES IT.
  //
  // TWO HOPS, and the second one is the whole point. Hop one is the api layer:
  // which method names the door's path. Hop two is a COMPONENT calling that
  // method — because `rankStory` sat in the api layer for weeks with the path
  // written out in full and no screen calling it, so a one-hop check ("is the
  // path mentioned anywhere?") would have reported the drag-rank gap as fine.
  // A control is a thing a person can press, and a person presses components.
  //
  // WHAT IT DOES NOT CATCH, said plainly so nobody over-trusts it: a handler in
  // a component with no button wired to it still reads as a call. It measures
  // "does a screen reach this door", not "can a person see the control" — the
  // second is a question about pixels, and this is a source scan. It catches the
  // failure this repo actually had (the capability absent from every screen) and
  // it would not catch a button someone later deleted from around a live handler.
  it("doors-have-controls: every write door is called from a screen, or says who it is for", () => {
    // Hop one: the api layer's method → the path it posts to. Read as one blob
    // per file and split on the method boundaries, because a method's body is
    // where its path literal lives.
    const apiSrc = sourceFiles([join(WEB, "lib", "api"), join(ROOT, "web-portal", "lib")], {
      extensions: [".ts"],
      skipTests: true,
    })
      .map((f) => f.source)
      .join("\n")
    expect(apiSrc.length, "the api-layer scan read nothing — it has gone blind").toBeGreaterThan(5000)
    // `name: (args) => …` up to the next method at the same indent. The path may
    // sit several lines down (a query builder, a then-chain), so the window runs
    // to the next declaration rather than to the end of the line.
    const methods = [...apiSrc.matchAll(/^ {2}(\w+):\s*[(<]/gm)]
    expect(methods.length, "the api-method scan found almost nothing").toBeGreaterThan(40)
    /** WHICH METHOD POSTS TO THIS DOOR — and the two ways that question used to be
     * answered wrongly, both found by sabotaging a control and watching this check
     * stay green.
     *
     *   • A PATH ENDS WHERE ITS STRING DOES. A plain `includes` is a prefix test,
     *     so `/api/tenancy/rates` matched `/api/tenancy/rates/update` too, and the
     *     stem door read as pressed the moment any sibling was.
     *   • A PATH IS NOT A DOOR. `/api/tenancy/rates` is TWO doors — a GET that
     *     reads the card and a POST that adds to it — and the reading method is
     *     called from a screen on every card that renders. So the write door read
     *     as pressed by the read door's own caller.
     *
     * What separates them is that the body SAYS it is a write — in any of the
     * THREE ways this api layer writes one: the shared `post()` helper
     * (shared/web/api.ts), the inline `{ method: "POST", … }` the older tenancy
     * methods still use, or `sendFile()` — the upload helper that streams a file
     * as the request body (web/lib/api/content.ts). All three are here because all
     * three are real; matching only the first called sixteen live doors
     * unreachable, which is the same kind of wrong answer in the other direction.
     *
     * `sendFile` earned its place the day the four streaming upload doors landed:
     * it holds the `method: "POST"` itself, so the CALLER's body carries the path
     * and no write marker, and all four streamed doors read as unpressed while
     * being wired to real file pickers. A helper that hides the verb is exactly the
     * shape this matcher has been wrong about twice.
     *
     * Between them these two holes hid BOTH rate cards' create doors — delete the
     * "New rate" button and this check said fine. */
    const WRITES = /\bpost\(|\bsendFile[<(]|method:\s*"(?:POST|PUT|PATCH|DELETE)"/
    /** Does this function body call THIS door — the whole path, and as a write?
     * Two holes lived here. A path was matched as a PREFIX, so
     * `/api/content/knowledge/sync-google` counted as a call to
     * `/api/content/knowledge/sync`; and a path is not a door — the same string
     * is a GET and a POST, so the reading twin vouched for the writing one. */
    const reaches = (path: string, body: string) =>
      new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=["\`?]|\\$\\{)`).test(body) &&
      WRITES.test(body)
    const bodyOf = new Map<string, string>()
    methods.forEach((m, i) => {
      const from = m.index as number
      const to = (methods[i + 1]?.index as number | undefined) ?? apiSrc.length
      bodyOf.set(m[1], (bodyOf.get(m[1]) ?? "") + apiSrc.slice(from, to))
    })

    // Hop two: the SCREENS — every component in both front ends, plus the
    // handful of non-component callers a screen genuinely delegates to (the
    // pre-auth onboarding flow, the host's own write layer).
    const screens =
      sourceFiles(
        [
          join(WEB, "components"),
          join(WEB, "app"),
          join(ROOT, "web-portal", "components"),
          join(ROOT, "web-portal", "app"),
        ],
        { extensions: [".ts", ".tsx"], skipTests: true }
      )
        .map((f) => f.source)
        .join("\n") +
      // The host's own write layer — a named action dispatched from a screen's
      // button is still that button pressing the door.
      read(join(WEB, "lib", "use-screen-actions.ts"))
    expect(screens.length, "the screen scan read nothing — it has gone blind").toBeGreaterThan(10000)

    const unpressed: string[] = []
    let doors = 0
    for (const worker of ["content", "tenancy"]) {
      const index = read(join(ROOT, "workers", worker, "src", "index.ts"))
      const table = /export const ROUTES[^=]*=\s*\{([\s\S]*?)\n\}/.exec(index)
      expect(table, `workers/${worker} has no ROUTES table — did it move?`).toBeTruthy()
      for (const [, method, path] of (table as RegExpExecArray)[1].matchAll(
        /"([A-Z]+) (\/[^"]+)":\s*\{\s*handler:/g
      )) {
        if (method === "GET") continue // a read is pressed by opening the screen
        // Key-gated ops doors (adminGuard): no session reaches them at all, so
        // there is no screen they could have and no person to give a button to.
        // They are run from scripts with the owner's key — a different kind of
        // caller, not a missing control.
        if (path.startsWith("/api/tenancy/admin/")) continue
        doors++
        // Which api method posts to this door, and is that method called from a
        // screen? Either hop missing is the same failure with two faces: no
        // plumbing, or plumbing nobody can reach.
        // A WHOLE PATH, not a prefix of one. `body.includes(path)` counted
        // `/api/content/knowledge/sync-google` as a call to
        // `/api/content/knowledge/sync`, so wiring a button to the LONGER door
        // silently marked the shorter one as pressed — and this suite's own
        // ratchet then demanded the deletion of a true NO_CONTROL line. A door
        // path ends where the URL literal does: a closing quote or backtick, or
        // the `?` that starts a query string.
        // Through the one matcher above, which knows both holes: a whole path,
        // and only a body that actually WRITES.
        const callers = [...bodyOf].filter(([, body]) => reaches(path, body)).map(([name]) => name)

        if (!callers.some((name) => new RegExp(`\\.${name}\\s*\\(`).test(screens)))
          unpressed.push(`${method} ${path}`)
      }
    }
    expect(doors, "the write-door census found almost nothing — it has gone blind").toBeGreaterThan(30)

    const unlisted = unpressed.filter((d) => !(d in NO_CONTROL))
    expect(
      unlisted,
      `these doors change something and nothing a person can click calls them — give them a control, or write down here who they ARE for: ${unlisted.join(", ")}`
    ).toEqual([])

    // THE RATCHET: an excuse in front of a door that now HAS a control is a line
    // nobody reread. Wire one up and its line must go, so this list can only shrink.
    const stale = Object.keys(NO_CONTROL).filter((d) => !unpressed.includes(d))
    expect(
      stale,
      `NO_CONTROL names doors that are called from a front end now — delete these lines: ${stale.join(", ")}`
    ).toEqual([])
  })
})

/** WRITE DOORS NOTHING A PERSON CAN PRESS REACHES YET. Two kinds of line, and
 * they are labelled, because pretending a gap is a decision is how a gap
 * survives a review.
 *
 *   • FOR A MACHINE — the door exists for the assistant, the MCP surface or the
 *     import engine, and a person does the same thing another way. Nothing is
 *     missing.
 *   • A GAP — the capability shipped and the people the app is for cannot use
 *     it. Named here so it is a list somebody can work through rather than a
 *     silence. Every one of these belongs to a lane other than screens.
 *
 * The list is a RATCHET: wire a door up and its line must be deleted, or the
 * build goes red. So it can only ever shrink, and it can never quietly describe
 * a screen that now exists. */
const NO_CONTROL: Record<string, string> = {
  /* ── for a client that is already out there ───────────────────────────── */
  "POST /api/content/learning/upload":
    "FOR AN OLDER BUILD OF THIS APP. The buffered half of the learning-media upload pair — a base64 data URL in a JSON body — replaced on 17 Aug 2026 by /upload-stream, which hands the file to R2 as it arrives. No screen in THIS build calls it, and that is deliberate: a browser holds its own copy of the app for as long as the tab is open, so somebody who loaded a page before the deploy is still running the old JavaScript and still posting here. An upload contract is the one change where the server must be ready before the client and outlast it afterwards. All four of these lines go when no build in the wild uses them.",
  "POST /api/content/brand-assets/upload":
    "FOR AN OLDER BUILD OF THIS APP — the buffered half of the brand-asset upload pair, kept for tabs opened before the 17 Aug 2026 deploy for the reason written on the learning line above.",
  "POST /api/content/staff/upload":
    "FOR AN OLDER BUILD OF THIS APP — the buffered half of the staff-file upload pair, kept for tabs opened before the 17 Aug 2026 deploy for the reason written on the learning line above.",
  "POST /api/content/knowledge/upload":
    "FOR AN OLDER BUILD OF THIS APP. The buffered upload door — a base64 data URL in a JSON body — replaced on 17 Aug 2026 by /upload-stream, which takes the file as the request body and never materialises it. No screen in THIS build calls it, and that is the point rather than a gap: a browser holds its own copy of the app for as long as the tab is open, so a person who loaded the app before the deploy is still running the old JavaScript and still posting here. The door stays until no build in the wild uses it; deleting it then is a separate, boring change. An upload contract is the one kind of change where the server must be ready before the client is, and outlast it afterwards.",

  /* ── for a machine ─────────────────────────────────────────────────────── */
  "POST /api/content/learning/bulk-active":
    "FOR A MACHINE. The SET-shaped write — 'switch these forty articles off'. It exists for the assistant and the machine surface, where a caller names a set; a person switches one article off on its own screen, which is the door beside this one.",
  "POST /api/content/help/bulk-status":
    "FOR A MACHINE. The same shape for tickets: a set of ids moved together. A person moves one ticket with the stepper on its own screen.",
  "POST /api/content/help/bulk-status-by-filter":
    "FOR A MACHINE. 'Move everything matching this filter' is a sentence somebody says to the assistant, not a control that could be drawn safely: a button whose blast radius is however many rows the filter happened to match is a button nobody can check before pressing.",
  "POST /api/content/work-logs/auto-stop":
    "FOR A MACHINE. A private preference about how the caller's own timers behave, set by asking the assistant. It changes no record anybody else can see, which is also why it is the content worker's one housekeeping write.",
  "POST /api/content/knowledge/sync":
    "FOR A MACHINE, and deliberately: the sweep runs itself every fifteen minutes. A button that says 'catch up now' invites people to press it when nothing is behind — the owner's own comprehension answer was that eleven new tickets need no hand-adding at all. The knowledge-base lane owns whether a status line ever earns one.",
  "POST /api/tenancy/config/screens":
    "FOR A MACHINE. A team's screen-recipe override is app furniture rather than a record: the assistant writes one, and a screen for editing screens is a screen nobody asked for.",

  "POST /api/content/google/calendar/events":
    "FOR A MACHINE, by the owner's own ruling: the assistant may create a calendar event WITHOUT asking, where sending mail always asks. A person with a diary already has a diary — the door exists so the app can put a sprint or a booking in it.",
  "POST /api/content/google/calendar/sprint":
    "FOR A MACHINE. The same door aimed at one sprint's dates, called when a sprint is sold or moved rather than pressed. Its human control is the sprint's own date fields, which is the write that triggers it.",
  "POST /api/content/google/drive/upload":
    "FOR A MACHINE. Putting a file INTO Drive is the assistant answering 'save that to the Bergman folder'. A person with a folder open drags it there, and the app's own upload doors are the ones on the record it belongs to.",
  "POST /api/content/google/chat/messages":
    "FOR A MACHINE. Posting into a named space is an act the assistant performs on request; a person is already in the space. The owner asked for read AND post, and the post half is the assistant's.",

  // THE THIRTEEN THAT FINISH THAT SENTENCE, and they are one decision, not
  // thirteen. Every door on this module acts INSIDE Google — a file in a Drive
  // folder, a label in a mailbox, a guest on a diary entry — and kwapso
  // deliberately has no screen for any of it. That is the same ruling the four
  // lines above already stand on, and it is the reason the module exists: a
  // person who wants to rename a file opens Drive, which is better at it than a
  // card we could build beside it would ever be. What kwapso adds is the
  // ASSISTANT doing it on request, and a history row on the connection so "what
  // has kwapso done as me?" has an answer in Settings.
  //
  // Read the two `take it back` doors as part of the same decision rather than as
  // an oversight: they exist so the assistant's own writes are undoable, and the
  // person's undo is Drive's bin and Chat's own delete, which they already have.
  "POST /api/content/google/drive/update":
    "FOR A MACHINE. Rewriting a file is the assistant answering 'update the scope doc with what we agreed'. A person with the document open edits it in Google Docs, which is better at editing documents than anything we would put beside it.",
  "POST /api/content/google/drive/folder":
    "FOR A MACHINE. Making a folder inside a shared one is the assistant tidying as it files — 'put these under a Bergman folder'. A person makes a folder in Drive, in one click, where the folders are.",
  "POST /api/content/google/drive/save-mail":
    "FOR A MACHINE. 'Put that exchange in the client folder' is a sentence somebody says to an assistant; the person's own version is forwarding the thread, which Gmail already does. It is also the one door here that reads one service and writes another, which is exactly the kind of errand a machine is for.",
  "POST /api/content/google/drive/trash":
    "FOR A MACHINE, and specifically to undo a machine. It exists so the assistant can take back a file it wrote; a person uses Drive's own bin, which is the same act on the same file with a shorter path to it.",
  "POST /api/content/google/gmail/reply":
    "FOR A MACHINE. The person's control is the mail reply dialog, which DRAFTS — the owner's ruling that a drafted reply is the normal way to answer mail. This door sends inside the thread, which is the assistant's half of the same sentence and carries the same always-ask confirm.",
  "POST /api/content/google/gmail/label":
    "FOR A MACHINE. Filing a message under a label is the assistant tidying a mailbox on request. A person clicks the label button in Gmail, where the message already is.",
  "POST /api/content/google/calendar/event/update":
    "FOR A MACHINE, on the owner's calendar ruling: the assistant may change a diary entry without asking, because its owner can change it back in one click. A person edits the entry in Google Calendar.",
  "POST /api/content/google/calendar/event/guests":
    "FOR A MACHINE. 'Add Marta to Thursday's call' is an errand; the person's version is the guest field in Google Calendar. It is the one calendar write that asks first, because an invitation lands in somebody else's inbox and cannot be recalled.",
  "POST /api/content/google/calendar/event/location":
    "FOR A MACHINE. Where a meeting happens is one field, and the assistant sets it when a room changes. A person types it in Google Calendar — and the meeting record's own location field is the kwapso-side control this door exists to push.",
  "POST /api/content/google/calendar/event/cancel":
    "FOR A MACHINE. Calling a meeting off is the assistant answering 'cancel Thursday'; a person cancels it in Google Calendar, where the guests and the notification live.",
  "POST /api/content/google/chat/delete":
    "FOR A MACHINE, and specifically to undo a machine — the counterpart of the post door above. It takes back a message kwapso itself sent; a person deletes their own message in Chat.",

  /* ── a gap, owned by another lane ──────────────────────────────────────── */
  // EMPTY, and that is the point of the two headings staying here. Twelve doors
  // sat under this one — both rate cards, the two halves of the Gmail sentence
  // the owner asked for in words, a correction to a row of time, two uploads and
  // a profile nobody could retire — and each of them now has something a person
  // can press. What is left above is not a backlog: every line up there says a
  // MACHINE is the caller, which is a decision rather than a gap.
}
