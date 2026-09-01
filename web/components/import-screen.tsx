"use client"

// Import screen — the AGENTIC multi-file wizard at /t/<teamId>/import
// (AGENTIC-IMPORT.md), drawn on the kit's own `ImportWizard`.
//
// THE FLOW IS THE KIT'S FIVE STEPS, and it always was — AGENTIC-IMPORT's own
// diagram is upload → plan → review → run → report. What this screen used to
// draw was three phases with two of the five hidden inside a busy banner: the
// agent's analysis and the write itself both happened behind a line of text
// with no rail, no progress and no way to tell how far along you were. The
// wizard makes both of them places you can be.
//
//   upload   the files, and beside them a sample of a good file per table
//            and what this team imported last time (`uploadAside`)
//   plan     how each file's columns line up with ours, per file, READ-ONLY —
//            there is no remap door (see `planContent` below)
//   review   the bottom line: how many rows will be written, how many skipped
//            and why, with the fix-list downloadable BEFORE anything runs
//   run      `batchConfirm` in flight
//   report   what actually happened, per target, with the rejected rows
//
// THREE PANELS ARE OURS AND TWO ARE THE KIT'S. The upload step is the kit's
// `FileUpload` and the run step is the kit's `Progress`; `planContent`,
// `reviewContent` and `reportContent` are supplied here because what they show
// is this app's business, not a wizard's. That is the component's own documented
// escape hatch ("Replace the whole X step"), not a way around it:
//   · the kit's plan step is a per-column `Select` editor driven by
//     `onMappingChange`, and there is no door behind it — `web/lib/api/data-ops.ts`
//     has batchStart/batchAddFile/batchPlan/batchConfirm/batchGet and no remap.
//     A control that cannot save is worse than a readout that does not pretend.
//   · the kit's review and report steps are `DataPreviewTable`, a per-row
//     checkbox grid. AGENTIC-IMPORT §1 rules "One confirm, not per row", and
//     `confirmBatch` re-scans every row regardless — a per-row checkbox here
//     would be a control that changes nothing.
//
// Host-composed (bespoke) because the multi-file plan-review UX isn't an engine
// recipe. Gated by the caller holding create on at least one import target.

import * as React from "react"
import { Download, FileSpreadsheet } from "@shared/ui/foundations/icons"

import { Button } from "@shared/ui/components/button/button"
import { Badge } from "@shared/ui/components/badge/badge"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { toast } from "@shared/ui/components/sonner/sonner"
import {
  ImportWizard,
  type ImportWizardStep,
} from "@shared/ui/components/import-wizard/import-wizard"

