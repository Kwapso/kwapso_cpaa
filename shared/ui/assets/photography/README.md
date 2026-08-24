# Photography

## What is here, and what draws it

**`exterior-mockup.png`** — 1920 × 1080, 1264 KB. The client's own file, kept
as the master and never loaded by an application.

Client, 2026-08-24: *"we will replace it later, but so far for the external
screens image use the attached (the phone mockup)"* — a phone on a metal tray,
the kwapso portal on its screen, shot from above.

It is the picture on the **left half of every outside screen**: sign in, link
sent, session expired, invitation, password/security and the portal's door.
They all share chapter 27.16's two-panel shell, so this is ONE image and one
component — `AuthPhotograph` in `compositions/shapes/sign-in.tsx`. No screen
names a file, a width or a crop.

## To replace it

Drop a new file over `exterior-mockup.png` and run:

```
node assets/build-assets.mjs
```

That is the whole swap. Nothing else in the repository changes, and all six
screens follow.

## What the build makes, and why

| file | size |
|---|---|
| `exterior-mockup-960.jpg` | 62 KB |
| `exterior-mockup-1440.jpg` | 118 KB |
| `exterior-mockup-1920.jpg` | 190 KB |

Three JPEGs at quality 78, served through `srcset`, against the master's
1264 KB. **PNG is the wrong container for a photograph** — it is lossless,
which is precisely what a photograph does not need, and 1.26 MB on the first
screen anyone sees is not shippable. A tablet now downloads 62 KB and a
desktop 118 KB.

**No WebP, and not for want of trying.** It would save perhaps another quarter.
This machine cannot encode it: `sips` lists `org.webmproject.webp` among its
formats but answers *"Can't write format"* — it reads WebP and does not write
it, and there is no `cwebp`, no ImageMagick and no PIL here. None of those is
worth adding to a repository whose delivery is vendored source with no build
step. Recorded in `../UPLOAD.md` §7 as a nice-to-have, not a blocker.

## The crop, which is the part that needed thought

The source is 16:9 landscape. The slot is **half the viewport wide and the
whole viewport tall**, so `object-fit: cover` keeps the full height and throws
width away — only the horizontal position can matter.

Measured on the master: the phone spans **40.1% to 62.5%** of the frame, centred
at 51.3%. So `object-position` is **51%**, not the default 50%. What survives:

| viewport | column | keeps | what is in frame |
|---|---|---|---|
| 1440 | 674 × 758 | 26% – 76% | tray, phone, stapler, pencil |
| 834 | 382 × 773 | 37% – 65% | tray edge and the whole phone |
| very tall 834 | 369 × 1112 | 42% – 60% | the phone's screen and the wordmark |

At the narrowest the tray and the pencil are gone and the phone's screen
survives, which is the right thing to lose last.

**Below 48rem it is not drawn at all** — 27.16, *"the image drops"*. The
wrapper is `hidden md:block` and the `<img>` is `loading="lazy"`, so it has no
layout box and **is never fetched**: verified at 380 and at 767, zero bytes.

It is **decorative** — `alt=""`. The heading beside it already names the
screen.

## Nothing else needs a photograph

The gallery's tiles, the company hub's header band and every avatar are content
an application uploads, not design assets. Those slots draw `ImageSlot` in the
demo and nothing in the delivery.
