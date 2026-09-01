import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { ChevronLeft, ChevronRight, X } from "@/components/icons/hugeicons"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useLanguage } from "@/i18n/language-provider"

export type ImageLightboxItem = {
  id: string
  src: string
  alt?: string
}

type ImageLightboxPhase = "closed" | "opening" | "open" | "closing"

export type ImageLightboxControls = {
  activeId: string | null
  phase: ImageLightboxPhase
  open: (id: string) => void
  close: () => void
  layoutIdFor: (id: string) => string | undefined
  registerTrigger: (id: string, node: HTMLButtonElement | null) => void
}

type ImageLightboxLabels = {
  title: string
  close: string
  previous: string
  next: string
  position: (position: number, total: number) => string
  instructions: string
}

/**
 * One shared, interruptible image transition for every Multideck attachment
 * surface. The clicked thumbnail and the full viewer share identity, so close
 * always returns to the image the operator is actually viewing.
 */
export function ImageLightbox({
  items,
  children,
  labels,
}: {
  items: ImageLightboxItem[]
  children: (controls: ImageLightboxControls) => ReactNode
  labels?: Partial<ImageLightboxLabels>
}) {
  const { t } = useLanguage()
  const reducedMotion = Boolean(useReducedMotion())
  const groupId = useId()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [phase, setPhase] = useState<ImageLightboxPhase>("closed")
  const [direction, setDirection] = useState(0)
  const timerRef = useRef<number | null>(null)
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const returnFocusIdRef = useRef<string | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const activeIndex = activeId === null ? -1 : items.findIndex((item) => item.id === activeId)
  const activeItem = activeIndex >= 0 ? items[activeIndex] : null
  const resolvedLabels = useMemo<ImageLightboxLabels>(() => ({
    title: labels?.title ?? t("Image preview"),
    close: labels?.close ?? t("Close image preview"),
    previous: labels?.previous ?? t("Previous image"),
    next: labels?.next ?? t("Next image"),
    position: labels?.position ?? ((position, total) => t("Image {position} of {total}")
      .replace("{position}", String(position))
      .replace("{total}", String(total))),
    instructions: labels?.instructions ?? t("Use the Left and Right Arrow keys to move between images."),
  }), [labels, t])

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  useEffect(() => () => clearTimer(), [clearTimer])

  useEffect(() => {
    if (activeId === null || items.some((item) => item.id === activeId)) return
    clearTimer()
    setActiveId(null)
    setPhase("closed")
    setDirection(0)
  }, [activeId, clearTimer, items])

  const open = useCallback((id: string) => {
    if (!items.some((item) => item.id === id)) return
    clearTimer()
    setActiveId(id)
    setDirection(0)
    setPhase(reducedMotion ? "open" : "opening")
    if (reducedMotion) return
    timerRef.current = window.setTimeout(() => {
      setPhase("open")
      timerRef.current = null
    }, 280)
  }, [clearTimer, items, reducedMotion])

  const move = useCallback((step: -1 | 1) => {
    if (activeIndex < 0 || items.length < 2 || phase === "closing") return
    setDirection(step)
    setActiveId(items[(activeIndex + step + items.length) % items.length].id)
  }, [activeIndex, items, phase])

  const close = useCallback(() => {
    if (!activeItem || phase === "closed" || phase === "closing") return
    returnFocusIdRef.current = activeItem.id
    clearTimer()
    setDirection(0)
    if (reducedMotion) {
      setActiveId(null)
      setPhase("closed")
      return
    }
    setPhase("closing")
    timerRef.current = window.setTimeout(() => {
      setActiveId(null)
      setPhase("closed")
      timerRef.current = null
    }, 200)
  }, [activeItem, clearTimer, phase, reducedMotion])

  const layoutIdFor = useCallback((id: string) => {
    const ownsTransition = phase === "closed"
      || ((phase === "opening" || phase === "closing") && activeId === id)
    return ownsTransition ? `image-preview-${id}` : undefined
  }, [activeId, phase])

  const registerTrigger = useCallback((id: string, node: HTMLButtonElement | null) => {
    if (node) triggerRefs.current.set(id, node)
    else triggerRefs.current.delete(id)
  }, [])

  const controls = useMemo<ImageLightboxControls>(() => ({
    activeId,
    phase,
    open,
    close,
    layoutIdFor,
    registerTrigger,
  }), [activeId, close, layoutIdFor, open, phase, registerTrigger])

  const dialogOpen = phase !== "closed" && Boolean(activeItem)
  const imageVisible = phase !== "closing" && Boolean(activeItem)
  const positionLabel = activeIndex < 0 ? "" : resolvedLabels.position(activeIndex + 1, items.length)
  const spatialTransition = reducedMotion
    ? { duration: 0 }
    : {
        layout: { type: "spring" as const, duration: phase === "closing" ? 0.2 : 0.28, bounce: 0 },
        opacity: { duration: 0.16 },
        x: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
      }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      move(-1)
    }
    if (event.key === "ArrowRight") {
      event.preventDefault()
      move(1)
    }
  }

  function returnFocus() {
    const id = returnFocusIdRef.current
    returnFocusIdRef.current = null
    if (id) triggerRefs.current.get(id)?.focus()
  }

  return (
    <LayoutGroup id={groupId}>
      {children(controls)}
      <Dialog open={dialogOpen} onOpenChange={(next) => { if (!next) close() }}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="z-[70] bg-transparent backdrop-blur-none data-open:animate-none data-closed:animate-none"
          className="pointer-events-none fixed inset-0 left-0 top-0 z-[71] flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 items-center justify-center gap-0 rounded-none border-0 bg-transparent p-4 !shadow-none sm:max-w-none data-open:animate-none data-closed:animate-none"
          onKeyDown={handleKeyDown}
          onOpenAutoFocus={(event) => { event.preventDefault(); closeButtonRef.current?.focus() }}
          onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus() }}
        >
          <DialogTitle className="sr-only">{resolvedLabels.title}</DialogTitle>
          <DialogDescription className="sr-only">
            {items.length > 1 ? `${positionLabel}. ${resolvedLabels.instructions}` : positionLabel}
          </DialogDescription>
          <motion.div
            aria-hidden="true"
            className="pointer-events-auto absolute inset-0 bg-black/76 backdrop-blur-[2px]"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: phase === "closing" ? 0 : 1 }}
            transition={{
              duration: reducedMotion ? 0 : phase === "closing" ? 0.12 : 0.18,
              ease: phase === "closing" ? "easeIn" : "easeOut",
            }}
            onClick={close}
          />
          <Button
            ref={closeButtonRef}
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label={resolvedLabels.close}
            onClick={close}
            className="pointer-events-auto absolute end-4 top-4 z-20 rounded-[var(--md-radius-lg)] bg-black/34 text-white shadow-[var(--md-shadow-line)] hover:bg-black/52 hover:text-white sm:end-6 sm:top-6"
          >
            <X className="size-4.5" />
          </Button>
          {items.length > 1 ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={resolvedLabels.previous}
                onClick={() => move(-1)}
                className="pointer-events-auto absolute start-3 top-1/2 z-20 -translate-y-1/2 rounded-[var(--md-radius-lg)] bg-black/34 text-white shadow-[var(--md-shadow-line)] hover:bg-black/52 hover:text-white sm:start-6"
              >
                <ChevronLeft className="size-5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={resolvedLabels.next}
                onClick={() => move(1)}
                className="pointer-events-auto absolute end-3 top-1/2 z-20 -translate-y-1/2 rounded-[var(--md-radius-lg)] bg-black/34 text-white shadow-[var(--md-shadow-line)] hover:bg-black/52 hover:text-white sm:end-6"
              >
                <ChevronRight className="size-5" />
              </Button>
            </>
          ) : null}
          <AnimatePresence initial={false} mode="popLayout" custom={direction}>
            {imageVisible && activeItem ? (
              <motion.figure
                key={activeItem.id}
                layoutId={`image-preview-${activeItem.id}`}
                className="pointer-events-auto relative z-10 grid max-h-[82dvh] max-w-[min(88vw,1280px)] place-items-center overflow-hidden rounded-[var(--md-radius-lg)] bg-black/18 shadow-[var(--md-shadow-lift)]"
                initial={reducedMotion || direction === 0 ? false : { opacity: 0, x: direction * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reducedMotion ? undefined : {
                  opacity: direction === 0 ? 1 : 0,
                  x: direction === 0 ? 0 : direction * -24,
                }}
                transition={spatialTransition}
              >
                <img
                  src={activeItem.src}
                  alt={activeItem.alt || positionLabel}
                  className="block h-auto min-h-[min(42dvh,480px)] w-auto min-w-[min(42vw,480px)] max-h-[82dvh] max-w-[min(88vw,1280px)] object-contain"
                />
              </motion.figure>
            ) : null}
          </AnimatePresence>
          {items.length > 1 ? (
            <p aria-live="polite" className="pointer-events-none absolute bottom-4 z-20 rounded-full bg-black/34 px-3 py-1 text-[11px] font-medium text-white shadow-[var(--md-shadow-line)] sm:bottom-6">
              {positionLabel}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </LayoutGroup>
  )
}
