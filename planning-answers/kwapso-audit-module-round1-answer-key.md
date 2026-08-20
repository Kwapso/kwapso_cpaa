# Answer key — audit module, round 1

The six comprehension checks in `kwapso-audit-module-round1`. Kept here and never in the
form. A wrong answer is **not** a failed respondent — it is a design instruction, written
beside each one.

| id | question | right answer | what a wrong answer tells me |
|---|---|---|---|
| `chk-wave` | Three packages, each with analysis, build, validation, training | **Three waves** | "Three sprints" means the word has not landed and the retired-words panel needs to be louder — or the word is wrong. This is the exact confusion that broke Monday's calendar. |
| `chk-rate` | Keno Group's supervisor is paid €38/hour — which rate card? | **The new one, the customer's own staff cost** | Any other answer means the three-rate distinction is not visible enough. The UI must label each rate card with whose money it is, on the screen, not in a doc. |
| `chk-decision` | How many steps in the branching diagram? | **It depends on what we decide in this chapter** | A confident 3 or 4 means the reader did not notice it was still open. Fine — but then the decision is mine and I should just make it. |
| `chk-timetravel` | Step removed 15 Aug, view set to 1 Aug — visible? | **Yes, as it was — it had not been removed yet** | Anything else means date-based history has not landed, and the date control needs to say what it is doing in words ("showing this process as it was on…"). |
| `chk-savings` | What must appear beside a savings number in the portal? | **The caption saying the times are agreed estimates and the subtraction is arithmetic** | A wrong answer is not a problem with the respondent — the caption is enforced by a build rule either way. But it tells me they do not know it exists, which matters when they are asked to trust the number. |
| `chk-portal` | What can a customer never see? | **What our hour costs us, and our margin** | If anyone picks a different option, the portal's boundary is not legible to the people selling against it. |

## Forks with a load-bearing consequence

- **`revision-model`** decides whether `process_versions` survives. It is deliberately
  re-asked: it was agreed on the call, but chapter 08's consequence was not raised there.
- **`audit-rate-home`** — the only answer that does not break R24 is a new, third rate
  card. If anyone picks the internal table, that is a conversation, not a build.
- **`baseline-def`** — whatever replaces "version 1" in the savings arithmetic. SCOPE
  currently says versions, so this may need a SCOPE amendment rather than just code.
- **`cut-order`** — the scope cut. My read is in the hint; the answers decide the week.
