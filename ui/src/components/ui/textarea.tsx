import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"textarea"> & {
  size?: "sm" | "default" | "lg"
}) {
  return (
    <textarea
      data-slot="textarea"
      data-size={size}
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-gray-alpha-400 bg-background-100 px-3 py-2 text-copy-16 transition-[color,border-color,box-shadow] outline-none placeholder:text-gray-900 hover:border-gray-alpha-500 focus-visible:border-gray-600 focus-visible:ring-3 focus-visible:ring-gray-600/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-800 aria-invalid:bg-red-100 aria-invalid:ring-3 aria-invalid:ring-red-800/20 data-[size=lg]:px-4 data-[size=lg]:py-2.5 data-[size=sm]:py-1.5 md:text-copy-14",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
