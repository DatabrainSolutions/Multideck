import { useEffect, useMemo, useState, type ReactNode } from "react"
import { AiBrain, ArrowUp, Check, X } from "@/components/icons/hugeicons"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Button } from "@/components/ui/button"
import {
  DexterMentionInput,
  DexterMentionText,
  DexterSuggestionGrid,
  type DexterMentionItem,
} from "@/components/multideck/agent-dexter-components"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { DexterBrandMark } from "@/components/multideck/dexter-brand-mark"
import {
  customerMentionItems,
  dealMentionItems,
  defaultDexterMentionItems,
  leadMentionItems,
  mergeDexterMentionItems,
} from "@/data/dexter-mentions"
import { useLanguage } from "@/i18n/language-provider"
import { listAccountsPage } from "@/lib/customer-api"
import { listDealsPage } from "@/lib/deal-api"
import { listLeadsPage } from "@/lib/lead-api"
import { mdMotion } from "@/lib/motion"
import { useAiAgentName } from "@/lib/user-preferences"
import { cn } from "@/lib/utils"

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
  const aiAgentName = useAiAgentName()
  const { direction, language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [prompt, setPrompt] = useState("")
  const [mentionItems, setMentionItems] = useState<DexterMentionItem[]>(defaultDexterMentionItems)
  const [promptMentions, setPromptMentions] = useState<DexterMentionItem[]>([])
  const [sentPrompt, setSentPrompt] = useState<string | null>(null)
  const [sentMentions, setSentMentions] = useState<DexterMentionItem[]>([])
  const [contextCounts, setContextCounts] = useState<{ accounts: number; leads: number; deals: number } | null>(null)
  const userMessageOffset = direction === "rtl" ? -14 : 14
  const responseLead = useMemo(
    () =>
      t(
        sentPrompt
          ? "I am reading the current customer view and shaping that into a next-step brief."
          : "Dexter is ready",
      ),
    [sentPrompt, t],
  )

  useEffect(() => {
    if (!open) return
    let active = true

    Promise.allSettled([
      listAccountsPage({ limit: 25, offset: 0 }),
      listLeadsPage({ limit: 25, offset: 0 }),
      listDealsPage({ limit: 25, offset: 0 }),
    ]).then(([customerResult, leadResult, dealResult]) => {
      if (!active) return
      setContextCounts({
        accounts: customerResult.status === "fulfilled" ? customerResult.value.total : 0,
        leads: leadResult.status === "fulfilled" ? leadResult.value.total : 0,
        deals: dealResult.status === "fulfilled" ? dealResult.value.total : 0,
      })
      setMentionItems(mergeDexterMentionItems(
        customerResult.status === "fulfilled" ? customerMentionItems(customerResult.value.rows) : [],
        leadResult.status === "fulfilled" ? leadMentionItems(leadResult.value.rows) : [],
        dealResult.status === "fulfilled" ? dealMentionItems(dealResult.value.rows) : [],
        defaultDexterMentionItems,
      ))
    })

    return () => {
      active = false
    }
  }, [open])

  function sendPrompt() {
    const nextPrompt = prompt.trim()
    if (!nextPrompt) return
    setSentPrompt(nextPrompt)
    setSentMentions(promptMentions)
    setPrompt("")
    setPromptMentions([])
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
            aria-label={t("Dexter companion").replace("Dexter", aiAgentName)}
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
              <div className="flex min-w-0 items-start gap-3">
                <DexterBrandMark className="mt-0.5 size-6 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-[18px] font-medium leading-5 tracking-normal text-[var(--md-ink)]">{t("Ask Dexter").replace("Dexter", aiAgentName)}</h2>
                  <p className="mt-1.5 text-[12px] leading-4 text-[var(--md-text)]">
                    {t("Current page context loaded from")} <span className="font-medium text-[var(--md-ink)]">{contextLabel}</span>.
                  </p>
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("Close Dexter")} className="rounded-full bg-[var(--md-surface)]/72 shadow-[var(--md-shadow-line)] hover:bg-[var(--md-surface)]" onClick={onClose}>
                <X className="size-4" strokeWidth={1.2} />
              </Button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-7 md-scrollbar">
              <motion.div
                className="ms-auto max-w-[300px] text-end text-[13px] leading-5 text-[var(--md-ink)]"
                initial={shouldReduceMotion ? false : { opacity: 0, x: userMessageOffset, filter: "blur(6px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                transition={mdMotion.enter}
              >
                {t("What should I focus on across customers right now?")}
              </motion.div>

              <div className="mt-5">
                <p className="px-1 text-[11px] font-semibold leading-4 text-[var(--md-ink)]">{aiAgentName}</p>
                <section className="mt-2 px-1">
                  <p className="text-[14px] leading-6 text-[var(--md-ink)]">{responseLead}</p>
                  {contextCounts ? (
                    <div className="md-dexter-context-card mt-4 grid grid-cols-3 gap-1 rounded-[14px] p-2" aria-label={t("Uses this page as context")}>
                      {[
                        [t("Accounts"), contextCounts.accounts],
                        [t("Leads"), contextCounts.leads],
                        [t("Deals"), contextCounts.deals],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="min-w-0 rounded-[10px] px-2 py-1.5 text-center">
                          <p className="text-[17px] font-medium leading-none tabular-nums text-[var(--md-ink)]" data-i18n-skip>
                            {new Intl.NumberFormat(language).format(Number(value))}
                          </p>
                          <p className="mt-1 truncate text-[10px] text-[var(--md-text)]">{label}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              </div>

              {sentPrompt ? (
                <motion.div
                  key={sentPrompt}
                  className="mt-5 ms-auto max-w-[320px] text-end text-[13px] leading-5 text-[var(--md-ink)]"
                  initial={shouldReduceMotion ? false : { opacity: 0, x: userMessageOffset, filter: "blur(6px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  transition={mdMotion.enter}
                >
                  <DexterMentionText text={sentPrompt} items={sentMentions} />
                </motion.div>
              ) : null}

              <div className="mt-6">
                <p className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Suggested follow-ups")}</p>
                <div className="md-dexter-companion-suggestions mt-2">
                  <DexterSuggestionGrid
                    onPick={(nextPrompt) => {
                      setPrompt(nextPrompt)
                      setPromptMentions([])
                    }}
                  />
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
                  <DexterMentionInput
                    value={prompt}
                    items={mentionItems}
                    selectedMentions={promptMentions}
                    placeholder={t("Describe what you want Dexter to do...").replace("Dexter", aiAgentName)}
                    minHeight={28}
                    maxHeight={132}
                    className="text-[13px] leading-5"
                    canSend={Boolean(prompt.trim())}
                    onChange={setPrompt}
                    onMentionsChange={setPromptMentions}
                    onSend={sendPrompt}
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium", sentPrompt ? "text-[var(--md-accent)]" : "text-[var(--md-subtle)]")}>
                      {sentPrompt ? <Check className="size-3" strokeWidth={1.4} /> : <AiBrain className="size-3" strokeWidth={1.25} />}
                      {t(sentPrompt ? "Brief prepared" : "Uses this page as context")}
                    </span>
                    <DexterActionPill
                      type="submit"
                      icon={ArrowUp}
                      iconOnly
                      label={t("Send prompt")}
                      className="size-8 min-w-0 rounded-full p-0"
                      disabled={!prompt.trim()}
                    />
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