import type { ImportableTarget, ImportBatchReport, ImportBatchSummary, ImportBatchView } from "@shared/types"
import { ApiFailure, dataOps } from "@/lib/api"
import { fileToCsv, UserFileError } from "@/lib/file-to-csv"
import { formatActivityWhen } from "@shared/web/format"
import { usePermissions } from "@/lib/perms"
import { useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"

type Rejection = { file: string; row: number; reason: string }

/** Neutralize formula-injection (a file named "=cmd()") exactly as the server
 * exporter does, then hand the browser a download. A SECURITY CONTROL, not a
 * convenience: these rows carry text that came out of somebody's spreadsheet,
 * and a CSV opened in Excel executes a leading `=`, `+`, `-` or `@`. Lives here
 * rather than in a kit part because it is about what our data can contain. */
function downloadRejections(rows: Rejection[], filename: string) {
  if (!rows.length) return
  const esc = (raw: string) => {
    const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv =
    "file,row,reason\r\n" + rows.map((r) => [esc(r.file), r.row, esc(r.reason)].join(",")).join("\r\n")
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export function ImportScreen({ teamId, initialTarget }: { teamId: string; initialTarget?: string }) {
  const t = useT()
  const { perms, loading: permsLoading } = usePermissions(teamId)
  const canImport = perms ? Object.values(perms).some((m) => m?.create) : false

  const [step, setStep] = React.useState<ImportWizardStep>("upload")
  const [batch, setBatch] = React.useState<ImportBatchView | null>(null)
  const [report, setReport] = React.useState<ImportBatchReport | null>(null)
  const [busy, setBusy] = React.useState(false)
  // The run step is the ONE place a failure cannot be a toast: `Back` is
  // withdrawn there by the wizard's own law, so a failed write with only a
  // toast would leave the reader on a dead step. The kit's error register keeps
  // the rail and carries the way out.
  const [runFailed, setRunFailed] = React.useState<string | null>(null)

  // The catalog — powers the "download a sample" links so a user can see what a good
  // file looks like BEFORE preparing theirs (AGENTIC-IMPORT §10). Arriving from a
  // specific tab (initialTarget) shows ONLY that table's sample — the one they came
  // to import — not the whole catalog; the generic Import screen still shows all.
  const targetsQ = useCached<ImportableTarget[]>(`import-targets:${teamId}`, () =>
    dataOps.importTargets().then((r) => r.targets)
  )
  const allTargets = targetsQ.data ?? []
  const scoped = initialTarget ? allTargets.filter((x) => x.tableKey === initialTarget) : []
  const samples = scoped.length ? scoped : allTargets

  const files = batch?.files ?? []
  const plan = batch?.plan ?? null

  async function addFiles(picked: File[]) {
    if (!picked.length || busy) return
    setBusy(true)
    try {
      let id = batch?.id
      if (!id) id = (await dataOps.batchStart()).batch.id
      let latest: ImportBatchView | null = batch
      for (const file of picked) {
        const csv = await fileToCsv(file)
        latest = (await dataOps.batchAddFile(id, file.name, csv)).batch
      }
      setBatch(latest)
    } catch (err) {
      const msg =
        err instanceof UserFileError || err instanceof ApiFailure
          ? err.message
          : t("Couldn't read that file.")
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  async function runPlan() {
    if (!batch || busy) return
    setBusy(true)
    try {
      const r = await dataOps.batchPlan(batch.id)
      setBatch(r.batch)
      setStep("plan")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't plan the import."))
    } finally {
      setBusy(false)
    }
  }

  async function run() {
    if (!batch || busy) return
    setBusy(true)
    setRunFailed(null)
    setStep("run")
    try {
      const r = await dataOps.batchConfirm(batch.id)
      setReport(r.report)
      setStep("report")
      toast.success(t("Imported {count} row(s).", { count: r.report.created }))
    } catch (err) {
      setRunFailed(err instanceof ApiFailure ? err.message : t("The import didn't finish."))
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setBatch(null)
    setReport(null)
    setRunFailed(null)
    setStep("upload")
  }

  // ---- guards (wait for rights before judging — a loading `can` reads false) ----
  if (permsLoading && perms === undefined) return <Skeleton variant="list" lines={4} />
  if (perms === undefined)
    return <p className="text-destructive text-sm">{t("Couldn't load your access rights. Refresh to try again.")}</p>
  if (!canImport)
    return (
      <p className="text-muted-foreground text-sm">
        {t("There's nothing here you can import into yet. You can import once you're allowed to create Accounts, Roles or Choices.")}
      </p>
    )

  const totalRows = files.reduce((n, f) => n + f.rowCount, 0)
  const skipped = plan ? plan.steps.reduce((n, s) => n + s.predictedRejects, 0) : 0
  const planRows = plan ? plan.steps.reduce((n, s) => n + s.rowCount, 0) : 0

  // Which control the footer's one forward press is, per step. `review` is the
  // irreversible one and the wizard labels it with `startLabel` itself.
  function onContinue() {
    if (step === "upload") return void runPlan()
    if (step === "plan") return setStep("review")
    if (step === "review") return void run()
    if (step === "report") return reset()
  }

  const canContinue =
    step === "upload"
      ? files.length > 0
      : step === "plan"
        ? plan !== null
        : step === "review"
          ? (plan?.order.length ?? 0) > 0
          : true

  return (
    <ImportWizard
      step={step}
      onStepChange={setStep}
      railLabel={t("Import steps")}
      stepLabels={{
        upload: t("Your files"),
        plan: t("Match the columns"),
        review: t("Check and commit"),
        run: t("Writing"),
        report: t("The report"),
      }}
      loading={busy}
      /* The run step's own failure, in the kit's register rather than a toast —
         see `runFailed`. Every other failure leaves the reader on a step they
         can act from, so those stay toasts. */
      error={runFailed !== null}
      errorEyebrow={t("The import stopped")}
      errorTitle={t("The import didn't finish")}
      errorBody={runFailed ?? undefined}
      errorAction={
        <Button variant="secondary" onClick={() => { setRunFailed(null); setStep("review") }}>
          {t("Back to the plan")}
        </Button>
      }
      /* ---- 1 · upload ---- */
      files={files.map((f) => ({ id: f.fileId, name: f.name }))}
      onFilesSelected={(picked) => void addFiles(picked)}
      accept=".csv,.tsv,.xlsx,.xls,text/csv"
      multiple
      uploadPrompt={t("Drop your spreadsheets here, or click to choose")}
      uploadHint={t("CSV or Excel (.xlsx) files. Add several at once, the assistant sorts out how they connect.")}
      uploadAside={
        <div className="flex flex-col gap-6">
          {samples.length > 0 && (
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span>{t("New to this? Download a sample:")}</span>
              {samples.map((s) => (
                <a
                  key={s.tableKey}
                  href={dataOps.importSampleHref(s.tableKey)}
                  className="text-foreground inline-flex items-center gap-1 underline underline-offset-2"
                >
                  <FileSpreadsheet className="size-3.5" aria-hidden /> {s.displayName}
                </a>
              ))}
            </div>
          )}
          {files.length === 0 && <PastImports teamId={teamId} />}
        </div>
      }
      /* ---- 2 · plan (ours: read-only, per file) ---- */
      planContent={plan ? <PlanColumns plan={plan} targets={allTargets} /> : undefined}
      /* ---- 3 · review (ours: the bottom line + the fix-list) ---- */
      reviewContent={plan ? <PlanReview plan={plan} /> : undefined}
      /* ---- 4 · run ----
         Indeterminate ON PURPOSE. The kit's rule is "never a spinner where a
         shape is known", and here it genuinely is not: `batchConfirm` is one
         POST that returns when the whole ordered graph has been written, with
         no per-row progress on the wire. A determinate bar would have to invent
         its own numerator. */
      runValue={null}
      runLabel={t("Importing your data")}
      runMeta={t("Writing {count} row(s). Each one is checked exactly as if you typed it in yourself.", {
        count: planRows - skipped,
      })}
      /* ---- 5 · report (ours) ---- */
      reportContent={report ? <Report report={report} /> : undefined}
      /* ---- the footer ---- */
      onBack={step === "upload" ? undefined : () => setStep(step === "review" ? "plan" : "upload")}
      onContinue={onContinue}
      canContinue={canContinue}
      backLabel={t("Back")}
      continueLabel={t("Continue")}
      startLabel={t("Run import")}
      finishLabel={t("Import more")}
      meta={
        step === "upload" && files.length > 0
          ? t("{files} file(s) · {rows} row(s). Planning uses the assistant (a few credits), so you can review before anything is written.", {
              files: files.length,
              rows: totalRows,
            })
          : undefined
      }
    />
  )
}

/** The plan's PLUMBING, one block per file: which table it feeds, which columns
 * line up, what gets normalized on the way, and which references make the order
 * matter. Read-only — there is no remap door (see the file header). */
function PlanColumns({ plan, targets }: { plan: NonNullable<ImportBatchView["plan"]>; targets: ImportableTarget[] }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t("Here's the plan")}</p>
          <p className="text-muted-foreground text-xs">
            {plan.steps.length} {t("file(s) →")} {plan.order.length}{" "}
            {t("table(s), in order. Review, then run once.")}
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 text-badge">
          {plan.bySource === "agent" ? t("Planned by the assistant") : t("Auto-matched")}
        </Badge>
      </div>

      {/* THE STEPS ARE A COLLECTION, so they get ONE container with divided
          rows inside it (N6). */}
      <div className="divide-border divide-y rounded-[var(--radius)] bg-surface-panel">
        {plan.steps.map((step, i) => (
          <div key={step.fileId} className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-badge">
                {t("Step")} {i + 1}
              </Badge>
              <span className="text-sm font-medium">{step.fileName}</span>
              <span className="text-muted-foreground text-xs">→</span>
              <span className="text-sm font-medium">{step.targetName}</span>
              <span className="text-muted-foreground text-xs">· {step.rowCount} {t("rows")}</span>
            </div>

            {step.references.length > 0 && (
              <p className="text-muted-foreground text-xs">
                {t("Uses")}{" "}
                {step.references.map((r) => (
                  <span key={r.column} className="text-foreground font-medium">
                    {r.column}
                  </span>
                ))}{" "}
                {t("from an earlier table, that's why order matters.")}
              </p>
            )}

            {/* Mapped columns + unmapped REQUIRED ones only. Unmapped OPTIONAL
             * columns fold into one quiet line — a simple file shouldn't read as a
             * wall of "not in your file" (the roles matrix alone is 32 columns). */}
            {(() => {
              const required = new Set(
                (targets.find((x) => x.tableKey === step.target)?.requiredColumns ?? [])
                  .filter((c) => c.required)
                  .map((c) => c.key)
              )
              const entries = Object.entries(step.mapping)
              const shown = entries.filter(([k, v]) => v !== null || required.has(k))
              const folded = entries.length - shown.length
              return (
                <div className="flex flex-col gap-1">
                  {shown.map(([ourCol, theirHeader]) => (
                    <div key={ourCol} className="flex items-center gap-2 text-xs">
                      <span className="w-28 shrink-0 font-medium">{ourCol}</span>
                      <span className="text-muted-foreground">←</span>
                      {theirHeader ? (
                        <span>{theirHeader}</span>
                      ) : (
                        <span className="text-muted-foreground italic">{t("not in your file")}</span>
                      )}
                      {step.transforms[ourCol] && (
                        <Badge variant="secondary" className="text-badge">
                          {step.transforms[ourCol]}
                        </Badge>
                      )}
                    </div>
                  ))}
                  {folded > 0 && (
                    <p className="text-muted-foreground text-xs">
                      + {folded} {t("optional column")}{folded === 1 ? "" : "s"} {t("not in your file, fine to leave out.")}
                    </p>
                  )}
                </div>
              )
            })()}
          </div>
        ))}
      </div>
    </div>
  )
}

/** THE ANSWER, THEN THE WORKING. The one thing this step is for is how many
 * rows will be written and how many will not — so it leads, and the per-step
 * reasons that justify the second number follow it. The fix-list is
 * downloadable HERE, before anything is written, which is the whole point of a
 * plan that is bound to the run (AGENTIC-IMPORT §2.5). */
function PlanReview({ plan }: { plan: NonNullable<ImportBatchView["plan"]> }) {
  const t = useT()
  const totalRows = plan.steps.reduce((n, s) => n + s.rowCount, 0)
  const skipped = plan.steps.reduce((n, s) => n + s.predictedRejects, 0)
  const rejections = plan.steps.flatMap((s) => s.predictedRejections ?? [])
  return (
    <div className="flex flex-col gap-4">
      {plan.warnings.map((w, i) => (
        <p key={i} className="text-destructive bg-destructive/10 rounded-[var(--radius)] p-2.5 text-xs">
          {w}
        </p>
      ))}

      <div className="flex flex-wrap gap-2">
        <Stat label={t("Will import")} value={totalRows - skipped} tone={totalRows - skipped ? "good" : "muted"} />
        <Stat label={t("Will be skipped")} value={skipped} tone={skipped ? "warn" : "muted"} />
        <Stat label={t("Tables")} value={plan.order.length} tone="muted" />
      </div>

      {rejections.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">
            {t("Skipped rows are listed with reasons. Fix them and re-import, or run now without them.")}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadRejections(rejections, "rows-to-fix.csv")}
            className="gap-1"
          >
            <Download className="size-3.5" aria-hidden /> {t("Download the list")}
          </Button>
        </div>
      )}

      {/* Per STEP, because a bad file is one file — a single total would say
          "42 rows will be skipped" without saying which spreadsheet to fix. */}
      {plan.steps.some((s) => s.predictedRejects > 0) && (
        <div className="divide-border divide-y rounded-[var(--radius)] bg-surface-panel">
          {plan.steps
            .filter((s) => s.predictedRejects > 0)
            .map((step) => (
              <div key={step.fileId} className="flex flex-col gap-1 p-3">
                <p className="text-warning text-xs font-medium">
                  {step.fileName} —{" "}
                  {t("{skipped} of {total} row(s) will be skipped", {
                    skipped: step.predictedRejects,
                    total: step.rowCount,
                  })}
                  {step.notes ? `, ${step.notes}` : ""}
                </p>
                {(step.predictedRejections ?? []).slice(0, 3).map((r, j) => (
                  <p key={j} className="text-muted-foreground text-xs">
                    {t("Row")} {r.row}: {r.reason}
                  </p>
                ))}
                {(step.predictedRejections?.length ?? 0) > 3 && (
                  <p className="text-muted-foreground text-xs">
                    {/* Opens with a WORD, not an ellipsis. `isUserVisible`
                        (scripts/lib/i18n-source.mjs:128) refuses any string
                        starting `…` as "opens mid-sentence", so a leading
                        ellipsis here would keep the sentence out of the
                        catalogue entirely and ship it in English to everybody
                        — extracted by nothing, so flagged by nothing. */}
                    {t("And {count} more — download the list above.", { count: step.predictedRejects - 3 })}
                  </p>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

/** What actually happened: the three totals, the per-target tally, and every
 * rejected row with its reason — downloadable so the user can fix and re-run
 * just those. */
function Report({ report }: { report: ImportBatchReport }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Stat label={t("Added")} value={report.created} tone="good" />
        <Stat label={t("Skipped")} value={report.skipped} tone={report.skipped ? "warn" : "muted"} />
        <Stat label={t("Failed")} value={report.failed} tone={report.failed ? "bad" : "muted"} />
      </div>

      {report.perTarget.length > 0 && (
        // ONE container round the collection, `divide-y` inside it (N6).
        <div className="divide-border divide-y rounded-[var(--radius)] bg-surface-panel">
          {report.perTarget.map((row) => (
            <div key={row.target} className="flex items-center gap-2 p-3 text-sm">
              <span className="flex-1 font-medium">{row.targetName}</span>
              <span className="text-muted-foreground text-xs">
                {/* ONE ENTRY WITH THREE HOLES, so a translator can reorder it. */}
                {t("{created} added · {skipped} skipped · {failed} failed", {
                  created: row.created,
                  skipped: row.skipped,
                  failed: row.failed,
                })}
              </span>
            </div>
          ))}
        </div>
      )}

      {report.rejections.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {t("Rejected rows ({count})", { count: report.rejections.length })}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => downloadRejections(report.rejections, "import-rejections.csv")}
              className="gap-1"
            >
              <Download className="size-3.5" aria-hidden /> {t("Download to fix")}
            </Button>
          </div>
          <div className="max-h-48 overflow-auto rounded-[var(--radius)] bg-surface-panel">
            {report.rejections.slice(0, 50).map((r, i) => (
              <div key={i} className="flex gap-2 border-b p-2 text-xs last:border-0">
                <span className="text-muted-foreground w-24 shrink-0 truncate">
                  {r.file}:{r.row}
                </span>
                <span>{r.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** The team's import history under the drop zone — who ran what, when, into which
 * tables, with the totals. Answers "several people import different sets — how do
 * we see past import runs?" without leaving the Import screen. Summaries only
 * (never row contents); a draft/planned batch shows as "not run". */
function PastImports({ teamId }: { teamId: string }) {
  const t = useT()
  const q = useCached<ImportBatchSummary[]>(`import-batches:${teamId}`, () =>
    dataOps.importBatches().then((r) => r.batches)
  )
  const batches = q.data ?? []
  if (!batches.length) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t("Past imports")}</p>
      <div className="divide-border divide-y rounded-[var(--radius)] bg-surface-panel">
        {batches.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 p-3 text-xs">
            <span className="font-medium">{b.by}</span>
            <span className="text-muted-foreground">{formatActivityWhen(b.at)}</span>
            <span className="text-muted-foreground min-w-0 flex-1 truncate">
              {b.files.map((f) => f.name).join(", ")}
              {b.targets.length ? ` → ${b.targets.join(", ")}` : ""}
            </span>
            {b.status === "complete" ? (
              <span className="shrink-0">
                <span className="text-success">{b.created} {t("added")}</span>
                {b.skipped + b.failed > 0 && (
                  <span className="text-warning"> · {b.skipped + b.failed} {t("skipped")}</span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground shrink-0">{t("not run")}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "good" | "warn" | "bad" | "muted" }) {
  const color =
    tone === "good"
      ? "text-success"
      : tone === "warn"
        ? "text-warning"
        : tone === "bad"
          ? "text-destructive"
          : "text-muted-foreground"
  // N6: a single stat is not a collection of two or more rows and not a form of
  // two or more fields, so it never earned a container. Three of them are ONE
  // band — the row is the group, and the numbers are big enough to be found
  // without a box drawn round each.
  return (
    <div className="flex-1 text-center">
      <p className={`text-2xl font-medium ${color}`}>{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  )
}
