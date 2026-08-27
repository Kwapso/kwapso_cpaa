// A VECTORIZE STAND-IN FOR THE SUITES — the same contract, in memory.
//
// WHY A STAND-IN AND NOT A MOCK THAT RETURNS FIXTURES. The properties this
// module has to hold are properties of the SEARCH: a namespace is a partition
// applied before it, a metadata filter narrows it, and nothing readable comes
// back out. A mock returning canned hits proves none of those and would pass
// just as loudly with the namespace argument deleted. This implements them, so a
// test that deletes the namespace really does start seeing another team's
// vectors — which is what the fence suite then catches.
//
// It is deliberately EXACT where the real thing is approximate: cosine over
// every stored vector rather than an approximate-nearest-neighbour graph. That
// makes the ranking deterministic in a test and leaves ANN recall — the one
// thing this cannot stand in for — to be measured against the real service.
//
// AND IT ENFORCES THE WRITE LIMITS, which for a long time it did not. Everything
// above is about the SEARCH; `upsert` and `deleteByIds` accepted an array of any
// length and quietly did the right thing with it. So the batching loops in
// `knowledge-vectors.ts` were exercised by every suite and CHECKED by none — the
// batch constant could have been a thousand or a million and this file would
// have agreed. It was 200 against a real ceiling of 100, and the first source
// with more than a hundred pieces took the whole re-index down in production
// under a green build. A stand-in that implements only the behaviour we want,
// and none of the limits we are held to, can only ever confirm us.

type Stored = {
  id: string
  values: number[]
  namespace?: string
  metadata: Record<string, string | number>
}

type Filter = Record<string, unknown>

/** WHAT VECTORIZE ACTUALLY ACCEPTS IN ONE CALL. Two different numbers on two
 * different endpoints, which is exactly the trap: `deleteByIds` is a tenth of
 * `upsert`, and the delete figure is not a guess — it is quoted back from the
 * service's own refusal, `too many ids in payload; max id count is 100`. */
const UPSERT_LIMIT = 1000
const DELETE_LIMIT = 100

/** Every query this index was asked, in order — so a suite can assert on the
 * SHAPE of the request (namespace present, metadata never returned) and not only
 * on what came back. */
/** Every WRITE this index was asked to make, in order — so a suite can assert
 * that a batching loop actually split, which is a fact about the calls and not
 * about what ended up stored. Both batch sizes produce identical contents; only
 * the call count tells them apart. */
export type WriteLog = { kind: "upsert" | "delete"; count: number }

export type QueryLog = {
  namespace?: string
  filter?: Filter
  topK?: number
  returnValues?: boolean
  returnMetadata?: string
}

export function fakeVectorize() {
  const vectors = new Map<string, Stored>()
  const queries: QueryLog[] = []
  const writes: WriteLog[] = []

  const matches = (value: unknown, clause: unknown): boolean => {
    if (clause && typeof clause === "object" && !Array.isArray(clause)) {
      const c = clause as Record<string, unknown>
      if ("$in" in c) return (c.$in as unknown[]).includes(value as never)
      if ("$gte" in c && Number(value) < Number(c.$gte)) return false
      if ("$lte" in c && Number(value) > Number(c.$lte)) return false
      return !("$gte" in c) && !("$lte" in c) ? false : true
    }
    return value === clause
  }

  const cosine = (a: number[], b: number[]): number => {
    let dot = 0
    let na = 0
    let nb = 0
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      dot += a[i] * b[i]
      na += a[i] * a[i]
      nb += b[i] * b[i]
    }
    return na && nb ? dot / Math.sqrt(na * nb) : 0
  }

  return {
    /** what the worker is given as `env.KNOWLEDGE_INDEX` */
    binding: {
      async upsert(rows: Stored[]) {
        if (rows.length > UPSERT_LIMIT)
          throw new Error(
            `VECTOR_UPSERT_ERROR (code = 40006): too many vectors in payload; max count is ${UPSERT_LIMIT}, got ${rows.length}`
          )
        for (const r of rows) vectors.set(r.id, r)
        writes.push({ kind: "upsert", count: rows.length })
        return { mutationId: "m" }
      },
      async deleteByIds(ids: string[]) {
        if (ids.length > DELETE_LIMIT)
          throw new Error(
            `VECTOR_DELETE_ERROR (code = 40007): too many ids in payload; max id count is ${DELETE_LIMIT}, got ${ids.length}`
          )
        for (const id of ids) vectors.delete(id)
        writes.push({ kind: "delete", count: ids.length })
        return { mutationId: "m" }
      },
      async query(vector: number[], opts: QueryLog & { filter?: Filter }) {
        queries.push(opts)
        const hits = [...vectors.values()]
          // THE NAMESPACE IS A PARTITION, APPLIED BEFORE THE SEARCH — exactly as
          // Vectorize applies it, so a query that forgot to pass one really does
          // reach every team's vectors here too.
          .filter((v) => (opts.namespace === undefined ? true : v.namespace === opts.namespace))
          .filter((v) =>
            Object.entries(opts.filter ?? {}).every(([key, clause]) => matches(v.metadata?.[key], clause))
          )
          .map((v) => ({ id: v.id, score: cosine(vector, v.values) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, opts.topK ?? 10)
        // Values and metadata are returned ONLY when asked for, which the seam
        // never does — so a suite can assert that nothing readable came back.
        return { count: hits.length, matches: hits }
      },
    },
    /** everything stored, for a suite that needs to look */
    all: () => [...vectors.values()],
    ids: () => [...vectors.keys()].sort(),
    queries: () => queries,
    writes: () => writes,
    reset: () => {
      vectors.clear()
      queries.length = 0
      writes.length = 0
    },
  }
}
