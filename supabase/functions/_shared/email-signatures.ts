/** Portable signature document contract. No credentials, database or provider code. */
export const signatureFields = {
  name: "Employee name",
  jobTitle: "Job title",
  email: "Sending email",
  phone: "Work phone",
  mobile: "Mobile",
  company: "Company name",
  website: "Company website",
  address: "Office address",
  companyDetails: "Company details",
} as const;
export type SignatureField = keyof typeof signatureFields;
export type SignatureBlockKind =
  | "identity"
  | "contact"
  | "details"
  | "text"
  | "image"
  | "badges"
  | "social"
  | "socials"
  | "button"
  | "divider"
  | "spacer"
  | "import";
export const signatureNetworks = {
  linkedin: { label: "LinkedIn", mark: "in", colour: "#0a66c2" },
  x: { label: "X", mark: "X", colour: "#111111" },
  facebook: { label: "Facebook", mark: "f", colour: "#1877f2" },
  instagram: { label: "Instagram", mark: "IG", colour: "#c13584" },
  youtube: { label: "YouTube", mark: "YT", colour: "#e62117" },
  tiktok: { label: "TikTok", mark: "TT", colour: "#111111" },
  whatsapp: { label: "WhatsApp", mark: "WA", colour: "#1da851" },
} as const;
export type SignatureNetwork = keyof typeof signatureNetworks;
export const signatureFonts = {
  arial: { label: "Arial", stack: "Arial,Helvetica,sans-serif" },
  helvetica: { label: "Helvetica", stack: "'Helvetica Neue',Helvetica,Arial,sans-serif" },
  system: { label: "System", stack: "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" },
  verdana: { label: "Verdana", stack: "Verdana,Geneva,sans-serif" },
  trebuchet: { label: "Trebuchet", stack: "'Trebuchet MS',Tahoma,sans-serif" },
  georgia: { label: "Georgia", stack: "Georgia,'Times New Roman',serif" },
  times: { label: "Times", stack: "'Times New Roman',Times,serif" },
} as const;
export type SignatureFont = keyof typeof signatureFonts;
export type SignatureBlock = {
  id: string;
  kind: SignatureBlockKind;
  text: string;
  field: SignatureField | "";
  label: string;
  assetId: string | null;
  images?: { assetId: string; alt: string; href: string }[];
  href: string;
  alt: string;
  width: number;
  size: number;
  colour: string;
  align: "left" | "center" | "right";
  bold: boolean;
  padding: number;
  /** Accent for buttons, contact-list labels and social badges. Empty uses each network's own colour. */
  fill?: string;
  italic?: boolean;
  caps?: boolean;
  /** Image and button corner radius in pixels; 999 draws a circle. */
  radius?: number;
  thickness?: number;
  /** Divider length as a percentage of its column. */
  length?: number;
  imageRole?: "logo" | "photo" | "banner";
  /** Headshots default to each person's profile photo; "upload" shows the uploaded image to everyone. */
  imageSource?: "person" | "upload";
  fields?: SignatureField[];
  layout?: "stacked" | "inline";
  labels?: "none" | "short" | "full";
  variant?: "badges" | "text";
  links?: { network: SignatureNetwork; href: string }[];
};
export type SignatureRow = {
  id: string;
  columns: SignatureBlock[][];
  columnWidths?: number[];
  valign?: "top" | "middle";
  /** Colour of a vertical rule drawn between columns. */
  rule?: string;
};
export type SignatureDocument = {
  version: 1;
  width: number;
  columnGap?: number;
  colour: string;
  rows: SignatureRow[];
  font?: SignatureFont;
  padding?: number;
  radius?: number;
  accent?: string;
};
export type SignatureValues = Record<Exclude<SignatureField, "companyDetails">, string> & { companyDetails?: string };
export type SignatureCompanyDetails = { name?: string; website?: string; phone?: string; email?: string; address?: string };
export function signatureCompanyText(details: SignatureCompanyDetails = {}, name = "", website = "") {
  return [details.name ?? name, details.website ?? website, details.phone, details.email, details.address].filter(Boolean).join("\n");
}
export type SignatureSelection = {
  enabled: boolean;
  templateId: string | null;
  revision: number | null;
  fingerprint: string | null;
};
export type SignatureAssignment = {
  kind: "everyone" | "department" | "user";
  id: string | null;
};
export type SignatureTemplate = {
  id: string;
  name: string;
  document: SignatureDocument;
  revision: number;
  publishedRevision: number | null;
  publishedDocument: SignatureDocument | null;
  assignments: SignatureAssignment[];
  publishedAssignments: SignatureAssignment[];
  ownerUserId: string | null;
  sourceTemplateId: string | null;
  archived: boolean;
  updatedAt: string;
};
export type SignatureChoice = {
  id: string;
  name: string;
  revision: number;
  fingerprint: string;
  html: string;
  text: string;
  personal: boolean;
};
export const emptySignatureSelection = (): SignatureSelection => ({
  enabled: true,
  templateId: null,
  revision: null,
  fingerprint: null,
});
export const signatureKinds: Record<SignatureBlockKind, string> = {
  identity: "Name & role",
  contact: "Contact detail",
  details: "Contact list",
  text: "Text",
  image: "Image",
  badges: "Trust badges",
  social: "Social link",
  socials: "Social profiles",
  button: "Button",
  divider: "Divider",
  spacer: "Space",
  import: "Imported signature",
};
export const signatureDefaultAccent = "#0e7d74";
/** Asset key for the rendered person's own profile photo. Never a stored asset id. */
export const signaturePersonPhotoKey = "person-photo";
/** Whether an image block shows each person's profile photo rather than one shared upload. */
export function signatureUsesPersonPhoto(b: SignatureBlock) {
  return b.kind === "image" && b.imageRole === "photo" && b.imageSource !== "upload";
}
/** The person's photo when the block uses it, otherwise the uploaded image, which also serves as the fallback. */
export function signatureImageUrl(b: SignatureBlock, assets: Record<string, string>) {
  return (signatureUsesPersonPhoto(b) ? assets[signaturePersonPhotoKey] : "") || (b.assetId ? assets[b.assetId] : "") || "";
}
export function signatureNeedsPersonPhoto(document: SignatureDocument) {
  return document.rows.some((r) => r.columns.some((c) => c.some(signatureUsesPersonPhoto)));
}
export function newSignatureBlock(kind: SignatureBlockKind): SignatureBlock {
  const block: SignatureBlock = {
    id: crypto.randomUUID(),
    kind,
    text: kind === "text" ? "Your message" : kind === "button" ? "Book a meeting" : "",
    field: kind === "identity" ? "name" : kind === "contact" ? "email" : "",
    label: "",
    assetId: null,
    href: "",
    alt: "",
    width: kind === "badges" ? 72 : kind === "image" ? 120 : 440,
    ...(kind === "badges" ? { images: [] } : {}),
    size: kind === "identity" ? 18 : kind === "details" ? 12 : 13,
    colour: kind === "button" ? "#ffffff" : "#253c39",
    align: "left",
    bold: kind === "identity" || kind === "button",
    padding: kind === "spacer" ? 12 : kind === "button" ? 8 : 4,
  };
  if (kind === "button") Object.assign(block, { fill: signatureDefaultAccent, radius: 6 });
  if (kind === "details") Object.assign(block, { fill: signatureDefaultAccent, fields: ["phone", "mobile", "email", "website"], layout: "stacked", labels: "short" });
  if (kind === "socials") Object.assign(block, { fill: signatureDefaultAccent, variant: "badges", links: [{ network: "linkedin", href: "" }] });
  if (kind === "divider") Object.assign(block, { thickness: 1, length: 100 });
  return block;
}
export function newSignatureDocument(
  layout: "side" | "stacked" | "banner" = "side",
): SignatureDocument {
  const details = [
    newSignatureBlock("identity"),
    { ...newSignatureBlock("contact"), field: "jobTitle" as const },
    newSignatureBlock("contact"),
    { ...newSignatureBlock("contact"), field: "phone" as const },
  ];
  const logo = newSignatureBlock("image");
  return {
    version: 1,
    width: 480,
    colour: "#ffffff",
    rows: [
      {
        id: crypto.randomUUID(),
        columns: layout === "side" ? [[logo], details] : [[...details]],
      },
      ...(layout === "banner"
        ? [{ id: crypto.randomUUID(), columns: [[{ ...logo, width: 460 }]] }]
        : []),
    ],
  };
}
const colour = (v: unknown, fallback: string) =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
const string = (v: unknown, max = 4000) =>
  typeof v === "string" ? v.slice(0, max) : "";
