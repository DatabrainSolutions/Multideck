import { type ReactNode, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlignMiddle,
  AlignTop,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  FacebookBrand,
  InstagramBrand,
  LinkedinBrand,
  Plus,
  TextAlignCenter,
  TextAlignLeft,
  TextAlignRight,
  TextAllCaps,
  TextBold,
  TextItalic,
  TiktokBrand,
  Trash2,
  Upload,
  WhatsappBrand,
  X,
  XBrand,
  YoutubeBrand,
  type LucideIcon,
} from "@/components/icons/hugeicons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SegmentedControl } from "./workflow-components";
import { SignatureBlockGlyph } from "./signature-block-glyph";
import { SwatchPicker } from "./swatch-picker";
import { ValueSlider } from "./value-slider";
import { useLanguage } from "@/i18n/language-provider";
import { mdEaseOut } from "@/lib/motion";
import {
  signatureFields,
  signatureFonts,
  signatureImageUrl,
  signatureUsesPersonPhoto,
  signatureNetworks,
  type SignatureBlock,
  type SignatureDocument,
  type SignatureField,
  type SignatureFont,
  type SignatureNetwork,
  type SignatureRow,
} from "@/lib/email-signatures";
import { signatureBlockGlyph, signatureBlockLabel } from "@/lib/signature-blocks";

export type CommitMode = "step" | "live" | "settle";
export type Swatch = { value: string; label: string };
type Direction = "up" | "down" | "left" | "right";

