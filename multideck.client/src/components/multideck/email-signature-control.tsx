import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ChevronDown,
  PenLine,
  RefreshCw,
  Settings2,
} from "@/components/icons/hugeicons";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useLanguage } from "@/i18n/language-provider";
import {
  getSignatureChoices,
  setSignatureDefault,
  type SignatureChoice,
  type SignatureSelection,
  signatureSelection,
} from "@/lib/email-signatures";

/** The same signature review and toggle in Inbox, Dexter and contact composers. */
export function EmailSignatureControl({
  mailboxId,
  value,
  onChange,
  disabled = false,
  previewChoice,
}: {
  mailboxId: string | null;
  value?: SignatureSelection;
  onChange: (value: SignatureSelection) => void;
  disabled?: boolean;
  previewChoice?: SignatureChoice;
}) {
  const { t } = useLanguage();
  const reduced = useReducedMotion();
  const [choices, setChoices] = useState<SignatureChoice[]>(
    previewChoice ? [previewChoice] : [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(false);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const previousMailbox = useRef(mailboxId);
  useEffect(() => {
    if (previewChoice || !mailboxId) return;
    let active = true;
    setLoading(true);
    setError(null);
    setChoices([]);
    const changed = previousMailbox.current !== mailboxId;
    previousMailbox.current = mailboxId;
    getSignatureChoices(mailboxId).then((result) => {
      if (!active) return;
      setChoices(result.choices);
      const current = latest.current.value;
      const wanted = changed ? null : current?.templateId;
      const selected = result.choices.find((c) => c.id === wanted) ||
        result.choices.find((c) => c.id === result.defaultId);
      if (selected) {
        latest.current.onChange(
          signatureSelection(selected, current?.enabled !== false),
        );
      } else {latest.current.onChange({
          enabled: current?.enabled !== false,
          templateId: null,
          revision: null,
          fingerprint: null,
        });}
    }).catch((e) => {
      if (active) setError(e.message || t("Signatures could not be loaded."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [mailboxId, reload, previewChoice, t]);
  const selected = choices.find((c) => c.id === value?.templateId) ||
    previewChoice;
  const enabled = value?.enabled !== false;
  const choose = (choice: SignatureChoice) => {
    onChange(signatureSelection(choice, enabled));
    setOpen(false);
  };
  return (
    <div className="email-signature-control min-w-0">
      <div className="flex min-h-9 flex-wrap items-center gap-1 text-[11px] text-[var(--md-subtle)]">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 active:scale-[0.98] motion-reduce:transform-none"
          disabled={disabled || !mailboxId || loading}
          aria-label={t(enabled ? "Remove signature" : "Include signature")}
          aria-pressed={enabled}
          title={t(enabled ? "Remove signature" : "Include signature")}
          onClick={() => {
            if (!choices.length && !enabled) {
              setOpen(true);
              return;
            }
            onChange({
              ...value,
              templateId: value?.templateId ?? null,
              revision: value?.revision ?? null,
              fingerprint: value?.fingerprint ?? null,
              enabled: !enabled,
            });
          }}
        >
          <PenLine
            className={`size-4 ${
              enabled && selected ? "text-[var(--md-accent)]" : ""
            }`}
          />
        </Button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled || loading}
              className="inline-flex min-h-8 items-center gap-1 rounded px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-ring)] active:scale-[0.98] motion-reduce:transform-none"
              aria-label={t("Choose email signature")}
            >
              {loading
                ? t("Loading signature…")
                : selected
                ? selected.name
                : t("Set up signature")}
              <ChevronDown className="size-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-64 p-2 data-[state=open]:animate-none"
            align="start"
          >
            {choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => choose(choice)}
                className="flex min-h-9 w-full items-center justify-between rounded px-2 text-left text-[12px] hover:bg-[var(--md-surface-soft)] active:scale-[0.98] motion-reduce:transform-none"
              >
                {choice.name}
                {choice.id === selected?.id
                  ? <span className="text-[var(--md-accent)]">✓</span>
                  : null}
              </button>
            ))}
            {!choices.length
              ? (
                <p className="p-2 text-[12px] text-[var(--md-subtle)]">
                  {t("Create a signature or ask your manager to assign one.")}
                </p>
              )
              : null}
            {selected && mailboxId && !previewChoice
              ? (
                <button
                  type="button"
                  className="min-h-9 w-full rounded px-2 text-left text-[12px] hover:bg-[var(--md-surface-soft)] active:scale-[0.98] motion-reduce:transform-none"
                  onClick={() =>
                    void setSignatureDefault(mailboxId, selected.id).then(() =>
                      setOpen(false)
                    ).catch((e) => setError(e.message))}
                >
                  {t("Use by default for this mailbox")}
                </button>
              )
              : null}
            <a
              href="/inbox/signatures"
              target="_blank"
              rel="noreferrer"
              className="flex min-h-9 items-center gap-2 rounded px-2 text-[12px] hover:bg-[var(--md-surface-soft)]"
            >
              <Settings2 className="size-3.5" />
              {t("Manage signatures")}
            </a>
            <button
              type="button"
              onClick={() => {
                setReload((x) => x + 1);
                setOpen(false);
              }}
              className="flex min-h-9 w-full items-center gap-2 rounded px-2 text-[12px] hover:bg-[var(--md-surface-soft)] active:scale-[0.98] motion-reduce:transform-none"
            >
              <RefreshCw className="size-3.5" />
              {t("Refresh signature")}
            </button>
          </PopoverContent>
        </Popover>
        {!enabled ? <span>{t("Off for this email")}</span> : null}
      </div>
      {error
        ? (
          <div
            role="alert"
            className="flex items-center gap-2 py-1 text-[12px] text-[var(--md-red)]"
          >
            {error}
            <button
              type="button"
              onClick={() => setReload((x) => x + 1)}
              className="underline"
            >
              {t("Retry")}
            </button>
          </div>
        )
        : null}
      {enabled && !loading && !error && choices.length > 1 && !selected
        ? (
          <p className="py-2 text-[12px] text-[var(--md-amber)]">
            {t("Choose a signature, or turn it off for this email.")}
          </p>
        )
        : null}
      <AnimatePresence initial={false}>
        {enabled && selected
          ? (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, height: reduced ? "auto" : 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: reduced ? "auto" : 0 }}
              transition={{ duration: reduced ? 0 : 0.2, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <iframe
                title={t("Email signature preview")}
                sandbox=""
                referrerPolicy="no-referrer"
                className="block h-[160px] w-full rounded-md border-0 bg-white"
                srcDoc={`<!doctype html><html><head><meta name="color-scheme" content="light"><style>body{margin:10px;font-family:Arial,sans-serif}table{max-width:100%}img{max-width:100%}</style></head><body>${selected.html}</body></html>`}
              />
            </motion.div>
          )
          : null}
      </AnimatePresence>
    </div>
  );
}