const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.round(Math.min(max, Math.max(min, v)))
    : fallback;
const oneOf = <T extends string>(v: unknown, options: readonly T[]) =>
  options.includes(v as T) ? v as T : undefined;
export function safeSignatureLink(value: string) {
  if (!value) return "";
  if (
    /^(https:\/\/|mailto:|tel:)/i.test(value) &&
    !/[\u0000-\u0020<>"']/.test(value)
  ) return value;
  return "";
}
function blockOptions(b: SignatureBlock): Partial<SignatureBlock> {
  const options: Partial<SignatureBlock> = {};
  if (typeof b.fill === "string") options.fill = b.fill === "" && b.kind === "socials" ? "" : colour(b.fill, signatureDefaultAccent);
  if (b.italic === true) options.italic = true;
  if (b.caps === true) options.caps = true;
  if (b.radius !== undefined) options.radius = num(b.radius, 0, 0, 999);
  if (b.thickness !== undefined) options.thickness = num(b.thickness, 1, 1, 8);
  if (b.length !== undefined) options.length = num(b.length, 100, 5, 100);
  const role = oneOf(b.imageRole, ["logo", "photo", "banner"] as const);
  if (role) options.imageRole = role;
  const source = oneOf(b.imageSource, ["person", "upload"] as const);
  if (source && b.kind === "image") options.imageSource = source;
  if (Array.isArray(b.fields)) {
    options.fields = [...new Set(b.fields.filter((field) => Object.hasOwn(signatureFields, field)))].slice(0, 9);
  }
  const layout = oneOf(b.layout, ["stacked", "inline"] as const);
  if (layout) options.layout = layout;
  const labels = oneOf(b.labels, ["none", "short", "full"] as const);
  if (labels) options.labels = labels;
  const variant = oneOf(b.variant, ["badges", "text"] as const);
  if (variant) options.variant = variant;
  if (b.kind === "socials") {
    if (!Array.isArray(b.links) || b.links.length > 8) throw new Error("Add up to eight social profiles.");
    options.links = b.links.map((link) => {
      if (!link || !Object.hasOwn(signatureNetworks, link.network)) throw new Error("Choose a supported social network.");
      if (link.href && !safeSignatureLink(link.href)) throw new Error("Use an HTTPS, email or telephone link.");
      return { network: link.network, href: safeSignatureLink(string(link.href, 2000)) };
    });
  }
  return options;
}
export function validateSignatureDocument(value: unknown): SignatureDocument {
  if (!value || typeof value !== "object") {
    throw new Error("Choose a signature layout.");
  }
  const doc = value as SignatureDocument;
  if (doc.version !== 1 || !Array.isArray(doc.rows) || doc.rows.length > 20) {
    throw new Error("A signature can have up to 20 rows.");
  }
  const ids = new Set<string>();
  let count = 0;
  const id = (v: unknown) => {
    if (typeof v !== "string" || !/^[a-z0-9-]{1,80}$/i.test(v) || ids.has(v)) {
      throw new Error("Signature blocks need unique identifiers.");
    }
    ids.add(v);
    return v;
  };
  const font = oneOf(doc.font, Object.keys(signatureFonts) as SignatureFont[]);
  return {
    version: 1,
    width: num(doc.width, 480, 240, 640),
    columnGap: num(doc.columnGap, 20, 0, 48),
    colour: colour(doc.colour, "#ffffff"),
    ...(font ? { font } : {}),
    ...(doc.padding !== undefined ? { padding: num(doc.padding, 0, 0, 40) } : {}),
    ...(doc.radius !== undefined ? { radius: num(doc.radius, 0, 0, 24) } : {}),
    ...(doc.accent !== undefined ? { accent: colour(doc.accent, signatureDefaultAccent) } : {}),
    rows: doc.rows.map((row) => {
      const rowId = id(row.id);
      if (
        !Array.isArray(row.columns) || row.columns.length < 1 ||
        row.columns.length > 4
      ) throw new Error("Choose between one and four columns.");
      const valign = oneOf(row.valign, ["top", "middle"] as const);
      return {
        id: rowId,
        columnWidths: signatureColumnWidths(row),
        ...(valign ? { valign } : {}),
        ...(row.rule !== undefined ? { rule: colour(row.rule, "#dfe5e3") } : {}),
        columns: row.columns.map((column) => {
          if (!Array.isArray(column)) {
            throw new Error("Invalid signature column.");
          }
          return column.map((b) => {
            if (++count > 60) {
              throw new Error("A signature can have up to 60 blocks.");
            }
            if (!b || !Object.hasOwn(signatureKinds, b.kind)) {
              throw new Error(
                "This signature has a block that can't be saved yet. Remove it or refresh and try again.",
              );
            }
            if (b.href && !safeSignatureLink(b.href)) {
              throw new Error("Use an HTTPS, email or telephone link.");
            }
            if (
              b.assetId && !/^[0-9a-f-]{36}$/i.test(b.assetId)
            ) throw new Error("Choose an uploaded signature image.");
            return {
              id: id(b.id),
              kind: b.kind,
              ...(b.kind === "badges"
                ? {
                  images: (() => {
                    if (!Array.isArray(b.images) || b.images.length > 8) {
                      throw new Error("Add up to eight trust badges.");
                    }
                    return b.images.map((image) => {
                      if (!image || !/^[0-9a-f-]{36}$/i.test(image.assetId)) {
                        throw new Error("Choose an uploaded badge image.");
                      }
                      if (image.href && !safeSignatureLink(image.href)) {
                        throw new Error(
                          "Use an HTTPS, email or telephone link.",
                        );
                      }
                      return {
                        assetId: image.assetId,
                        alt: string(image.alt, 240),
                        href: safeSignatureLink(string(image.href, 2000)),
                      };
                    });
                  })(),
                }
                : {}),
              text: string(b.text, b.kind === "import" ? 60000 : 4000),
              field: Object.hasOwn(signatureFields, b.field) ? b.field : "",
              label: string(b.label, 120),
              assetId: b.assetId || null,
              href: safeSignatureLink(string(b.href, 2000)),
              alt: string(b.alt, 240),
              width: num(b.width, 120, 16, 640),
              size: num(b.size, 13, 10, 28),
              colour: colour(b.colour, "#253c39"),
              align: ["left", "center", "right"].includes(b.align)
                ? b.align
                : "left",
              bold: b.bold === true,
              padding: num(b.padding, 4, 0, 48),
              ...blockOptions(b),
            } as SignatureBlock;
          });
        }),
      };
    }),
  };
}
/** Width available to rows once the signature's inner padding is removed. */
export function signatureContentWidth(document: SignatureDocument) {
  return document.width - (document.padding ?? 0) * 2;
}
/** Percentage widths are portable across canvas, preview and email tables. */
export function signatureColumnWidths(row: SignatureRow): number[] {
  if (row.columns.length === 1) return [100];
  if (row.columns.length > 2) return row.columns.map(() => 100 / row.columns.length);
  const first = row.columnWidths?.[0];
  const width = typeof first === "number" && Number.isFinite(first) ? Math.max(20, Math.min(80, Math.round(first))) : 50;
  return [width, 100 - width];
}
export function resizeSignatureColumn(document: SignatureDocument, rowId: string, percent: number): SignatureDocument {
  if (!Number.isFinite(percent)) return document;
  return { ...document, rows: document.rows.map(row => row.id === rowId && row.columns.length === 2
    ? { ...row, columnWidths: signatureColumnWidths({ ...row, columnWidths: [percent, 100-percent] }) } : row) };
}
export function resizeSignatureImage(document: SignatureDocument, blockId: string, requested: number): SignatureDocument {
  if (!Number.isFinite(requested)) return document;
  const next = structuredClone(document);
  for (const row of next.rows) for (let column = 0; column < row.columns.length; column++) {
    const block = row.columns[column].find(block => block.id === blockId && block.kind === "image");
    if (!block) continue;
    const available = signatureContentWidth(next) - (next.columnGap ?? 20) * (row.columns.length - 1);
    block.width = Math.max(24, Math.min(Math.floor(available * (row.columns.length === 2 ? .8 : 1 / row.columns.length)), Math.round(requested)));
    if (row.columns.length === 2) {
      const widths = signatureColumnWidths(row);
      const needed = Math.min(80, Math.ceil(block.width / available * 100));
      if (needed > widths[column]) row.columnWidths = column === 0 ? [needed,100-needed] : [100-needed,needed];
    }
  }
  return next;
}
export function signatureAssetIds(document: SignatureDocument) {
  return [
    ...new Set(
      document.rows.flatMap((r) =>
        r.columns.flatMap((c) =>
          c.flatMap((
            b,
          ) => [
            ...(b.assetId ? [b.assetId] : []),
            ...(b.kind === "badges"
              ? (b.images || []).map((image) => image.assetId)
              : []),
          ])
        )
      ),
    ),
  ];
}
export function escapeSignatureHtml(v: string) {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const detailLabels: Partial<Record<SignatureField, [string, string]>> = {
  phone: ["T", "Phone"],
  mobile: ["M", "Mobile"],
  email: ["E", "Email"],
  website: ["W", "Web"],
  address: ["A", "Address"],
};
function fieldLink(field: SignatureField | "", value: string) {
  if (!value) return "";
  if (field === "email") return safeSignatureLink(`mailto:${value}`);
  if (field === "website") return safeSignatureLink(/^https:\/\//i.test(value) ? value : `https://${value.replace(/^http:\/\//i, "")}`);
  if (field === "phone" || field === "mobile") {
    const digits = value.replace(/[^\d+]/g, "");
    return digits.replace(/\D/g, "").length >= 5 ? safeSignatureLink(`tel:${digits}`) : "";
  }
  return "";
}
const displayValue = (field: SignatureField, value: string) =>
  field === "website" ? value.replace(/^https?:\/\//i, "").replace(/\/$/, "") : value;
function renderDetails(b: SignatureBlock, values: SignatureValues) {
  const e = escapeSignatureHtml;
  const accent = b.fill || b.colour;
  const items = (b.fields || []).flatMap((field) => {
    const raw = (values[field as keyof SignatureValues] || "").trim();
    if (!raw) return [];
    const inline = b.layout === "inline";
    const value = displayValue(field, inline ? raw.replace(/\n+/g, " · ") : raw);
    const label = b.labels === "none" ? "" : detailLabels[field]?.[b.labels === "full" ? 1 : 0] || "";
    const href = fieldLink(field, raw);
    const body = e(value).replace(/\n/g, "<br>");
    const content = href ? `<a href="${e(href)}" style="color:inherit;text-decoration:none">${body}</a>` : body;
    return [{
      html: `${label ? `<span style="color:${accent};font-weight:600">${e(label)}</span>&nbsp;&nbsp;` : ""}${content}`,
      text: `${label ? `${label} ` : ""}${value}`,
    }];
  });
  const separator = `<span style="color:#b9c3c0">&nbsp;&nbsp;|&nbsp;&nbsp;</span>`;
  return {
    html: items.map((item) => item.html).join(b.layout === "inline" ? separator : "<br>"),
    text: items.map((item) => item.text).join(b.layout === "inline" ? " | " : "\n"),
  };
}
function renderSocials(b: SignatureBlock) {
  const e = escapeSignatureHtml;
  const links = (b.links || []).filter((link) => safeSignatureLink(link.href));
  if (!links.length) return { html: "", text: "" };
  const text = links.map((link) => `${signatureNetworks[link.network].label}: ${link.href}`).join("\n");
  if (b.variant === "text") {
    return {
      html: links.map((link) => `<a href="${e(link.href)}" style="color:${b.fill || b.colour};text-decoration:none">${e(signatureNetworks[link.network].label)}</a>`).join(`<span style="color:#b9c3c0">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`),
      text,
    };
  }
  const box = Math.max(18, Math.min(40, b.size + 10));
  const radius = Math.min(b.radius ?? 6, Math.floor(box / 2));
  const cells = links.map((link, index) => {
    const network = signatureNetworks[link.network];
    const background = b.fill || network.colour;
    return `<td style="padding-right:${index < links.length - 1 ? 6 : 0}px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td width="${box}" height="${box}" align="center" valign="middle" bgcolor="${background}" style="width:${box}px;height:${box}px;background:${background};border-radius:${radius}px;text-align:center;vertical-align:middle"><a href="${e(link.href)}" title="${e(network.label)}" style="display:block;width:${box}px;line-height:${box}px;color:#ffffff;font-size:${Math.round(box * .42)}px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif">${e(network.mark)}</a></td></tr></table></td>`;
  }).join("");
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${b.align === "left" ? "" : ` align="${b.align}"`}><tr>${cells}</tr></table>`,
    text,
  };
}
function renderButton(b: SignatureBlock) {
  const e = escapeSignatureHtml;
  if (!b.text.trim()) return { html: "", text: "" };
  const href = safeSignatureLink(b.href);
  const fill = b.fill || signatureDefaultAccent;
  const padY = Math.round(b.size * .62), padX = Math.round(b.size * 1.25);
  const radius = Math.min(b.radius ?? 6, 40);
  const label = `<span style="color:${b.colour};font-size:${b.size}px;line-height:1.2;font-weight:${b.bold ? 600 : 400};${b.italic ? "font-style:italic;" : ""}${b.caps ? "text-transform:uppercase;letter-spacing:.06em;" : ""}">${e(b.text)}</span>`;
  const inner = href
    ? `<a href="${e(href)}" style="display:inline-block;padding:${padY}px ${padX}px;border-radius:${radius}px;text-decoration:none;color:${b.colour}">${label}</a>`
    : `<span style="display:inline-block;padding:${padY}px ${padX}px">${label}</span>`;
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"${b.align === "left" ? "" : ` align="${b.align}"`}><tr><td bgcolor="${fill}" style="background:${fill};border-radius:${radius}px">${inner}</td></tr></table>`,
    text: href ? `${b.text}: ${href}` : b.text,
  };
}
export function renderSignatureBlock(
  b: SignatureBlock,
  values: SignatureValues,
  assets: Record<string, string> = {},
) {
  const e = escapeSignatureHtml;
  let value = b.field ? values[b.field] || "" : b.text;
  let html = "", text = "";
  let linkable = true;
  if (b.kind === "badges") {
    const images = (b.images || []).filter((image) => assets[image.assetId]);
    if (!images.length) return { html: "", text: "" };
    const width = Math.min(b.width, Math.floor(440 / images.length) - 8);
    html =
      `<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:100%" align="${b.align}"><tr>${
        images.map((image) => {
          const img = `<img src="${e(assets[image.assetId])}" alt="${
            e(image.alt)
          }" width="${width}" style="display:block;border:0;width:${width}px;max-width:100%;height:auto">`;
          return `<td valign="middle" style="padding-right:8px">${
            safeSignatureLink(image.href)
              ? `<a href="${e(image.href)}">${img}</a>`
              : img
          }</td>`;
        }).join("")
      }</tr></table>`;
    text = images.map((image) => image.alt).filter(Boolean).join(" · ");
  } else if (b.kind === "image") {
    const src = signatureImageUrl(b, assets);
    if (!src) return { html: "", text: "" };
    const radius = b.radius ? `border-radius:${b.radius >= 999 ? "50%" : `${b.radius}px`};` : "";
    // Profile photos arrive in any shape; crop them square so every headshot matches the design.
    const person = signatureUsesPersonPhoto(b) && src === assets[signaturePersonPhotoKey];
    const alt = person ? b.alt || values.name || "" : b.alt;
    const size = person
      ? ` height="${b.width}" style="display:block;border:0;width:${b.width}px;height:${b.width}px;max-width:100%;object-fit:cover;${radius}"`
      : ` style="display:block;border:0;width:${b.width}px;max-width:100%;height:auto;${radius}"`;
    const img = `<img src="${e(src)}" alt="${e(alt)}" width="${b.width}"${size}>`;
    html = b.align === "left" ? img : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${b.align}"><tr><td>${img}</td></tr></table>`;
    text = alt;
  } else if (b.kind === "divider") {
    const length = b.length ?? 100;
    html =
      `<table role="presentation" width="${length}%" cellpadding="0" cellspacing="0"${length < 100 && b.align !== "left" ? ` align="${b.align}"` : ""}><tr><td style="border-top:${b.thickness ?? 1}px solid ${b.colour};font-size:1px;line-height:1px">&nbsp;</td></tr></table>`;
  } else if (b.kind === "spacer") {
    html =
      `<div style="height:${b.padding}px;line-height:${b.padding}px">&nbsp;</div>`;
  } else if (b.kind === "import") {
    html = b.text;
    text = b.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  } else if (b.kind === "details") {
    ({ html, text } = renderDetails(b, values));
    if (!html) return { html: "", text: "" };
    linkable = false;
  } else if (b.kind === "socials" || b.kind === "button") {
    ({ html, text } = b.kind === "socials" ? renderSocials(b) : renderButton(b));
    if (!html) return { html: "", text: "" };
    linkable = false;
  } else {
    if (!value.trim()) return { html: "", text: "" };
    text = `${b.label ? `${b.label} ` : ""}${value}`;
    html = e(text).replace(/\n/g, "<br>");
  }
  const href = linkable ? safeSignatureLink(
    b.href ||
      (b.field === "email" && value
        ? `mailto:${value}`
        : b.field === "website"
        ? value
        : ""),
  ) : "";
  if (href) {
    html = `<a href="${
      e(href)
    }" style="color:inherit;text-decoration:none">${html}</a>`;
  }
  return {
    html: `<div style="padding:${
      b.kind === "spacer" ? 0 : b.padding
    }px 0;text-align:${b.align};font-size:${b.size}px;line-height:1.45;color:${b.colour};font-weight:${
      b.bold ? 600 : 400
    };${b.italic ? "font-style:italic;" : ""}${b.caps ? "text-transform:uppercase;letter-spacing:.08em;" : ""}overflow-wrap:anywhere">${html}</div>`,
    text,
  };
}
export function renderSignature(
  document: SignatureDocument,
  values: SignatureValues,
  assets: Record<string, string> = {},
) {
  const gap = document.columnGap ?? 20;
  const content = signatureContentWidth(document);
  const rows = document.rows.map(row => {
    const widths = signatureColumnWidths(row);
    return row.columns.map((column,index) => column.map(block => renderSignatureBlock(
      block.kind === "image" ? {...block,width:Math.min(block.width, Math.floor((content - gap * (row.columns.length - 1)) * widths[index] / 100))} : block,
      values, assets,
    )));
  });
  const font = signatureFonts[document.font ?? "arial"].stack;
  const radius = document.radius ? `border-radius:${document.radius}px;border-collapse:separate;overflow:hidden` : "border-collapse:collapse";
  const body = rows.map((columns,rowIndex) => {
    const row = document.rows[rowIndex];
    const widths = signatureColumnWidths(row);
    const valign = row.valign ?? "top";
    return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-collapse:collapse"><tr>${columns.map((blocks,index) => `<td width="${widths[index]}%" valign="${valign}" style="width:${widths[index]}%;vertical-align:${valign};overflow-wrap:anywhere;${index < columns.length-1 ? `padding-right:${gap}px;` : ""}${index > 0 && row.rule ? `border-left:1px solid ${row.rule};padding-left:${gap}px;` : ""}">${blocks.map(block=>block.html).join("")}</td>`).join("")}</tr></table></td></tr>`;
  }).join("");
  const inner = document.padding
    ? `<tr><td style="padding:${document.padding}px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tbody>${body}</tbody></table></td></tr>`
    : body;
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${document.width}" style="width:${document.width}px;max-width:100%;background:${document.colour};font-family:${font};${radius}"><tbody>${inner}</tbody></table>`,
    text: rows.flatMap(columns=>columns.flatMap(blocks=>blocks.map(block=>block.text).filter(Boolean))).join("\n"),
  };
}
export function eligibleSignatures(
  templates: SignatureTemplate[],
  userId: string,
  departments: string[],
  allowPersonal: boolean,
) {
  const live = templates.filter((t) =>
    !t.archived && t.publishedRevision && !t.ownerUserId
  );
  const individual = live.filter((t) =>
    t.publishedAssignments.some((a) => a.kind === "user" && a.id === userId)
  );
  const department = live.filter((t) =>
    t.publishedAssignments.some((a) =>
      a.kind === "department" && departments.includes(a.id ?? "")
    )
  );
  const everyone = live.filter((t) =>
    t.publishedAssignments.some((a) => a.kind === "everyone")
  );
  return [
    ...(individual.length
      ? individual
      : department.length
      ? department
      : everyone),
    ...templates.filter((t) =>
      allowPersonal && !t.archived && t.publishedRevision &&
      t.ownerUserId === userId
    ),
  ];
}
