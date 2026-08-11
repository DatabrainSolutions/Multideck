"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ComponentProps, type ReactNode } from "react"
import { ArrowLeftIcon, ArrowRightIcon, ExternalLink } from "@/components/icons/hugeicons"

import { Badge } from "@/components/ui/badge"
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { cn } from "@/lib/utils"

export type InlineCitationProps = ComponentProps<"span">

export function InlineCitation({ className, ...props }: InlineCitationProps) {
  return <span className={cn("group/citation inline items-center", className)} {...props} />
}

export type InlineCitationTextProps = ComponentProps<"span">

export function InlineCitationText({ className, ...props }: InlineCitationTextProps) {
  return (
    <span
      className={cn(
        "rounded-[3px] transition-[background-color,color] duration-200 group-hover/citation:bg-[var(--md-accent-a08)] group-hover/citation:text-[var(--md-ink)]",
        className,
      )}
      {...props}
    />
  )
}

export type InlineCitationCardProps = ComponentProps<typeof HoverCard>

export function InlineCitationCard(props: InlineCitationCardProps) {
  return <HoverCard closeDelay={80} openDelay={120} {...props} />
}

export type InlineCitationCardTriggerProps = Omit<ComponentProps<typeof Badge>, "children"> & {
  sources: string[]
  href?: string
  label?: ReactNode
  external?: boolean
}

function sourceHost(source: string) {
  if (source.startsWith("/") && !source.startsWith("//")) return "Multideck"
  try {
    return new URL(source).hostname.replace(/^www\./, "")
  } catch {
    return "Source"
  }
}

export function InlineCitationCardTrigger({
  sources,
  href = sources[0],
  label,
  external = false,
  className,
  ...props
}: InlineCitationCardTriggerProps) {
  const content = label ?? (sources[0] ? sourceHost(sources[0]) : "Source")

  return (
    <HoverCardTrigger asChild>
      <Badge
        asChild
        className={cn(
          "mx-1 h-[21px] max-w-[190px] rounded-full bg-[var(--md-accent-a08)] px-2 text-[10.5px] font-medium text-[var(--md-accent)] shadow-[inset_0_0_0_1px_var(--md-accent-a14)] hover:bg-[var(--md-accent-a14)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a42)]",
          className,
        )}
        variant="secondary"
        {...props}
      >
        <a
          href={href}
          rel={external ? "noreferrer" : undefined}
          target={external ? "_blank" : undefined}
        >
          <span className="truncate">{content}</span>
          {sources.length > 1 ? <span>+{sources.length - 1}</span> : null}
          <ExternalLink className="size-2.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        </a>
      </Badge>
    </HoverCardTrigger>
  )
}

export type InlineCitationCardBodyProps = ComponentProps<"div">

export function InlineCitationCardBody({ className, ...props }: InlineCitationCardBodyProps) {
  return (
    <HoverCardContent
      align="start"
      sideOffset={8}
      className={cn(
        "relative w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-surface)] p-0 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]",
        className,
      )}
      {...props}
    />
  )
}

const CarouselApiContext = createContext<CarouselApi | undefined>(undefined)

function useCitationCarouselApi() {
  return useContext(CarouselApiContext)
}

export type InlineCitationCarouselProps = ComponentProps<typeof Carousel>

export function InlineCitationCarousel({ className, children, ...props }: InlineCitationCarouselProps) {
  const [api, setApi] = useState<CarouselApi>()

  return (
    <CarouselApiContext.Provider value={api}>
      <Carousel className={cn("w-full", className)} setApi={setApi} {...props}>
        {children}
      </Carousel>
    </CarouselApiContext.Provider>
  )
}

export type InlineCitationCarouselContentProps = ComponentProps<"div">

export function InlineCitationCarouselContent(props: InlineCitationCarouselContentProps) {
  return <CarouselContent {...props} />
}

export type InlineCitationCarouselItemProps = ComponentProps<"div">

