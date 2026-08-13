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

type Stored = {
  id: string
  values: number[]
  namespace?: string
  metadata: Record<string, string | number>
}

type Filter = Record<string, unknown>

/** Every query this index was asked, in order — so a suite can assert on the
 * SHAPE of the request (namespace present, metadata never returned) and not only
 * on what came back. */
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
        for (const r of rows) vectors.set(r.id, r)
        return { mutationId: "m" }
      },
      async deleteByIds(ids: string[]) {
        for (const id of ids) vectors.delete(id)
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
    reset: () => {
      vectors.clear()
      queries.length = 0
    },
  }
}
