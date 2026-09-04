# Lane report: the client portal, walked screen by screen (staging, 4 Sep 2026)

Sweep only. Nothing was fixed, nothing was written through the portal. Signed in as the
client login `alaap@swiftstruck.com` (the session the owner opened in the Browser pane;
the staging test-login door answered 403 "Not available." from both the agency host and
the workers.dev host, so no code was minted). Walked at 1280×900 and at 375×812.
Worktree: `../kwapso-portal-sweep` on `audit/portal-sweep` from `origin/main` (491431d2).

## 1. The seven screens

| Route | Verdict | What it does | Narrow (375) |
|---|---|---|---|
| `/` (root) | OK | Redirects to `/home` with a session. | n/a |
| `/home` | OK | Greeting, "Ask us something", three newest tickets + count 45, "See all of them", "What you bought". Every control works. | OK, no horizontal overflow |
| `/tickets` | **Finding** | All 45 rows render, count badge exact, no "Show older" (fits one page). No search, no filter, no tabs. | **The create button is clipped**: its right edge sits at 391px in a 375px viewport (16px off-screen) beside the three-line display heading. |
| `/tickets/[id]` | OK, one wart | Status badge, description, Files and links (2, with an image preview that loads), Send a file, Add a link (sheet opens, cancels), reply box (button disabled until text is typed). Bad id → "We can't find that ticket." inside the shell with a way back. | OK |
| `/impact` | OK | Savings caption present (R25). Account → process → step accordion expands two levels; a per-process comment box ("Questions about this?") renders. | OK |
| `/deliverables` | **Finding** | One row. **Its link is `href="somevideo.com"`**, which the browser resolves to `https://staging-client.kwapso.app/somevideo.com` → the bare 404. | OK |
| `/company` | OK | Account name, reference, three contacts. Two rows carry "Main contact". | OK |
| `/login` | OK | Renders even with a session (no redirect to home). Email field, "Email me a code", Google. The left photo shows a spinner for ~2–5 s before the 1280px JPEG paints; it does resolve. Not submitted (a send). | Photo hidden, clean |
| any unknown path | **Finding** | Next's bare "404 This page could not be found." — no shell, no nav, no way back. Neither front door has a `not-found.tsx`. | same |

