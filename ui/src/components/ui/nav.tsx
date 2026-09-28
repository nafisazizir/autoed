import * as React from "react"
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "@/lib/utils"
import { IconChevronRight } from "@tabler/icons-react"

function Nav({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"nav"> & { size?: "default" | "lg" }) {
  return (
    <nav
      data-slot="nav"
      data-size={size}
      className={cn("group/nav flex flex-col data-[size=lg]:gap-12", className)}
      {...props}
    />
  )
}

function NavHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="nav-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function NavContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="nav-content"
      className={cn(
        "flex min-h-0 flex-1 scrollbar-none flex-col overflow-y-auto group-data-[size=lg]/nav:gap-12",
        className
      )}
      {...props}
    />
  )
}

function NavFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="nav-footer"
      className={cn("mt-auto flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function NavGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="nav-group"
      className={cn(
        "flex flex-col gap-1 pb-8 group-data-[size=lg]/nav:gap-4 group-data-[size=lg]/nav:pb-0",
        className
      )}
      {...props}
    />
  )
}

function NavGroupLabel({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "flex h-8 items-center px-2.5 text-heading-14 text-gray-1000 group-data-[size=lg]/nav:h-auto group-data-[size=lg]/nav:px-0 group-data-[size=lg]/nav:text-heading-16",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "nav-group-label",
    },
  })
}

const NavListContext = React.createContext(false)

function NavList({
  className,
  marker = false,
  ...props
}: React.ComponentProps<"ul"> & { marker?: boolean }) {
  return (
    <NavListContext.Provider value={marker}>
      <ul
        data-slot="nav-list"
        data-marker={marker || undefined}
        className={cn(
          "flex flex-col gap-0.5 group-data-[size=lg]/nav:gap-3",
          className
        )}
        {...props}
      />
    </NavListContext.Provider>
  )
}

function NavItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="nav-item" className={className} {...props} />
}

const lastMark = new WeakMap<Element, { x: number; y: number }>()

function NavMark({ active }: { active: boolean }) {
  const ref = React.useRef<HTMLSpanElement>(null)

  React.useLayoutEffect(() => {
    const mark = ref.current
    const list = mark?.closest("[data-marker]")
    if (!active || !mark || !list) return

    const position = () => {
      const a = mark.getBoundingClientRect()
      const b = list.getBoundingClientRect()
      return a.width ? { x: a.left - b.left, y: a.top - b.top } : undefined
    }

    const to = position()
    const from = lastMark.get(list)
    if (to && from && (from.x !== to.x || from.y !== to.y)) {
      mark.style.transition = "none"
      mark.style.translate = `${from.x - to.x}px ${from.y - to.y}px`
      void mark.offsetWidth
      mark.style.transition = ""
      mark.style.translate = ""
    }
    if (to) lastMark.set(list, to)

    return () => {
      const at = position()
      if (at) lastMark.set(list, at)
    }
  }, [active])

  return (
    <span
      ref={ref}
      data-slot="nav-mark"
      aria-hidden="true"
      className="me-1 mt-[calc((1lh-0.25rem)/2)] size-1 shrink-0 self-start transition-[translate] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[size=lg]/nav:me-0.5 in-aria-[current=page]:bg-current motion-reduce:transition-none"
    />
  )
}

const navRowClassName =
  "inline-flex min-h-8 w-full shrink-0 items-center justify-start gap-1 rounded-[min(var(--radius-md),10px)] border border-transparent bg-clip-padding px-2.5 py-1.5 text-left text-button-14 text-gray-900 transition-[color,border-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] outline-none select-none hover:text-gray-1000 focus-visible:border-gray-600 focus-visible:ring-3 focus-visible:ring-gray-600/50 in-data-[slot=nav-sub]:min-h-7 in-data-[slot=nav-sub]:py-1 group-data-[size=lg]/nav:min-h-0 group-data-[size=lg]/nav:gap-1.5 group-data-[size=lg]/nav:rounded-md group-data-[size=lg]/nav:p-0 group-data-[size=lg]/nav:text-heading-24 group-data-[size=lg]/nav:in-data-[slot=nav-sub]:text-heading-20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

function NavLink({
  className,
  render,
  active = false,
  children,
  ...props
}: useRender.ComponentProps<"a"> & { active?: boolean }) {
  const marked = React.useContext(NavListContext)
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        "aria-current": active ? "page" : undefined,
        className: cn(
          navRowClassName,
          "aria-[current=page]:text-gray-1000",
          className
        ),
        children: marked ? (
          <>
            <NavMark active={active} />
            {children}
          </>
        ) : (
          children
        ),
      },
      props
    ),
    render,
    state: {
      slot: "nav-link",
      active,
    },
  })
}

function NavCollapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return (
    <CollapsiblePrimitive.Root
      data-slot="nav-collapsible"
      render={<li />}
      {...props}
    />
  )
}

function NavCollapsibleTrigger({
  className,
  children,
  ...props
}: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="nav-collapsible-trigger"
      className={cn(navRowClassName, "group/nav-trigger", className)}
      {...props}
    >
      {children}
      <IconChevronRight className="ml-auto size-4 text-gray-900 transition-transform duration-200 group-data-panel-open/nav-trigger:rotate-90 group-data-[size=lg]/nav:size-5" />
    </CollapsiblePrimitive.Trigger>
  )
}

function NavCollapsibleContent({
  className,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="nav-collapsible-content"
      className={cn(
        "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none",
        className
      )}
      {...props}
    />
  )
}

function NavSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="nav-sub"
      className={cn(
        "my-0.5 ml-2.5 flex flex-col gap-0.5 border-l border-gray-alpha-400 pl-1.5 group-data-[size=lg]/nav:mt-3 group-data-[size=lg]/nav:mb-0 group-data-[size=lg]/nav:ml-0 group-data-[size=lg]/nav:gap-3 group-data-[size=lg]/nav:pl-4",
        className
      )}
      {...props}
    />
  )
}

function NavSubItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="nav-sub-item" className={className} {...props} />
}

export {
  Nav,
  NavCollapsible,
  NavCollapsibleContent,
  NavCollapsibleTrigger,
  NavContent,
  NavFooter,
  NavGroup,
  NavGroupLabel,
  NavHeader,
  NavItem,
  NavLink,
  NavList,
  NavSub,
  NavSubItem,
}
