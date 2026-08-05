import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { Building2, FileText, Mail, Ship } from "lucide-react"
import { MotionConfig, useReducedMotion } from "motion/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import gmailLogo from "@/assets/integrations/gmail.svg"
import outlookLogo from "@/assets/integrations/outlook.svg"
import {
  DexterPromptComposer,
  type DexterMentionItem,
} from "@/components/multideck/agent-dexter-components"
import { LanguageProvider, useLanguage } from "@/i18n/language-provider"
import { mdMotion } from "@/lib/motion"

type DemoPrompt = {
  question: string
  mentions: DexterMentionItem[]
}

const demoPrompts: DemoPrompt[] = [
  {
    question: "Build my morning brief: overnight changes, blocked jobs, customer promises, and what I should do first.",
    mentions: [],
  },
  {
    question: "Read the latest customer email, check every claim against the live booking, and draft the reply.",
    mentions: [
      { id: "gmail", type: "email", title: "Gmail", meta: "Connected mailbox", icon: Mail, logo: gmailLogo },
    ],
  },
  {
    question: "Find every promise we made this week that still has no owner or follow-up.",
    mentions: [
      { id: "outlook", type: "email", title: "Outlook", meta: "Connected mailbox", icon: Mail, logo: outlookLogo },
    ],
  },
  {
    question: "Tell them about the delay before they ask, in their usual tone, with the new ETA.",
    mentions: [
      { id: "marlow", type: "customer", title: "Marlow Apparel", meta: "Customer record", icon: Building2 },
      { id: "md-22479", type: "booking", title: "MD-22479", meta: "Ningbo to Rotterdam", icon: Ship },
    ],
  },
  {
    question: "Which customers are quietly becoming less profitable, and what changed?",
    mentions: [],
  },
  {
    question: "Pull the latest invoice, prepare the customs values, and flag anything likely to be rejected.",
    mentions: [
      { id: "invoice-gmail", type: "email", title: "Gmail", meta: "Connected mailbox", icon: Mail, logo: gmailLogo },
      { id: "commercial-invoice", type: "document", title: "Commercial invoice", meta: "Most recent attachment", icon: FileText },
    ],
  },
  {
    question: "If this vessel slips by three days, show me every booking, customer promise, and margin it affects.",
    mentions: [],
  },
]

function wait(delay: number, timers: Set<number>) {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => {
      timers.delete(timer)
      resolve()
    }, delay)
    timers.add(timer)
  })
}

function MarketingDexterDemo() {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [value, setValue] = useState(() => demoPrompts[0].question)
  const [mentions, setMentions] = useState<DexterMentionItem[]>(() => demoPrompts[0].mentions)
  const promptIndexRef = useRef(0)
  const [pageVisibility, setPageVisibility] = useState(() => ({
    visible: typeof document === "undefined" || document.visibilityState !== "hidden",
    revision: 0,
  }))

  useEffect(() => {
    const syncVisibility = () => {
      const visible = document.visibilityState !== "hidden"
      setPageVisibility((current) => ({
        visible,
        revision: visible ? current.revision + 1 : current.revision,
      }))
    }

    document.addEventListener("visibilitychange", syncVisibility)
    window.addEventListener("focus", syncVisibility)
    window.addEventListener("pageshow", syncVisibility)
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility)
      window.removeEventListener("focus", syncVisibility)
      window.removeEventListener("pageshow", syncVisibility)
    }
  }, [])

  useEffect(() => {
    const showCompletePrompt = (promptIndex: number) => {
      const example = demoPrompts[promptIndex]
      setMentions(example.mentions)
      const mentionPrefix = example.mentions.length > 0
        ? `${example.mentions.map((mention) => `@${mention.title}`).join(" ")} `
        : ""
      setValue(`${mentionPrefix}${t(example.question)}`)
    }

    if (shouldReduceMotion || !pageVisibility.visible) {
      showCompletePrompt(promptIndexRef.current)
      return
    }

    let cancelled = false
    const timers = new Set<number>()

    async function animate() {
      let promptIndex = promptIndexRef.current
      showCompletePrompt(promptIndex)

      while (!cancelled) {
        await wait(2_200, timers)
        if (cancelled) return

        promptIndex = (promptIndex + 1) % demoPrompts.length
        promptIndexRef.current = promptIndex
        const example = demoPrompts[promptIndex]
        const question = t(example.question)
        const mentionPrefix = example.mentions.length > 0
          ? `${example.mentions.map((mention) => `@${mention.title}`).join(" ")} `
          : ""

        setMentions(example.mentions)
        setValue(`${mentionPrefix}${question.slice(0, 1)}`)

        for (let character = 2; character <= question.length; character += 1) {
          if (cancelled) return
          setValue(`${mentionPrefix}${question.slice(0, character)}`)
          await wait(question[character - 1] === " " ? 20 : 34, timers)
        }

      }
    }

    void animate()
    return () => {
      cancelled = true
      timers.forEach(window.clearTimeout)
      timers.clear()
    }
  }, [pageVisibility, shouldReduceMotion, t])

  return (
    <div className="w-full py-1">
      <div className="pointer-events-none select-none" aria-label={t("Animated examples of questions operators can ask Dexter")}>
        <DexterPromptComposer
          value={value}
          selectedMentions={mentions}
          mentionItems={mentions}
          selectedSpecialistId="auto"
          selectedModelId="fast"
          accessMode="full"
          contextUsedTokens={18_400}
          contextMaxTokens={128_000}
          animateProgrammaticMentions
          onChange={() => undefined}
          onMentionsChange={() => undefined}
          onOpenAttachments={() => undefined}
          onSelectSpecialist={() => undefined}
          onSelectModel={() => undefined}
          onAccessModeChange={() => undefined}
          onSend={() => undefined}
        />
      </div>
    </div>
  )
}

async function mountMarketingDexter(host: HTMLElement) {
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" })
  const appStyles = import.meta.env.DEV
    ? (await import("./styles.css?inline")).default
    : await fetch("/assets/multideck-app.css").then((response) => {
        if (!response.ok) throw new Error("The Dexter composer stylesheet could not be loaded.")
        return response.text()
      })
  const style = document.createElement("style")
  style.textContent = `${appStyles.replaceAll(":root", ":host")}
    :host { display: block; color-scheme: light; font-family: "SF Pro Display", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; text-align: start; }
    *, *::before, *::after { box-sizing: border-box; }
  `
  const mount = document.createElement("div")
  shadow.replaceChildren(style, mount)

  const root = createRoot(mount)
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <TooltipProvider>
          <MotionConfig reducedMotion="user" transition={mdMotion.fast}>
            <MarketingDexterDemo />
          </MotionConfig>
        </TooltipProvider>
      </LanguageProvider>,
    )
  })
  host.dataset.dexterMounted = "true"

  if (import.meta.hot) import.meta.hot.dispose(() => root.unmount())
}

const host = document.querySelector<HTMLElement>("[data-dexter-marketing-root]")

if (host) {
  void mountMarketingDexter(host).catch((error) => {
    host.dataset.dexterLoadError = error instanceof Error ? error.message : "Dexter could not load."
    console.error(error)
  })
}
