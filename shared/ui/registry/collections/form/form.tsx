"use client"

// Form — a config-driven form: declare the fields and it renders the inputs,
// runs basic validation (required + email), and hands you the values on submit.
// (Glide's "Form Container".) For complex forms, swap in react-hook-form later.

import * as React from "react"

import { type BaseConfig, defaultBaseConfig } from "../../../lib/config"
import { cn } from "../../../lib/utils"
import { Button } from "../../primitives/button/button"
import { useIsVisible } from "../../primitives/visibility/visibility"
import { Input } from "../../primitives/input/input"
import { Label } from "../../primitives/label/label"
import { Switch } from "../../primitives/switch/switch"
import { Textarea } from "../../primitives/textarea/textarea"

/* ------------------------------- config ------------------------------- */

export type FormFieldType = "text" | "email" | "number" | "textarea" | "switch"

export interface FormField {
  name: string
  label: string
  type: FormFieldType
  placeholder: string
  required: boolean
}

/** Every field is required on purpose — see ARCHITECTURE.md "Configuration". */
export interface FormConfig extends BaseConfig {
  fields: FormField[]
  submitLabel: string
  columns: 1 | 2
}

export const defaultFormConfig: FormConfig = {
  ...defaultBaseConfig,
  fields: [],
  submitLabel: "Submit",
  columns: 1,
}

/* ------------------------------ component ------------------------------ */

function Form({
  config,
  onSubmit,
  className,
}: {
  config: FormConfig
  onSubmit?: (values: Record<string, unknown>) => void
  className?: string
}) {
  const [values, setValues] = React.useState<Record<string, unknown>>({})
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const set = (name: string, v: unknown) =>
    setValues((s) => ({ ...s, [name]: v }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    for (const f of config.fields) {
      const v = values[f.name]
      if (f.required && f.type !== "switch" && !v) {
        next[f.name] = `${f.label} is required`
      } else if (
        f.type === "email" &&
        v &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))
      ) {
        next[f.name] = "Enter a valid email"
      }
    }
    setErrors(next)
    if (Object.keys(next).length === 0) onSubmit?.(values)
  }

  if (!useIsVisible(config)) return null

  return (
    <form
      onSubmit={submit}
      className={cn("flex w-full flex-col gap-4", className)}
    >
      <div
        className={cn(
          "grid gap-4",
          config.columns === 2 ? "sm:grid-cols-2" : "grid-cols-1"
        )}
      >
        {config.fields.map((f) => (
          <div
            key={f.name}
            className={cn(
              "flex flex-col gap-1.5",
              f.type === "textarea" && "sm:col-span-2",
              f.type === "switch" && "flex-row items-center justify-between"
            )}
          >
            <Label htmlFor={f.name}>
              {f.label}
              {f.required && <span className="text-destructive"> *</span>}
            </Label>
            {/* Required text-like fields get the animated teal ring. Mirrors
                Field's `shape` rule (primitives/field/field.tsx): only a single
                rectangular control is ringed — a switch is not box-shaped, so
                its asterisk carries "required" instead. Any future non-input
                field type (a pill/chip group) belongs on this exclusion list
                too, or it gets a gold rectangle drawn around the whole group. */}
            <div
              className={cn(
                f.required && f.type !== "switch" && "required-ring"
              )}
            >
              {f.type === "textarea" ? (
                <Textarea
                  id={f.name}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              ) : f.type === "switch" ? (
                <Switch id={f.name} onCheckedChange={(c) => set(f.name, c)} />
              ) : (
                <Input
                  id={f.name}
                  type={f.type === "number" ? "number" : f.type}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )}
            </div>
            {errors[f.name] && (
              <span className="text-xs text-destructive">{errors[f.name]}</span>
            )}
          </div>
        ))}
      </div>
      <Button type="submit" className="w-fit">
        {config.submitLabel}
      </Button>
    </form>
  )
}

export { Form }
