"use client"

// FileUpload — a drag-and-drop zone + click-to-browse picker. Covers Glide's
// "Image Picker" and "File Picker": image files show a thumbnail, others show
// their extension. Calls onChange with the current File[].

import * as React from "react"
import { UploadCloud, X } from "lucide-react"

import { cn } from "../../../lib/utils"

export interface FileUploadProps {
  /** e.g. "image/*" for an image picker. */
  accept?: string
  multiple?: boolean
  onChange?: (files: File[]) => void
  className?: string
}

function FileUpload({
  accept,
  multiple = false,
  onChange,
  className,
}: FileUploadProps) {
  const [files, setFiles] = React.useState<File[]>([])
  const [over, setOver] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  function add(list: FileList | null) {
    if (!list) return
    const next = multiple
      ? [...files, ...Array.from(list)]
      : Array.from(list).slice(0, 1)
    setFiles(next)
    onChange?.(next)
  }
  function remove(i: number) {
    const next = files.filter((_, j) => j !== i)
    setFiles(next)
    onChange?.(next)
  }

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          add(e.dataTransfer.files)
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground transition-colors hover:bg-accent",
          over && "border-primary bg-primary/5"
        )}
      >
        <UploadCloud className="size-6" />
        Drop files here or click to browse
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => add(e.target.files)}
      />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg border bg-card p-2 text-xs"
            >
              {f.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={URL.createObjectURL(f)}
                  alt=""
                  className="size-10 rounded object-cover"
                />
              ) : (
                <div className="flex size-10 items-center justify-center rounded bg-secondary uppercase">
                  {f.name.split(".").pop()}
                </div>
              )}
              <span className="max-w-32 truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="rounded p-0.5 transition-colors hover:bg-accent"
                aria-label={`Remove ${f.name}`}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export { FileUpload }
