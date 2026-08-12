# agency-app-shape — the comprehension-check answer key

Round 7, August 2026. **Never put this in the form.** A failed check is not a failed
respondent — it is a design instruction: the app must make that distinction obvious
without anyone having to be told.

| id | question, in short | correct answer | what a wrong answer means |
|---|---|---|---|
| `c_placement` | Where does Aurora start looking for work on a screen? | **All three should get her there** | If he picks one path, the other two are dead ends in his head — the cross-links (app → account, story → app) are not optional polish, they are the feature. |
| `c_orphan` | Rebuilding a screen nobody asked for — what is it? | **A story, with no ticket above it** | A wrong answer means the ticket→story relationship reads as mandatory. The Stories screen must let you create one with no ticket in sight. |
| `c_compartment` | What can a FluClinic contact's answer be built from? | **FluClinic's, plus the agency's general material** | "Everything" means the compartment idea has not landed and the UI must show which compartment answered, on the answer. |
| `c_sync_effort` | Eleven new tickets — how many go in by hand? | **None** | If he thinks he must add them, the knowledge base screen is failing to show that most of it feeds itself. Needs a visible "kept in step automatically" state. |
| `c_google_identity` | Colleague asks about a document in *your* Drive | **Only if you filed it as team material** | The team/private shelf is invisible today. Whatever we build must say, at the moment of connecting a folder, who will be able to read it. |
| `c_permission_reach` | Assistant asked to delete with read-only rights | **It refuses — never exceeds your own rights** | This is a locked law (the agent acts AS the user through the same gated doors). If it reads as uncertain, the permission screen must say it in words. |

## Notes for reconciliation

- `q_relitigate` is a drift detector, not a real fork. Anything but "no" gets read first.
- `q_kb_compartment_split` is the only structurally expensive answer in the form —
  adding a dimension later means re-indexing every source. Treat a non-recommended
  answer as a schema decision, not a preference.
- `q_seed_order` forces a genuine trade between missing screens, real data, and Google.
  Whatever he picks is the next sprint's shape.
- Mine the notes on `q_missing` and `q_quiet_stop` — in every prior round the notes
  carried a requirement no option anticipated.