const networkIcons: Record<SignatureNetwork, LucideIcon> = {
  linkedin: LinkedinBrand,
  x: XBrand,
  facebook: FacebookBrand,
  instagram: InstagramBrand,
  youtube: YoutubeBrand,
  tiktok: TiktokBrand,
  whatsapp: WhatsappBrand,
};
const detailFieldOrder: SignatureField[] = ["phone", "mobile", "email", "website", "address", "company", "jobTitle", "name"];
const textKinds = new Set(["identity", "contact", "text", "details"]);
const alignable = new Set(["identity", "contact", "text", "details", "image", "badges", "socials", "button", "divider"]);

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="sig-prop-section">
      <div className="sig-prop-section-head">
        <h3>{title}</h3>
        {action}
      </div>
      <div className="sig-prop-stack">{children}</div>
    </section>
  );
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="sig-field">
      <span>{label}</span>
      {children}
      {hint ? <span className="sig-field-hint">{hint}</span> : null}
    </label>
  );
}
function IconAction({ label, onClick, disabled, children, tone }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; tone?: "danger" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`sig-icon-action ${tone === "danger" ? "is-danger" : ""}`}
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
function Toggle({ label, pressed, onChange, disabled, icon: Icon }: { label: string; pressed: boolean; onChange: (value: boolean) => void; disabled?: boolean; icon: LucideIcon }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          className="sig-format-toggle"
          onClick={() => onChange(!pressed)}
        >
          <Icon className="size-3.5" strokeWidth={pressed ? 2 : 1.6} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function UploadZone({ label, busy, disabled, multiple, onFiles }: { label: string; busy: boolean; disabled: boolean; multiple?: boolean; onFiles: (files: File[]) => void }) {
  const { t } = useLanguage();
  const [over, setOver] = useState(false);
  return (
    <label
      className={`sig-upload ${over ? "is-over" : ""} ${busy ? "is-busy" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (!disabled && !busy) onFiles(Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/")));
      }}
    >
      <Upload className="size-4" />
      <span>{busy ? t("Uploading…") : label}</span>
      <span className="sig-upload-hint">{t("PNG, JPG, GIF or WebP · up to 2 MB")}</span>
      <input
        className="sr-only"
        type="file"
        multiple={multiple}
        accept="image/png,image/jpeg,image/webp,image/gif"
        disabled={disabled || busy}
        onChange={(event) => {
          onFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
    </label>
  );
}

export function SignaturePropertiesPanel({
  doc,
  block,
  row,
  readOnly,
  assets,
  uploading,
  error,
  swatches,
  backgrounds,
  canMove,
  onDismissError,
  editBlock,
  editDoc,
  editRow,
  setColumns,
  onRecolour,
  onUpload,
  onUploadBadges,
  onImportBrand,
  onClose,
  onDelete,
  onDuplicate,
  onMove,
}: {
  doc: SignatureDocument;
  block: SignatureBlock | null;
  row: SignatureRow | null;
  readOnly: boolean;
  assets: Record<string, string>;
  uploading: boolean;
  error: string;
  swatches: Swatch[];
  backgrounds: Swatch[];
  canMove: Record<Direction, boolean>;
  onDismissError: () => void;
  editBlock: (patch: Partial<SignatureBlock>, mode?: CommitMode) => void;
  editDoc: (patch: Partial<SignatureDocument>, mode?: CommitMode) => void;
  editRow: (patch: Partial<SignatureRow>, mode?: CommitMode) => void;
  setColumns: (count: number) => void;
  onRecolour: (accent: string, mode?: CommitMode) => void;
  onUpload: (file: File) => void;
  onUploadBadges: (files: File[]) => void;
  onImportBrand?: () => void;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (direction: Direction) => void;
}) {
  const { t } = useLanguage();
  const reduced = useReducedMotion();
  const slider = (key: keyof SignatureBlock) => ({
    onChange: (value: number) => editBlock({ [key]: value }, "live"),
    onCommit: (value: number) => editBlock({ [key]: value }, "settle"),
    disabled: readOnly,
  });
  const colour = (key: "colour" | "fill") => ({
    swatches,
    onChange: (value: string) => editBlock({ [key]: value }, "live"),
    onCommit: (value: string) => editBlock({ [key]: value }, "settle"),
    disabled: readOnly,
  });
  const transition = { duration: reduced ? 0 : .26, ease: mdEaseOut };
  const shapeValue = (radius = 0) => radius >= 999 ? "circle" : radius > 0 ? "rounded" : "square";
  const b = block;
  return (
    <aside className="sig-properties" aria-label={t(b ? "Block properties" : "Signature settings")}>
      <AnimatePresence mode="popLayout" initial={false}>
        {b
          ? (
            <motion.div
              key={b.id}
              className="sig-prop-body"
              initial={{ opacity: 0, x: reduced ? 0 : 10, filter: reduced ? "none" : "blur(3px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: reduced ? 0 : -6, transition: { duration: reduced ? 0 : .12 } }}
              transition={transition}
            >
              <header className="sig-prop-header">
                <SignatureBlockGlyph kind={signatureBlockGlyph(b)} className="is-small" />
                <div className="min-w-0 flex-1">
                  <div className="sig-prop-title">{t(signatureBlockLabel(b))}</div>
                  <div className="sig-prop-subtitle">{t("Selected block")}</div>
                </div>
                <IconAction label={t("Duplicate block")} disabled={readOnly} onClick={onDuplicate}><Copy className="size-3.5" /></IconAction>
                <IconAction label={t("Remove block")} disabled={readOnly} onClick={onDelete} tone="danger"><Trash2 className="size-3.5" /></IconAction>
                <IconAction label={t("Close block properties")} onClick={onClose}><X className="size-3.5" /></IconAction>
              </header>

              {b.kind === "image"
                ? (
                  <Section title={t("Image")}>
                    {b.imageRole === "photo"
                      ? (
                        <div className="sig-field">
                          <span>{t("Photo")}</span>
                          <SegmentedControl
                            className="w-full [&>button]:flex-1"
                            ariaLabel={t("Photo")}
                            disabled={readOnly}
                            options={["person", "upload"] as const}
                            value={signatureUsesPersonPhoto(b) ? "person" : "upload"}
                            onChange={(value) => editBlock({ imageSource: value })}
                            renderOption={(value) => t(value === "person" ? "Each person" : "One image")}
                          />
                          <span className="sig-field-hint">
                            {t(signatureUsesPersonPhoto(b)
                              ? "Uses the profile photo each person sets in Settings. People without one show the fallback image, or no headshot."
                              : "Everyone assigned this signature shows the image you upload.")}
                          </span>
                        </div>
                      )
                      : null}
                    {signatureImageUrl(b, assets)
                      ? <img className={`sig-upload-preview is-${shapeValue(b.radius)}`} src={signatureImageUrl(b, assets)} alt={b.alt} />
                      : null}
                    <UploadZone
                      label={t(signatureUsesPersonPhoto(b)
                        ? b.assetId ? "Replace fallback image" : "Upload fallback image"
                        : b.assetId ? "Replace image" : b.imageRole === "photo" ? "Upload headshot" : b.imageRole === "banner" ? "Upload banner" : "Upload image")}
                      busy={uploading}
                      disabled={readOnly}
                      onFiles={([file]) => file && onUpload(file)}
                    />
                    {onImportBrand && b.imageRole !== "photo"
                      ? (
                        <Button variant="outline" size="sm" disabled={readOnly || uploading} onClick={onImportBrand}>
                          <Upload className="size-3.5" />
                          {t("Use brand logo")}
                        </Button>
                      )
                      : null}
                    <Field
                      label={t("Image description")}
                      hint={t(signatureUsesPersonPhoto(b)
                        ? "Read aloud by screen readers. Leave blank to use each person's name."
                        : "Read aloud by screen readers and shown when images are blocked.")}
                    >
                      <Input value={b.alt} disabled={readOnly} onChange={(event) => editBlock({ alt: event.target.value })} />
                    </Field>
                    <ValueSlider label={t("Width")} value={b.width} min={24} max={doc.width} unit="px" marks={[64, 120, 240]} {...slider("width")} />
                    <div className="sig-field">
                      <span>{t("Shape")}</span>
                      <SegmentedControl
                        className="w-full [&>button]:flex-1"
                        ariaLabel={t("Shape")}
                        disabled={readOnly}
                        options={["square", "rounded", "circle"] as const}
                        value={shapeValue(b.radius)}
                        onChange={(value) => editBlock({ radius: value === "circle" ? 999 : value === "rounded" ? 8 : 0 })}
                        renderOption={(value) => t(value === "square" ? "Square" : value === "rounded" ? "Rounded" : "Circle")}
                      />
                    </div>
                    <Field label={t("Link (optional)")}>
                      <Input type="url" placeholder="https://" value={b.href} disabled={readOnly} onChange={(event) => editBlock({ href: event.target.value })} />
                    </Field>
                  </Section>
                )
                : null}

              {b.kind === "badges"
                ? (
                  <Section title={t("Badges")}>
                    <p className="sig-hint">{t("Accreditations, memberships and awards, displayed together in one row.")}</p>
                    <UploadZone label={t("Upload badges")} busy={uploading} disabled={readOnly} multiple onFiles={onUploadBadges} />
                    {(b.images || []).map((image, index) => (
                      <div className="sig-badge-editor" key={`${image.assetId}-${index}`}>
                        <img src={assets[image.assetId]} alt={image.alt} />
                        <Input
                          aria-label={`${t("Badge description")} ${index + 1}`}
                          placeholder={t("Badge description")}
                          disabled={readOnly}
                          value={image.alt}
                          onChange={(event) => editBlock({ images: b.images!.map((item, i) => i === index ? { ...item, alt: event.target.value } : item) })}
                        />
                        <IconAction label={`${t("Remove badge")} ${index + 1}`} disabled={readOnly} tone="danger" onClick={() => editBlock({ images: b.images!.filter((_, i) => i !== index) })}>
                          <Trash2 className="size-3.5" />
                        </IconAction>
                      </div>
                    ))}
                    <ValueSlider label={t("Badge width")} value={b.width} min={24} max={120} unit="px" {...slider("width")} />
                  </Section>
                )
                : null}

              {b.kind === "identity" || b.kind === "contact" || b.kind === "text" || b.kind === "social"
                ? (
                  <Section title={t("Content")}>
                    <Field label={t("Shows")}>
                      <Select
                        value={b.field || "__custom"}
                        disabled={readOnly}
                        onValueChange={(value) => editBlock({ field: (value === "__custom" ? "" : value) as SignatureBlock["field"] })}
                      >
                        <SelectTrigger aria-label={t("Shows")} className="w-full min-w-0 text-[12px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__custom">{t("Custom text")}</SelectItem>
                          {Object.entries(signatureFields).map(([key, label]) => <SelectItem key={key} value={key}>{t(label)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    {b.field
                      ? <div className="sig-variable-chip"><span className="sig-variable-dot" />{t("Fills in for each sender")}</div>
                      : (
                        <Field label={t("Text")}>
                          <textarea rows={3} value={b.text} disabled={readOnly} onChange={(event) => editBlock({ text: event.target.value })} />
                        </Field>
                      )}
                    {b.kind === "contact" || b.label
                      ? (
                        <Field label={t("Label (optional)")}>
                          <Input value={b.label} placeholder={t("For example, T")} disabled={readOnly} onChange={(event) => editBlock({ label: event.target.value })} />
                        </Field>
                      )
                      : null}
                    <Field label={t("Link (optional)")}>
                      <Input type="url" placeholder="https://" value={b.href} disabled={readOnly} onChange={(event) => editBlock({ href: event.target.value })} />
                    </Field>
                  </Section>
                )
                : null}

              {b.kind === "details"
                ? (
                  <Section title={t("Details")}>
                    <div className="sig-chip-list" role="group" aria-label={t("Details shown")}>
                      <AnimatePresence initial={false} mode="popLayout">
                        {(b.fields || []).map((field) => (
                          <motion.button
                            layout
                            key={field}
                            type="button"
                            className="sig-chip is-on"
                            disabled={readOnly}
                            initial={{ opacity: 0, scale: .85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: .85 }}
                            transition={{ duration: reduced ? 0 : .2, ease: mdEaseOut }}
                            aria-label={`${t("Remove")} ${t(signatureFields[field])}`}
                            onClick={() => editBlock({ fields: (b.fields || []).filter((item) => item !== field) })}
                          >
                            {t(signatureFields[field])}
                            <X className="size-3" />
                          </motion.button>
                        ))}
                        {detailFieldOrder.filter((field) => !(b.fields || []).includes(field)).map((field) => (
                          <motion.button
                            layout
                            key={field}
                            type="button"
                            className="sig-chip"
                            disabled={readOnly}
                            initial={{ opacity: 0, scale: .85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: .85 }}
                            transition={{ duration: reduced ? 0 : .2, ease: mdEaseOut }}
                            aria-label={`${t("Add")} ${t(signatureFields[field])}`}
                            onClick={() => editBlock({ fields: [...(b.fields || []), field] })}
                          >
                            <Plus className="size-3" />
                            {t(signatureFields[field])}
                          </motion.button>
                        ))}
                      </AnimatePresence>
                    </div>
                    <p className="sig-hint">{t("Empty details are hidden for anyone who has not filled them in.")}</p>
                    <div className="sig-field">
                      <span>{t("Arrangement")}</span>
                      <SegmentedControl className="w-full [&>button]:flex-1" ariaLabel={t("Arrangement")} disabled={readOnly} options={["stacked", "inline"] as const} value={b.layout ?? "stacked"} onChange={(layout) => editBlock({ layout })} renderOption={(value) => t(value === "stacked" ? "Stacked" : "One line")} />
                    </div>
                    <div className="sig-field">
                      <span>{t("Labels")}</span>
                      <SegmentedControl className="w-full [&>button]:flex-1" ariaLabel={t("Labels")} disabled={readOnly} options={["none", "short", "full"] as const} value={b.labels ?? "short"} onChange={(labels) => editBlock({ labels })} renderOption={(value) => value === "none" ? t("None") : value === "short" ? "T · E" : t("Phone")} />
                    </div>
                    {b.labels !== "none" ? <SwatchPicker label={t("Label colour")} value={b.fill || b.colour} {...colour("fill")} /> : null}
                  </Section>
                )
                : null}

              {b.kind === "socials"
                ? (
                  <Section title={t("Profiles")}>
                    <AnimatePresence initial={false}>
                      {(b.links || []).map((link, index) => {
                        const Icon = networkIcons[link.network];
                        return (
                          <motion.div
                            key={link.network}
                            className="sig-social-row"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: reduced ? 0 : .24, ease: mdEaseOut }}
                          >
                            <span className="sig-social-mark" title={signatureNetworks[link.network].label}><Icon className="size-3.5" /></span>
                            <Input
                              type="url"
                              aria-label={`${signatureNetworks[link.network].label} ${t("link")}`}
                              placeholder={`${signatureNetworks[link.network].label} URL`}
                              value={link.href}
                              disabled={readOnly}
                              onChange={(event) => editBlock({ links: b.links!.map((item, i) => i === index ? { ...item, href: event.target.value } : item) })}
                            />
                            <IconAction label={`${t("Remove")} ${signatureNetworks[link.network].label}`} disabled={readOnly} onClick={() => editBlock({ links: b.links!.filter((_, i) => i !== index) })}>
                              <X className="size-3" />
                            </IconAction>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                    <div className="sig-chip-list">
                      {(Object.keys(signatureNetworks) as SignatureNetwork[]).filter((network) => !(b.links || []).some((link) => link.network === network)).map((network) => {
                        const Icon = networkIcons[network];
                        return (
                          <button key={network} type="button" className="sig-chip" disabled={readOnly} onClick={() => editBlock({ links: [...(b.links || []), { network, href: "" }] })}>
                            <Icon className="size-3" />
                            {signatureNetworks[network].label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="sig-hint">{t("Profiles without a link stay hidden in sent email.")}</p>
                    <div className="sig-field">
                      <span>{t("Style")}</span>
                      <SegmentedControl className="w-full [&>button]:flex-1" ariaLabel={t("Style")} disabled={readOnly} options={["badges", "text"] as const} value={b.variant ?? "badges"} onChange={(variant) => editBlock({ variant })} renderOption={(value) => t(value === "badges" ? "Icons" : "Text links")} />
                    </div>
                    {b.variant !== "text"
                      ? (
                        <>
                          <label className="sig-switch-row">
                            <span>{t("Use each network's colour")}</span>
                            <Switch checked={b.fill === ""} disabled={readOnly} onCheckedChange={(checked) => editBlock({ fill: checked ? "" : doc.accent ?? "#0e7d74" })} />
                          </label>
                          {b.fill !== "" ? <SwatchPicker label={t("Icon colour")} value={b.fill || "#0e7d74"} {...colour("fill")} /> : null}
                          <ValueSlider label={t("Icon size")} value={b.size} min={10} max={28} unit="px" {...slider("size")} />
                        </>
                      )
                      : null}
                  </Section>
                )
                : null}

              {b.kind === "button"
                ? (
                  <Section title={t("Button")}>
                    <Field label={t("Label")}>
                      <Input value={b.text} maxLength={60} disabled={readOnly} onChange={(event) => editBlock({ text: event.target.value })} />
                    </Field>
                    <Field label={t("Opens")} hint={b.href ? undefined : t("Add a link so the button takes people somewhere.")}>
                      <Input type="url" placeholder="https://" value={b.href} disabled={readOnly} onChange={(event) => editBlock({ href: event.target.value })} />
                    </Field>
                    <SwatchPicker label={t("Button colour")} value={b.fill || "#0e7d74"} {...colour("fill")} />
                    <SwatchPicker label={t("Text colour")} value={b.colour} {...colour("colour")} />
                    <div className="sig-field">
                      <span>{t("Shape")}</span>
                      <SegmentedControl className="w-full [&>button]:flex-1" ariaLabel={t("Shape")} disabled={readOnly} options={["square", "rounded", "circle"] as const} value={shapeValue(b.radius)} onChange={(value) => editBlock({ radius: value === "circle" ? 999 : value === "rounded" ? 6 : 0 })} renderOption={(value) => t(value === "square" ? "Square" : value === "rounded" ? "Rounded" : "Pill")} />
                    </div>
                    <ValueSlider label={t("Size")} value={b.size} min={10} max={20} unit="px" {...slider("size")} />
                  </Section>
                )
                : null}

              {b.kind === "divider"
                ? (
                  <Section title={t("Divider")}>
                    <SwatchPicker label={t("Colour")} value={b.colour} {...colour("colour")} />
                    <ValueSlider label={t("Thickness")} value={b.thickness ?? 1} min={1} max={8} unit="px" {...slider("thickness")} />
                    <ValueSlider label={t("Length")} value={b.length ?? 100} min={5} max={100} unit="%" marks={[25, 50, 75]} {...slider("length")} />
                  </Section>
                )
                : null}

              {textKinds.has(b.kind) || b.kind === "socials" && b.variant === "text"
                ? (
                  <Section title={t("Style")}>
                    <SwatchPicker label={t("Colour")} value={b.colour} {...colour("colour")} />
                    <ValueSlider label={t("Text size")} value={b.size} min={10} max={28} unit="px" marks={[12, 14, 18]} {...slider("size")} />
                    <div className="sig-format-row">
                      <div className="sig-format-group" role="group" aria-label={t("Text style")}>
                        <Toggle label={t("Bold")} icon={TextBold} pressed={b.bold} disabled={readOnly} onChange={(bold) => editBlock({ bold })} />
                        <Toggle label={t("Italic")} icon={TextItalic} pressed={!!b.italic} disabled={readOnly} onChange={(italic) => editBlock({ italic })} />
                        <Toggle label={t("Capitals")} icon={TextAllCaps} pressed={!!b.caps} disabled={readOnly} onChange={(caps) => editBlock({ caps })} />
                      </div>
                    </div>
                  </Section>
                )
                : null}

              <Section title={t("Arrange")}>
                {alignable.has(b.kind)
                  ? (
                    <div className="sig-field">
                      <span>{t("Alignment")}</span>
                      <SegmentedControl
                        className="w-full [&>button]:flex-1"
                        ariaLabel={t("Alignment")}
                        disabled={readOnly}
                        options={["left", "center", "right"] as const}
                        value={b.align}
                        onChange={(align) => editBlock({ align })}
                        renderOption={(value) => {
                          const Icon = value === "left" ? TextAlignLeft : value === "center" ? TextAlignCenter : TextAlignRight;
                          return <><Icon className="size-3.5" /><span className="sr-only">{t(value === "left" ? "Left" : value === "center" ? "Centre" : "Right")}</span></>;
                        }}
                      />
                    </div>
                  )
                  : null}
                <ValueSlider
                  label={t(b.kind === "spacer" ? "Height" : "Spacing above and below")}
                  value={b.padding}
                  min={0}
                  max={b.kind === "spacer" ? 48 : 40}
                  unit="px"
                  {...slider("padding")}
                />
                <div className="sig-field">
                  <span>{t("Move block")}</span>
                  <div className="sig-move-pad">
                    {([["up", ArrowUp], ["down", ArrowDown], ["left", ArrowLeft], ["right", ArrowRight]] as const).map(([direction, Icon]) => (
                      <IconAction key={direction} label={`${t("Move block")} ${t(direction)}`} disabled={readOnly || !canMove[direction]} onClick={() => onMove(direction)}>
                        <Icon className="size-3.5" />
                      </IconAction>
                    ))}
                  </div>
                </div>
              </Section>

              {row ? <RowSettings row={row} readOnly={readOnly} editRow={editRow} setColumns={setColumns} /> : null}
            </motion.div>
          )
          : (
            <motion.div
              key="signature"
              className="sig-prop-body"
              initial={{ opacity: 0, x: reduced ? 0 : -8, filter: reduced ? "none" : "blur(3px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, transition: { duration: reduced ? 0 : .12 } }}
              transition={transition}
            >
              <header className="sig-prop-header">
                <div className="min-w-0 flex-1">
                  <div className="sig-prop-title">{t("Signature style")}</div>
                  <div className="sig-prop-subtitle">{t("Select a block to edit it")}</div>
                </div>
              </header>
              <Section title={t("Brand")}>
                <SwatchPicker
                  label={t("Accent colour")}
                  value={doc.accent ?? "#0e7d74"}
                  swatches={swatches.filter((swatch) => !["#ffffff", "#dfe5e3"].includes(swatch.value))}
                  disabled={readOnly}
                  onChange={(value) => onRecolour(value, "live")}
                  onCommit={(value) => onRecolour(value, "settle")}
                />
                <p className="sig-hint">{t("Recolours every label, rule and button using the current accent.")}</p>
                <Field label={t("Typeface")}>
                  <Select value={doc.font ?? "arial"} disabled={readOnly} onValueChange={(font) => editDoc({ font: font as SignatureFont })}>
                    <SelectTrigger aria-label={t("Typeface")} className="w-full min-w-0 text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(signatureFonts) as SignatureFont[]).map((font) => (
                        <SelectItem key={font} value={font}>
                          <span style={{ fontFamily: signatureFonts[font].stack }}>{signatureFonts[font].label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <p className="sig-hint">{t("Email-safe fonts only, so every recipient sees the same type.")}</p>
              </Section>
              <Section title={t("Canvas")}>
                <SwatchPicker
                  label={t("Background")}
                  value={doc.colour}
                  swatches={backgrounds}
                  disabled={readOnly}
                  onChange={(value) => editDoc({ colour: value }, "live")}
                  onCommit={(value) => editDoc({ colour: value }, "settle")}
                />
                <ValueSlider label={t("Width")} value={doc.width} min={240} max={640} unit="px" marks={[320, 480, 600]} disabled={readOnly} onChange={(width) => editDoc({ width }, "live")} onCommit={(width) => editDoc({ width }, "settle")} />
                <ValueSlider label={t("Inner padding")} value={doc.padding ?? 0} min={0} max={40} unit="px" disabled={readOnly} onChange={(padding) => editDoc({ padding }, "live")} onCommit={(padding) => editDoc({ padding }, "settle")} />
                <ValueSlider label={t("Corner radius")} value={doc.radius ?? 0} min={0} max={24} unit="px" disabled={readOnly} onChange={(radius) => editDoc({ radius }, "live")} onCommit={(radius) => editDoc({ radius }, "settle")} />
                <ValueSlider label={t("Column spacing")} value={doc.columnGap ?? 20} min={0} max={48} unit="px" marks={[12, 20, 32]} disabled={readOnly} onChange={(columnGap) => editDoc({ columnGap }, "live")} onCommit={(columnGap) => editDoc({ columnGap }, "settle")} />
              </Section>
            </motion.div>
          )}
      </AnimatePresence>
      <AnimatePresence>
        {error
          ? (
            <motion.p
              role="alert"
              className="sig-prop-error"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: reduced ? 0 : .2, ease: mdEaseOut }}
            >
              <span>{error}</span>
              <button type="button" onClick={onDismissError}>{t("Dismiss")}</button>
            </motion.p>
          )
          : null}
      </AnimatePresence>
    </aside>
  );
}

function RowSettings({ row, readOnly, editRow, setColumns }: { row: SignatureRow; readOnly: boolean; editRow: (patch: Partial<SignatureRow>, mode?: CommitMode) => void; setColumns: (count: number) => void }) {
  const { t } = useLanguage();
  return (
    <Section title={t("Row")}>
      <div className="sig-field">
        <span>{t("Columns")}</span>
        <SegmentedControl className="w-full [&>button]:flex-1" ariaLabel={t("Columns")} disabled={readOnly} options={["1", "2", "3", "4"] as const} value={String(row.columns.length) as "1"} onChange={(value) => setColumns(Number(value))} />
      </div>
      {row.columns.length > 1
        ? (
          <>
            <div className="sig-field">
              <span>{t("Vertical alignment")}</span>
              <SegmentedControl
                className="w-full [&>button]:flex-1"
                ariaLabel={t("Vertical alignment")}
                disabled={readOnly}
                options={["top", "middle"] as const}
                value={row.valign ?? "top"}
                onChange={(valign) => editRow({ valign })}
                renderOption={(value) => {
                  const Icon = value === "top" ? AlignTop : AlignMiddle;
                  return <><Icon className="size-3.5" />{t(value === "top" ? "Top" : "Middle")}</>;
                }}
              />
            </div>
            <label className="sig-switch-row">
              <span>{t("Rule between columns")}</span>
              <Switch checked={!!row.rule} disabled={readOnly} onCheckedChange={(checked) => editRow({ rule: checked ? "#dfe5e3" : undefined })} />
            </label>
          </>
        )
        : null}
    </Section>
  );
}
