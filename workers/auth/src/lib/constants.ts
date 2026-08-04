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
