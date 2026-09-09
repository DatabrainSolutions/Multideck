import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { motion, useReducedMotion } from "motion/react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion } from "@/lib/motion"

type TabsActiveTarget = {
  top: number
  left: number
  width: number
  height: number
  borderRadius: string
}

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex min-w-0 gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ref,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const [activeTarget, setActiveTarget] = React.useState<TabsActiveTarget | null>(null)

  const updateActiveTarget = React.useCallback(() => {
    const list = listRef.current
    const activeNode = list?.querySelector<HTMLElement>('[data-slot="tabs-trigger"][data-state="active"], [data-slot="tabs-trigger"][data-active]')

    if (!list || !activeNode) {
      setActiveTarget(null)
      return
    }

    const listRect = list.getBoundingClientRect()
    const activeRect = activeNode.getBoundingClientRect()
    const borderRadius = window.getComputedStyle(activeNode).borderRadius

    if (variant === "line") {
      const isVertical = list.getAttribute("aria-orientation") === "vertical"

      setActiveTarget({
        top: isVertical ? activeRect.top - listRect.top : activeRect.bottom - listRect.top - 2,
        left: isVertical ? activeRect.right - listRect.left - 2 : activeRect.left - listRect.left,
        width: isVertical ? 2 : activeRect.width,
        height: isVertical ? activeRect.height : 2,
        borderRadius: "999px",
      })
      return
    }

    setActiveTarget({
      top: activeRect.top - listRect.top,
      left: activeRect.left - listRect.left,
      width: activeRect.width,
      height: activeRect.height,
      borderRadius,
    })
  }, [variant])

  React.useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return

    const frame = requestAnimationFrame(updateActiveTarget)
    const resizeObserver = new ResizeObserver(updateActiveTarget)
    const mutationObserver = new MutationObserver(updateActiveTarget)

    resizeObserver.observe(list)
    Array.from(list.children).forEach((child) => resizeObserver.observe(child))
    mutationObserver.observe(list, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "data-active", "class", "style"],
    })

    window.addEventListener("resize", updateActiveTarget)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener("resize", updateActiveTarget)
    }
  }, [updateActiveTarget])

  return (
    <TabsPrimitive.List
      ref={(node) => {
        listRef.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
      }}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        "relative isolate overflow-hidden",
        variant === "line" && "overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_rgba(11,20,19,0.08)]",
        tabsListVariants({ variant }),
        className,
      )}
      {...props}
    >
      {activeTarget ? (
        <motion.span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute z-0",
            variant === "line"
              ? "bg-[var(--md-accent)]"
              : "bg-[var(--md-accent)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16),var(--md-premium-stroke-soft)]",
          )}
          style={{ top: 0, left: 0 }}
          initial={false}
          animate={{
            x: activeTarget.left,
            y: activeTarget.top,
            width: activeTarget.width,
            height: activeTarget.height,
            borderRadius: activeTarget.borderRadius,
          }}
          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.page)}
        />
      ) : null}
      {props.children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative z-10 inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-[color,opacity,scale,transform] group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-none group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=line]/tabs-list:data-active:text-[var(--md-accent)] group-data-[variant=line]/tabs-list:data-[state=active]:text-[var(--md-accent)] dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent",
        "data-active:bg-transparent data-active:shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-active:border-transparent dark:data-active:bg-transparent dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent group-data-[variant=default]/tabs-list:data-active:text-[var(--md-accent-ink)] group-data-[variant=default]/tabs-list:data-[state=active]:text-[var(--md-accent-ink)] group-data-[variant=default]/tabs-list:data-active:hover:text-[var(--md-accent-ink)] group-data-[variant=default]/tabs-list:data-[state=active]:hover:text-[var(--md-accent-ink)]",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("min-w-0 flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
