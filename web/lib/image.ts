// Downsize a chosen photo in the browser before upload, so a 12MB phone
// picture becomes a small square-ish JPEG data URL the worker accepts.
//
// TWO DECODE PATHS ON PURPOSE. `createImageBitmap` is the fast one, but it is
// not universally reliable: Safari (including the macOS/iOS web-app runtime)
// throws on perfectly valid files — notably iPhone PNGs and anything carrying
// an unusual colour profile — and some browsers reject HEIC outright. A hard
// failure there reads to the user as "this app can't take my photo", which is
// exactly what happened on the first real sign-in. So we fall back to the
// classic <img> + object URL decode, which is slower but succeeds where the
// modern path gives up. Only if BOTH fail do we surface an error.

import { KNOWLEDGE_FILE_MAX_BYTES } from "@shared/workers/limits"

// PRE-DOWNSIZE GUARD: a sane phone photo, before the canvas ever runs. This
// used to be its own `25_000_000` (decimal) — a 1.2 MB window (25,000,000 vs
// 26,214,400) in which the browser refused a file the server, checking the
// same cap in binary, would have accepted. `KNOWLEDGE_FILE_MAX_BYTES` is
// `shared/workers/limits.ts`'s own name for the one number this app already
// teaches on every other upload door (its own comment says so); it is pure
// constants with no imports, so importing it here costs the browser bundle
// nothing, and `web/components/access-tokens.tsx` already reaches into the
// same file for `MCP_TOKEN_TTL_DAYS`. One cap, read once, never retyped.
export const MAX_UPLOAD_BYTES = KNOWLEDGE_FILE_MAX_BYTES

/** Decode via the fast path, falling back to an <img> element. */
async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file)
    } catch {
      // fall through to the element decode
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = "async"
    // Object URLs are same-origin, but this keeps the canvas untainted if the
    // source ever becomes a remote URL.
    img.crossOrigin = "anonymous"
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("decode failed"))
      img.src = url
    })
    // Safari resolves onload before the bitmap is always paintable.
    if (typeof img.decode === "function") await img.decode().catch(() => {})
    return img
  } finally {
    // Revoking immediately is safe: the element keeps its decoded copy.
    URL.revokeObjectURL(url)
  }
}

export async function fileToDataUrl(file: File, maxSize = 512): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("not an image")
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("image too large")

  const source = await decode(file)
  const sw = source.width
  const sh = source.height
  if (!sw || !sh) throw new Error("image has no dimensions")

  const scale = Math.min(1, maxSize / Math.max(sw, sh))
  const width = Math.max(1, Math.round(sw * scale))
  const height = Math.max(1, Math.round(sh * scale))

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas not available")
  // A white base matters: transparent PNGs flattened to JPEG would otherwise
  // composite onto black and come back as a dark square.
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0, width, height)
  if ("close" in source && typeof source.close === "function") source.close()

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85)
  // A canvas that failed to paint serialises to a tiny stub; treat that as a
  // failure rather than uploading an empty square.
  if (dataUrl.length < 512) throw new Error("image did not render")
  return dataUrl
}