export function InlineCitationCarouselItem({ className, ...props }: InlineCitationCarouselItemProps) {
  return <CarouselItem className={cn("w-full space-y-2 p-4 ps-8", className)} {...props} />
}

export type InlineCitationCarouselHeaderProps = ComponentProps<"div">

export function InlineCitationCarouselHeader({ className, ...props }: InlineCitationCarouselHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-t-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] p-2",
        className,
      )}
      {...props}
    />
  )
}

export type InlineCitationCarouselIndexProps = ComponentProps<"div">

export function InlineCitationCarouselIndex({ children, className, ...props }: InlineCitationCarouselIndexProps) {
  const api = useCitationCarouselApi()
  const [current, setCurrent] = useState(0)
  const [count, setCount] = useState(0)

  const syncState = useCallback(() => {
    if (!api) return
    setCount(api.scrollSnapList().length)
    setCurrent(api.selectedScrollSnap() + 1)
  }, [api])

  useEffect(() => {
    if (!api) return
    syncState()
    api.on("select", syncState)
    api.on("reInit", syncState)
    return () => {
      api.off("select", syncState)
      api.off("reInit", syncState)
    }
  }, [api, syncState])

  return (
    <div
      className={cn("ms-auto px-2 py-1 text-[11px] tabular-nums text-[var(--md-subtle)]", className)}
      {...props}
    >
      {children ?? `${current}/${count}`}
    </div>
  )
}

export type InlineCitationCarouselPrevProps = ComponentProps<"button">

export function InlineCitationCarouselPrev({ className, onClick, ...props }: InlineCitationCarouselPrevProps) {
  const api = useCitationCarouselApi()
  return (
    <button
      type="button"
      className={cn("grid size-7 shrink-0 place-items-center rounded-full text-[var(--md-subtle)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a42)]", className)}
      onClick={(event) => {
        api?.scrollPrev()
        onClick?.(event)
      }}
      {...props}
    >
      <ArrowLeftIcon className="size-3.5 rtl:rotate-180" strokeWidth={1.5} />
    </button>
  )
}

export type InlineCitationCarouselNextProps = ComponentProps<"button">

export function InlineCitationCarouselNext({ className, onClick, ...props }: InlineCitationCarouselNextProps) {
  const api = useCitationCarouselApi()
  return (
    <button
      type="button"
      className={cn("grid size-7 shrink-0 place-items-center rounded-full text-[var(--md-subtle)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a42)]", className)}
      onClick={(event) => {
        api?.scrollNext()
        onClick?.(event)
      }}
      {...props}
    >
      <ArrowRightIcon className="size-3.5 rtl:rotate-180" strokeWidth={1.5} />
    </button>
  )
}

export type InlineCitationSourceProps = ComponentProps<"article"> & {
  title?: string
  url?: string
  description?: string
  external?: boolean
}

export function InlineCitationSource({
  title,
  url,
  description,
  external = false,
  className,
  children,
  ...props
}: InlineCitationSourceProps) {
  const content = (
    <>
      {title ? <h4 dir="auto" className="text-[13px] font-medium leading-5 text-[var(--md-ink)]">{title}</h4> : null}
      {description ? <p dir="auto" className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{description}</p> : null}
      {url ? <p dir="ltr" className="mt-2 truncate text-[10.5px] text-[var(--md-subtle)]">{url}</p> : null}
      {children}
    </>
  )

  return (
    <article className={cn("min-w-0", className)} {...props}>
      {url ? (
        <a
          href={url}
          rel={external ? "noreferrer" : undefined}
          target={external ? "_blank" : undefined}
          className="block rounded-[var(--md-radius-lg)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a42)]"
        >
          {content}
        </a>
      ) : content}
    </article>
  )
}

export type InlineCitationQuoteProps = ComponentProps<"blockquote">

export function InlineCitationQuote({ children, className, ...props }: InlineCitationQuoteProps) {
  return (
    <blockquote
      className={cn("border-s-2 border-[var(--md-line)] ps-3 text-[12px] italic text-[var(--md-text)]", className)}
      {...props}
    >
      {children}
    </blockquote>
  )
}
