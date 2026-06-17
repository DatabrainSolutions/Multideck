import { useMemo, useState, type ReactNode } from "react"
import { ArrowUp, Check, Clock3, FileText, Sparkles, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { Button } from "@/components/ui/button"
import { mdMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

const suggestedFollowUps = [
  { label: "Prep Marlow renewal note", meta: "Customer update - 2 mins", icon: FileText },
  { label: "Check open customer risks", meta: "39 accounts - priority scan", icon: Sparkles },
  { label: "Summarise renewal blockers", meta: "Bauhaus, Northwind, Pacific", icon: Clock3 },
]

export function DexterDockedPage({
  open,
  onClose,
  contextLabel,
  className,
  children,
}: {
  open: boolean
  onClose: () => void
  contextLabel: string
  className?: string
  children: ReactNode
}) {
  return (
    <>
      <div className={cn("md-dexter-page", open && "md-dexter-page--open", className)}>{children}</div>
      <DexterCompanionSidebar open={open} onClose={onClose} contextLabel={contextLabel} />
    </>
  )
}

export function DexterCompanionSidebar({
  open,
  onClose,
  contextLabel = "Customers",
  presentation = "fixed",
}: {
  open: boolean
  onClose: () => void
  contextLabel?: string
  presentation?: "fixed" | "preview"
}) {
  const [prompt, setPrompt] = useState("")
  const [sentPrompt, setSentPrompt] = useState<string | null>(null)
  const responseLead = useMemo(
    () =>
      sentPrompt
        ? "I am reading the current customer view and shaping that into a next-step brief."
        : "Marlow and Bauhaus are the two accounts most worth attention right now.",
    [sentPrompt],
  )

  function sendPrompt() {
    const nextPrompt = prompt.trim()
    if (!nextPrompt) return
    setSentPrompt(nextPrompt)
    setPrompt("")
  }

  return (
    <AnimatePresence>
      {open ? (
        <div
          className={cn(
            "overflow-hidden",
            presentation === "fixed" ? "fixed inset-0 z-50" : "relative h-[620px] min-h-[520px] w-full rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] shadow-[var(--md-shadow-line)]",
            presentation === "fixed" && "pointer-events-none",
          )}
          aria-live="polite"
        >
          <motion.aside
            role="dialog"
            aria-modal={presentation === "fixed"}
            aria-label="Dexter companion"
            className={cn(
              "md-dexter-companion-panel pointer-events-auto absolute inset-y-0 right-0 flex flex-col overflow-hidden text-[var(--md-ink)]",
              presentation === "fixed" ? "w-[min(440px,calc(100vw-20px))]" : "w-[min(420px,74%)]",
            )}
            initial={{ x: 56, opacity: 0, filter: "blur(10px)" }}
            animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ x: 38, opacity: 0, filter: "blur(10px)" }}
            transition={mdMotion.page}
          >
            <header className="md-dexter-companion-header relative z-10 flex items-start justify-between gap-4 px-5 pb-3 pt-4">
              <div className="min-w-0">
                <h2 className="text-[18px] font-medium leading-5 tracking-normal text-[var(--md-ink)]">Ask Dexter</h2>
                <p className="mt-1.5 text-[12px] leading-4 text-[var(--md-text)]">
                  Current page context loaded from <span className="font-medium text-[var(--md-ink)]">{contextLabel}</span>.
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" className="rounded-full bg-white/52 shadow-[var(--md-shadow-line)] hover:bg-white/80" onClick={onClose}>
                <X className="size-4" strokeWidth={1.2} />
              </Button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-7 md-scrollbar">
              <div className="md-dexter-chat-bubble md-dexter-chat-bubble--user ml-auto max-w-[300px] rounded-[20px] px-4 py-3 text-[13px] leading-5">
                What should I focus on across customers right now?
              </div>

              <div className="mt-5">
                <p className="px-1 text-[11px] font-semibold leading-4 text-[var(--md-ink)]">Dexter</p>
                <section className="md-dexter-chat-bubble md-dexter-chat-bubble--assistant mt-1.5 rounded-[22px] p-4">
                  <p className="text-[14px] leading-6 text-[var(--md-ink)]">{responseLead}</p>
                  <div className="mt-4 grid gap-2">
                    {[
                      ["Marlow Apparel", "QBR prep and open hold should be cleaned up before Thursday."],
                      ["Bauhaus Importe", "Renewal risk is tied to the Rotterdam delay update."],
                      ["Pacific Goods", "Air quote reply is ready and time-sensitive."],
                    ].map(([title, detail]) => (
                      <div key={title} className="md-dexter-context-card rounded-[14px] px-3 py-2">
                        <p className="text-[12px] font-medium text-[var(--md-ink)]">{title}</p>
                        <p className="mt-1 text-[12px] leading-4 text-[var(--md-text)]">{detail}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {sentPrompt ? (
                <div className="md-dexter-chat-bubble md-dexter-chat-bubble--user mt-5 ml-auto max-w-[320px] rounded-[20px] px-4 py-3 text-[13px] leading-5">
                  {sentPrompt}
                </div>
              ) : null}

              <div className="mt-6">
                <p className="text-[12px] font-medium text-[var(--md-subtle)]">Suggested follow-ups</p>
                <div className="mt-2 grid gap-2">
                  {suggestedFollowUps.map((item, index) => {
                    const Icon = item.icon

                    return (
                      <button
                        key={item.label}
                        type="button"
                        className="md-dexter-followup grid grid-cols-[30px_1fr_auto] items-center gap-3 rounded-[16px] px-3 py-3 text-left transition-[background,color,box-shadow,opacity,transform] hover:-translate-y-0.5"
                        onClick={() => setPrompt(item.label)}
                      >
                        <Icon className="size-4 text-[var(--md-accent)]" strokeWidth={1.25} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]">{item.label}</span>
                          <span className="block truncate text-[12px] text-[var(--md-text)]">{item.meta}</span>
                        </span>
                        <span className="grid size-6 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[11px] font-medium text-[var(--md-text)]">{index + 1}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <form
              className="md-dexter-companion-composer p-4 pt-2"
              onSubmit={(event) => {
                event.preventDefault()
                sendPrompt()
              }}
            >
              <div className="md-dexter-companion-composer-shell rounded-[22px] p-1.5">
                <div className="md-dexter-companion-composer-inner flex min-h-[92px] flex-col rounded-[16px] px-3 py-3">
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Describe what you want Dexter to do..."
                    className="min-h-0 flex-1 resize-none border-0 bg-transparent text-[13px] leading-5 text-[var(--md-ink)] outline-none placeholder:text-[var(--md-subtle)]"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium", sentPrompt ? "text-[var(--md-accent)]" : "text-[var(--md-subtle)]")}>
                      {sentPrompt ? <Check className="size-3" strokeWidth={1.4} /> : <Sparkles className="size-3" strokeWidth={1.25} />}
                      {sentPrompt ? "Brief prepared" : "Uses this page as context"}
                    </span>
                    <Button type="submit" size="icon-sm" className="rounded-full bg-[var(--md-ink)] text-white hover:bg-[var(--md-accent)]" disabled={!prompt.trim()}>
                      <ArrowUp className="size-3.5" strokeWidth={1.4} />
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
