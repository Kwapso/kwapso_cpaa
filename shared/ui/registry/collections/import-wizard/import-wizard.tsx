"use client"

// ImportWizard — a 3-stage import flow: Validate file → Map columns → Preview &
// import. Stage 1 is a dropzone (the FileUpload primitive) with validation
// feedback; stage 2 maps each source column to a target-schema field (pre-filled,
// editable, required targets marked); stage 3 renders the DataPreviewTable then a
// confirm. Flat, token-driven, dark-mode.

import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "../../../lib/utils"
import { Button } from "../../primitives/button/button"
import { FileUpload } from "../../primitives/file-upload/file-upload"
import { Label } from "../../primitives/label/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../primitives/select/select"
import { DataPreviewTable } from "../data-preview-table/data-preview-table"

export interface ImportTargetField {
  key: string
  label: string
  required: boolean
}
export interface ImportTargetSchema {
  fields: ImportTargetField[]
}

/** Stage-1 validation feedback, supplied by the host after it inspects the file. */
export interface ImportStageStatus {
  valid: boolean
  message?: string
}

const STAGES = ["Validate file", "Map columns", "Preview & import"] as const

function Stepper({ stage }: { stage: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STAGES.map((label, i) => {
        const n = i + 1
        const done = n < stage
        const active = n === stage
        return (
          <React.Fragment key={label}>
            <li className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-foreground",
                  !done && !active && "text-muted-foreground"
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : n}
              </span>
              <span
                className={cn(
                  "hidden text-sm sm:inline",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </li>
            {i < STAGES.length - 1 && (
              <span className="h-px w-4 flex-1 bg-border sm:w-8" aria-hidden />
            )}
          </React.Fragment>
        )
      })}
    </ol>
  )
}

function ImportWizard({
  targetSchema,
  suggestedMapping,
  previewRows,
  stageStatus,
  onFile,
  onMappingChange,
  onConfirm,
  className,
}: {
  targetSchema: ImportTargetSchema
  /** sourceColumn → targetKey (pre-filled suggestion; the source columns are its keys). */
  suggestedMapping: Record<string, string>
  /** Rows shown in stage 3, already in target-field order. */
  previewRows: React.ReactNode[][]
  /** Stage-1 file validation feedback (host-supplied). */
  stageStatus?: ImportStageStatus
  onFile: (file: File) => void
  onMappingChange: (map: Record<string, string>) => void
  onConfirm: () => void
  className?: string
}) {
  const [stage, setStage] = React.useState(1)
  const [mapping, setMapping] =
    React.useState<Record<string, string>>(suggestedMapping)
  const sourceColumns = Object.keys(suggestedMapping)

  const setMap = (source: string, target: string) => {
    const next = { ...mapping, [source]: target }
    setMapping(next)
    onMappingChange(next)
  }

  const mappedTargets = new Set(Object.values(mapping))
  const missingRequired = targetSchema.fields
    .filter((f) => f.required && !mappedTargets.has(f.key))
    .map((f) => f.label)

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-5 rounded-xl border bg-card p-5",
        className
      )}
    >
      <Stepper stage={stage} />

      {stage === 1 && (
        <div className="flex flex-col gap-3">
          <FileUpload
            accept=".csv,.xlsx,.xls"
            onChange={(f) => f[0] && onFile(f[0])}
          />
          {stageStatus?.message && (
            <p
              className={cn(
                "text-sm",
                stageStatus.valid ? "text-success" : "text-destructive"
              )}
            >
              {stageStatus.message}
            </p>
          )}
          <div className="flex justify-end">
            <Button onClick={() => setStage(2)} disabled={!stageStatus?.valid}>
              Next
            </Button>
          </div>
        </div>
      )}

      {stage === 2 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            {sourceColumns.map((source) => (
              <div
                key={source}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <Label className="font-mono text-xs text-muted-foreground sm:w-1/3">
                  {source}
                </Label>
                <div className="sm:w-2/3">
                  <Select
                    value={mapping[source] || undefined}
                    onValueChange={(v) => setMap(source, v)}
                  >
                    <SelectTrigger aria-label={`Map ${source}`}>
                      <SelectValue placeholder="— skip —" />
                    </SelectTrigger>
                    <SelectContent>
                      {targetSchema.fields.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label}
                          {f.required ? " *" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
          {missingRequired.length > 0 && (
            <p className="text-xs text-destructive">
              Map every required field: {missingRequired.join(", ")}.
            </p>
          )}
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => setStage(1)}>
              Back
            </Button>
            <Button
              onClick={() => setStage(3)}
              disabled={missingRequired.length > 0}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {stage === 3 && (
        <div className="flex flex-col gap-4">
          <DataPreviewTable
            columns={targetSchema.fields.map((f) => f.label)}
            rows={previewRows}
            totalCount={previewRows.length}
          />
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => setStage(2)}>
              Back
            </Button>
            <Button onClick={onConfirm}>
              Import {previewRows.length} rows
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export { ImportWizard }
