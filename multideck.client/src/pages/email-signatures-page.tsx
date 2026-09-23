import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Eye,
  History,
  Laptop,
  PenLine,
  Plus,
  RefreshCw,
  Settings2,
  Smartphone,
  Users,
} from "@/components/icons/hugeicons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DotGridLoader } from "@/components/multideck/dot-grid-loader";
import { SignatureBuilder } from "@/components/multideck/signature-builder";
import { SignatureTemplatePicker } from "@/components/multideck/signature-template-picker";
import { SignatureThumbnail } from "@/components/multideck/signature-thumbnail";
import { SegmentedControl } from "@/components/multideck/workflow-components";
import { useLanguage } from "@/i18n/language-provider";
import { mdEase, mdEaseIn, mdEaseOut, staggerRamp } from "@/lib/motion";
import {
  eligibleSignatures,
  getSignatureVersions,
  getSignatureWorkspace,
  renderSignature,
  signatureBrandImageFile,
  signatureCompanyText,
  signatureDefaultAccent,
  signatureNeedsPersonPhoto,
  signaturePersonPhotoKey,
  saveSignatureTemplate,
  type SignatureDocument,
  type SignatureTemplate,
  type SignatureValues,
  type SignatureWorkspace,
  uploadSignatureImage,
  validateSignatureDocument,
} from "@/lib/email-signatures";
import {
  fillSignatureBrandLogo,
  signatureNeedsBrandLogo,
  signaturePreviewDocument,
  signatureStarter,
} from "@/lib/signature-templates";
import {
  getTenantBranding,
  type TenantBranding,
} from "@/lib/tenant-branding-api";
import { getSupabaseSession } from "@/lib/supabase";
import "@/styles/email-signatures.css";

type LibraryFilter = "all" | "live" | "draft" | "personal";

function Preview(
  { html, narrow = false, title = "Signature preview" }: {
    html: string;
    narrow?: boolean;
    title?: string;
  },
) {
  return (
    <iframe
      title={title}
      sandbox=""
      referrerPolicy="no-referrer"
      className="block h-[300px] max-w-full rounded-lg border-0 bg-white shadow-[0_0_0_1px_#0000000a] transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
      style={{ width: narrow ? 340 : 640 }}
      srcDoc={`<!doctype html><html><head><meta name="color-scheme" content="light"><style>body{margin:24px;font-family:Arial,Helvetica,sans-serif;color:#253c39}table{max-width:100%}img{max-width:100%}a{pointer-events:none}</style></head><body>${html}</body></html>`}
    />
  );
}

