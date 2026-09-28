import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Text sits 12px in at 32 and 36px (10 at 24, 16 at 40), square or pill
// alike, the same inset as fields and one popup edge + padding + item away
// from menu text. The icon side sits a half step in.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-button-14 whitespace-nowrap transition-[color,background-color,border-color,scale] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] outline-none select-none focus-visible:border-gray-600 focus-visible:ring-3 focus-visible:ring-gray-600/50 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-red-800 aria-invalid:ring-3 aria-invalid:ring-red-800/20 motion-reduce:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-gray-1000 text-background-100 hover:bg-gray-950 active:bg-gray-900",
        outline:
          "border-gray-alpha-400 bg-background-100 hover:border-gray-alpha-500 hover:bg-gray-100 hover:text-gray-1000 active:bg-gray-200 aria-expanded:bg-gray-100 aria-expanded:text-gray-1000",
        secondary:
          "bg-gray-100 text-gray-1000 hover:bg-gray-200 active:bg-gray-300 aria-expanded:bg-gray-200 aria-expanded:text-gray-1000",
        ghost:
          "hover:bg-gray-alpha-100 hover:text-gray-1000 active:bg-gray-alpha-200 aria-expanded:bg-gray-alpha-100 aria-expanded:text-gray-1000",
        destructive: "bg-red-700 text-white hover:bg-red-800 active:bg-red-900",
        link: "text-gray-1000 underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pe-2.5 has-data-[icon=inline-start]:ps-2.5",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),8px)] px-2.5 text-button-12 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-[min(var(--radius-md),10px)] px-3 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pe-2.5 has-data-[icon=inline-start]:ps-2.5",
        lg: "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pe-3.5 has-data-[icon=inline-start]:ps-3.5",
        icon: "size-9",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),8px)] in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-md",
        "icon-lg": "size-10",
      },
      // Declared after size so rounded-full outranks the xs/sm radius caps and
      // the in-group rounded-md; ButtonGroup squares the inner corners.
      shape: {
        default: "",
        rounded: "rounded-full in-data-[slot=button-group]:rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      shape: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  shape = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, shape, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
