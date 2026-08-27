// THE QUESTION SET the bench measures against, and the answer key beside it.
//
// AUTHORED OFF THE MATERIAL, not off the pipeline. Every `cites` names a source
// that is really in the staging base and really contains the answer, and every
// `refuse` names something the agency demonstrably has nothing on — checked by
// reading the rows, not by asking the retriever and writing down what it said.
// A key derived from the retriever's own output measures nothing.
//
// THREE KINDS OF CLAIM, because retrieval fails in three different ways:
//
//   cites   FINDING. One of these strings appears in a cited title.
//   refuse  HONESTY (R23). A question about something that never happened must
//           come back as "we have nothing on that". A confident answer here is
//           worse than no answer at all, and it is the failure a relevance floor
//           exists to prevent.
//   spread  USEFULNESS. Six passages that are one thing said six ways is not a
//           six-passage answer. `spread` is the number of DISTINCT subjects the
//           citations must cover once the calendar envelopes ("Invitation:",
//           "Notes:") are stripped back to the meeting they are about.
//
// A question may carry more than one; all of them must hold for it to pass.
export const QUESTIONS = [
  // ── FINDING WHAT IS THERE ────────────────────────────────────────────────
  { q: "What did we agree in the week recap?", cites: ["Week recap"] },
  { q: "What came out of the Team Assembly?", cites: ["Team Assembly"] },
  { q: "What was the feedback on Kwapso CPAA?", cites: ["Kwapso CPAA"] },
  { q: "What was discussed on the HOGO sync?", cites: ["HOGO", "Hogo"] },
  { q: "What is the process for taking on a new insurance client?", cites: ["insurance client"] },
  { q: "How do we record a damage case?", cites: ["damage", "Schaden"] },
  { q: "What happens when a vehicle is handed to a new driver?", cites: ["vehicle", "driver"] },
  { q: "How are vouchers issued to a pharmacy?", cites: ["voucher", "pharmacy"] },
  { q: "What was covered in the FluClinic sprint sync?", cites: ["FluClinic", "Flu clinic"] },
  { q: "What did the strategy session with kwapso cover?", cites: ["Strategy Session"] },

  // ── AN EXACT REFERENCE, INSIDE A LONG QUESTION ───────────────────────────
  // The measured failure that fix 1 is about: the proportional term floor made
  // a reference number HARDER to find the more fully somebody phrased the
  // question around it.
  {
    q: "Could somebody remind me where things currently stand with task 3144, and whether anybody has replied about it since last week?",
    cites: ["3144"],
  },
  { q: "task 3144", cites: ["3144"] },

  // ── SAYING NOTHING, WHEN THERE IS NOTHING ────────────────────────────────
  // R23. Each of these names something the base genuinely does not hold: no
  // security review was ever run, nobody has written about parental leave, and
  // the capital of France is the standing example of a question whose words all
  // appear somewhere and never together.
  { q: "What did the external penetration test report conclude about our authentication?", refuse: true },
  { q: "What is our parental leave policy and how much notice does it need?", refuse: true },
  { q: "What is the capital of France?", refuse: true },
  { q: "What were the findings of the ISO 27001 certification audit we completed?", refuse: true },

  // ── ONE THING SAID FIVE WAYS ─────────────────────────────────────────────
  // The measured failure that fix 5 is about. A recurring meeting arrives as the
  // meeting itself, its Gemini notes in Drive, the calendar event and the
  // invitation and notes emails — five titles, one subject — and an answer built
  // from six of them has told the reader one thing.
  { q: "Summarise the week recap meeting", cites: ["Week recap"], spread: 2 },
  { q: "What happened at the Team Assembly meeting in August?", cites: ["Team Assembly"], spread: 2 },

  // ── QUESTIONS THAT CROSS SOURCES ─────────────────────────────────────────
  { q: "What is the plan for importing HOGO's existing data?", cites: ["HOGO", "Hogo", "Import"] },
  { q: "What has been agreed with Assecuranz about their file import?", cites: ["Assecuranz"] },
]
