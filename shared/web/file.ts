// A CHOSEN FILE → A DATA URL. One line, one seam, both front ends.
//
// It exists because three components had written it out: the certificate picker
// and the knowledge upload on the agency side, and the to-do attachment on the
// client's. Three copies of a FileReader promise is three chances for one of
// them to resolve `undefined` on an empty file, or to swallow the browser's own
// error, and for the difference to show up as "the upload just does nothing".
//
// NO RE-ENCODE, EVER. Whatever was picked is what gets stored, byte for byte: a
// certificate is a document, and a PDF put through an image pipeline is not a
// PDF. Downsizing a PHOTO before upload is a different job with a different
// answer — `web/lib/image.ts` — and this file must never grow into it.

/** Read a File to a raw base64 data URL.
 *
 * The rejection carries the browser's own `reader.error` when there is one: no
 * call site shows it (each catches and says its own sentence), but the error log
 * is the only place a "the upload does nothing" report can be answered from. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read that file."))
    reader.readAsDataURL(file)
  })
}
