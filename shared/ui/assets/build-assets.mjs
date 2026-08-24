/* ============================================================================
   assets/build-assets.mjs — every derived image in this folder, from the
   masters the client uploaded, reproducibly.

   WHY A SCRIPT AND NOT A ONE-OFF RUN
   Twenty-two binary files are committed alongside the six logo masters and the
   two app-icon masters. Without this file nobody can say what any of them was
   made from, at what size, or with which crop — and the next re-export of the
   brand would have to be reverse-engineered. Run it and everything downstream
   of a master is rebuilt:

       node assets/build-assets.mjs            # write
       node assets/build-assets.mjs --check    # fail if anything is stale

   NO IMAGE LIBRARY IS INSTALLED ON THIS MACHINE, AND NONE IS ADDED
   `sips` ships with macOS but cannot write .ico, cannot trim to content and
   cannot flatten to a chosen colour. ImageMagick is absent; python3 has no
   PIL. Rather than add a dependency to a repository whose whole delivery is
   "vendored source, no build", the three operations actually needed are
   written here against `node:zlib`:

     · DECODE  — PNG, non-interlaced, 8-bit, colour types 0/2/3/4/6.
     · RESIZE  — box filter (area average) on PREMULTIPLIED alpha. For a
                 3000px master going to 96px this is the right filter and not
                 a compromise: every destination pixel is the true mean of the
                 ~31x31 source pixels under it. Premultiplying is what stops a
                 black glyph on transparent developing a dark halo.
     · ENCODE  — PNG (colour type 6 with alpha, colour type 2 without) and
                 ICO (BITMAPINFOHEADER/DIB entries, the universally-read form,
                 not a PNG with the extension changed).

   THE TWO MEASUREMENTS EVERYTHING ELSE FOLLOWS FROM
   Measured off the masters by this file's own decoder, not guessed:

     isotype-black.png     3000 x 2997, ink 1665 x 1666 at (670, 665)
                           -> the ink fills 55.5% of the canvas, dead centre.
     logotype-black.png    3000 x  835, ink 2708 x  542 at (146, 146)
                           -> 146px of empty canvas on all four sides.

   That 55.5% is why `demo/placeholder.tsx` had to blow its <img> up to 180%
   inside a clipping box: a 2.5rem slot was drawing a 1.4rem glyph. Every
   derivative below is TRIMMED TO THE INK first, so the hack is not needed and
   is removed. The masters keep their padding and are not touched.

   WHAT IS NOT BUILT HERE, AND WILL NOT BE
   `favicon.svg`. An SVG that wraps a raster is not a vector: it carries the
   PNG's pixels, scales exactly as badly, and is larger. It is the one item in
   assets/UPLOAD.md still genuinely blocked on the client, and §4/§5 say so.
   ========================================================================= */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK = process.argv.includes("--check");

/* ----------------------------------------------------------------------------
   DECODE
   ------------------------------------------------------------------------- */

/** @returns {{w:number,h:number,rgba:Buffer}} 8-bit straight-alpha RGBA. */
function decodePng(file) {
  const d = readFileSync(file);
  let i = 8;
  let ihdr = null;
  const idat = [];
  let plte = null;
  let trns = null;
  while (i < d.length) {
    const len = d.readUInt32BE(i);
    const type = d.toString("ascii", i + 4, i + 8);
    const data = d.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") {
      ihdr = {
        w: data.readUInt32BE(0),
        h: data.readUInt32BE(4),
        depth: data[8],
        color: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") idat.push(data);
    else if (type === "PLTE") plte = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IEND") break;
    i += 12 + len;
  }
  if (ihdr === null) throw new Error(`${file}: no IHDR`);
  if (ihdr.interlace !== 0) throw new Error(`${file}: interlaced PNG unsupported`);
  if (ihdr.depth !== 8) throw new Error(`${file}: bit depth ${ihdr.depth} unsupported`);

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.color];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = ihdr.w * channels;
  const out = Buffer.alloc(ihdr.h * stride);

  let pos = 0;
  for (let y = 0; y < ihdr.h; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = x >= channels && prev ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }

  const rgba = Buffer.alloc(ihdr.w * ihdr.h * 4);
  for (let p = 0; p < ihdr.w * ihdr.h; p++) {
    let r, g, b, a;
    if (ihdr.color === 6) {
      r = out[p * 4]; g = out[p * 4 + 1]; b = out[p * 4 + 2]; a = out[p * 4 + 3];
    } else if (ihdr.color === 2) {
      r = out[p * 3]; g = out[p * 3 + 1]; b = out[p * 3 + 2]; a = 255;
    } else if (ihdr.color === 0) {
      r = g = b = out[p]; a = 255;
    } else if (ihdr.color === 4) {
      r = g = b = out[p * 2]; a = out[p * 2 + 1];
    } else {
      const idx = out[p];
      r = plte[idx * 3]; g = plte[idx * 3 + 1]; b = plte[idx * 3 + 2];
      a = trns && idx < trns.length ? trns[idx] : 255;
    }
    rgba[p * 4] = r; rgba[p * 4 + 1] = g; rgba[p * 4 + 2] = b; rgba[p * 4 + 3] = a;
  }
  return { w: ihdr.w, h: ihdr.h, rgba };
}