Console over the whole walk: one 400 (the owner's first wrong login code, not the app) and
two Radix warnings, `Missing Description or aria-describedby for DialogContent`, from the
"Ask us something" and "Add a link" dialogs. Network: every portal door 200, nothing hung.

Not pressed, on purpose: Sign out (ends the only session), Send a file (native picker),
Take it off (destructive; source shows a confirm at ticket-attachments.tsx:296), Submit on
both dialogs, Reply, the language switch (writes the user row), the impact comment Send.

## 2. Broken or wart controls, ranked by what a client notices

1. **Deliverable link goes to a 404 on our own host** (`/deliverables`). The agency saved
   `somevideo.com` with no scheme; `safeHref` (shared/web/rich-text.ts:70) accepts it as
   app-relative and the row renders it verbatim. Test data here, but the door accepts it
   and the screen will do the same to a real one. Fix belongs at the write door
   (require a scheme) and/or the row (refuse a scheme-less URL rather than link it).
2. **The "+" create button is cut off at phone width** (`/tickets`, 375px). The
   `CollectionHeading` row cannot shrink below the display-size heading plus the button,
   and the shell's `overflow-x: clip` hides the overflow in silence. Measured
   `right = 391.5` against `innerWidth = 375`. Home's full-width "Ask us something" button
   is fine; only the icon-only one on Tickets is clipped.
3. **Raw markdown in ticket rows and titles.** Imported Glide tickets carry `**bold**`,
   `###` and `\1.` in their description; `richTextPlain` strips HTML tags, not markdown,
   so a row reads "processes **Processes are the real work…**". Data shape, not a portal
   bug, but every third row on staging shows it. The agency side shows the same.
4. **Unknown URL → framework 404 page** with no shell. A mistyped or stale link drops the
   client out of the app entirely.
5. **Bottom nav label wraps** at 375px: "My company" breaks onto two lines while the other
   four stay on one.
6. **Login page does not redirect a signed-in client**; visiting `/login` with a session
   shows the sign-in form again.
7. Two dialogs lack an accessible description (the Radix warning above).
8. Two contacts on the same account both labelled "Main contact" — data on staging, but
   the screen does not mind, so worth deciding whether it should.

Not a finding, recorded so nobody chases it: the Browser pane's scrolled screenshots show
the sticky header mid-frame with black above it. JS measured `header.top = 0` at
`scrollY = 450` on both widths; it is the hidden-tab paint artefact already on file.

## 3. How much of Aurora's round reached the portal

Measured with `git diff --stat 69c6382b^1 69c6382b -- web-portal/`: **19 files,
+292/−61** (the brief's 22 / +410/−116 was a different range). Three of her commits
touch the portal: e045c371 (error handling, 14 files, the substance), d59157a9 (the
Phosphor icon swap, 8 files, name changes only), 6529663b (one test line).

| Improvement | Portal | Reason |
|---|---|---|
| New shell + scrolling (`h-dvh overflow-hidden` page, inner scroller, sticky-in-scrollport) | **Not applicable** | The portal has its own shell (`portal-shell.tsx`): document scroll, sticky header + sticky bottom nav, `max-w-3xl`. The kit's `PortalHome` composition names the portal `density="calm"`, "narrow, calm, larger type", with no second spine. Her round changed 4 icon lines in it and nothing structural. Verified the sticky header pins at scroll on both widths. |
| Toolbars and filter panels on collections (`ToolbarRow`, `filter-bar.tsx` +889) | **Agency only — and a real gap on Tickets** | The portal never calls `ToolbarRow`, so R48's `web-portal/` census matches nothing and the law is silent there. The tickets list has 45 rows and no search box, no status filter, no open/closed split. `tickets-screen.tsx` argues "no tabs" (R3) and that attribution, not filtering, is the open work; it does not argue for no search. On a phone this is 45 cards to thumb through. |
| Error card vs bare red line | **Present** | e045c371 added `ErrorPanel` (title + line + Try again) in the portal's own idiom and wired it into every screen; also fixed "empty before loading" on Waiting-on-you / Sent-to-us and the "can't find that ticket" on a network error. Deliberately not the kit's `ShapeStateBody`. Could not trigger a live error read-only; verified the not-found path and the source. |
| Tab shape and count badges | **Count badge present; tabs not applicable** | Every collection heading carries the exact server count once (R16, `CollectionHeading`). There is no tab strip anywhere on the portal, by the R3 reasoning in `tickets-screen.tsx`. |
| Folder-tab trail | **Agency only, and correct** | Lives in `screen-bits.tsx` / `tabs-view.tsx` for nested collections; the portal's deepest screen is one ticket with a single "← All tickets" link. |
| Two spines and the scale setting | **Agency only, and correct** | `--spine-*` and `/api/auth/scale` are read by `app-shell.tsx`, `use-is-phone.ts`, `web/lib/api/auth.ts`; `web-portal/` references neither. The calm door has one column and one type size by design. A client cannot change scale; no control was drawn, so nothing is missing so much as never offered. |
| Phosphor icons | **Present** | 8 portal files renamed (`LifeBuoy→Tray`, `Building2→Buildings`, `LogOut→SignOut`, …). |

Net: the portal got the two halves of her round that apply to it (icons, honest failure
states) and correctly skipped the shell, spines, scale and folder trail. The one place
"narrower, calmer" is doing work it should not is the tickets list, where a growing
collection has no search and no filter and no law that would notice.

## 4. Things I could not do

- Live error state (a 5xx on a portal door) and true empty states for tickets and
  contacts: this client has 45 tickets, 1 deliverable, 3 contacts. Empty copy verified
  in source only ("Nothing here yet." + one line, same box shape as the error twin).
- The login form's send step and the reply/raise/link/file writes: all left unsent.
