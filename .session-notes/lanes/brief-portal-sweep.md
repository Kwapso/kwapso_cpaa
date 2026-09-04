# Lane brief: walk every screen of the client portal, and report what Aurora's round reached

You are a verification lane on **the Kwapso System** (`Kwapso/kwapso_system`), working
alongside a planner session. This is a SWEEP, not a build: you are finding out what is
broken, not fixing it. Fix nothing without saying so in the report.

## Setup

    cd /Users/alaap_kanchwala_apple/Desktop/kwapso_cpaa
    git fetch origin
    git worktree add ../kwapso-portal-sweep -b audit/portal-sweep origin/main
    cd ../kwapso-portal-sweep && npm install

Read `CLAUDE.md` first. Do not work in the primary checkout — two other sessions share it.

## Where to test

Staging was deployed from `origin/main` at 05:40 UTC on 4 Sep 2026, so it carries
Aurora's complete UI round and her audit of it. Both smokes passed.

- Client portal: **https://staging-client.kwapso.app**
- Agency app (for comparison): **https://agency-staging.kwapso.app**
- A client login on staging is `alaap@swiftstruck.com`. `alaap@kwapso.com` is the AGENCY
  login — signing in with it will not show you the portal.

## The surface, measured off disk

Seven routes: `home`, `company`, `deliverables`, `impact`, `tickets/[[...rest]]`,
`login`, and the root `page.tsx`. Twenty-four components in `web-portal/components/`.

## What to report, per screen

For each of the seven routes:

1. **Does it render at all** — or an error, a blank, or a spinner that never resolves.
2. **Every button and control on it.** Press each one. Say what it did. A control that
   does nothing is a finding; so is one that throws in the console.
3. **Empty states.** What does the screen show when its collection has no rows? "Nothing
   here" and "it broke" must look different — Aurora's round fixed exactly that class of
   bug on the agency side and the portal is where it was worst.
4. **Console and network.** Any error, any 4xx/5xx, any request that never returns.
5. **Narrow width.** Re-check at 375px. The portal is a reading surface and the client
   opens it on a phone.

## The second question, which is the point of the sweep

**How much of Aurora's UI round actually reached the portal?** Measured from the merge:
her round touched **22 files under `web-portal/`, +410/-116** — against 269 files overall.
So the portal got a fraction. Establish concretely which improvements are present and
which stop at the agency door. Compare like for like:

- the new shell and its scrolling behaviour
- toolbars and filter panels on collections
- the error card versus a bare red line
- tab shape and count badges
- the folder-tab trail
- the two spines and the scale setting

For each: **present in the portal / agency only / not applicable.** "Not applicable" needs
a reason — the portal is deliberately a narrower, calmer surface (`SHAPE_SHELL.calm`,
`max-w-3xl`, UI-RULEBOOK L5), so some absences are correct rather than missing.

## Constraints

- **Read-only on staging.** Do not create, edit, delete or send anything through the portal.
  It holds real client data. Look, press what is safe to press, and report.
- **A press that would write** (raise a ticket, send a message, upload) — do NOT complete it.
  Open the dialog, confirm it renders, cancel.
- Every Cloudflare command takes the `cf-exec` prefix. `npm run check` is read by EXIT CODE.
- Never run `scripts/i18n-translate.mjs`.
- Do not deploy. Do not touch `shared/ui/`.

## Report back

A table of the seven screens with a verdict each, a list of every broken control with the
console error beside it, and the present/agency-only/not-applicable table for Aurora's
round. Rank findings by what a CLIENT would notice, not by what is technically worst.