/* ----------------------------------------------------------------------------
   MEASURE, CROP, PAD, RESIZE
   ------------------------------------------------------------------------- */

/** Tightest box containing anything that is not fully transparent. */
function inkBox(img, threshold = 8) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.rgba[(y * img.w + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error("image is entirely transparent");
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function crop(img, box) {
  const out = { w: box.w, h: box.h, rgba: Buffer.alloc(box.w * box.h * 4) };
  for (let y = 0; y < box.h; y++) {
    img.rgba.copy(
      out.rgba,
      y * box.w * 4,
      ((box.y + y) * img.w + box.x) * 4,
      ((box.y + y) * img.w + box.x + box.w) * 4,
    );
  }
  return out;
}

/**
 * Grow the canvas to `w x h`, centring what is there, filling the new margin
 * with `fill` ([r,g,b,a]). Used to square a 3000x2997 master without cropping
 * three rows off it, and to square a trimmed 1665x1666 glyph.
 */
function pad(img, w, h, fill = [0, 0, 0, 0]) {
  const out = { w, h, rgba: Buffer.alloc(w * h * 4) };
  for (let p = 0; p < w * h; p++) {
    out.rgba[p * 4] = fill[0]; out.rgba[p * 4 + 1] = fill[1];
    out.rgba[p * 4 + 2] = fill[2]; out.rgba[p * 4 + 3] = fill[3];
  }
  const dx = Math.floor((w - img.w) / 2);
  const dy = Math.floor((h - img.h) / 2);
  for (let y = 0; y < img.h; y++) {
    img.rgba.copy(out.rgba, ((dy + y) * w + dx) * 4, y * img.w * 4, (y + 1) * img.w * 4);
  }
  return out;
}

/**
 * Box-filter resize on premultiplied alpha.
 *
 * Every destination pixel is the area-weighted mean of the source rectangle it
 * covers, so a 3000 -> 96 reduction averages ~31x31 real pixels rather than
 * point-sampling one of them. Alpha is premultiplied before the average and
 * divided out after: averaging straight RGBA would pull the (arbitrary) colour
 * of fully-transparent pixels into the edge and fringe the glyph.
 */
function resize(img, w, h) {
  const out = { w, h, rgba: Buffer.alloc(w * h * 4) };
  const sx = img.w / w;
  const sy = img.h / h;
  for (let dy = 0; dy < h; dy++) {
    const y0 = dy * sy;
    const y1 = (dy + 1) * sy;
    for (let dx = 0; dx < w; dx++) {
      const x0 = dx * sx;
      const x1 = (dx + 1) * sx;
      let r = 0, g = 0, b = 0, a = 0, weight = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (wy <= 0) continue;
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (wx <= 0) continue;
          const i = (y * img.w + x) * 4;
          const al = img.rgba[i + 3] / 255;
          const f = wx * wy;
          r += img.rgba[i] * al * f;
          g += img.rgba[i + 1] * al * f;
          b += img.rgba[i + 2] * al * f;
          a += img.rgba[i + 3] * f;
          weight += f;
        }
      }
      const o = (dy * w + dx) * 4;
      const alpha = a / weight;
      const un = alpha > 0 ? weight * (alpha / 255) : 0;
      out.rgba[o] = un > 0 ? Math.round(Math.min(255, r / un)) : 0;
      out.rgba[o + 1] = un > 0 ? Math.round(Math.min(255, g / un)) : 0;
      out.rgba[o + 2] = un > 0 ? Math.round(Math.min(255, b / un)) : 0;
      out.rgba[o + 3] = Math.round(alpha);
    }
  }
  return out;
}

