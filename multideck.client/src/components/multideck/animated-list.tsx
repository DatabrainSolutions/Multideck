import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"
import { mdEase } from "@/lib/motion"

const defaultAnimatedListItems = [
  "Item 1",
  "Item 2",
  "Item 3",
  "Item 4",
  "Item 5",
  "Item 6",
  "Item 7",
  "Item 8",
  "Item 9",
  "Item 10",
  "Item 11",
  "Item 12",
  "Item 13",
  "Item 14",
  "Item 15",
]

type AnimatedListRenderState = {
  selected: boolean
}

type AnimatedListProps<T> = {
  items?: T[]
  renderItem?: (item: T, index: number, state: AnimatedListRenderState) => ReactNode
  getItemKey?: (item: T, index: number) => string | number
  onItemSelect?: (item: T, index: number) => void
  showGradients?: boolean
  enableArrowNavigation?: boolean
  className?: string
  listClassName?: string
  itemClassName?: string
  displayScrollbar?: boolean
  fadeColor?: string
  initialSelectedIndex?: number
  maxHeight?: number | string
  ariaLabel?: string
  itemElement?: "button" | "div"
  selectionBehavior?: "hover" | "click" | "none"
}

function AnimatedListItem({
  children,
  id,
  index,
  selected,
  animateOnScroll,
  itemElement,
  itemClassName,
  onMouseEnter,
  onClick,
  listRef,
}: {
  children: ReactNode
  id: string
  index: number
  selected: boolean
  animateOnScroll: boolean
  itemElement: "button" | "div"
  itemClassName?: string
  onMouseEnter?: () => void
  onClick: () => void
  listRef: RefObject<HTMLDivElement | null>
}) {
  const ref = useRef<Element | null>(null)
  const inView = useInView(ref, { root: listRef, amount: 0.35 })
  const reduceMotion = useReducedMotion()
  const shouldAnimate = animateOnScroll && !reduceMotion
  const MotionItem = itemElement === "button" ? motion.button : motion.div
  const setRef = (node: HTMLButtonElement | HTMLDivElement | null) => {
    ref.current = node
  }

  return (
    <MotionItem
      ref={setRef}
      id={id}
      {...(itemElement === "button" ? { type: "button" } : {})}
      role="option"
      aria-selected={selected}
      data-index={index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      initial={shouldAnimate ? { opacity: 0, y: 4 } : false}
      animate={!shouldAnimate || inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
      transition={{ duration: 0.18, delay: shouldAnimate ? Math.min(index * 0.012, 0.08) : 0, ease: mdEase }}
      style={{ willChange: shouldAnimate ? "transform, opacity" : undefined }}
      className={cn(
        "w-full rounded-[var(--md-radius-lg)] px-3 py-3 text-left transition-[background,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:bg-white/55 hover:shadow-[var(--md-shadow-line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a18)]",
        selected && "bg-white/68 shadow-[var(--md-shadow-line)]",
        itemClassName,
      )}
    >
      {children}
    </MotionItem>
  )
}

export function AnimatedList<T = string>({
  items,
  renderItem,
  getItemKey,
  onItemSelect,
  showGradients = true,
  enableArrowNavigation = true,
  className,
  listClassName,
  itemClassName,
  displayScrollbar = true,
  fadeColor = "var(--md-surface)",
  initialSelectedIndex = -1,
  maxHeight = 400,
  ariaLabel = "Scrollable list",
  itemElement = "button",
  selectionBehavior = "hover",
}: AnimatedListProps<T>) {
  const generatedId = useId()
  const listRef = useRef<HTMLDivElement | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const gradientStateRef = useRef({ isScrollable: false, top: 0, bottom: 0 })
  const resolvedItems = (items ?? defaultAnimatedListItems) as T[]
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex)
  const [keyboardNav, setKeyboardNav] = useState(false)
  const [isScrollable, setIsScrollable] = useState(false)
  const [topGradientOpacity, setTopGradientOpacity] = useState(0)
  const [bottomGradientOpacity, setBottomGradientOpacity] = useState(0)

  const updateGradientState = useCallback((container: HTMLDivElement) => {
    const { scrollTop, scrollHeight, clientHeight } = container
    const bottomDistance = scrollHeight - (scrollTop + clientHeight)
    const nextIsScrollable = scrollHeight > clientHeight + 1
    const nextTopOpacity = Number(Math.min(scrollTop / 44, 1).toFixed(2))
    const nextBottomOpacity = Number((nextIsScrollable ? Math.min(bottomDistance / 44, 1) : 0).toFixed(2))
    const current = gradientStateRef.current

    if (current.isScrollable === nextIsScrollable && current.top === nextTopOpacity && current.bottom === nextBottomOpacity) {
      return
    }

    gradientStateRef.current = {
      isScrollable: nextIsScrollable,
      top: nextTopOpacity,
      bottom: nextBottomOpacity,
    }

    setIsScrollable(nextIsScrollable)
    setTopGradientOpacity(nextTopOpacity)
    setBottomGradientOpacity(nextBottomOpacity)
  }, [])

  const requestGradientState = useCallback(
    (container: HTMLDivElement) => {
      if (scrollFrameRef.current !== null) return

      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null
        updateGradientState(container)
      })
    },
    [updateGradientState],
  )

  const handleItemSelect = useCallback(
    (item: T, index: number) => {
      setSelectedIndex(index)
      onItemSelect?.(item, index)
    },
    [onItemSelect],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!enableArrowNavigation || resolvedItems.length === 0) return

      const moveTo = (index: number) => {
        event.preventDefault()
        setKeyboardNav(true)
        setSelectedIndex(Math.min(Math.max(index, 0), resolvedItems.length - 1))
      }

      if (event.key === "ArrowDown") moveTo(selectedIndex < 0 ? 0 : selectedIndex + 1)
      if (event.key === "ArrowUp") moveTo(selectedIndex < 0 ? resolvedItems.length - 1 : selectedIndex - 1)
      if (event.key === "Home") moveTo(0)
      if (event.key === "End") moveTo(resolvedItems.length - 1)

      if ((event.key === "Enter" || event.key === " ") && selectedIndex >= 0) {
        event.preventDefault()
        onItemSelect?.(resolvedItems[selectedIndex], selectedIndex)
      }
    },
    [enableArrowNavigation, onItemSelect, resolvedItems, selectedIndex],
  )

  useEffect(() => {
    if (listRef.current) updateGradientState(listRef.current)
  }, [resolvedItems.length, updateGradientState])

  useEffect(() => {
    if (!listRef.current) return

    const container = listRef.current
    const observer = new ResizeObserver(() => updateGradientState(container))

    observer.observe(container)
    return () => {
      observer.disconnect()
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current)
        scrollFrameRef.current = null
      }
    }
  }, [updateGradientState])

  useEffect(() => {
    if (!keyboardNav || selectedIndex < 0 || !listRef.current) return

    const container = listRef.current
    const selectedItem = container.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`)

    if (selectedItem) {
      const extraMargin = 32
      const itemTop = selectedItem.offsetTop
      const itemBottom = itemTop + selectedItem.offsetHeight
      const visibleTop = container.scrollTop + extraMargin
      const visibleBottom = container.scrollTop + container.clientHeight - extraMargin

      if (itemTop < visibleTop) {
        container.scrollTo({ top: itemTop - extraMargin, behavior: "smooth" })
      } else if (itemBottom > visibleBottom) {
        container.scrollTo({ top: itemBottom - container.clientHeight + extraMargin, behavior: "smooth" })
      }
    }

    setKeyboardNav(false)
  }, [keyboardNav, selectedIndex])

  const activeItemId = selectedIndex >= 0 ? `${generatedId}-item-${selectedIndex}` : undefined
  const listStyle: CSSProperties = {
    maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight,
  }
  const rootStyle = {
    "--md-animated-list-fade": fadeColor,
  } as CSSProperties

  return (
    <div className={cn("relative w-full overflow-hidden rounded-[var(--md-radius-xl)]", className)} style={rootStyle}>
      <div
        ref={listRef}
        role="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={activeItemId}
        tabIndex={enableArrowNavigation ? 0 : undefined}
        className={cn(
          "md-scrollbar flex flex-col gap-2 overflow-y-auto p-1 pr-2 outline-none",
          !displayScrollbar && "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          listClassName,
        )}
        style={listStyle}
        onScroll={(event) => requestGradientState(event.currentTarget)}
        onKeyDown={handleKeyDown}
      >
        {resolvedItems.map((item, index) => {
          const selected = selectedIndex === index

          return (
            <AnimatedListItem
              key={getItemKey ? getItemKey(item, index) : index}
              id={`${generatedId}-item-${index}`}
              index={index}
              selected={selected}
              animateOnScroll={isScrollable}
              itemElement={itemElement}
              itemClassName={itemClassName}
              listRef={listRef}
              onMouseEnter={selectionBehavior === "hover" ? () => setSelectedIndex(index) : undefined}
              onClick={() => {
                if (selectionBehavior !== "none") setSelectedIndex(index)
                handleItemSelect(item, index)
              }}
            >
              {renderItem ? (
                renderItem(item, index, { selected })
              ) : (
                <p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{String(item)}</p>
              )}
            </AnimatedListItem>
          )
        })}
      </div>

      {showGradients && isScrollable ? (
        <>
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-[var(--md-animated-list-fade)] to-transparent transition-opacity duration-200"
            style={{ opacity: topGradientOpacity }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--md-animated-list-fade)] to-transparent transition-opacity duration-200"
            style={{ opacity: bottomGradientOpacity }}
          />
        </>
      ) : null}
    </div>
  )
}
