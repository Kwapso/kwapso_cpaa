# The 93 hand-written controls — three lanes, three prompts

93 raw HTML control elements across 53 files, each with its padding, focus ring,
disabled state and hover transition decided at the call site rather than by the
kit. This is the last large piece of R39 becoming true rather than aspirational.

The three lanes below touch **disjoint file sets**, so they can run at once
without merge conflicts. Each prompt is self-contained: it makes its own
worktree, so it can be pasted into a fresh session that knows nothing.

| lane | scope | files | sites |
|---|---|---|---|
| A | dialogs & components | 34 | 60 |
| B | screens & panels | 8 | 12 |
| C | shared seams + the portal's remainder | 10 | 19 |

**There is no lane D, and the reason is worth reading before you plan around
these numbers.** The client portal was scoped as a fourth lane of 5 files and 7
sites. Then two of its files were excluded — `sign-in.tsx` and
`portal-shell.tsx` are owned by `lane/portal-signin`, and `sign-in.tsx` holds
one `<form>` and one `<img>`, both already on the do-not-convert list. Of the
four sites left, THREE are `<input type="file">` behind a kit button, which the
ruling below says is a mechanism rather than a control. **The portal's honest
output is ONE conversion** — a `type="text"` in `ticket-screen.tsx` — plus one
user-supplied `<img>` that needs the failure-handling check before anyone
touches it.

One conversion is not a lane. It is folded into lane C, which is also small and
also careful, and the two file sets do not overlap. Three lanes, not four.

---

## THE SHARED RULING — every lane obeys this, and it is why they agree

**READ THIS FIRST, BEFORE THE FILE LIST. If you are unsure about an element, do
NOT convert it — leave it and say so in your report. An honest "I left six and
here is why" is worth more than six silent conversions that change behaviour.
NOBODY IS COUNTING CONVERSIONS.** A lane handed a number will find the number,
and the damage from converting something that should have stayed is silent —
a broken file dialog fails no check we have. This paragraph is at the top
deliberately: by the time a session reaches a closing caveat it already has a
plan.

Three patterns are **legitimately raw and must NOT be converted.** Without this
written down, three lanes reach three different answers and the review is a mess.

**1 · A hidden file input.** `<input type="file" hidden>` sitting behind a kit
`Button` or `FileUpload` is the correct shape — the browser's file dialog can
only be opened by a real file input. Converting it breaks attachment upload in
`file-picker`, `help-attachments`, `knowledge-upload-dialog` and
`ticket-attachments`. **Leave it. It is not a control, it is a mechanism.**

**2 · `<img>` in `shared/web/record-mark.tsx`.** It carries deliberate failure
handling — a `key` on the src so a changed picture resets the error state, and a
fallback so a dead URL never draws the browser's torn-paper glyph. The file's own
header says that is the single thing it exists to prevent, and `app-mark`
learned it first with a test. **Leave it** unless the kit's `Image` provably does
the same, which needs checking rather than assuming.

**3 · `<form>`.** A real `<form onSubmit>` is correct HTML and gives you Enter-to-
submit for free. The kit's `structures/form` is a form *layout*, not a
replacement for the element. **Leave it.**

**What DOES convert:** every `<button>` that is a button, every `<label>` that
labels a field, every `<img>` drawing static or branded art. Kit `Label` is
already imported in three files, so the pattern exists to copy.

---

## Common preamble — in every prompt

Each lane must, in order:

1. Make its own worktree off `lane/ui-swap` — never work in
   `~/Desktop/kwapso_cpaa`, which is shared and has moved under two agents
   already today.
2. Convert only the files in its own list.
3. Run `npm run check` and get exit 0. **R31 now forbids the Tailwind radius
   step names** — write `rounded-[var(--radius)]` and `rounded-pill`, not
   `rounded-xl`/`rounded-full`, or the build goes red.
4. **Verify visually, not only by the gate.** A converted button that compiles
   can still be the wrong size or lose its icon. Screenshot one screen per lane.
5. Report what was left unconverted and why.

