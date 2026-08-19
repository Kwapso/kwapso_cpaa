// A RENAME IS A RENAME — the dropdown value moves and the records move with it.
//
// The fault: a record stores its dropdown value as the WORD, so the spelling is
// the only thing joining a record to its vocabulary. Renaming the row alone left
// 107 tickets saying "Request" while the group had moved on — their tab gone,
// their mark gone, a new tab beside them counting nothing.
//
// The asymmetry is what made it hard to see, and it is asserted here rather than
// described: the MARK was always a lookup (it lives only on the dropdown row and
// is read by the word), so changing an emoji already reached every record. Only
// the WORD was a join key, and only the word needed carrying.
import { DatabaseSync } from "node:sqlite"
import { beforeEach, describe, expect, it } from "vitest"

import { TEAM_MIGRATIONS } from "../src/team-schema"
import { VOCABULARY_HOMES, storedWordColumns } from "@shared/selectable-homes"
import { DEFAULT_SELECTABLE } from "../src/team-schema"

const holder: { db: DatabaseSync | null } = { db: null }
const db = () => holder.db as DatabaseSync

beforeEach(() => {
  holder.db = new DatabaseSync(":memory:")
  for (const m of TEAM_MIGRATIONS) db().exec(m.sql)
})

describe("every dropdown group says where its words are kept", () => {
  // THE ROT CHECK. A new vocabulary added to the seed with no home declared would
  // rename silently and rewrite nothing — the exact bug, re-committed. The seed
  // is the source here, not a list in this file.
  it("no group the seed ships is undeclared", () => {
    const seeded = [...new Set(DEFAULT_SELECTABLE.map((v) => v.type))]
    const undeclared = seeded.filter((g) => !(g in VOCABULARY_HOMES))
    expect(
      undeclared,
      `these dropdown groups are seeded but name no home in shared/selectable-homes.ts — say whether each is a vocabulary (which columns store its words), "labels" (the code owns the states) or "unused" (it backs nothing)`
    ).toEqual([])
  })

  // …AND THE OTHER DIRECTION. An entry naming a table or column that no longer
  // exists rewrites nothing while claiming to, which reads as covered.
  it("every column a home names is really on the schema", () => {
    const missing: string[] = []
    for (const [group, home] of Object.entries(VOCABULARY_HOMES)) {
      if (home === "labels" || home === "unused") continue
      for (const { table, column } of home.columns) {
        const cols = db()
          .prepare(`SELECT name FROM pragma_table_info(?)`)
          .all(table) as { name: string }[]
        if (!cols.some((c) => c.name === column)) missing.push(`${group} → ${table}.${column}`)
      }
    }
    expect(missing, "a home names a column the schema does not have").toEqual([])
  })
})

describe("renaming a value carries the records that stored it", () => {
  /** The rename, exactly as `updateSelectable` builds it — the same map, so this
   * proves the MAP and the SQL shape rather than re-implementing the decision. */
  function rename(group: string, from: string, to: string) {
    db().prepare("UPDATE selectable_data SET value = ? WHERE type = ? AND value = ?").run(to, group, from)
    for (const h of storedWordColumns(group))
      db().prepare(`UPDATE ${h.table} SET ${h.column} = ? WHERE ${h.column} = ?`).run(to, from)
  }

  it("a ticket type: the vocabulary and all 3 tickets move together", () => {
    db().exec(`
      INSERT INTO selectable_data (id, type, value, mark, created_at) VALUES ('V1','Ticket type','Request','💭','2026-01-01');
      INSERT INTO help (id, ref, description, help_type, status, created_at) VALUES ('H1','T-1','a','Request','new','2026-01-01');
      INSERT INTO help (id, ref, description, help_type, status, created_at) VALUES ('H2','T-2','b','Request','new','2026-01-01');
      INSERT INTO help (id, ref, description, help_type, status, created_at) VALUES ('H3','T-3','c','Issue','new','2026-01-01');
    `)
    rename("Ticket type", "Request", "Ask")

    const moved = db().prepare("SELECT count(*) AS n FROM help WHERE help_type = 'Ask'").get() as { n: number }
    const left = db().prepare("SELECT count(*) AS n FROM help WHERE help_type = 'Request'").get() as { n: number }
    expect(moved.n, "the tickets did not follow their own vocabulary").toBe(2)
    expect(left.n, "a ticket was left holding the old word").toBe(0)
    // AND NOTHING ELSE MOVED. A rewrite keyed on the word alone would be right
    // here and wrong the moment two groups share a spelling.
    const other = db().prepare("SELECT help_type FROM help WHERE id = 'H3'").get() as { help_type: string }
    expect(other.help_type, "a ticket of another type was rewritten").toBe("Issue")
  })

  it("a group with two homes moves BOTH — a department is on purposes and on tasks", () => {
    db().exec(`
      INSERT INTO selectable_data (id, type, value, created_at) VALUES ('V2','Department','Delivery','2026-01-01');
      INSERT INTO meeting_purposes (id, name, department, created_at) VALUES ('P1','Kickoff','Delivery','2026-01-01');
      INSERT INTO tasks (id, title, department, status, created_at) VALUES ('K1','Invoice','Delivery','open','2026-01-01');
    `)
    expect(storedWordColumns("Department")).toHaveLength(2)
    rename("Department", "Delivery", "Client work")

    const purpose = db().prepare("SELECT department AS d FROM meeting_purposes WHERE id='P1'").get() as { d: string }
    const task = db().prepare("SELECT department AS d FROM tasks WHERE id='K1'").get() as { d: string }
    expect(purpose.d, "the meeting purpose kept the old department").toBe("Client work")
    expect(task.d, "the task kept the old department — one home was carried and the other was not").toBe("Client work")
  })

  it("a LABEL group rewrites nothing, because nothing ever stored its word", () => {
    // The server validates a ticket's status against its own enum; the dropdown
    // row supplies only what a person reads. So this is not a gap in the map.
    expect(storedWordColumns("Ticket status")).toEqual([])
    expect(VOCABULARY_HOMES["Ticket status"]).toBe("labels")
  })

  it("the MARK was always a lookup — an emoji change needs no carrying at all", () => {
    // The SEEDED row, not a fixture: a second row with the same (type, value)
    // would be exactly the duplicate this group already had, and the lookup would
    // answer from whichever came first.
    db().exec(
      `INSERT INTO help (id, ref, description, help_type, status, created_at) VALUES ('H4','T-4','d','Issue','new','2026-01-01');`
    )
    const seeded = db()
      .prepare("SELECT id, mark FROM selectable_data WHERE type='Ticket type' AND value='Issue'")
      .all() as { id: string; mark: string | null }[]
    expect(seeded, "the seed no longer ships a Ticket type of Issue — has the vocabulary moved?").toHaveLength(1)
    db().prepare("UPDATE selectable_data SET mark = ? WHERE id = ?").run("🔥", seeded[0].id)
    // The ticket is untouched and yet reads the new mark, because the mark is
    // joined by the word and never copied onto the record.
    const ticket = db().prepare("SELECT help_type FROM help WHERE id='H4'").get() as { help_type: string }
    const mark = db()
      .prepare("SELECT mark FROM selectable_data WHERE type='Ticket type' AND value = ?")
      .get(ticket.help_type) as { mark: string }
    expect(mark.mark).toBe("🔥")
  })
})