/** Composite over an opaque colour and drop the alpha channel entirely. */
function flatten(img, [fr, fg, fb]) {
  const out = { w: img.w, h: img.h, rgba: Buffer.alloc(img.w * img.h * 4) };
  for (let p = 0; p < img.w * img.h; p++) {
    const a = img.rgba[p * 4 + 3] / 255;
    out.rgba[p * 4] = Math.round(img.rgba[p * 4] * a + fr * (1 - a));
    out.rgba[p * 4 + 1] = Math.round(img.rgba[p * 4 + 1] * a + fg * (1 - a));
    out.rgba[p * 4 + 2] = Math.round(img.rgba[p * 4 + 2] * a + fb * (1 - a));
    out.rgba[p * 4 + 3] = 255;
  }
  return out;
}

/* ----------------------------------------------------------------------------
   ENCODE
   ------------------------------------------------------------------------- */

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (CRC_TABLE === null) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/**
 * PNG out. `alpha: false` writes colour type 2 — three channels and no alpha
 * channel at all, so "no transparency" is a property of the FILE and not a
 * promise about its contents. That is what apple-touch-icon.png needs.
 */
function encodePng(img, { alpha = true } = {}) {
  const channels = alpha ? 4 : 3;
  const stride = img.w * channels;
  const raw = Buffer.alloc(img.h * (stride + 1));
  for (let y = 0; y < img.h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    for (let x = 0; x < img.w; x++) {
      const s = (y * img.w + x) * 4;
      const d = y * (stride + 1) + 1 + x * channels;
      raw[d] = img.rgba[s];
      raw[d + 1] = img.rgba[s + 1];
      raw[d + 2] = img.rgba[s + 2];
      if (alpha) raw[d + 3] = img.rgba[s + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * ICO out, as BITMAPINFOHEADER/DIB entries.
 *
 * A real .ico, not a renamed PNG. PNG-inside-ICO is legal since Vista and
 * every current browser reads it, but the DIB form is read by everything ever
 * shipped and costs 4KB at these sizes, so there is no reason to take the
 * narrower option. Each entry is 32-bit BGRA, bottom-up, followed by the
 * 1-bit AND mask the format still requires even when alpha carries the
 * transparency (rows padded to 4 bytes).
 */
function encodeIco(images) {
  const entries = [];
  const bodies = [];
  for (const img of images) {
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);
    header.writeInt32LE(img.w, 4);
    header.writeInt32LE(img.h * 2, 8); // XOR + AND, per the format
    header.writeUInt16LE(1, 12);
    header.writeUInt16LE(32, 14);
    const xor = Buffer.alloc(img.w * img.h * 4);
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        const s = ((img.h - 1 - y) * img.w + x) * 4;
        const d = (y * img.w + x) * 4;
        xor[d] = img.rgba[s + 2];
        xor[d + 1] = img.rgba[s + 1];
        xor[d + 2] = img.rgba[s];
        xor[d + 3] = img.rgba[s + 3];
      }
    }
    const maskStride = Math.ceil(img.w / 32) * 4;
    const and = Buffer.alloc(maskStride * img.h); // all zero: "opaque here"
    bodies.push(Buffer.concat([header, xor, and]));
  }
  let offset = 6 + images.length * 16;
  for (let i = 0; i < images.length; i++) {
    const e = Buffer.alloc(16);
    e[0] = images[i].w === 256 ? 0 : images[i].w;
    e[1] = images[i].h === 256 ? 0 : images[i].h;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(bodies[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += bodies[i].length;
    entries.push(e);
  }
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(images.length, 4);
  return Buffer.concat([dir, ...entries, ...bodies]);
}

/* ----------------------------------------------------------------------------
   THE BUILD
   ------------------------------------------------------------------------- */

const written = [];
let stale = 0;

function emit(relative, bytes, note) {
  const file = join(HERE, relative);
  mkdirSync(dirname(file), { recursive: true });
  const same = existsSync(file) && readFileSync(file).equals(bytes);
  if (CHECK) {
    if (!same) {
      stale += 1;
      console.error(`STALE  ${relative}`);
    }
  } else if (!same) {
    writeFileSync(file, bytes);
  }
  written.push({ relative, note });
}


/* ----------------------------------------------------------------------------
   SVG — PARSE, MEASURE THE INK, TRIM

   The client uploaded true vector masters on 2026-08-24 and they are NOT
   trimmed, which is the trap in them: every one carries a `fill:none` frame
   path tracing the whole canvas, so a naive `svg.getBBox()` returns the
   viewBox itself and the file LOOKS tight. It is not. Measured below, and
   independently in a browser through `getBBox()` on the inked paths only:

     Isotype-*.svg              viewBox 130.24 x 130.07   ink  72.25 x  72.26
                                -> the ink is 55.5% of the canvas
     Logotype-*.svg             viewBox 489.18 x 136.02   ink 441.47 x  88.32
     Logotype-no-isotype-*.svg  viewBox 380.87 x 136.02   ink 333.16 x  88.32

   So the VIEWBOX RATIOS ARE NOT THE ARTWORK'S RATIOS. The lockup's viewBox
   reads 3.596:1 and the lockup is 4.9986:1 — a 39% error in height for a
   given width if the viewBox is taken on trust. The isotype's 55.5% is the
   same number the PNG masters measured, which is the cross-check that these
   are the same drawings at the same margins.

   Trimming an SVG needs no path maths and loses nothing: the viewBox is
   rewritten to the ink box and the frame path is dropped. What DOES need
   maths is finding the ink box in Node, which is what `pathBox` is for. The
   masters use only M V Z c h l s v — no arcs, no quadratics — so the parser
   below covers exactly the command set present plus the obvious absolute
   twins, and throws on anything it has not been taught rather than guessing.
   ------------------------------------------------------------------------- */

/** Tokenise a `d` attribute into [command, ...numbers] runs. */
function parsePath(d) {
  const out = [];
  const re = /([MmLlHhVvCcSsZz])|(-?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/g;
  let m;
  let cur = null;
  while ((m = re.exec(d)) !== null) {
    if (m[1] !== undefined) {
      cur = { cmd: m[1], args: [] };
      out.push(cur);
    } else {
      if (cur === null) throw new Error(`path starts with a number: ${d.slice(0, 40)}`);
      cur.args.push(parseFloat(m[2]));
    }
  }
  return out;
}

/** Extend a box by one point. */
const hit = (box, x, y) => {
  if (x < box.x0) box.x0 = x;
  if (x > box.x1) box.x1 = x;
  if (y < box.y0) box.y0 = y;
  if (y > box.y1) box.y1 = y;
};

/**
 * Bounding box of one `d`, cubics included.
 *
 * A cubic is sampled at 64 points rather than solved for its extrema. The
 * error is bounded by the curve's own second derivative over 1/64 of its
 * length, which on artwork drawn at this scale is well under a thousandth of
 * a unit — and the result is checked against a real renderer's `getBBox()`
 * before it is trusted. Solving the quadratic for t would be exact and is the
 * better answer if this ever has to bound a curve with a hard corner in it;
 * these do not.
 */
function pathBox(d) {
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  let x = 0, y = 0, sx = 0, sy = 0;
  // Last cubic's second control point, for S/s reflection.
  let px = null, py = null;
  const cubic = (x1, y1, x2, y2, x3, y3) => {
    hit(box, x, y);
    hit(box, x3, y3);
    for (let i = 1; i < 64; i++) {
      const t = i / 64, u = 1 - t;
      hit(
        box,
        u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      );
    }
    px = x2; py = y2;
    x = x3; y = y3;
  };

  for (const { cmd, args } of parsePath(d)) {
    const rel = cmd === cmd.toLowerCase();
    const up = cmd.toUpperCase();
    let i = 0;
    if (up === "Z") {
      x = sx; y = sy; px = py = null;
      continue;
    }
    // A repeated argument run continues the same command; after M it is L.
    let step = up === "H" || up === "V" ? 1 : up === "C" ? 6 : up === "S" ? 4 : 2;
    let first = true;
    while (i < args.length) {
      const a = args.slice(i, i + step);
      if (up === "M") {
        x = rel ? x + a[0] : a[0];
        y = rel ? y + a[1] : a[1];
        if (first) { sx = x; sy = y; }
        hit(box, x, y);
        px = py = null;
      } else if (up === "L") {
        x = rel ? x + a[0] : a[0];
        y = rel ? y + a[1] : a[1];
        hit(box, x, y);
        px = py = null;
      } else if (up === "H") {
        x = rel ? x + a[0] : a[0];
        hit(box, x, y);
        px = py = null;
      } else if (up === "V") {
        y = rel ? y + a[0] : a[0];
        hit(box, x, y);
        px = py = null;
      } else if (up === "C") {
        cubic(
          rel ? x + a[0] : a[0], rel ? y + a[1] : a[1],
          rel ? x + a[2] : a[2], rel ? y + a[3] : a[3],
          rel ? x + a[4] : a[4], rel ? y + a[5] : a[5],
        );
      } else if (up === "S") {
        const rx = px === null ? x : 2 * x - px;
        const ry = py === null ? y : 2 * y - py;
        cubic(
          rx, ry,
          rel ? x + a[0] : a[0], rel ? y + a[1] : a[1],
          rel ? x + a[2] : a[2], rel ? y + a[3] : a[3],
        );
      } else {
        throw new Error(`path command not supported: ${cmd}`);
      }
      // After the first pair of an M run, the rest are implicit L.
      if (up === "M" && first) step = 2;
      first = false;
      i += step;
    }
    if (up === "M") {
      // Handled above: the trailing pairs were treated as L by the same loop.
    }
  }
  return box;
}

/**
 * Read one master, find the box its VISIBLE paths occupy, and return the file
 * with the viewBox rewritten to that box and the invisible frame removed.
 *
 * "Visible" is decided the same way a browser decides it: a path whose
 * resolved fill is `none` paints nothing. These files carry it as a class
 * (`.cls-1{fill:none}`), so the <style> block is read rather than assumed.
 */
function trimSvg(file, { square = false } = {}) {
  const src = readFileSync(file, "utf8");

  const noneClasses = new Set();
  for (const m of src.matchAll(/\.([A-Za-z0-9_-]+)\s*\{([^}]*)\}/g)) {
    if (/fill\s*:\s*none/.test(m[2])) noneClasses.add(m[1]);
  }

  const vb = /viewBox="([^"]+)"/.exec(src);
  if (vb === null) throw new Error(`${file}: no viewBox`);

  const kept = [];
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const m of src.matchAll(/<path\b([^>]*)\/>/g)) {
    const attrs = m[1];
    const cls = /class="([^"]*)"/.exec(attrs);
    const invisible =
      (cls !== null && cls[1].split(/\s+/).some((c) => noneClasses.has(c))) ||
      /fill="none"/.test(attrs);
    if (invisible) continue;
    const d = /\sd="([^"]+)"/.exec(attrs);
    if (d === null) continue;
    const b = pathBox(d[1]);
    hit(box, b.x0, b.y0);
    hit(box, b.x1, b.y1);
    kept.push(m[0]);
  }
  if (!isFinite(box.x0)) throw new Error(`${file}: no visible paths`);

  const r = (n) => Math.round(n * 1000) / 1000;
  let x = box.x0, y = box.y0, w = box.x1 - box.x0, h = box.y1 - box.y0;
  if (square) {
    // The isotype's ink is a hair off square (72.253 x 72.260). Grow the short
    // axis rather than crop the long one, so the glyph stays whole and centred
    // and the component's square box needs no letterboxing.
    const side = Math.max(w, h);
    x -= (side - w) / 2;
    y -= (side - h) / 2;
    w = h = side;
  }

  // The style block is kept verbatim so the reversed cut keeps its own ink
  // (#fffdf8, the brand's off-white — NOT pure white, and not this file's to
  // round off). The `fill:none` rules go with the paths that used them.
  const style = /<style>([^<]*)<\/style>/.exec(src);
  const styleOut =
    style === null
      ? ""
      : `<style>${style[1]
          .split("}")
          .filter((rule) => !/fill\s*:\s*none/.test(rule))
          .join("}")
          .replace(/^\s*$/, "")}${/fill\s*:\s*none/.test(style[1]) ? "" : ""}</style>`;

  return {
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(x)} ${r(y)} ${r(w)} ${r(h)}"` +
      ` width="${r(w)}" height="${r(h)}">` +
      (styleOut === "<style></style>" ? "" : `<defs>${styleOut}</defs>`) +
      kept.join("") +
      `</svg>\n`,
    /* Four decimals on the ratio, because it is copied verbatim into
       `brand.tsx` as `--brand-ratio` and the two must not disagree. */
    ink: { x: r(x), y: r(y), w: r(w), h: r(h), ratio: Math.round((w / h) * 1e4) / 1e4 },
    viewBox: vb[1],
  };
}

