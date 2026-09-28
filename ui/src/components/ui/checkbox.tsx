import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "@/lib/utils"
import { IconCheck } from "@tabler/icons-react"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[min(var(--radius-md),4px)] border border-gray-alpha-400 bg-background-100 transition-[border-color,box-shadow] outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 hover:border-gray-alpha-500 focus-visible:border-gray-600 focus-visible:ring-3 focus-visible:ring-gray-600/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-800 aria-invalid:bg-red-100 aria-invalid:ring-3 aria-invalid:ring-red-800/20 aria-invalid:aria-checked:border-gray-1000 aria-invalid:aria-checked:bg-gray-1000 data-checked:border-gray-1000 data-checked:bg-gray-1000 data-checked:text-background-100 data-checked:hover:border-gray-950 data-checked:hover:bg-gray-950",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <IconCheck />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