function relativeEdit(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const minutes = Math.round((time - Date.now()) / 60000);
  const format = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
  if (Math.abs(minutes) < 60 * 24) return format.format(Math.round(minutes / 60), "hour");
  if (Math.abs(minutes) < 60 * 24 * 30) return format.format(Math.round(minutes / 1440), "day");
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function EmailSignaturesPage(
  { personal = false, navigate }: { personal?: boolean; navigate?: (path: string) => void },
) {
  const { t } = useLanguage();
  const reduced = Boolean(useReducedMotion());
  const [brand, setBrand] = useState<TenantBranding | null>(null);
  useEffect(() => {
    let active = true;
    void getSupabaseSession().then((session) =>
      session ? getTenantBranding(session.access_token) : null
    ).then((value) => {
      if (active) setBrand(value);
    }).catch(() => {
      if (active) setBrand(null);
    });
    return () => {
      active = false;
    };
  }, []);
  const [workspace, setWorkspace] = useState<SignatureWorkspace | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SignatureTemplate | null>(null);
  const [step, setStep] = useState<"design" | "preview" | "assign">("design");
  const [personId, setPersonId] = useState("");
  const [narrow, setNarrow] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [review, setReview] = useState(false);
  const [picker, setPicker] = useState(false);
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [versions, setVersions] = useState<
    Awaited<ReturnType<typeof getSignatureVersions>> | null
  >(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const savingRef = useRef(false);
  const editsRevision = useRef(0);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getSignatureWorkspace();
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (!key?.startsWith(`md-signature-draft:${result.userId}:`)) {
            continue;
          }
          const cached = JSON.parse(sessionStorage.getItem(key) || "null");
          if (
            cached?.revision === 0 && cached.id && !result.templates.some((t) =>
              t.id === cached.id
            ) &&
            (cached.ownerUserId === result.userId ||
              !cached.ownerUserId && result.manager)
          ) {
            cached.document = validateSignatureDocument(cached.document);
            result.templates.push(cached);
          }
        }
      } catch { /* A damaged local recovery never blocks remote records. */ }
      setWorkspace(result);
      setPersonId((p) => p || result.userId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const cacheKey = workspace && selected
    ? `md-signature-draft:${workspace.userId}:${selected.id}`
    : null;
  useEffect(() => {
    if (!dirty || !selected || !cacheKey) return;
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(selected));
    } catch { /* Remote saving still runs. */ }
  }, [cacheKey, dirty, selected]);
  async function save(publish = false): Promise<SignatureTemplate | null> {
    const current = selectedRef.current;
    if (!current || savingRef.current) return null;
    savingRef.current = true;
    setSaving(true);
    setError("");
    const stamp = editsRevision.current;
    try {
      const saved = await saveSignatureTemplate(current, publish);
      setWorkspace((w) =>
        w
          ? {
            ...w,
            templates: [...w.templates.filter((x) => x.id !== saved.id), saved],
          }
          : w
      );
      if (selectedRef.current?.id === saved.id) {
        setSelected((s) =>
          s
            ? stamp === editsRevision.current ? saved : {
              ...s,
              revision: saved.revision,
              publishedRevision: saved.publishedRevision,
              publishedDocument: saved.publishedDocument,
              publishedAssignments: saved.publishedAssignments,
            }
            : s
        );
        if (stamp === editsRevision.current) {
          setDirty(false);
          if (cacheKey) sessionStorage.removeItem(cacheKey);
        }
      }
      setSavedAt(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      return saved;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!dirty || saving || error) return;
    const timer = setTimeout(() => void saveRef.current(), 1100);
    return () => clearTimeout(timer);
  }, [dirty, selected, saving, error]);
  function edit(patch: Partial<SignatureTemplate>) {
    editsRevision.current++;
    setSelected((s) => s ? { ...s, ...patch } : s);
    setDirty(true);
    setError("");
  }
  function openTemplate(template: SignatureTemplate) {
    setSelected(template);
    selectedRef.current = template;
    setStep("design");
    setError("");
    setDirty(false);
    setSavedAt("");
    editsRevision.current = 0;
    if (workspace) {
      try {
        const cached = JSON.parse(
          sessionStorage.getItem(
            `md-signature-draft:${workspace.userId}:${template.id}`,
          ) || "null",
        );
        if (cached?.document) {
          cached.document = validateSignatureDocument(cached.document);
          if (cached.revision !== template.revision) {
            cached.id = crypto.randomUUID();
            cached.revision = 0;
            cached.publishedRevision = null;
            cached.publishedDocument = null;
            cached.publishedAssignments = [];
            cached.name = `${cached.name} (recovered)`;
            cached.assignments = [];
            cached.sourceTemplateId = null;
          }
          setSelected(cached);
          setDirty(true);
        }
      } catch { /* Ignore unusable recovery entries. */ }
    }
  }
  function create(document: SignatureDocument, options: { name?: string; source?: SignatureTemplate } = {}) {
    if (!workspace) return;
    const own = personal || !workspace.manager;
    const template: SignatureTemplate = {
      id: crypto.randomUUID(),
      name: options.source ? `${options.source.name} ${t("copy")}` : options.name ?? t("Untitled signature"),
      document: structuredClone(document),
      revision: 0,
      publishedRevision: null,
      publishedDocument: null,
      assignments: [],
      publishedAssignments: [],
      ownerUserId: own ? workspace.userId : null,
      sourceTemplateId: own ? options.source?.id || null : null,
      archived: false,
      updatedAt: new Date().toISOString(),
    };
    openTemplate(template);
    setDirty(true);
    setPicker(false);
    if (!options.source && brandLogoUrl && signatureNeedsBrandLogo(template.document)) {
      void signatureBrandImageFile(brandLogoUrl)
        .then((file) => uploadSignatureImage(file, own))
        .then((asset) => {
          setWorkspace((w) => w ? { ...w, assetUrls: { ...w.assetUrls, [asset.id]: asset.url } } : w);
          const latest = selectedRef.current;
          if (latest?.id !== template.id) return;
          editsRevision.current++;
          setSelected((s) => s && s.id === template.id ? { ...s, document: fillSignatureBrandLogo(s.document, asset.id) } : s);
          setDirty(true);
        })
        .catch(() => { /* The logo slot stays ready for a manual upload. */ });
    }
  }
  function duplicate(source: SignatureTemplate) {
    create(source.publishedDocument || source.document, { source });
  }
  const brandLogoUrl = brand?.configured ? brand.logoUrl : null;
  const accent = brand?.configured && /^#[0-9a-f]{6}$/i.test(brand.primaryColor) ? brand.primaryColor.toLowerCase() : signatureDefaultAccent;
  const person = workspace
    ? workspace.people.find((p) => p.id === personId) || workspace.people.find((p) => p.id === workspace.userId)
    : undefined;
  const values: SignatureValues | null = useMemo(() => workspace && person
    ? {
      companyDetails: signatureCompanyText(workspace.policy.company_details, workspace.company, workspace.policy.website),
      name: person.name,
      jobTitle: person.jobTitle,
      email: person.email,
      phone: person.phone,
      mobile: person.mobile,
      company: person.company ?? workspace.company,
      website: person.website ?? workspace.policy.website,
      address: person.address || "",
    }
    : null, [workspace, person]);
  /** Headshot blocks show whoever the signature is previewed as, never one fixed photo. */
  const assets = useMemo(() => workspace && person?.photoUrl
    ? { ...workspace.assetUrls, [signaturePersonPhotoKey]: person.photoUrl }
    : workspace?.assetUrls ?? {}, [workspace, person]);
  const library = useMemo(() => {
    if (!workspace || !values) return [];
    const available = personal
      ? workspace.templates.filter((x) => !x.archived && (x.ownerUserId === workspace.userId || x.publishedRevision))
      : workspace.templates.filter((x) => !x.archived && !x.ownerUserId);
    return available
      .map((template) => {
        const document = template.publishedDocument && !template.ownerUserId && personal ? template.publishedDocument : template.document;
        const preview = signaturePreviewDocument(document, values, assets, brandLogoUrl);
        return {
          template,
          width: document.width,
          html: renderSignature(preview.document, values, preview.assets).html,
          status: template.ownerUserId ? "personal" as const : template.publishedRevision ? "live" as const : "draft" as const,
        };
      })
      .sort((a, b) => b.template.updatedAt.localeCompare(a.template.updatedAt));
  }, [workspace, values, assets, personal, brandLogoUrl]);
  if (loading && !workspace) {
    return (
      <div className="grid min-h-[400px] place-items-center">
        <DotGridLoader />
      </div>
    );
  }
  if (!workspace || !person || !values) {
    return (
      <div className="md-page max-w-3xl">
        <h1 className="text-[20px]">{t("Email signatures")}</h1>
        <p role="alert" className="my-4 text-[13px] text-[var(--md-red)]">
          {error}
        </p>
        <Button onClick={() => void load()}>
          <RefreshCw className="size-4" />
          {t("Retry")}
        </Button>
      </div>
    );
  }
  const own = selected?.ownerUserId === workspace.userId;
  const editable = selected
    ? own ? workspace.allowCustomisation : workspace.manager && !personal
    : false;
  const canCreate = workspace.allowCustomisation || workspace.manager && !personal;
  const counts: Record<LibraryFilter, number> = {
    all: library.length,
    live: library.filter((item) => item.status === "live").length,
    draft: library.filter((item) => item.status === "draft").length,
    personal: library.filter((item) => item.status === "personal").length,
  };
  const filters = (["all", "live", "draft", "personal"] as const).filter((option) => option === "all" || counts[option] > 0);
  const activeFilter = filters.includes(filter) ? filter : "all";
  const shown = library.filter((item) => activeFilter === "all" || item.status === activeFilter);
  const affected = selected && !selected.ownerUserId
    ? workspace.people.filter((p) =>
      eligibleSignatures(
        [{
          ...selected,
          publishedRevision: 1,
          publishedAssignments: selected.assignments,
        }],
        p.id,
        p.departmentIds,
        false,
      ).length
    )
    : [];
  const rendered = selected
    ? renderSignature(selected.document, values, assets)
    : null;
  const usesPersonPhoto = selected ? signatureNeedsPersonPhoto(selected.document) : false;
  async function archive(template: SignatureTemplate) {
    try {
      await saveSignatureTemplate({ ...template, archived: true });
      setSelected(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function audience(template: SignatureTemplate) {
    if (template.ownerUserId) return t("Only you");
    if (template.publishedAssignments.some((a) => a.kind === "everyone")) return t("Everyone");
    if (!template.publishedAssignments.length) return t("Not assigned");
    return `${template.publishedAssignments.length} ${t(template.publishedAssignments.length === 1 ? "assignment" : "assignments")}`;
  }
  return (
    <div
      className={`signature-studio md-page mx-auto max-w-[1500px] ${
        selected && step === "design" ? "is-editing" : ""
      }`}
    >
      <header className="sig-page-header mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="sig-editor-heading flex min-w-0 items-center gap-3">
          {selected
            ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("Back to signatures")}
                disabled={saving}
                onClick={() => {
                  const leave = () => {
                    setSelected(null);
                    setDirty(false);
                    setError("");
                  };
                  if (dirty) {
                    void save().then((saved) => {
                      if (saved) leave();
                    });
                  } else {
                    leave();
                  }
                }}
              >
                <ArrowLeft className="size-4" />
              </Button>
            )
            : null}
          <div>
            <div className="mb-1 text-[11px] text-[var(--md-subtle)]">
              {t(personal ? "Inbox" : "Company settings")}
            </div>
            <h1 className="text-[22px] font-medium tracking-[-.025em]">
              {selected ? selected.name : t("Email signatures")}
            </h1>
          </div>
        </div>
        <div className="sig-editor-actions flex flex-wrap items-center gap-2">
          {selected
            ? (
              <>
                <span
                  role="status"
                  className="mr-2 text-[11px] text-[var(--md-subtle)]"
                >
                  {saving
                    ? t("Saving…")
                    : dirty
                    ? t("Unsaved changes")
                    : savedAt
                    ? `${t("Saved")} ${savedAt}`
                    : selected.publishedRevision
                    ? t("Published")
                    : t("Draft")}
                </span>
                {editable
                  ? (
                    <Button
                      type="button"
                      disabled={saving || !selected.name.trim()}
                      onClick={() => setReview(true)}
                    >
                      {t("Review and apply")}
                      <ArrowRight className="size-4" />
                    </Button>
                  )
                  : workspace.allowCustomisation
                  ? (
                    <Button onClick={() => duplicate(selected)}>
                      <Copy className="size-4" />
                      {t("Make personal copy")}
                    </Button>
                  )
                  : null}
              </>
            )
            : (
              <>
                {workspace.manager && !personal ||
                    personal && workspace.allowCustomisation
                  ? (
                    <Button
                      variant="ghost"
                      onClick={() => personal ? navigate?.("/settings") : navigate?.("/admin/email-signatures/team")}
                    >
                      <Settings2 className="size-4" />
                      {t(personal ? "My details" : "Team details")}
                    </Button>
                  )
                  : null}
                {canCreate
                  ? (
                    <Button onClick={() => setPicker(true)}>
                      <Plus className="size-4" />
                      {t("New signature")}
                    </Button>
                  )
                  : null}
              </>
            )}
        </div>
      </header>
      {error
        ? (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-[color-mix(in_srgb,var(--md-red)_8%,transparent)] px-4 py-3 text-[12px] text-[var(--md-red)]"
          >
            {error}
            {selected && editable
              ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {t("Retry save")}
                </Button>
              )
              : null}
          </div>
        )
        : null}
      {!selected
        ? (
          <>
            <div className="sig-library-toolbar">
              <p className="max-w-xl text-[13px] leading-relaxed text-[var(--md-subtle)]">
                {t(
                  personal
                    ? "Your signature, ready wherever you write an email in Multideck."
                    : "Design once. Personal details fill automatically for everyone you assign.",
                )}
              </p>
              {library.length && filters.length > 1
                ? (
                  <SegmentedControl
                    ariaLabel={t("Show signatures")}
                    options={filters}
                    value={activeFilter}
                    onChange={setFilter}
                    className="[&>button]:h-7 [&>button]:text-[12px]"
                    renderOption={(option) => (
                      <>
                        {t(option === "all" ? "All" : option === "live" ? "Live" : option === "draft" ? "Drafts" : "Personal")}
                        <span className="text-[11px] tabular-nums opacity-55">{counts[option]}</span>
                      </>
                    )}
                  />
                )
                : null}
            </div>
            {!library.length
              ? (
                <motion.div
                  className="sig-empty"
                  initial={{ opacity: 0, y: reduced ? 0 : 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduced ? 0 : .42, ease: mdEaseOut }}
                >
                  <div className="sig-empty-art" aria-hidden="true">
                    {[0, 1, 2].map((i) => <span key={i}><i /><i style={{ width: "80%" }} /><i style={{ width: "54%" }} /></span>)}
                  </div>
                  <h2 className="text-[16px] font-medium">
                    {t("A considered sign-off for every email")}
                  </h2>
                  <p className="mb-5 mt-2 max-w-sm text-[12px] leading-relaxed text-[var(--md-subtle)]">
                    {t("Pick one of twenty templates or start from scratch, add your details and images, then choose who uses it.")}
                  </p>
                  {canCreate
                    ? (
                      <Button onClick={() => setPicker(true)}>
                        <Plus className="size-4" />
                        {t("Create a signature")}
                      </Button>
                    )
                    : (
                      <p className="text-[12px] text-[var(--md-subtle)]">
                        {t("Your manager can assign your company signature here.")}
                      </p>
                    )}
                </motion.div>
              )
              : (
                <motion.div layout={!reduced} className="sig-library-grid">
                  <AnimatePresence mode="popLayout" initial={true}>
                    {shown.map(({ template, html, width, status }, index) => {
                      const canArchive = !template.ownerUserId && workspace.manager && !personal || template.ownerUserId === workspace.userId && workspace.allowCustomisation;
                      return (
                        <motion.article
                          layout={!reduced}
                          key={template.id}
                          className="sig-card"
                          initial={{ opacity: 0, y: reduced ? 0 : 14, scale: reduced ? 1 : .985 }}
                          animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: reduced ? 0 : .46, ease: mdEaseOut, delay: reduced ? 0 : staggerRamp(index, .04) } }}
                          exit={{ opacity: 0, scale: reduced ? 1 : .97, transition: { duration: reduced ? 0 : .16, ease: mdEaseIn } }}
                          transition={{ layout: { duration: reduced ? 0 : .36, ease: mdEase } }}
                        >
                          <button
                            type="button"
                            onClick={() => openTemplate(template)}
                            className="sig-card-open"
                            aria-label={`${t("Open signature")} ${template.name}`}
                          >
                            <div className="sig-card-stage" style={{ height: 204 }}>
                              <div className="sig-card-mail">
                                <div className="sig-card-mail-lines" aria-hidden="true">
                                  <span style={{ width: "36%" }} />
                                  <span style={{ width: "84%" }} />
                                </div>
                                <SignatureThumbnail html={html} width={width} padding={18} />
                              </div>
                            </div>
                            <div className="sig-card-meta">
                              <div className="sig-card-title">
                                <span className="truncate">{template.name}</span>
                                <span className={`sig-status is-${status}`}>
                                  {t(status === "personal" ? "Personal" : status === "live" ? "Live" : "Draft")}
                                </span>
                              </div>
                              <div className="sig-card-sub">
                                <span>{audience(template)}</span>
                                {relativeEdit(template.updatedAt) ? <span>{t("Edited")} {relativeEdit(template.updatedAt)}</span> : null}
                              </div>
                            </div>
                          </button>
                          <div className="sig-card-actions">
                            {!(personal && !workspace.allowCustomisation)
                              ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" aria-label={`${t(personal ? "Personal copy" : "Duplicate")} ${template.name}`} onClick={() => duplicate(template)}>
                                      <Copy className="size-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t(personal ? "Make a personal copy" : "Duplicate")}</TooltipContent>
                                </Tooltip>
                              )
                              : null}
                            {canArchive
                              ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>
                                      <button
                                        type="button"
                                        aria-label={`${t(template.ownerUserId ? "Reset to assigned signature" : "Archive")} ${template.name}`}
                                        disabled={template.publishedAssignments.length > 0}
                                        onClick={() => void archive(template)}
                                      >
                                        <Archive className="size-3.5" />
                                      </button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {template.publishedAssignments.length
                                      ? t("Remove and apply assignments before archiving")
                                      : t(template.ownerUserId ? "Reset to assigned signature" : "Archive")}
                                  </TooltipContent>
                                </Tooltip>
                              )
                              : null}
                          </div>
                        </motion.article>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              )}
          </>
        )
        : (
          <>
            <div className="sig-stage-bar mb-4 flex flex-wrap items-end justify-between gap-3">
              <div
                className="sig-stage-tabs flex gap-1"
                role="tablist"
                aria-label={t("Signature setup")}
              >
                {([
                  "design",
                  "preview",
                  ...(!selected.ownerUserId && workspace.manager && !personal
                    ? ["assign"]
                    : []),
                ] as const).map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    role="tab"
                    aria-selected={step === stage}
                    onClick={() => setStep(stage as typeof step)}
                    className={`relative isolate flex min-h-9 items-center gap-2 rounded-md px-3 text-[12px] transition-colors duration-200 ${
                      step === stage ? "text-[var(--md-ink)]" : "text-[var(--md-subtle)] hover:text-[var(--md-ink)]"
                    }`}
                  >
                    {step === stage
                      ? (
                        <motion.span
                          layoutId="sig-stage-tab"
                          className="absolute inset-0 -z-10 rounded-[inherit] bg-[var(--md-surface)] shadow-[var(--md-premium-stroke)]"
                          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 40 }}
                        />
                      )
                      : null}
                    {stage === "design"
                      ? <PenLine className="size-3.5" />
                      : stage === "preview"
                      ? <Eye className="size-3.5" />
                      : <Users className="size-3.5" />}
                    {t(
                      stage === "design"
                        ? "Design"
                        : stage === "preview"
                        ? "Preview"
                        : "Assign",
                    )}
                  </button>
                ))}
              </div>
              <div className="sig-preview-controls flex items-center gap-2">
                <label className="flex items-center gap-2 text-[11px] text-[var(--md-subtle)]">
                  {t("Preview as")}
                  <Select
                    value={person.id}
                    onValueChange={(value) => setPersonId(value)}
                  >
                    <SelectTrigger aria-label={t("Preview as")} className="w-full min-w-0 text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {workspace.people.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.id === workspace.userId ? ` (${t("You")})` : ""}
                          {workspace.people.some((other) =>
                              other.id !== p.id && other.name === p.name
                            )
                            ? ` · ${p.email}`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                {editable
                  ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("Signature version history")}
                      disabled={!selected.publishedRevision}
                      onClick={() =>
                        void getSignatureVersions(selected.id).then(setVersions)
                          .catch((e) => setError(e.message))}
                    >
                      <History className="size-4" />
                    </Button>
                  )
                  : null}
              </div>
            </div>
            {step === "design"
              ? (
                <>
                  <div className="sig-name-controls mb-4 flex flex-wrap items-center gap-3">
                    {workspace.manager && !personal ? <Button variant="ghost" size="sm" onClick={() => navigate?.("/admin/email-signatures/team")}>{t("Edit company & office details")}</Button> : null}
                    <label className="flex items-center gap-3 text-[11px] text-[var(--md-subtle)]">
                      {t("Signature name")}
                      <Input
                        value={selected.name}
                        disabled={!editable}
                        maxLength={120}
                        onChange={(e) => edit({ name: e.target.value })}
                        className="h-8 w-[220px] text-[12px]"
                      />
                    </label>
                  </div>
                  <SignatureBuilder
                    key={selected.id}
                    document={selected.document}
                    onChange={(document) => edit({ document })}
                    values={values}
                    assets={assets}
                    readOnly={!editable}
                    allowTemplates={editable}
                    brandColours={brand?.configured ? [brand.primaryColor, brand.secondaryColor] : []}
                    brandLogo={brandLogoUrl
                      ? {
                        url: brandLogoUrl,
                        load: () => signatureBrandImageFile(brandLogoUrl),
                      }
                      : undefined}
                    onUpload={async (file) => {
                      const asset = await uploadSignatureImage(
                        file,
                        !!selected.ownerUserId,
                      );
                      setWorkspace((w) =>
                        w
                          ? {
                            ...w,
                            assetUrls: {
                              ...w.assetUrls,
                              [asset.id]: asset.url,
                            },
                          }
                          : w
                      );
                      return asset;
                    }}
                  />
                </>
              )
              : null}
            {step === "preview"
              ? (
                <motion.div
                  className="rounded-xl bg-[var(--md-surface)] p-6 shadow-[var(--md-premium-stroke)]"
                  initial={{ opacity: 0, y: reduced ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduced ? 0 : .32, ease: mdEaseOut }}
                >
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[12px] text-[var(--md-subtle)]">
                      {t("How your signature will appear in an email")}
                    </p>
                    <SegmentedControl
                      ariaLabel={t("Preview width")}
                      options={["wide", "narrow"] as const}
                      value={narrow ? "narrow" : "wide"}
                      onChange={(value) => setNarrow(value === "narrow")}
                      className="[&>button]:h-7 [&>button]:text-[12px]"
                      renderOption={(value) => {
                        const Icon = value === "wide" ? Laptop : Smartphone;
                        return <><Icon className="size-3.5" />{t(value === "wide" ? "Desktop" : "Mobile")}</>;
                      }}
                    />
                  </div>
                  <div className="flex justify-center">
                    <Preview html={rendered!.html} narrow={narrow} />
                  </div>
                  <p className="mt-5 text-center text-[11px] text-[var(--md-subtle)]">
                    {t(
                      "Email clients can vary. Test a real email before rolling out a new design.",
                    )}
                  </p>
                </motion.div>
              )
              : null}
            {step === "assign"
              ? (
                <motion.div
                  className="grid gap-6 rounded-xl bg-[var(--md-surface)] p-6 shadow-[var(--md-premium-stroke)] lg:grid-cols-[1fr_1fr]"
                  initial={{ opacity: 0, y: reduced ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduced ? 0 : .32, ease: mdEaseOut }}
                >
                  <div>
                    <h2 className="text-[15px] font-medium">
                      {t("Who should use this signature?")}
                    </h2>
                    <p className="mb-5 mt-2 text-[12px] text-[var(--md-subtle)]">
                      {t(
                        "Individual assignments take priority over departments, then the company default. People choose when several signatures apply.",
                      )}
                    </p>
                    {[
                      {
                        kind: "everyone" as const,
                        id: null,
                        name: t("Everyone"),
                        email: "",
                      },
                      ...workspace.departments.map((d) => ({
                        kind: "department" as const,
                        ...d,
                        email: "",
                      })),
                      ...workspace.people.map((p) => ({
                        kind: "user" as const,
                        id: p.id,
                        name: p.name,
                        email: p.email,
                      })),
                    ].map((a) => (
                      <label
                        key={`${a.kind}:${a.id}`}
                        className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-[12px] transition-colors hover:bg-[var(--md-hover)]"
                      >
                        <Checkbox
                          checked={selected.assignments.some((x) =>
                            x.kind === a.kind && x.id === a.id
                          )}
                          onCheckedChange={(checked) =>
                            edit({
                              assignments: checked === true
                                ? [...selected.assignments, {
                                  kind: a.kind,
                                  id: a.id,
                                }]
                                : selected.assignments.filter((x) =>
                                  x.kind !== a.kind || x.id !== a.id
                                ),
                            })}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block">
                            {a.name}
                            {a.kind === "user" && a.id === workspace.userId
                              ? ` (${t("You")})`
                              : ""}
                          </span>
                          {a.email
                            ? (
                              <span className="block truncate text-[11px] text-[var(--md-subtle)]">
                                {a.email}
                              </span>
                            )
                            : null}
                        </span>
                        <span className="text-[10px] text-[var(--md-subtle)]">
                          {a.kind === "department"
                            ? t("Department")
                            : a.kind === "user"
                            ? t("Person")
                            : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <div className="mb-3 text-[12px] font-medium">
                      {affected.length} {t(
                        affected.length === 1
                          ? "person included"
                          : "people included",
                      )}
                    </div>
                    <AnimatePresence initial={false}>
                      {affected.map((p) => (
                        <motion.div
                          key={p.id}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: reduced ? 0 : .24, ease: mdEaseOut }}
                          className="overflow-hidden"
                        >
                          <div className="flex items-center gap-2.5 py-2 text-[12px]">
                            {usesPersonPhoto
                              ? p.photoUrl
                                ? <img src={p.photoUrl} alt="" className="size-6 shrink-0 rounded-full object-cover" />
                                : <span aria-hidden className="size-6 shrink-0 rounded-full bg-[var(--md-hover)]" />
                              : null}
                            <span className="min-w-0 flex-1 truncate">{p.name}</span>
                            {usesPersonPhoto && !p.photoUrl
                              ? (
                                <span className="shrink-0 text-[11px] text-[var(--md-subtle)]">
                                  {t(p.photoStatus === "too_large" ? "Photo over 2 MB" : "No profile photo")}
                                </span>
                              )
                              : <Check className="size-3.5 text-[var(--md-accent)]" />}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {!affected.length
                      ? (
                        <p className="sig-hint">
                          {t(
                            "Choose an audience. The design can stay unassigned until you are ready.",
                          )}
                        </p>
                      )
                      : null}
                  </div>
                </motion.div>
              )
              : null}
          </>
        )}
      <SignatureTemplatePicker
        open={picker}
        onOpenChange={setPicker}
        accent={accent}
        values={values}
        brandLogoUrl={brandLogoUrl}
        onChoose={(document, templateId) => create(document, { name: templateId ? signatureStarter(templateId)?.name : undefined })}
      />
      <Dialog open={review} onOpenChange={setReview}>
        <DialogContent className="max-w-[720px]">
          <DialogTitle>{t("Apply this signature")}</DialogTitle>
          <DialogDescription>
            {selected?.ownerUserId
              ? t(
                "Your personal signature will be available in every Multideck composer.",
              )
              : t(
                "This version will be used for new emails by the people assigned to it. Saved emails keep their reviewed version until refreshed.",
              )}
          </DialogDescription>
          {error
            ? (
              <p role="alert" className="text-[12px] text-[var(--md-red)]">
                {error}
              </p>
            )
            : null}
          {rendered ? <Preview html={rendered.html} /> : null}
          <p className="text-[12px] text-[var(--md-subtle)]">
            {selected?.ownerUserId
              ? t("Only you")
              : `${affected.length} ${
                t(affected.length === 1 ? "person included" : "people included")
              }`}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReview(false)}>
              {t("Keep editing")}
            </Button>
            <Button
              disabled={saving}
              onClick={() =>
                void save(true).then((result) => {
                  if (result) {
                    setReview(false);
                    setStep("preview");
                  }
                })}
            >
              {saving ? t("Applying…") : t("Apply signature")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!versions}
        onOpenChange={(open) => {
          if (!open) setVersions(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{t("Published versions")}</DialogTitle>
          <DialogDescription>
            {t("Restore a version as a draft, then review and apply it.")}
          </DialogDescription>
          {versions?.map((v) => (
            <button
              key={v.revision}
              className="flex min-h-11 items-center justify-between rounded p-2 text-[12px] hover:bg-[var(--md-surface-soft)]"
              onClick={() => {
                edit({ document: v.document, assignments: v.assignments });
                setVersions(null);
                setStep("design");
              }}
            >
              <span>{t("Version")} {v.revision}</span>
              <span>{new Date(v.created_at).toLocaleDateString("en-GB")}</span>
            </button>
          ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