/* ---- 1 · Logo derivatives, from the VECTOR masters --------------------------
   Six trimmed SVGs, one per cut. No raster ladder any more: the PNG
   derivatives this file used to emit (`*-96.png`, `*-256.png`) were the right
   answer while the masters were 3000px rasters and are dead weight now that
   there are vectors — two ladders for one mark is how they drift apart.

   Each output is the master with its viewBox rewritten to the ink and the
   invisible frame path dropped. Nothing is redrawn, recoloured or re-exported;
   the path data is byte-identical to the client's.
   -------------------------------------------------------------------------- */

const LOGO_CUTS = [
  { out: "isotype-black",  src: "logos/Isotype-black.svg",                square: true },
  { out: "isotype-white",  src: "logos/Isotype-white.svg",                square: true },
  { out: "logotype-black", src: "logos/Logotype-black.svg",               square: false },
  { out: "logotype-white", src: "logos/Logotype-white.svg",               square: false },
  { out: "wordmark-black", src: "logos/Logotype-no-isotype-black.svg",    square: false },
  { out: "wordmark-white", src: "logos/Logotype-no-isotype-white.svg",    square: false },
];

const geometry = {};
const trimmed = {};

for (const cut of LOGO_CUTS) {
  const t = trimSvg(join(HERE, cut.src), { square: cut.square });
  trimmed[cut.out] = t;
  geometry[cut.out] = t;
  emit(
    `logos/${cut.out}-ink.svg`,
    Buffer.from(t.svg, "utf8"),
    `viewBox ${t.ink.w} x ${t.ink.h}  ratio ${t.ink.ratio}  from ${cut.src}`,
  );
}

