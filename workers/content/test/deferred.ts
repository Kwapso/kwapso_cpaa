// LET THE DEFERRED WORK FINISH BEFORE THE ASSERTIONS.
//
// Since 5 Sep 2026 the best-effort side errands a door starts — the outbound
// email a reply triggers, the crash row a 500 writes — ride `ctx.waitUntil`
// instead of sitting between the write and the answer
// (`shared/workers/parallel.ts`). The runtime keeps the request alive until they
// finish; a test calling `worker.fetch(request, env)` with two arguments hands
// out no context at all, so the work starts and the assertions run before it
// lands.
//
// This is the context a test hands in. It is not a stub that swallows the work:
// it COLLECTS what was deferred and awaits it, so a suite asserting "answering a
// ticket emails their people" is asserting the same thing it always was, through
// the same path the deployed worker takes. That is the point — the alternative
// (asserting before the deferred work runs) would be a suite that passes while
// the mail is still in flight, which is a test of the wrong moment.

/** Run one door call with a real waiting context, and return its response only
 * after everything the door deferred has settled. */
export async function withDeferred(
  run: (ctx: unknown) => Promise<Response>
): Promise<Response> {
  const pending: Promise<unknown>[] = []
  const ctx = {
    waitUntil: (work: Promise<unknown>) => void pending.push(work),
    passThroughOnException: () => {},
  }
  const res = await run(ctx)
  // `afterResponse` attaches its own catch before handing the promise over, so
  // nothing here can reject — a deferred failure is logged, exactly as it is in
  // the runtime, and never turns into a failed assertion about something else.
  await Promise.all(pending)
  return res
}
