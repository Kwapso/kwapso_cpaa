# ADVISORIES.md — what `npm audit` reports, and what can actually be reached

`npm audit` reports **29 advisories across 9 packages (13 high, 13 moderate, 3 low)**.
It counts what is *installed*. This file answers the different question the owner asked:
**can the vulnerable code be reached by a running Cloudflare Worker, or by a browser
loading the exported site?**

**Answer: 0 of the 29 are reachable. 0 of the 13 high.**

Nothing here is a claim about severity being overstated in general. Every one of these
is a real bug in a real package. The finding is about *this deployment shape*: the
vulnerable code is never loaded by anything we deploy.

Re-run the proof at any time with the commands in [§ How to re-run the proof](#how-to-re-run-the-proof).

---

## The two deployed surfaces, established first

Everything below rests on these four facts about what kwapso actually ships. Each is
evidence, not assertion.

**F1 — All eight workers have zero runtime dependencies.**
`workers/{auth,tenancy,content,data-ops,realtime,mcp,gateway,portal-gateway}/package.json`
declare **no `dependencies` key at all** — reading each one back gives `{}` for all eight.
Their `devDependencies` are only `@cloudflare/workers-types`, `typescript`, `vitest`. No
npm package is bundled into any worker, so no advisory below can reach a worker through a
dependency.

**F2 — Worker source imports no npm package at all.**
Across the **118** shipped worker source files (`workers/*/src/**/*.ts`, excluding
`*.test.ts`), the only non-relative imports are `@shared/*` (a repo-local path alias to
`shared/`) and `cloudflare:workers` (a Workers runtime built-in). A targeted search for
each vulnerable package name across those 118 files returns **0 files** for every one of
`next`, `sharp`, `postcss`, `undici`, `ws`, `nanoid`, `esbuild`, `miniflare`, `wrangler`,
`jsdom`.

**F3 — Both front doors are static exports, served as assets.**
`web/next.config.ts` and `web-portal/next.config.ts` set `output: "export"` and
`images: { unoptimized: true }` under `BUILD_STATIC=1`, which is what `npm run build`
invokes (`build:static`). The build output lists every route as `○ (Static)` or
`● (SSG)` — **no `ƒ` / dynamic route exists**. `workers/gateway/wrangler.jsonc` serves
`../../web/out` and `workers/portal-gateway/wrangler.jsonc` serves `../../web-portal/out`
through the Cloudflare `assets` binding. No Next.js server runtime is deployed anywhere:
there is no `next-on-pages`, no OpenNext, no `next start` in any build, check or deploy
script.

**F4 — The exported output contains no server runtime and no vulnerable package code.**
`web/out` (1,754 files) and `web-portal/out` (70 files) contain HTML, `_next/static`
chunks, icons and one CSS file each. Neither contains a `server/` directory, a
server-reference or action manifest, an `.rsc` payload, or a `middleware` file. Grepping
the full emitted JS/HTML/CSS of both exports returns **0 files** for the code signature of
every vulnerable package (details per row below).

Two supporting facts used by individual rows:

- **No `nodejs_compat`.** No `workers/*/wrangler.jsonc` sets `nodejs_compat` or
  `node_compat`, so a worker cannot pull in a Node-polyfilled `undici` or `ws` even
  incidentally.
- **Host platform is `darwin`** (`process.platform` → `darwin`), which matters for the
  one Windows-only advisory.

---

## The 29 advisories

Severity is npm's per-advisory severity. "Reachable" means: can this code run in a
deployed Cloudflare Worker, or in a browser loading `web/out` or `web-portal/out`?

### `next` — 8 advisories (3 high, 5 moderate)

Installed 15.5.19; advisories cover `>=13.0.0 <15.5.21`. Next.js **is** shipped to the
browser here — its client runtime is in `_next/static`. So each row below is about
whether that *specific* CVE lives in client code or server code. All eight are in the
Next.js **server** runtime, which F3 shows is never deployed.

Two facts kill most of this class outright: `grep -rn '"use server"' web web-portal` →
**0 files** (no Server Actions exist to attack), and there are **0** `app/**/route.ts`
route handlers, **0** `middleware.ts`, and **0** `export const runtime = "edge"`
declarations in either front door.

| Package | Advisory | Severity | Reachable | Evidence |
|---|---|---|---|---|
| next | [GHSA-m99w-x7hq-7vfj](https://github.com/advisories/GHSA-m99w-x7hq-7vfj) — DoS in App Router using Server Actions | high | **No** | Requires a Server Action endpoint. `grep -rn 'use server' web web-portal --include='*.ts*'` → **0 files**. `output: "export"` forbids Server Actions; build emits no server-reference manifest in either `out/` (F3, F4). |
| next | [GHSA-89xv-2m56-2m9x](https://github.com/advisories/GHSA-89xv-2m56-2m9x) — SSRF in Server Actions on custom servers | high | **No** | Requires both a Server Action and a custom Node server. Neither exists: 0 `use server`; `next start` appears only as an unused script in `web/package.json:10` and is invoked by no build, check or deploy script. Deploy is `wrangler deploy` serving `web/out` as assets (F3). |
| next | [GHSA-p9j2-gv94-2wf4](https://github.com/advisories/GHSA-p9j2-gv94-2wf4) — SSRF in rewrites via attacker-controlled destination hostname | high | **No** | `rewrites()` exists only in the **non-static** branch of `web/next.config.ts` / `web-portal/next.config.ts` (the `BUILD_STATIC` else-branch, dev only), and every destination is a hardcoded `http://127.0.0.1:{8787,8788,8789}` literal — no attacker-controlled hostname. `output: "export"` drops rewrites entirely; the deployed router is `workers/gateway/src/index.ts`, which is our own code (F2). |
| next | [GHSA-68g3-v927-f742](https://github.com/advisories/GHSA-68g3-v927-f742) — cache confusion of response bodies for requests with bodies | moderate | **No** | Requires the Next.js server response cache. No Next server is deployed; `out/` has no `server/` or `cache/` directory (F3, F4). Responses come from the Cloudflare asset layer and our own workers. |
| next | [GHSA-4633-3j49-mh5q](https://github.com/advisories/GHSA-4633-3j49-mh5q) — cache confusion via invalid UTF-8 byte sequences in bodies | moderate | **No** | Same server response cache as the row above; same evidence. The static export answers GETs for files on disk — it has no request-body cache path at all. |
| next | [GHSA-4c39-4ccg-62r3](https://github.com/advisories/GHSA-4c39-4ccg-62r3) — unbounded Server Action payload in Edge runtime | moderate | **No** | Needs both a Server Action and the Edge runtime. `grep -rn "runtime *= *['\"]edge['\"]" web web-portal` → **0 files**; `grep -rn 'use server'` → **0 files** (F3). |
| next | [GHSA-q8wf-6r8g-63ch](https://github.com/advisories/GHSA-q8wf-6r8g-63ch) — DoS in the Image Optimization API using SVGs | moderate | **No** | Needs the `/_next/image` server route. `images: { unoptimized: true }` is set in both configs, and the emitted bundle carries `unoptimized:!0` inside the live `ImageConfigContext` (`web/out/_next/static/chunks/main-*.js`). The only `_next/image` string in either export is the inert `imageConfigDefault` **config literal** in that same chunk; grepping both exports for an actual optimizer URL (`_next/image?`) returns **0 files**. `next/image` is imported by **0** files in either front door. |
| next | [GHSA-955p-x3mx-jcvp](https://github.com/advisories/GHSA-955p-x3mx-jcvp) — unauthenticated disclosure of internal Server Function endpoints | moderate | **No** | Discloses Server Function endpoints; there are none to disclose. 0 `use server`, 0 `app/**/route.ts`, 0 `middleware.ts`, and no server-reference manifest in either `out/` (F3, F4). |

### `postcss` — 4 advisories (2 high, 2 moderate)

Build-time CSS tooling. Two install paths, both build-only:
`web-portal → @tailwindcss/postcss@4.3.0 → postcss@8.5.15` (a **devDependency**), and
`next → postcss@8.4.31` (Next's build pipeline). PostCSS runs on **our own repo's CSS**
during `next build` and emits plain CSS; it is not shipped and never sees third-party input.

| Package | Advisory | Severity | Reachable | Evidence |
|---|---|---|---|---|
| postcss | [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) — arbitrary file read via attacker-controlled `sourceMappingURL` in CSS comments | high | **No** | Needs PostCSS to parse attacker-controlled CSS. Its only inputs are repo-owned stylesheets processed during `next build`. Not shipped: grepping both exports for `postcss` and `CssSyntaxError` returns **0 files**; `web/out` and `web-portal/out` each ship **1 plain `.css` file and 0 `.map` files**, with **0** occurrences of `sourceMappingURL`. |
| postcss | [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) — path traversal in previous-source-map auto-loading | high | **No** | Same build-time-only surface and same evidence: 0 sourcemaps emitted, 0 `sourceMappingURL` in shipped CSS, 0 postcss code in either export (F4). |
| postcss | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) — XSS via unescaped `</style>` in CSS stringify output | moderate | **No** | Requires PostCSS to stringify attacker-controlled CSS into a page. No user-supplied CSS reaches the build; the CSS is generated once at build from repo files. PostCSS is not in the browser bundle (0 files, F4). |
| postcss | [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) — incomplete fix of GHSA-6g55-p6wh-862q, arbitrary `.map` read when `from` is unset | moderate | **No** | Same build-time-only surface as its parent advisory; same evidence. |

### `undici` — 12 advisories (4 high, 6 moderate, 2 low)

Two install paths, both non-deployed: `web-portal → jsdom@29.1.1 → undici@7.28.0`
(**jsdom is a devDependency**, used as the vitest DOM environment) and
`wrangler → miniflare@4.20260611.0 → undici@7.24.8` (wrangler's **local** dev simulator).

Deployed workers use the Workers runtime's native `fetch`, not this package: worker source
references `undici` in **0** files (F2), no worker declares any dependency (F1), and no
wrangler config enables `nodejs_compat`. The browser uses its own `fetch`; `undici`/`ProxyAgent`
appear in **0 files** of either export (F4). Every row below shares that evidence, so the
per-row column names the specific attack surface that is absent.

| Package | Advisory | Severity | Reachable | Evidence |
|---|---|---|---|---|
| undici | [GHSA-vmh5-mc38-953g](https://github.com/advisories/GHSA-vmh5-mc38-953g) — TLS cert validation bypass via dropped `requestTls` in SOCKS5 ProxyAgent | high | **No** | Needs undici's `ProxyAgent` with a SOCKS5 proxy. `ProxyAgent` appears in 0 files of either export; 0 worker files reference undici (F1, F2, F4). No proxy is configured anywhere in the repo. |
| undici | [GHSA-vxpw-j846-p89q](https://github.com/advisories/GHSA-vxpw-j846-p89q) — WebSocket client DoS via fragment count bypass | high | **No** | Needs undici's **WebSocket client**. The only WebSocket code we deploy is the realtime worker's `new WebSocketPair()` (`workers/realtime/src/index.ts:155`), a Workers runtime built-in. undici is in 0 worker files and 0 export files. |
| undici | [GHSA-hm92-r4w5-c3mj](https://github.com/advisories/GHSA-hm92-r4w5-c3mj) — cross-origin request routing via SOCKS5 proxy pool reuse | high | **No** | Needs a SOCKS5 proxy pool in undici. Same absence as GHSA-vmh5-mc38-953g: no undici in any deployed surface, no proxy configured. |
| undici | [GHSA-4cwx-7wf7-3272](https://github.com/advisories/GHSA-4cwx-7wf7-3272) — cross-user info disclosure / parse-time crash via degenerate private cache directives | high | **No** | Needs undici's HTTP cache interceptor. Not deployed (F1, F2); workers cache through Cloudflare, not undici. |
| undici | [GHSA-p88m-4jfj-68fv](https://github.com/advisories/GHSA-p88m-4jfj-68fv) — HTTP header injection via `Set-Cookie` percent-decoding | moderate | **No** | Needs undici to parse `Set-Cookie`. Deployed cookie handling is the Workers runtime's; undici is in 0 worker files and 0 export files (F2, F4). |
| undici | [GHSA-pr7r-676h-xcf6](https://github.com/advisories/GHSA-pr7r-676h-xcf6) — cross-user info disclosure via shared cache whitespace bypass | moderate | **No** | undici HTTP cache interceptor; not deployed (F1, F2). |
| undici | [GHSA-8xcm-r25x-g524](https://github.com/advisories/GHSA-8xcm-r25x-g524) — downstream response desynchronization via retry interceptor | moderate | **No** | Needs undici's retry interceptor; not deployed (F1, F2). |
| undici | [GHSA-m8rv-5g2x-5cg5](https://github.com/advisories/GHSA-m8rv-5g2x-5cg5) — CRLF injection via blob-like body `type` property | moderate | **No** | Needs undici request-body construction; not deployed (F1, F2). |
| undici | [GHSA-jr45-8vmc-qm54](https://github.com/advisories/GHSA-jr45-8vmc-qm54) — cross-user info disclosure via whitespace around equals in `Cache-Control` | moderate | **No** | undici HTTP cache interceptor; not deployed (F1, F2). |
| undici | [GHSA-v3r7-h72x-cjcm](https://github.com/advisories/GHSA-v3r7-h72x-cjcm) — cookie attribute injection via unsanitized domain / unparsed `setCookie` | moderate | **No** | Needs undici's cookie helpers; not deployed (F1, F2). |
| undici | [GHSA-g8m3-5g58-fq7m](https://github.com/advisories/GHSA-g8m3-5g58-fq7m) — `Set-Cookie` SameSite downgrade via permissive substring matching | low | **No** | Needs undici cookie parsing; not deployed (F1, F2). |
| undici | [GHSA-35p6-xmwp-9g52](https://github.com/advisories/GHSA-35p6-xmwp-9g52) — HTTP response queue poisoning via keep-alive socket reuse | low | **No** | Needs undici's connection pool; not deployed (F1, F2). Workers do not manage keep-alive sockets. |

### `nanoid` — 2 advisories (2 high)

Reached only through PostCSS: `next → postcss@8.4.31 → nanoid@3.3.12` and
`web-portal → @tailwindcss/postcss → postcss@8.5.15 → nanoid` (deduped). PostCSS uses it
for internal ids at build time.

| Package | Advisory | Severity | Reachable | Evidence |
|---|---|---|---|---|
| nanoid | [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv) — non-secure generators can loop indefinitely with negative size | high | **No** | Requires calling nanoid with an attacker-controlled negative size. Its only caller is PostCSS at build time, with fixed internal sizes; no repo code imports nanoid. Not shipped: nanoid's alphabet signature (`useandom-26T198340PX75px…`) appears in **0 files** of `web/out` and **0 files** of `web-portal/out` (F4). |
| nanoid | [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) — custom generators can loop indefinitely when size is zero | high | **No** | Same single build-time caller and same absence from both exports; requires a custom generator with attacker-controlled size, which no code here constructs. |

### `sharp` — 1 advisory (1 high)

| Package | Advisory | Severity | Reachable | Evidence |
|---|---|---|---|---|
| sharp | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) — inherited libvips CVEs (CVE-2026-33327/33328/35590/35591) | high | **No** | `sharp` is a **native Node binding** and cannot execute in the Workers runtime at all. It is declared in **no** `package.json` — purely transitive via `next → sharp` (the image optimizer) and `wrangler → miniflare → sharp` (local dev). The optimizer is off: `unoptimized: true` in both configs, 0 `next/image` imports, 0 `_next/image?` URLs emitted (see the Image Optimization row). Both exports contain **0** `.node` binaries and **0** files referencing `sharp` (F4). The one real caller is `scripts/gen-icons.mjs`, which is referenced by **no** npm script — it is run by hand on a developer's Mac over the repo's **own committed** `web/public/icons/*.svg`, never over untrusted input, and its output PNGs are committed as static assets. |

### `ws` — 1 advisory (1 high)

| Package | Advisory | Severity | Reachable | Evidence |
|---|---|---|---|---|
| ws | [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) — memory exhaustion DoS from tiny fragments and data chunks | high | **No** | Single install path `wrangler → miniflare@4.20260611.0 → ws@8.20.1` — wrangler's **local** dev simulator, never deployed. Deployed WebSockets use the Workers runtime built-in `new WebSocketPair()` (`workers/realtime/src/index.ts:155`); `workers/realtime/package.json` declares no runtime dependencies. `WebSocketServer` appears in **0 files** of either export (F1, F2, F4). |

### `esbuild` — 1 advisory (1 low)

| Package | Advisory | Severity | Reachable | Evidence |
|---|---|---|---|---|
| esbuild | [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) — arbitrary file read when running the development server **on Windows** | low | **No** | Two build-time-only paths: `wrangler → esbuild@0.27.3` and `workers/* → vitest → vite → esbuild`. The advisory requires esbuild's **dev server**, which nothing here runs, and is **Windows-only** — `process.platform` is `darwin`. esbuild appears in **0 files** of either export (F4). |

---

## What this means, and what was changed

**Reachable: 0 of 29. 0 of the 13 high.** Every advisory sits in one of three buckets,
none of which is deployed:

1. **Build-time tooling** — `postcss`, `nanoid`, `esbuild` (via vite/wrangler). Runs on a
   developer's or CI's machine over repo-owned input; produces plain CSS/JS.
2. **Local dev and test tooling** — `wrangler`, `miniflare`, `ws`, `undici` (via miniflare
   and jsdom), `sharp` (via miniflare). Never uploaded by `wrangler deploy`.
3. **Next.js server runtime** — all 8 `next` advisories, plus `sharp` via the image
   optimizer. Excluded by `output: "export"`; the workers serve a folder of files.

**Per the owner's ruling, no upgrade was applied**, because the fix step is scoped to
advisories proven reachable and none were. In particular `next` was left at 15.5.19: the
`npm audit fix --force` for it is a major-version jump that would put the static export —
the very property that makes these 8 advisories unreachable — at risk, in exchange for
closing nothing that is open.

Only `ADVISORIES.md` was added. `package.json`, `package-lock.json` and the workspace
package files are untouched, so the dependency tree this proof describes is exactly the
one on the branch. `npm run check:built` passes.

### What would change this answer

This finding is a property of the deployment shape, not of the packages. Re-run the proof
if any of these change — each one reopens a specific bucket:

- **A front door stops being a static export** (`output: "export"` removed, or a Next
  server / `next-on-pages` / OpenNext deployed) → reopens all 8 `next` advisories and the
  `sharp` image-optimizer path.
- **A Server Action, `app/**/route.ts`, `middleware.ts`, or `export const runtime = "edge"`
  is added** to `web/` or `web-portal/` → reopens the Server Action and Server Function rows.
- **`images: { unoptimized: true }` is removed** or `next/image` starts being used with an
  optimizer → reopens GHSA-q8wf-6r8g-63ch and `sharp`.
- **Any worker gains a runtime dependency** (`"dependencies"` stops being `{}`) or a
  wrangler config enables `nodejs_compat` → reopens `undici` and `ws`.
- **`scripts/gen-icons.mjs` is pointed at untrusted images**, or wired into a build →
  reopens `sharp`.
- **PostCSS is made to process user-supplied CSS** → reopens the 4 `postcss` rows and the
  2 `nanoid` rows.

### How to re-run the proof

```bash
npm audit --json > /tmp/audit.json && npm run build
```

Then the four load-bearing checks, each of which must stay at zero:

```bash
node -e "for(const w of require('fs').readdirSync('workers'))console.log(w,JSON.stringify(require('./workers/'+w+'/package.json').dependencies??{}))"
```

```bash
grep -rlE "['\"](next|sharp|postcss|undici|ws|nanoid|esbuild)['\"]" workers/*/src --include='*.ts' | grep -v test | wc -l
```

```bash
grep -rlE "useandom-26T198340PX75px|CssSyntaxError|ProxyAgent|WebSocketServer|esbuild|sharp" web/out web-portal/out | wc -l
```

```bash
grep -rn "use server\|runtime *= *['\"]edge['\"]" web web-portal --include='*.ts' --include='*.tsx' | grep -v node_modules | wc -l
```

*Proof run 2026-08-19 against `next@15.5.19`, `wrangler@4.100.0`, `miniflare@4.20260611.0`,
on branch `lane/advisories`.*