/* ---- 2 · App icons and favicons ---------------------------------------------
   The client, verbatim: "for the favicons just create smaller versions of the
   app icons portal/system that you already have." That is exactly what this
   is — no recomposition, no new lockup.

   THE APP ICONS ARE PNG-ONLY. `assets/logos/` gained vectors on 2026-08-24;
   `assets/app-icons/` did not, so every RASTER below is still generated from
   `app-icon-{system,portal}.png`. Both masters are 3000 x 2997 and already
   opaque, field edge to edge: #0B0D0F behind a white mark for the system,
   #FECC6D behind a black mark for the portal. They are padded to 3000 x 3000
   in the field's own colour rather than cropped, so nothing is lost off the
   top.

   MASKABLE. Measured on the masters: the mark's box is 55.5% of the canvas,
   centred, so its extent is well inside the middle 80% Android crops to. No
   extra padding is added — adding some would shrink the mark below what the
   client drew for no benefit. The field is full-bleed, which is what makes an
   icon maskable in the first place.

   APPLE-TOUCH-ICON. iOS composites on white and a transparent mark disappears,
   so this one is flattened and written WITHOUT an alpha channel (PNG colour
   type 2). It is flattened onto the kit's off-beige #FFFEF9 — the page tone,
   not pure white — so that if a future master ever does carry transparency the
   backdrop is a kwapso paper rather than a browser default. Against today's
   opaque masters the composite is a no-op and the flatten is insurance.
   -------------------------------------------------------------------------- */

