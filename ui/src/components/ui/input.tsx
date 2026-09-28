import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & {
  size?: "sm" | "default" | "lg"
}) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-gray-alpha-400 bg-background-100 px-3 py-1 text-label-16 transition-[color,border-color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-button-14 file:text-gray-1000 placeholder:text-gray-900 hover:border-gray-alpha-500 focus-visible:border-gray-600 focus-visible:ring-3 focus-visible:ring-gray-600/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-800 aria-invalid:bg-red-100 aria-invalid:ring-3 aria-invalid:ring-red-800/20 data-[size=lg]:h-10 data-[size=lg]:px-4 data-[size=sm]:h-8 md:text-label-14",
        className
      )}
      {...props}
    />
  )
}

export { Input }
