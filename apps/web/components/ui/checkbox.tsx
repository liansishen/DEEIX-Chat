"use client"

import { CheckIcon, MinusIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import type * as React from "react"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-3.5 shrink-0 rounded-[4px] border border-input transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-control-checked-background data-[state=checked]:bg-control-checked-background data-[state=checked]:text-control-checked-foreground data-[state=indeterminate]:border-control-checked-background data-[state=indeterminate]:bg-control-checked-background data-[state=indeterminate]:text-control-checked-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="group/checkbox grid place-content-center text-current transition-none"
      >
        {/* The indicator also renders for "indeterminate"; a check there reads as fully selected. */}
        <CheckIcon className="size-3 group-data-[state=indeterminate]/checkbox:hidden" />
        <MinusIcon className="hidden size-3 group-data-[state=indeterminate]/checkbox:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
