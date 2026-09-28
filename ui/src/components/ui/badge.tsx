import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-label-12 whitespace-nowrap transition-colors focus-visible:border-gray-600 focus-visible:ring-3 focus-visible:ring-gray-600/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-red-800 aria-invalid:ring-3 aria-invalid:ring-red-800/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "bg-gray-1000 text-background-100 [a]:hover:bg-gray-950 [a]:active:bg-gray-900",
        secondary:
          "bg-gray-100 text-gray-1000 [a]:hover:bg-gray-200 [a]:active:bg-gray-300",
        destructive:
          "bg-red-100 text-red-800 focus-visible:ring-red-800/20 [a]:hover:bg-red-200 [a]:active:bg-red-300",
        outline:
          "border-gray-alpha-400 text-gray-1000 [a]:hover:border-gray-alpha-500 [a]:hover:bg-gray-alpha-100 [a]:hover:text-gray-900 [a]:active:bg-gray-alpha-200",
        ghost:
          "[a]:hover:bg-gray-alpha-100 [a]:hover:text-gray-900 [a]:active:bg-gray-alpha-200",
        link: "text-gray-1000 underline-offset-4 [a]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