/** The kit's off-beige, --kw-off-beige. The one place a hex belongs. */
const OFF_BEIGE = [0xff, 0xfe, 0xf9];

const APPS = [
  { dir: "system", src: "app-icons/app-icon-system.png", cut: "isotype-white" },
  { dir: "portal", src: "app-icons/app-icon-portal.png", cut: "isotype-black" },
];

const hex = (r, g, b) =>
  "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

for (const app of APPS) {
  const master = decodePng(join(HERE, app.src));
  const field = [master.rgba[0], master.rgba[1], master.rgba[2], 255];
  const side = Math.max(master.w, master.h);
  const squared = pad(master, side, side, field);
  const at = (n) => resize(squared, n, n);

  emit(`app-icons/${app.dir}/icon-192.png`, encodePng(at(192)), "192x192  PWA manifest");
  emit(`app-icons/${app.dir}/icon-512.png`, encodePng(at(512)), "512x512  manifest + Android splash");
  emit(
    `app-icons/${app.dir}/maskable-512.png`,
    encodePng(at(512)),
    "512x512  maskable; mark occupies the middle 55.5%, inside the 80% safe zone",
  );
  emit(
    `app-icons/${app.dir}/apple-touch-icon.png`,
    encodePng(flatten(at(180), OFF_BEIGE), { alpha: false }),
    "180x180  no alpha channel, flattened on #FFFEF9",
  );
  emit(
    `app-icons/${app.dir}/favicon.ico`,
    encodeIco([at(32), at(16)]),
    "32 + 16  real ICO, 32-bit DIB entries",
  );

  /* ---- favicon.svg — UNBLOCKED 2026-08-24 by the vector masters ------------
     It was the one item this file refused to build, because an SVG wrapping a
     raster is not a vector. It is a vector now.

     RECONSTRUCTED, AND SAY SO. There is no app-icon SVG master, so this is
     the field colour read off the PNG master plus the VECTOR isotype placed
     at the size and position measured on that same PNG — mark box 55.5% of
     the canvas, dead centre. It is not a new drawing and it is not a guess:
     every number in it came off the client's own file. If an app-icon vector
     ever arrives, this is one line to switch and the reconstruction goes.

     WHY THERE IS NO prefers-color-scheme BLOCK, AND WHY THAT IS NOT AN
     OVERSIGHT. `assets/UPLOAD.md` §5 raised one — "so one file is black on a
     light tab and reversed on a dark one" — and that is the right idea for a
     TRANSPARENT mark. This icon is not transparent: the client asked for
     "smaller versions of the app icons", and an app icon is a full-bleed
     field with the mark on it. The tab's own colour never touches the mark,
     so a media query here would have to invent a second colourway that the
     brand does not have. Left out deliberately; flagged in §5 as a one-line
     question for the client rather than decided here.

     Note for whoever revisits this: a favicon gets `prefers-color-scheme`
     and NOTHING ELSE. This system spells dark three ways, but the other two
     are `[data-theme]` on the application's own <html> — an icon rendered by
     browser chrome has no access to that document. The media query is the
     whole toolkit here, and that is correct rather than a shortcut.
     ---------------------------------------------------------------------- */
  const mark = trimmed[app.cut];
  const FIELD = hex(field[0], field[1], field[2]);
  /* The measured share of the icon the mark occupies, from the PNG master. */
  const MARK_SHARE = 0.555;
  const S = 64; // a round working box; the file scales to any size
  const m = S * MARK_SHARE;
  const off = (S - m) / 2;
  const scale = m / mark.ink.w;
  const inner = mark.svg
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");
  const favicon =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">` +
    `<rect width="${S}" height="${S}" fill="${FIELD}"/>` +
    `<g transform="translate(${(off).toFixed(4)} ${(off).toFixed(4)}) scale(${scale.toFixed(6)}) translate(${(-mark.ink.x).toFixed(4)} ${(-mark.ink.y).toFixed(4)})">` +
    inner +
    `</g></svg>\n`;
  emit(
    `app-icons/${app.dir}/favicon.svg`,
    Buffer.from(favicon, "utf8"),
    `vector; ${FIELD} field, mark at ${(MARK_SHARE * 100).toFixed(1)}%`,
  );
}

