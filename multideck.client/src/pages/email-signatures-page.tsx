import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Archive,
  ArrowLeft,
  Check,
  Copy,
  Eye,
  History,
  PenLine,
  Plus,
  RefreshCw,
  Settings2,
  Users,
  X,
} from "@/components/icons/hugeicons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { DotGridLoader } from "@/components/multideck/dot-grid-loader";
import { SignatureBuilder } from "@/components/multideck/signature-builder";
import { SignatureBlockGlyph } from "@/components/multideck/signature-block-glyph";
import { useLanguage } from "@/i18n/language-provider";
import {
  eligibleSignatures,
  getSignatureVersions,
  getSignatureWorkspace,
  newSignatureDocument,
  renderSignature,
  signatureCompanyText,
  saveSignatureTemplate,
  type SignatureDocument,
  type SignatureTemplate,
  type SignatureValues,
  type SignatureWorkspace,
  updateSignaturePolicy,
  updateSignatureProfile,
  uploadSignatureImage,
  validateSignatureDocument,
} from "@/lib/email-signatures";
import {
  getTenantBranding,
  type TenantBranding,
} from "@/lib/tenant-branding-api";
import { getSupabaseSession } from "@/lib/supabase";
import { signatureBrandImageFile } from "@/lib/email-signatures";
import "@/styles/email-signatures.css";

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
      className="block h-[300px] max-w-full rounded-lg border-0 bg-white shadow-[0_0_0_1px_#0000000a]"
      style={{ width: narrow ? 320 : 620 }}
      srcDoc={`<!doctype html><html><head><meta name="color-scheme" content="light"><style>body{margin:24px;font-family:Arial,Helvetica,sans-serif;color:#253c39}table{max-width:100%}img{max-width:100%}a{pointer-events:none}</style></head><body>${html}</body></html>`}
    />
  );
}
export function EmailSignaturesPage(
  { personal = false, navigate }: { personal?: boolean; navigate?: (path:string)=>void },
) {
  const { t } = useLanguage();
  const reduced = useReducedMotion();
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
  const [newDialog, setNewDialog] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  function create(
    layout: "side" | "stacked" | "banner",
    source?: SignatureTemplate,
  ) {
    if (!workspace) return;
    const own = personal || !workspace.manager;
    const template: SignatureTemplate = {
      id: crypto.randomUUID(),
      name: source ? `${source.name} ${t("copy")}` : t("Untitled signature"),
      document: structuredClone(
        source?.publishedDocument || source?.document ||
          newSignatureDocument(layout),
      ),
      revision: 0,
      publishedRevision: null,
      publishedDocument: null,
      assignments: [],
      publishedAssignments: [],
      ownerUserId: own ? workspace.userId : null,
      sourceTemplateId: own ? source?.id || null : null,
      archived: false,
      updatedAt: new Date().toISOString(),
    };
    openTemplate(template);
    setDirty(true);
    setNewDialog(false);
  }
  if (loading && !workspace) {
    return (
      <div className="grid min-h-[400px] place-items-center">
        <DotGridLoader />
      </div>
    );
  }
  if (!workspace) {
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
  const person = workspace.people.find((p) => p.id === personId) ||
    workspace.people.find((p) => p.id === workspace.userId)!;
  const values: SignatureValues = {
    companyDetails: signatureCompanyText(workspace.policy.company_details, workspace.company, workspace.policy.website),
    name: person.name,
    jobTitle: person.jobTitle,
    email: person.email,
    phone: person.phone,
    mobile: person.mobile,
    company: person.company ?? workspace.company,
    website: person.website ?? workspace.policy.website,
    address: person.address || "",
  };
  const own = selected?.ownerUserId === workspace.userId;
  const editable = selected
    ? own ? workspace.allowCustomisation : workspace.manager && !personal
    : false;
  const available = personal
    ? workspace.templates.filter((x) =>
      x.ownerUserId === workspace.userId || x.publishedRevision
    )
    : workspace.templates.filter((x) => !x.ownerUserId);
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
    ? renderSignature(selected.document, values, workspace.assetUrls)
    : null;
  async function changePolicy(
    userId: string | undefined,
    allowCustomisation: boolean | null,
  ) {
    try {
      await updateSignaturePolicy({
        userId,
        allowCustomisation,
        website: workspace!.policy.website,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function archive(template: SignatureTemplate) {
    try {
      await saveSignatureTemplate({ ...template, archived: true });
      setSelected(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
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
                  if (dirty) {
                    void save().then((saved) => {
                      if (saved) {
                        setSelected(null);
                        setDirty(false);
                        setError("");
                      }
                    });
                  } else {
                    setSelected(null);
                    setDirty(false);
                    setError("");
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
                      <ArrowRightIcon />
                    </Button>
                  )
                  : workspace.allowCustomisation
                  ? (
                    <Button onClick={() => create("side", selected)}>
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
                {workspace.allowCustomisation || workspace.manager && !personal
                  ? (
                    <Button onClick={() => setNewDialog(true)}>
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
            className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-[var(--md-red-a08)] px-4 py-3 text-[12px] text-[var(--md-red)]"
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
            <p className="mb-6 max-w-xl text-[13px] leading-relaxed text-[var(--md-subtle)]">
              {t(
                personal
                  ? "Your signature, ready wherever you write an email in Multideck."
                  : "Design once. Personal details fill automatically for everyone you assign.",
              )}
            </p>
            {!available.length
              ? (
                <div className="flex min-h-[350px] flex-col items-center justify-center rounded-xl bg-[var(--md-surface)] p-8 text-center shadow-[var(--md-premium-stroke)]">
                  <SignatureBlockGlyph kind="identity" />
                  <h2 className="mt-4 text-[16px] font-medium">
                    {t("A considered sign-off for every email")}
                  </h2>
                  <p className="mb-5 mt-2 max-w-sm text-[12px] leading-relaxed text-[var(--md-subtle)]">
                    {t(
                      "Start with a layout, add your details and images, then choose who uses it.",
                    )}
                  </p>
                  {workspace.allowCustomisation || workspace.manager
                    ? (
                      <Button onClick={() => setNewDialog(true)}>
                        <Plus className="size-4" />
                        {t("Create a signature")}
                      </Button>
                    )
                    : (
                      <p>
                        {t(
                          "Your manager can assign your company signature here.",
                        )}
                      </p>
                    )}
                </div>
              )
              : (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {available.map((template) => {
                    const output = renderSignature(
                      template.document,
                      values,
                      workspace.assetUrls,
                    );
                    return (
                      <motion.article
                        layout
                        key={template.id}
                        transition={{
                          duration: reduced ? 0 : .22,
                          ease: "easeOut",
                        }}
                        className="overflow-hidden rounded-xl bg-[var(--md-surface)] shadow-[var(--md-premium-stroke)]"
                      >
                        <button
                          type="button"
                          onClick={() => openTemplate(template)}
                          className="block w-full p-4 text-left"
                          aria-label={`${t("Open signature")} ${template.name}`}
                        >
                          <div
                            className="sig-library-preview pointer-events-none h-[170px] overflow-hidden rounded-md bg-white"
                            aria-hidden="true"
                          >
                            <div
                              className="sig-library-preview-content origin-top-left scale-[.65] p-6"
                              style={{ width: "153%" }}
                            >
                              <div
                                dangerouslySetInnerHTML={{
                                  __html: output.html,
                                }}
                              />
                            </div>
                          </div>
                          <div className="mt-4 flex items-center justify-between gap-2">
                            <span className="truncate text-[13px] font-medium">
                              {template.name}
                            </span>
                            <span className="text-[10px] text-[var(--md-subtle)]">
                              {t(
                                template.ownerUserId
                                  ? "Personal"
                                  : template.publishedRevision
                                  ? "Live"
                                  : "Draft",
                              )}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-[var(--md-subtle)]">
                            {template.publishedAssignments.some((a) =>
                                a.kind === "everyone"
                              )
                              ? t("Everyone")
                              : template.ownerUserId
                              ? t("Only you")
                              : `${template.publishedAssignments.length} ${
                                t(
                                  template.publishedAssignments.length === 1
                                    ? "assignment"
                                    : "assignments",
                                )
                              }`}
                          </p>
                        </button>
                        <div className="flex items-center justify-between px-3 pb-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => create("side", template)}
                            disabled={personal && !workspace.allowCustomisation}
                          >
                            <Copy className="size-3.5" />
                            {t(personal ? "Personal copy" : "Duplicate")}
                          </Button>
                          {(!template.ownerUserId && workspace.manager &&
                              !personal) ||
                              template.ownerUserId === workspace.userId &&
                                workspace.allowCustomisation
                            ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`${
                                  t(
                                    template.ownerUserId
                                      ? "Reset to assigned signature"
                                      : "Archive",
                                  )
                                } ${template.name}`}
                                title={template.publishedAssignments.length
                                  ? t(
                                    "Remove and apply assignments before archiving",
                                  )
                                  : t("Archive")}
                                disabled={template.publishedAssignments.length >
                                  0}
                                onClick={() => void archive(template)}
                              >
                                <Archive className="size-3.5" />
                              </Button>
                            )
                            : null}
                        </div>
                      </motion.article>
                    );
                  })}
                </div>
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
                    className={`flex min-h-9 items-center gap-2 rounded-md px-3 text-[12px] ${
                      step === stage
                        ? "bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-premium-stroke)]"
                        : "text-[var(--md-subtle)]"
                    }`}
                  >
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
                    onValueChange={(value) => setPersonId((value === "__empty" ? "" : value))}
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
                  </SelectContent></Select>
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
                    assets={workspace.assetUrls}
                    readOnly={!editable}
                    brandLogo={brand?.configured && brand.logoUrl
                      ? {
                        url: brand.logoUrl,
                        load: () => signatureBrandImageFile(brand.logoUrl!),
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
                <div className="rounded-xl bg-[var(--md-surface)] p-6 shadow-[var(--md-premium-stroke)]">
                  <div className="mb-6 flex items-center justify-between">
                    <p className="text-[12px] text-[var(--md-subtle)]">
                      {t("How your signature will appear in an email")}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setNarrow((v) => !v)}
                    >
                      {t(narrow ? "Show wide view" : "Show narrow view")}
                    </Button>
                  </div>
                  <div className="flex justify-center">
                    <Preview html={rendered!.html} narrow={narrow} />
                  </div>
                  <p className="mt-5 text-center text-[11px] text-[var(--md-subtle)]">
                    {t(
                      "Email clients can vary. Test a real email before rolling out a new design.",
                    )}
                  </p>
                </div>
              )
              : null}
            {step === "assign"
              ? (
                <div className="grid gap-6 rounded-xl bg-[var(--md-surface)] p-6 shadow-[var(--md-premium-stroke)] lg:grid-cols-[1fr_1fr]">
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
                        className="flex min-h-10 items-center gap-3 py-2 text-[12px]"
                      >
                        <input
                          type="checkbox"
                          checked={selected.assignments.some((x) =>
                            x.kind === a.kind && x.id === a.id
                          )}
                          onChange={(e) =>
                            edit({
                              assignments: e.target.checked
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
                    <div className="sig-panel-label">
                      {affected.length} {t(
                        affected.length === 1
                          ? "person included"
                          : "people included",
                      )}
                    </div>
                    {affected.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between py-2 text-[12px]"
                      >
                        <span>{p.name}</span>
                        <Check className="size-3.5 text-[var(--md-accent)]" />
                      </div>
                    ))}
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
                </div>
              )
              : null}
          </>
        )}
      <Dialog open={newDialog} onOpenChange={setNewDialog}>
        <DialogContent className="max-w-[680px]">
          <DialogTitle>{t("Start with a layout")}</DialogTitle>
          <DialogDescription>
            {t(
              "Every layout is editable. Add your logo, details and banner in the builder.",
            )}
          </DialogDescription>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["side", "stacked", "banner"] as const).map((layout) => (
              <button
                key={layout}
                className="rounded-lg bg-[var(--md-surface-soft)] p-5 text-left shadow-[var(--md-premium-stroke-soft)]"
                onClick={() => create(layout)}
              >
                <SignatureBlockGlyph
                  kind={layout === "banner" ? "image" : "identity"}
                />
                <div className="mt-3 text-[13px] font-medium">
                  {t(
                    layout === "side"
                      ? "Logo beside details"
                      : layout === "stacked"
                      ? "Clean and stacked"
                      : "With a banner",
                  )}
                </div>
                <p className="mt-2 text-[11px] text-[var(--md-subtle)]">
                  {t("Make it yours")}
                </p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
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
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[85dvh] max-w-[700px] overflow-y-auto">
          <DialogTitle>{t("Signature customisation")}</DialogTitle>
          <DialogDescription>
            {t(
              "Decide who can make a personal copy. Everyone can still turn their signature off for an individual email.",
            )}
          </DialogDescription>
          {error
            ? (
              <p role="alert" className="text-[12px] text-[var(--md-red)]">
                {error}
              </p>
            )
            : null}
          {workspace.manager && !personal
            ? (
              <>
                <label className="flex items-center justify-between text-[13px]">
                  {t("Allow customisation by default")}
                  <input
                    type="checkbox"
                    checked={workspace.policy.allow_customisation}
                    onChange={(e) =>
                      void changePolicy(undefined, e.target.checked)}
                  />
                </label>
                <label className="sig-field">
                  {t("Company website")}
                  <Input
                    value={workspace.policy.website}
                    onChange={(e) =>
                      setWorkspace((w) =>
                        w
                          ? {
                            ...w,
                            policy: { ...w.policy, website: e.target.value },
                          }
                          : w
                      )}
                    onBlur={() =>
                      void changePolicy(
                        undefined,
                        workspace.policy.allow_customisation,
                      )}
                    placeholder="https://"
                  />
                </label>
              </>
            )
            : null}
          {workspace.people.filter((p) =>
            !personal || p.id === workspace.userId
          ).map((p) => (
            <div
              key={p.id}
              className="grid gap-2 border-t border-[var(--md-line)] py-3 sm:grid-cols-[1fr_150px]"
            >
              <span className="text-[12px]">{p.name}</span>
              {workspace.manager && !personal
                ? (
                  <Select
                    value={p.allowCustomisation === null
                      ? "default"
                      : String(p.allowCustomisation)}
                    onValueChange={(value) =>
                      void changePolicy(
                        p.id,
                        (value === "__empty" ? "" : value) === "default"
                          ? null
                          : (value === "__empty" ? "" : value) === "true",
                      )}
>
<SelectTrigger aria-label={t("Personal customisation")} className="w-full min-w-0 text-[12px]"><SelectValue /></SelectTrigger>
<SelectContent>
                    <SelectItem value="default">{t("Company default")}</SelectItem>
                    <SelectItem value="true">{t("Allow personal copy")}</SelectItem>
                    <SelectItem value="false">
                      {t("Company signatures only")}
                    </SelectItem>
                  </SelectContent></Select>
                )
                : null}
              <label className="sig-field !mt-0">
                {t("Work phone")}
                <Input
                  defaultValue={p.phone}
                  onBlur={(e) => {
                    if (e.target.value !== p.phone) {
                      void updateSignatureProfile({
                        userId: p.id,
                        phone: e.target.value,
                        mobile: p.mobile,
                      }).then(load).catch((e) => setError(e.message));
                    }
                  }}
                />
              </label>
              <label className="sig-field !mt-0">
                {t("Mobile")}
                <Input
                  defaultValue={p.mobile}
                  onBlur={(e) => {
                    if (e.target.value !== p.mobile) {
                      void updateSignatureProfile({
                        userId: p.id,
                        phone: p.phone,
                        mobile: e.target.value,
                      }).then(load).catch((e) => setError(e.message));
                    }
                  }}
                />
              </label>
            </div>
          ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function ArrowRightIcon() {
  return <span aria-hidden="true">→</span>;
}
