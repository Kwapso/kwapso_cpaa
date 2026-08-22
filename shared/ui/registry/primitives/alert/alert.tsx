// Alert — a static, inline message banner. Not a toast (that is Sonner, which
// interrupts) and not a dialog (that blocks). The icon slot is styled by the
// parent, so any lucide icon lines up without per-icon classes.

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../../lib/utils"

const alertVariants = cva(
  "relative w-full rounded-xl border px-4 py-3 text-sm [&>svg]:absolute [&>svg]:top-4 [&>svg]:left-4 [&>svg]:size-4 [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground [&>svg]:text-foreground",
        destructive:
          "border-destructive/50 text-destructive [&>svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mb-1 font-medium tracking-tight", className)}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "text-sm text-muted-foreground [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