/* ---- 3 · The outside screens' photograph ------------------------------------
   Client, 2026-08-24: "we will replace it later, but so far for the external
   screens image use the attached (the phone mockup)". One picture, one shell,
   six screens — sign in, link sent, session expired, invitation,
   password/security and the portal's door all draw the same file.

   TO SWAP IT: drop a new file over `photography/exterior-mockup.png` and run
   this script. Nothing else changes anywhere; no composition names a path.

   1.26 MB OF PNG IS NOT SHIPPABLE, and PNG is the wrong container for a
   photograph in the first place — it is lossless, which is exactly what a
   photograph does not need. Three JPEGs are emitted and served through
   `srcset`, so a tablet does not download a desktop image:

       960 wide ->  ~62 KB      1440 -> ~118 KB      1920 -> ~190 KB

   against the master's 1264 KB. Quality 78: high enough that the phone's
   screen and the metal tray's specular edges stay clean, low enough that the
   large flat backdrop does not cost anything.

   WEBP IS NOT BUILT, AND NOT FOR WANT OF TRYING. It would save perhaps another
   quarter on top of these. This machine cannot encode it: `sips` LISTS
   `org.webmproject.webp` among its formats but answers "Can't write format" —
   it reads WebP and does not write it. There is no `cwebp`, no ImageMagick and
   no PIL here, and none of those is worth adding to a repository whose whole
   delivery is vendored source with no build. JPEG is universally decodable and
   costs one round of quality; the gap is recorded in `assets/UPLOAD.md` §7 as
   a nice-to-have, not a blocker. `brew install webp` and one line here closes
   it if anyone wants the last 25%.

   WHY sips AT ALL, when everything above this line is pure Node: a JPEG
   encoder is not something to hand-write beside a PNG one. This is the only
   step that shells out, it is macOS-only, and it says so rather than failing
   with a confusing ENOENT.
   -------------------------------------------------------------------------- */