---

## LANE A · dialogs & components — 34 files, 60 sites

```
BEFORE ANYTHING ELSE: nobody is counting conversions. If you are unsure about
an element, leave it and say so in your report. Converting something that should
have stayed is a SILENT break — a hidden file input turned into a kit Button
stops the browser opening a file dialog, and no check we have catches it.

You are converting hand-written HTML controls to the kwapso design kit's
controls, in an isolated git worktree. Nothing else.

SETUP (do this first, exactly):
  cd ~/Desktop/kwapso_cpaa
  git worktree add -b lane/controls-a ~/Desktop/kwapso-ctrl-a lane/ui-swap
  cd ~/Desktop/kwapso-ctrl-a && npm install

Never edit ~/Desktop/kwapso_cpaa itself — it is shared with other sessions.

READ FIRST: CLAUDE.md, then shared/ui/docs/RULES.md (the kit's own rulebook,
which is readable in this repo as of today), then RULES.md's R39 row.

YOUR FILES — these 34 and no others:
  web/components/google-source-dialog.tsx      (4 button, 2 img)
  web/components/app-shell.tsx                 (5 button)
  web/components/knowledge-ask.tsx             (3 button, 1 form)
  web/components/story-detail.tsx              (3 button)
  web/components/sprint-detail.tsx             (3 button)
  web/components/record-calendar.tsx           (3 button)
  web/components/app-form-dialog.tsx           (2 label, 1 img)
  web/components/wave-detail.tsx               (2 button)
  web/components/story-form-dialog.tsx         (2 label)
  web/components/record-picker.tsx             (1 button, 1 input)
  web/components/process-detail.tsx            (2 button)
  web/components/internal-rate-card.tsx        (2 label)
  web/components/contact-link-dialog.tsx       (2 label)
  …and: timer-bar, temp/auth-card, team-switcher, role-picker-dialog,
  record-table, profile-menu, profile-dialog, meeting-detail,
  knowledge-upload-dialog, help-attachments, file-picker, email-change-dialog,
  create-team-dialog, contact-detail, brand-mark, app-detail, agent-host,
  agent-history-dialog, account-form-dialog, account-detail,
  web/app/onboarding/page.tsx  (1 site each)

THE RULING ON WHAT NOT TO CONVERT — obey it, it is why the lanes agree:
  · <input type="file" hidden> behind a Button or FileUpload is a MECHANISM,
    not a control. Converting it breaks the browser's file dialog. Leave it.
    (file-picker, help-attachments, knowledge-upload-dialog)
  · <form onSubmit> is correct HTML and gives Enter-to-submit for free. The
    kit's structures/form is a form LAYOUT, not a replacement. Leave it.
  · <img> drawing a USER-SUPPLIED picture that has failure handling around it
    (a key on the src, an onError fallback) — leave it unless you can prove the
    kit's Image does the same. brand-mark's is static art and should convert.

CONVERT: every <button> that is a button → @shared/ui/controls/button/button.
Every <label> that labels a field → @shared/ui/controls/label/label (already
imported in three files — copy that pattern). Static <img> → the kit's Image.

R31 IS NEW TODAY: write rounded-[var(--radius)] and rounded-pill. The Tailwind
step names (rounded-xl, rounded-full, rounded-lg) now FAIL the build.

FINISH WITH:
  npm run check          → must exit 0
  Then RUN THE APP and look at it. A converted button that compiles can still
  be the wrong size, lose its icon, or lose a click handler. Screenshot the
  app shell and one dialog.
  Commit on lane/controls-a and push. Do NOT merge and do NOT deploy.

REPORT: how many you converted, how many you LEFT and why. An honest "I left
six" is worth more than six silent conversions. Nobody is counting conversions.
```

---

## LANE B · screens & panels — 8 files, 12 sites

