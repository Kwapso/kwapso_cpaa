"use client"

// Import screen — the AGENTIC multi-file wizard at /t/<teamId>/import
// (AGENTIC-IMPORT.md). Drop one or many spreadsheets (CSV native; XLSX converted
// in the browser), then:
//   1. the AGENT reads the files + builds a PLAN (which table each feeds, column
//      mappings, normalizations, the dependency order, predicted rejects) — metered;
//   2. you REVIEW the plan (one confirmation, not per row);
//   3. it RUNS in dependency order, writing every row through the same gated create
//      endpoint the UI uses (so imported rows get the same audit trail as typed
//      ones), and returns a per-row REPORT with reasons for anything rejected.
// Host-composed (bespoke) because the multi-file plan-review UX isn't an engine
// recipe. Gated by the caller holding create on at least one import target.

import * as React from "react"
import { Download, FileSpreadsheet, Sparkles, Upload } from "lucide-react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"

import type { ImportableTarget, ImportBatchReport, ImportBatchSummary, ImportBatchView } from "@shared/types"
import { ApiFailure, dataOps } from "@/lib/api"
import { fileToCsv, UserFileError } from "@/lib/file-to-csv"
import { formatActivityWhen } from "@shared/web/format"
import { usePermissions } from "@/lib/perms"
import { useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"

type Phase = "upload" | "review" | "done"

export function ImportScreen({ teamId, initialTarget }: { teamId: string; initialTarget?: string }) {
  const t = useT()
  const { perms, loading: permsLoading } = usePermissions(teamId)
  const canImport = perms ? Object.values(perms).some((m) => m?.create) : false

  const [phase, setPhase] = React.useState<Phase>("upload")
  const [batch, setBatch] = React.useState<ImportBatchView | null>(null)
  const [report, setReport] = React.useState<ImportBatchReport | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [busyNote, setBusyNote] = React.useState("")
  const fileRef = React.useRef<HTMLInputElement>(null)

  // The catalog — powers the "download a sample" links so a user can see what a good
  // file looks like BEFORE preparing theirs (AGENTIC-IMPORT §10). Arriving from a
  // specific tab (initialTarget) shows ONLY that table's sample — the one they came
  // to import — not the whole catalog; the generic Import screen still shows all.
  const targetsQ = useCached<ImportableTarget[]>(`import-targets:${teamId}`, () =>
    dataOps.importTargets().then((r) => r.targets)
  )
  const allTargets = targetsQ.data ?? []
  const scoped = initialTarget ? allTargets.filter((t) => t.tableKey === initialTarget) : []
  const samples = scoped.length ? scoped : allTargets

  const files = batch?.files ?? []

  async function addFiles(list: FileList | null) {
    if (!list || !list.length || busy) return
    setBusy(true)
    setBusyNote("Reading your files…")
    try {
      let id = batch?.id
      if (!id) id = (await dataOps.batchStart()).batch.id
      let latest: ImportBatchView | null = batch
      for (const file of Array.from(list)) {
        const csv = await fileToCsv(file)
        latest = (await dataOps.batchAddFile(id, file.name, csv)).batch
      }
      setBatch(latest)
    } catch (err) {
      const msg =
        err instanceof UserFileError || err instanceof ApiFailure ? err.message : "Couldn't read that file."
      toast.error(msg)
    } finally {
      setBusy(false)
      setBusyNote("")
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function plan() {
    if (!batch || busy) return
    setBusy(true)
    setBusyNote("The assistant is reading your files and building a plan…")
    try {
      const r = await dataOps.batchPlan(batch.id)
      setBatch(r.batch)
      setPhase("review")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't plan the import.")
    } finally {
      setBusy(false)
      setBusyNote("")
    }
  }

  async function run() {
    if (!batch || busy) return
    setBusy(true)
    setBusyNote("Importing your data…")
    try {
      const r = await dataOps.batchConfirm(batch.id)
      setReport(r.report)
      setPhase("done")
      toast.success(`Imported ${r.report.created} row(s).`)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "The import didn't finish.")
    } finally {
      setBusy(false)
      setBusyNote("")
    }
  }

  function reset() {
    setBatch(null)
    setReport(null)
    setPhase("upload")
  }

  function downloadRejections(rows: { file: string; row: number; reason: string }[], filename: string) {
    if (!rows.length) return
    // Neutralize formula-injection (a file named "=cmd()") like the server exporter.
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

  // ---- guards (wait for rights before judging — a loading `can` reads false) ----
  if (permsLoading && perms === undefined) return <Skeleton variant="list" lines={4} />
  if (perms === undefined)
    return <p className="text-destructive text-sm">{t("Couldn't load your access rights. Refresh to try again.")}</p>
  if (!canImport)
    return (
      <p className="text-muted-foreground text-sm">
        {t("There's nothing here you can import into yet. You can import once you're allowed to create Accounts, Roles or Dropdown values.")}
      </p>
    )

  return (
    <div className="flex flex-col gap-6">
      {busyNote && (
        <div className="bg-muted/50 text-muted-foreground flex items-center gap-2 rounded-xl border p-3 text-sm">
          <Sparkles className="size-4 animate-pulse" aria-hidden /> {busyNote}
        </div>
      )}

      {/* 1 · UPLOAD */}
      {phase === "upload" && (
        <div className="flex flex-col gap-4">
          <label
            className="border-muted-foreground/25 hover:bg-muted/40 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              void addFiles(e.dataTransfer.files)
            }}
          >
            <Upload className="text-muted-foreground size-6" aria-hidden />
            <span className="text-sm font-medium">{t("Drop your spreadsheets here, or click to choose")}</span>
            <span className="text-muted-foreground text-xs">
              {t("CSV or Excel (.xlsx) files. Add several at once, the assistant sorts out how they connect.")}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.xlsx,.xls,text/csv"
              multiple
              className="hidden"
              onChange={(e) => void addFiles(e.target.files)}
              disabled={busy}
            />
          </label>

          {/* Sample files — see a good file for each table before preparing yours. */}
          {samples.length > 0 && (
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span>{t("New to this? Download a sample:")}</span>
              {samples.map((t) => (
                <a
                  key={t.tableKey}
                  href={dataOps.importSampleHref(t.tableKey)}
                  className="text-foreground inline-flex items-center gap-1 underline underline-offset-2"
                >
                  <FileSpreadsheet className="size-3.5" aria-hidden /> {t.displayName}
                </a>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className="divide-border divide-y rounded-xl border">
              {files.map((f) => (
                <div key={f.fileId} className="flex items-center gap-2 p-3 text-sm">
                  <FileSpreadsheet className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">{f.rowCount} {t("rows")}</span>
                </div>
              ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  {t("Planning uses the assistant (a few credits), so you can review before anything is written.")}
                </p>
                <Button onClick={() => void plan()} disabled={busy} className="gap-1">
                  <Sparkles className="size-4" aria-hidden /> {t("Analyze & plan")}
                </Button>
              </div>
            </div>
          )}

          {files.length === 0 && <PastImports teamId={teamId} />}
        </div>
      )}

      {/* 2 · REVIEW THE PLAN */}
      {phase === "review" && batch?.plan && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{t("Here's the plan")}</p>
              <p className="text-muted-foreground text-xs">
                {batch.plan.steps.length} {t("file(s) →")}{" "}
                {batch.plan.order.length} {t("table(s), in order. Review, then run once.")}
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {batch.plan.bySource === "agent" ? "Planned by the assistant" : "Auto-matched"}
            </Badge>
          </div>

          {batch.plan.warnings.map((w, i) => (
            <p key={i} className="text-destructive bg-destructive/10 rounded-xl p-2.5 text-xs">
              {w}
            </p>
          ))}

          {/* THE ANSWER, THEN THE WORKING. `PlanSummary` is what this whole
              phase is for — how many rows will be written, how many skipped —
              and it was at the BOTTOM, under a card per file, so a reader had to
              cross the working to reach the total they came to check (N2 counted
              five blocks before it). The steps are the audit trail for the three
              numbers above them, and an audit trail reads perfectly well after
              the figure it explains. */}
          <PlanSummary plan={batch.plan} onDownload={downloadRejections} />

          {/* THE STEPS ARE A COLLECTION, so they get ONE container with divided
              rows inside it (N6). This phase used to draw a bordered card per
              step inside a bordered plan inside a bordered screen, which is
              three boundaries between a reader and one fact and the single
              heaviest use of the border class in either front door — the
              "twisted" feeling arriving as geometry. */}
          <div className="divide-border divide-y rounded-xl border">
          {batch.plan.steps.map((step, i) => (
            <div key={step.fileId} className="flex flex-col gap-4 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
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
                  (allTargets.find((t) => t.tableKey === step.target)?.requiredColumns ?? [])
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
                          <Badge variant="secondary" className="text-[9px]">
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

              {step.predictedRejects > 0 && (
                <div className="bg-warning/10 flex flex-col gap-1 rounded-xl p-2.5">
                  <p className="text-xs font-medium text-warning">
                    {step.predictedRejects} of {step.rowCount} {t("row(s) will be skipped")}
                    {step.notes ? `, ${step.notes}` : ""}
                  </p>
                  {(step.predictedRejections ?? []).slice(0, 3).map((r, j) => (
                    <p key={j} className="text-muted-foreground text-xs">
                      {t("Row")} {r.row}: {r.reason}
                    </p>
                  ))}
                  {(step.predictedRejections?.length ?? 0) > 3 && (
                    <p className="text-muted-foreground text-xs">
                      …and {step.predictedRejects - 3} {t("more, download the list below.")}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setPhase("upload")} disabled={busy}>
              {t("Back")}
            </Button>
            <Button onClick={() => void run()} disabled={busy || !batch.plan.order.length} className="gap-1">
              <Upload className="size-4" aria-hidden /> {t("Run import")}
            </Button>
          </div>
        </div>
      )}

      {/* 3 · REPORT */}
      {phase === "done" && report && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Stat label={t("Added")} value={report.created} tone="good" />
            <Stat label={t("Skipped")} value={report.skipped} tone={report.skipped ? "warn" : "muted"} />
            <Stat label={t("Failed")} value={report.failed} tone={report.failed ? "bad" : "muted"} />
          </div>

          {report.perTarget.length > 0 && (
            // ONE container round the collection, `divide-y` inside it (N6). It
            // was a bordered box per row, which draws a boundary AND leaves a
            // gap at every one of them — two cues where the rule allows one.
            <div className="divide-border divide-y rounded-xl border">
              {report.perTarget.map((t) => (
                <div key={t.target} className="flex items-center gap-2 p-3 text-sm">
                  <span className="flex-1 font-medium">{t.targetName}</span>
                  <span className="text-muted-foreground text-xs">
                    {t.created} added · {t.skipped} skipped · {t.failed} failed
                  </span>
                </div>
              ))}
            </div>
          )}

          {report.rejections.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{t("Rejected rows (")}{report.rejections.length})</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadRejections(report.rejections, "import-rejections.csv")}
                  className="gap-1"
                >
                  <Download className="size-3.5" aria-hidden /> {t("Download to fix")}
                </Button>
              </div>
              <div className="max-h-48 overflow-auto rounded-xl border">
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

          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={reset} className="gap-1">
              <Upload className="size-4" aria-hidden /> {t("Import more")}
            </Button>
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
      <div className="divide-border divide-y rounded-xl border">
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

/** The plan's bottom line, above the Run button: how many rows WILL import, how many
 * will be skipped (with a downloadable fix-list BEFORE running), and how many of the
 * targets' columns weren't in the files — big numbers, separated from the step detail,
 * so a bad file is obvious at a glance (a plan must look different from a clean one). */
function PlanSummary({
  plan,
  onDownload,
}: {
  plan: NonNullable<ImportBatchView["plan"]>
  onDownload: (rows: { file: string; row: number; reason: string }[], filename: string) => void
}) {
  const t = useT()
  const totalRows = plan.steps.reduce((n, s) => n + s.rowCount, 0)
  const skipped = plan.steps.reduce((n, s) => n + s.predictedRejects, 0)
  const rejections = plan.steps.flatMap((s) => s.predictedRejections ?? [])
  return (
    <div className="flex flex-col gap-4 border-t pt-4">
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
            variant="outline"
            size="sm"
            onClick={() => onDownload(rejections, "rows-to-fix.csv")}
            className="gap-1"
          >
            <Download className="size-3.5" aria-hidden /> {t("Download the list")}
          </Button>
        </div>
      )}
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
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  )
}
