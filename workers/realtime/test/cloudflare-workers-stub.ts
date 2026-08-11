// The `cloudflare:workers` module, standing in for a test run.
//
// TeamChannel extends DurableObject, which only exists inside the Workers
// runtime — which is why this worker's behaviour was checked by READING its
// source with regexes rather than running it. A regex can prove a call is
// written; it cannot prove a broadcast reaches the second listener after the
// first one's socket died, and that is the whole of what this class does.
//
// So: the two lines of the base class that matter (it takes `ctx` and `env` and
// hangs them off `this`), aliased in by workers/realtime/vitest.config.ts. It is
// scoped to THIS worker deliberately — realtime is the only worker with a
// Durable Object, and a global alias would quietly hand the stub to any worker
// that grew one later.
//
// Everything the tests actually exercise — acceptWebSocket, getWebSockets,
// serializeAttachment — is the DurableObjectState the test builds itself, so
// this file stays the shim and nothing more.

export class DurableObject<E = unknown> {
  readonly ctx: DurableObjectState
  readonly env: E
  constructor(ctx: DurableObjectState, env: E) {
    this.ctx = ctx
    this.env = env
  }
}