```
BEFORE ANYTHING ELSE: nobody is counting conversions. If you are unsure about an
element, leave it and say so. Converting something that should have stayed is a
SILENT break.

Same setup, different branch and files:
  git worktree add -b lane/controls-b ~/Desktop/kwapso-ctrl-b lane/ui-swap

YOUR FILES — these 8 and no others:
  web/components/agent-panel.tsx               (2 button, 1 input)
  web/components/work-panels.tsx               (2 button)
  web/components/import-screen.tsx             (1 input, 1 label)
  web/components/stakeholders-panel.tsx        (1 button)
  web/components/screens/kwapso-screen.tsx     (1 button)
  web/components/meetings-screen.tsx           (1 button)
  web/components/contact-panels.tsx            (1 button)
  web/components/account-detail-panels.tsx     (1 button)

Everything else — the ruling on what not to convert, R31, the gate, the visual
check, the report — is identical to Lane A. Read that prompt's middle section.

NOTE ON agent-panel.tsx: its <input> is the assistant's composer. Check whether
the kit's Input supports what it does (Enter to send, disabled while streaming)
before converting; if it does not, leave it and say so.
```

---

## LANE C · shared seams + the portal's remainder — 10 files, 19 sites

```
BEFORE ANYTHING ELSE: nobody is counting conversions. If you are unsure about an
element, leave it and say so. This lane especially — see the warning below.

Same setup:
  git worktree add -b lane/controls-c ~/Desktop/kwapso-ctrl-c lane/ui-swap

YOUR FILES — these 6 and no others:
  shared/web/screen-engine/range-facet.tsx      (2 button, 2 label)
  shared/web/record-mark.tsx                    (4 img)
  shared/web/screen-engine/filter-bar.tsx       (3 button)
  shared/web/screen-engine/searchable-facet.tsx (1 button)
  shared/web/screen-engine/screen-renderer.tsx  (1 button)
  shared/web/form-shell.tsx                     (1 form)

AND THE CLIENT PORTAL'S REMAINDER — 4 files, 5 sites, of which the honest
answer is probably ONE conversion:
  web-portal/components/ticket-screen.tsx       (1 input type="text"  → CONVERT)
  web-portal/components/ticket-attachments.tsx  (2 input type="file"  → LEAVE)
  web-portal/components/waiting-on-you.tsx      (1 input type="file"  → LEAVE)
  web-portal/components/deliverables-screen.tsx (1 img, user-supplied → CHECK)

DO NOT TOUCH web-portal/components/sign-in.tsx OR portal-shell.tsx, and the
reason has CHANGED — read it, because the old one is no longer true.

lane/portal-signin has LANDED on main, so those files are no longer contested.
They are excluded now because:
  · sign-in.tsx holds one <form> and one <img>, both on the do-not-convert
    list. There was never anything there for you.
  · portal-shell.tsx carries a hand-drawn copy of the kit's AuthShell, drawn
    because the kit's own screen could not be imported under Next. That is
    fixed upstream (kit v1.2.0) and the file is scheduled for DELETION —
    UI-GAPS row 23 says deleted, not revisited. Converting controls inside a
    file with a deletion date on it is work thrown away twice: once when you do
    it, once when someone reviews it.

The portal is the client's front door — narrow, calm, larger type. Check it at a
phone width as well as a desktop one.

THIS LANE IS THE RISKIEST AND THE SMALLEST — that is not a contradiction.
Every file here is used by BOTH front doors and by every recipe-driven screen
in the app. A regression in filter-bar or screen-renderer shows up on dozens of
screens at once, not one.

So: convert the buttons and labels, and be conservative.
  · record-mark.tsx's four <img> — LEAVE THEM unless you can prove the kit's
    Image reproduces the failure handling. Read that file's header first; it
    explains what it exists to prevent and it is not decoration.
  · form-shell.tsx's <form> — leave it, it is correct HTML.
  · screen-renderer.tsx also imports @radix-ui/react-dialog directly. That is a
    PINNED exemption (UI_PACKAGE_EXEMPT, R39) with an upstream fix already
    written. Do not touch it and do not try to remove it.

Verify by opening a recipe-driven collection screen with filters and using
them — not only by the gate.
```