const PHOTO_MASTER = "photography/exterior-mockup.png";
/** The widths the auth column actually paints. See the header. */
const PHOTO_WIDTHS = [960, 1440, 1920];
const PHOTO_QUALITY = 78;

if (existsSync(join(HERE, PHOTO_MASTER))) {
  let sips = true;
  try {
    execFileSync("sips", ["--version"], { stdio: "ignore" });
  } catch {
    sips = false;
  }
  if (!sips) {
    console.error(
      "\n  ! `sips` is not on this machine, so the photograph's JPEGs were not\n" +
        "    rebuilt. Everything else above is pure Node and did build. On macOS\n" +
        "    sips ships with the OS; elsewhere, re-encode the three widths in\n" +
        `    ${PHOTO_WIDTHS.join(", ")} at quality ${PHOTO_QUALITY} by any means and keep the names.`,
    );
  } else {
    for (const w of PHOTO_WIDTHS) {
      const out = join(HERE, `photography/exterior-mockup-${w}.jpg`);
      const tmp = `${out}.tmp`;
      execFileSync("sips", [
        "-Z", String(w),
        "-s", "format", "jpeg",
        "-s", "formatOptions", String(PHOTO_QUALITY),
        join(HERE, PHOTO_MASTER),
        "--out", tmp,
      ], { stdio: "ignore" });
      const bytes = readFileSync(tmp);
      execFileSync("rm", ["-f", tmp]);
      emit(
        `photography/exterior-mockup-${w}.jpg`,
        bytes,
        `${w} wide, q${PHOTO_QUALITY}, ${(bytes.length / 1024).toFixed(0)} KB`,
      );
    }
  }
}

/* ---- 3 · Say what happened -------------------------------------------------- */

if (CHECK) {
  if (stale > 0) {
    console.error(`\n${stale} derived asset(s) are stale. Run: node assets/build-assets.mjs`);
    process.exit(1);
  }
  console.log(`assets: ${written.length} derived files up to date.`);
} else {
  console.log("assets/build-assets.mjs — measured off the masters:\n");
  for (const [name, g] of Object.entries(geometry)) {
    console.log(
      `  ${name.padEnd(16)} viewBox ${g.viewBox.padEnd(22)} ink ${String(g.ink.w).padStart(8)} x ${String(g.ink.h).padEnd(8)} ratio ${g.ink.ratio}`,
    );
  }
  console.log("");
  for (const w of written) console.log(`  ${w.relative.padEnd(42)} ${w.note}`);
  console.log(`\n  ${written.length} files.`);
}
