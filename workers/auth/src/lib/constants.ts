// One source for the verification-code policy, shared by the login flow
// (index.ts) and the email-change flow (email-change.ts) — so the TTL, attempt
// cap and per-hour throttle can never drift between the two.
export const CODE_TTL_MINUTES = 10
export const MAX_CODE_ATTEMPTS = 5
export const MAX_CODES_PER_HOUR = 5
/** How long before the SAME address may ask for another code. This — not the
 * hourly cap — is what limits sending: the hourly cap bounds how many code ROWS
 * exist, and past it a request ROTATES the live one instead of being refused.
 * A person who owns the inbox can always get in; a flood is still ~1/minute. */
export const RESEND_COOLDOWN_SECONDS = 60

// ── the SEND throttle (the caps above are per ADDRESS; these are per CALLER) ──
// Everything above limits what one address can be sent. Nothing limited the
// SENDER: an anonymous caller could walk a list of a million addresses, one send
// each, and every one of them passed every per-address rule — a mail-bomb, a
// Resend bill, and unbounded growth of the core DB from an unauthenticated door.
// So the send door also counts EMAILS per caller and in total, over a trailing
// hour, and both ceilings ride the write (see login-codes.ts).

/** Codes one caller (CF-Connecting-IP, else the shared "unknown" bucket) may
 * cause to be emailed in an hour. Generous enough for a whole office behind one
 * NAT signing in on a Monday morning; far below "walk a mailing list". */
export const MAX_SENDS_PER_IP_PER_HOUR = 30

/** Codes the whole environment may email in an hour, whatever the source. The
 * backstop for the one thing a per-IP cap cannot see: a caller who rotates
 * addresses (a botnet, or a forged edge header). Spoofing the IP header buys a
 * bigger share of THIS number, never an escape from it. */
export const MAX_SENDS_GLOBAL_PER_HOUR = 300
