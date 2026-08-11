// One source for the verification-code policy, shared by the login flow
// (index.ts) and the email-change flow (email-change.ts) — so the TTL, attempt
// cap and per-hour throttle can never drift between the two.
export const CODE_TTL_MINUTES = 10
export const MAX_CODE_ATTEMPTS = 5

/** How many of those five tries a caller who did NOT ask for this code may spend.
 * The rest are RESERVED for whoever asked (login_codes.sent_ip — rewritten by
 * every mint and rotation, so it always names the caller who most recently paid
 * the send throttle's price for this code, which is the best available signal for
 * "the person about to type it").
 * WHY IT EXISTS: the cap used to be one shared pool, so ~5 junk requests against a
 * freshly minted code destroyed it and the person who actually asked for it could
 * not sign in — and sign-in is the only way into the product. A guess is free; an
 * ask is throttled. So guessing gets the small shared lane and asking earns the
 * reserved one, and a stranger's wrong guesses can never reach the owner's tries.
 * The brute-force bound is UNCHANGED: five wrong guesses total against a
 * 1,000,000-wide code that lives ten minutes, however many callers try. */
export const MAX_CODE_ATTEMPTS_ELSEWHERE = 2

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

/** Codes the whole environment may email in an hour before the door starts
 * RATIONING. This number is the backstop for the one thing a per-IP cap cannot
 * see: a caller who rotates addresses (a botnet, or a forged edge header).
 *
 * IT IS NOT A WALL, DELIBERATELY. It used to be a hard refusal on both write
 * paths, and that turned it into a lockout switch for the whole product: ten
 * source IPs at a tenth of a request per second spent it, and then every
 * legitimate person was refused a sign-in code for the rest of the hour, on both
 * public doors. A bound that refuses honest traffic has turned one attack into a
 * better one. Past this line the door instead narrows every caller to the small
 * share below — so the flood's own addresses, which are far over it, are the ones
 * refused, and someone signing in for the first time this hour is not. */
export const SENDS_EVERYWHERE_BEFORE_RATIONING = 300

/** A caller's send budget once the environment is over the line above. Exactly one
 * address's own hourly cap (MAX_CODES_PER_HOUR) — the most one honest person can
 * possibly need — so rationing can never be tighter than a single sign-in. A busy
 * office behind one address is squeezed to five codes while a flood is running;
 * that is the price, and it is paid in a slower Monday morning rather than a
 * closed door.
 * THE TRADE-OFF, SAID PLAINLY: there is no longer an absolute ceiling on mail from
 * this door, so a large enough address pool can still run up a sending bill —
 * five per address per hour instead of the thirty they could spend before. We
 * bought that with the guarantee that nobody can shut the product's only entrance.
 * The control for a genuinely distributed flood is at the edge (a WAF rule, a
 * challenge on the send door) — not a self-inflicted lockout in here. */
export const MAX_SENDS_PER_IP_WHEN_RATIONED = 5

/** The bucket the NON-PRODUCTION test-login door charges its sends to.
 *
 * It is a bucket of its own, and that is the point. Every budget in this file
 * exists to bound OUTBOUND MAIL from an anonymous caller. The test door is
 * neither: it proves itself with its own secret, it is refused outright in
 * production, and it sends no email at all — it hands the code straight back to
 * the holder. Charging it to the caller's address meant a machine running the
 * smoke suite spent the same thirty codes an office signs in on, so running the
 * verification twice in an hour locked the verification out. A budget that stops
 * us checking whether the door works is not protecting the door. */
export const TEST_LOGIN_BUCKET = "test-login"

/** …and its own ceiling, so the door is still bounded rather than free. Sized for
 * a day of automated runs, not for a person. */
export const MAX_TEST_LOGIN_SENDS_PER_HOUR = 400

// ── the EMAIL-CHANGE door (its victim is a THIRD PARTY) ──────────────────────
// Every number above bounds mail to an address that ASKED for it. The
// email-change door is the other shape: a signed-in caller names ANY address and
// we mail it. The recipient is a stranger to that account, and a session costs
// nothing but an inbox of your own — so MAX_CODES_PER_HOUR, counted per USER, is
// only half a bound. It says how much one account can spend; it says nothing
// about how much mail one INBOX can be made to receive.

/** Email-change codes ONE TARGET ADDRESS may be sent in an hour, counting every
 * account together. This is the ceiling that actually protects the stranger:
 * signing up is open, so "how many accounts can an attacker hold?" is not a
 * bound, and only a ceiling on the ADDRESS bounds what lands in their inbox.
 *
 * Deliberately the SAME number as the per-user cap: one honest person changing
 * their own address is stopped by their own ceiling long before this one, so it
 * costs them nothing and bites only when several accounts aim at one inbox.
 * THE PRICE, SAID PLAINLY: a stranger who knows the address you are moving TO
 * can spend this hour and make you wait for it. That is a delay on a settings
 * change you can retry — not the login door, where the same trade would be a
 * lockout from the only entrance to the product, and is why that door rations
 * instead of refusing. */
export const MAX_CHANGE_CODES_PER_TARGET_PER_HOUR = MAX_CODES_PER_HOUR
