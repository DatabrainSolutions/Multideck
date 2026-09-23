import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Laptop, Plus, Smartphone, X } from "@/components/icons/hugeicons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FilterChips, SegmentedControl } from "./workflow-components";
import { SignatureThumbnail } from "./signature-thumbnail";
import { useLanguage } from "@/i18n/language-provider";
import { mdEase, mdEaseIn, mdEaseOut, staggerRamp } from "@/lib/motion";
import { renderSignature, type SignatureDocument, type SignatureValues } from "@/lib/email-signatures";
import {
  blankSignatureDocument,
  signaturePreviewDocument,
  signaturePreviewValues,
  signatureStarters,
  signatureTemplateCategories,
  type SignatureTemplateCategory,
} from "@/lib/signature-templates";

type Choice = {
  id: string;
  name: string;
  description: string;
  category: SignatureTemplateCategory | "blank";
  document: SignatureDocument;
  html: string;
};
const blankId = "blank";

/**
 * Start from a blank canvas or one of the starter templates. Every tile is the real
 * renderer's output for the viewer's own details, so what is chosen is what is edited.
 */
export function SignatureTemplatePicker({
  open,
  onOpenChange,
  onChoose,
  values,
  accent,
  brandLogoUrl,
  mode = "create",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (document: SignatureDocument, templateId: string | null) => void;
  values?: Partial<SignatureValues>;
  accent: string;
  brandLogoUrl?: string | null;
  mode?: "create" | "replace";
}) {
  const { t } = useLanguage();
  const reduced = Boolean(useReducedMotion());
  const [category, setCategory] = useState<"all" | SignatureTemplateCategory>("all");
  const [focusedId, setFocusedId] = useState<string>(signatureStarters[0].id);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  useEffect(() => {
    if (!open) return;
    setCategory("all");
    setFocusedId(signatureStarters[0].id);
  }, [open]);
  const previewValues = useMemo(() => signaturePreviewValues(values), [values]);
  const choices = useMemo<Choice[]>(() => {
    if (!open) return [];
    return signatureStarters.map((starter) => {
      const document = starter.build(accent);
      const preview = signaturePreviewDocument(document, previewValues, {}, brandLogoUrl);
      return { ...starter, document, html: renderSignature(preview.document, previewValues, preview.assets).html };
    });
  }, [open, accent, previewValues, brandLogoUrl]);
  const visible = choices.filter((choice) => category === "all" || choice.category === category);
  const focused = choices.find((choice) => choice.id === focusedId);
  function use(id: string) {
    if (id === blankId) {
      onChoose(blankSignatureDocument(accent), null);
      return;
    }
    const choice = choices.find((item) => item.id === id);
    if (choice) onChoose(structuredClone(choice.document), choice.id);
  }
  const categories = ["all", ...Object.keys(signatureTemplateCategories)] as const;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sig-picker !max-w-[1160px]">
        <header className="sig-picker-head">
          <div className="min-w-0">
            <DialogTitle className="text-[16px] font-medium tracking-[-.01em]">
              {t(mode === "create" ? "New signature" : "Change template")}
            </DialogTitle>
            <DialogDescription className="mt-1 text-[12px] text-[var(--md-subtle)]">
              {t(mode === "create"
                ? "Start from scratch or pick a template. Every part stays editable."
                : "Swap the layout without losing anything. Undo brings your previous design back.")}
            </DialogDescription>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={t("Close")} onClick={() => onOpenChange(false)}>
            <X className="size-4" />
          </Button>
        </header>
        <FilterChips
          className="sig-picker-filters"
          options={categories}
          activeOption={category}
          onChange={(option) => setCategory(option as typeof category)}
          labelForOption={(option) => t(option === "all" ? "All templates" : signatureTemplateCategories[option as SignatureTemplateCategory])}
          buttonClassName="h-8 px-3 text-[12px] shrink-0"
        />
        <div className="sig-picker-body">
          <div className="sig-picker-grid" role="listbox" aria-label={t("Templates")}>
            {category === "all"
              ? (
                <motion.button
                  type="button"
                  role="option"
                  aria-selected={focusedId === blankId}
                  className="sig-picker-tile is-blank"
                  initial={{ opacity: 0, y: reduced ? 0 : 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduced ? 0 : .38, ease: mdEaseOut }}
                  onClick={() => focusedId === blankId ? use(blankId) : setFocusedId(blankId)}
                  onDoubleClick={() => use(blankId)}
                >
                  <span className="sig-picker-blank-art" aria-hidden="true">
                    <Plus className="size-5" />
                  </span>
                  <span className="sig-picker-tile-name">{t("Start from scratch")}</span>
                  <span className="sig-picker-tile-desc">{t("A blank canvas. Drag in exactly what you need.")}</span>
                  {focusedId === blankId ? <SelectedRing reduced={reduced} /> : null}
                </motion.button>
              )
              : null}
            <AnimatePresence mode="popLayout" initial={false}>
              {visible.map((choice, index) => (
                <motion.button
                  key={choice.id}
                  layout={!reduced}
                  type="button"
                  role="option"
                  aria-selected={focusedId === choice.id}
                  aria-label={`${choice.name}. ${choice.description}`}
                  className="sig-picker-tile"
                  initial={{ opacity: 0, y: reduced ? 0 : 12, scale: reduced ? 1 : .98 }}
                  animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: reduced ? 0 : .42, ease: mdEaseOut, delay: reduced ? 0 : staggerRamp(index + 1, .03) } }}
                  exit={{ opacity: 0, scale: reduced ? 1 : .96, transition: { duration: reduced ? 0 : .14, ease: mdEaseIn } }}
                  transition={{ layout: { duration: reduced ? 0 : .34, ease: mdEase } }}
                  onClick={() => focusedId === choice.id ? use(choice.id) : setFocusedId(choice.id)}
                  onDoubleClick={() => use(choice.id)}
                >
                  <SignatureThumbnail html={choice.html} width={choice.document.width} height={132} padding={14} className="sig-picker-thumb" />
                  <span className="sig-picker-tile-name">{t(choice.name)}</span>
                  {focusedId === choice.id ? <SelectedRing reduced={reduced} /> : null}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
          <aside className="sig-picker-preview" aria-live="polite">
            <div className="sig-picker-stage" data-device={device}>
              <div className="sig-picker-mail">
                <div className="sig-picker-mail-lines" aria-hidden="true">
                  <span style={{ width: "34%" }} />
                  <span style={{ width: "92%" }} />
                  <span style={{ width: "78%" }} />
                  <span style={{ width: "58%" }} />
                </div>
                <p className="sig-picker-mail-signoff">{t("Kind regards,")}</p>
                <div className="sig-picker-mail-signature">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.div
                      key={`${focusedId}-${device}`}
                      initial={{ opacity: 0, y: reduced ? 0 : 8, filter: reduced ? "none" : "blur(6px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: reduced ? 0 : .36, ease: mdEaseOut } }}
                      exit={{ opacity: 0, y: reduced ? 0 : -4, filter: reduced ? "none" : "blur(4px)", transition: { duration: reduced ? 0 : .14, ease: mdEaseIn } }}
                    >
                      {focused
                        ? <SignatureThumbnail html={focused.html} width={focused.document.width} padding={0} />
                        : (
                          <div className="sig-picker-blank-preview">
                            <Plus className="size-4" />
                            {t("Your blocks will appear here")}
                          </div>
                        )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
            <div className="sig-picker-meta">
              <div className="min-w-0 flex-1">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={focusedId}
                    initial={{ opacity: 0, y: reduced ? 0 : 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduced ? 0 : .18, ease: mdEaseOut }}
                  >
                    <div className="text-[14px] font-medium">{t(focused?.name ?? "Start from scratch")}</div>
                    <p className="mt-1 text-[12px] leading-relaxed text-[var(--md-subtle)]">
                      {t(focused?.description ?? "A blank canvas. Drag in exactly what you need.")}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>
              <SegmentedControl
                ariaLabel={t("Preview width")}
                options={["desktop", "mobile"] as const}
                value={device}
                onChange={setDevice}
                className="shrink-0 [&>button]:h-7 [&>button]:px-2"
                renderOption={(value) => {
                  const Icon = value === "desktop" ? Laptop : Smartphone;
                  return <><Icon className="size-3.5" /><span className="sr-only">{t(value === "desktop" ? "Desktop" : "Mobile")}</span></>;
                }}
              />
            </div>
            <p className="sig-picker-note">{t("Previewed with your details. Sample details fill any gaps, and images stay as placeholders until you upload your own.")}</p>
            <Button className="sig-picker-use" onClick={() => use(focusedId)}>
              {t(focusedId === blankId ? "Start from scratch" : mode === "create" ? "Use this template" : "Apply template")}
              <ArrowRight className="size-4" />
            </Button>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SelectedRing({ reduced }: { reduced: boolean }) {
  return (
    <motion.span
      layoutId="sig-picker-selected"
      aria-hidden="true"
      className="sig-picker-ring"
      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38, mass: .7 }}
    />
  );
}
