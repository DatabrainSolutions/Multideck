import {
  newSignatureBlock,
  signatureDefaultAccent,
  signatureImageUrl,
  type SignatureBlock,
  type SignatureBlockKind,
  type SignatureDocument,
  type SignatureField,
  type SignatureRow,
  type SignatureValues,
} from "@/lib/email-signatures";

export type SignatureTemplateCategory = "minimal" | "classic" | "logo" | "photo" | "statement" | "banner";
export const signatureTemplateCategories: Record<SignatureTemplateCategory, string> = {
  minimal: "Minimal",
  classic: "Classic",
  logo: "With logo",
  photo: "With photo",
  statement: "Statement",
  banner: "With banner",
};
export type SignatureStarter = {
  id: string;
  name: string;
  description: string;
  category: SignatureTemplateCategory;
  build: (accent: string) => SignatureDocument;
};

const ink = "#1f2a28";
const muted = "#66736f";
const faint = "#dfe5e3";

function hexToRgb(hex: string) {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : signatureDefaultAccent;
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
}
/** Mix two hex colours; `amount` is the share of `to`. */
export function mixSignatureColour(from: string, to: string, amount: number) {
  const a = hexToRgb(from), b = hexToRgb(to);
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, "0")).join("")}`;
}

function block(kind: SignatureBlockKind, patch: Partial<SignatureBlock> = {}): SignatureBlock {
  return { ...newSignatureBlock(kind), colour: ink, ...patch };
}
const name = (patch: Partial<SignatureBlock> = {}) => block("identity", { size: 17, padding: 2, ...patch });
const field = (field: SignatureField, patch: Partial<SignatureBlock> = {}) =>
  block("contact", { field, size: 12, colour: muted, padding: 1, ...patch });
const details = (accent: string, fields: SignatureField[], patch: Partial<SignatureBlock> = {}) =>
  block("details", { fields, fill: accent, size: 12, padding: 6, ...patch });
const text = (value: string, patch: Partial<SignatureBlock> = {}) => block("text", { text: value, size: 12, colour: muted, ...patch });
const rule = (colour: string, patch: Partial<SignatureBlock> = {}) =>
  block("divider", { colour, thickness: 1, length: 100, padding: 8, ...patch });
const image = (role: "logo" | "photo" | "banner", width: number, patch: Partial<SignatureBlock> = {}) =>
  block("image", {
    imageRole: role,
    width,
    alt: role === "logo" ? "Company logo" : role === "photo" ? "" : "",
    radius: role === "photo" ? 999 : role === "banner" ? 6 : 0,
    ...(role === "photo" ? { imageSource: "person" as const } : {}),
    ...patch,
  });
const socials = (accent: string, patch: Partial<SignatureBlock> = {}) =>
  block("socials", {
    fill: accent,
    size: 12,
    padding: 6,
    links: [{ network: "linkedin", href: "" }, { network: "x", href: "" }, { network: "instagram", href: "" }],
    ...patch,
  });
const button = (accent: string, label: string, patch: Partial<SignatureBlock> = {}) =>
  block("button", { text: label, fill: accent, colour: "#ffffff", size: 12, padding: 10, radius: 6, ...patch });
const row = (columns: SignatureBlock[][], patch: Partial<SignatureRow> = {}): SignatureRow => ({
  id: crypto.randomUUID(),
  columns,
  ...patch,
});
const signature = (accent: string, rows: SignatureRow[], patch: Partial<SignatureDocument> = {}): SignatureDocument => ({
  version: 1,
  width: 480,
  columnGap: 20,
  colour: "#ffffff",
  accent,
  rows,
  ...patch,
});
const centred = (items: SignatureBlock[]) => items.map((item) => ({ ...item, align: "center" as const }));

export function blankSignatureDocument(accent = signatureDefaultAccent): SignatureDocument {
  return signature(accent, [row([[]])]);
}

export const signatureStarters: SignatureStarter[] = [
  {
    id: "essential",
    name: "Essential",
    description: "Name, role and one tidy line of contact details.",
    category: "minimal",
    build: (accent) => signature(accent, [row([[
      name(),
      field("jobTitle"),
      details(accent, ["phone", "email", "website"], { layout: "inline", labels: "none", colour: muted, padding: 8 }),
    ]])]),
  },
  {
    id: "single-line",
    name: "Single line",
    description: "Everything on one quiet line. Ideal for quick replies.",
    category: "minimal",
    build: (accent) => signature(accent, [row([[
      details(accent, ["name", "jobTitle", "company", "phone"], { layout: "inline", labels: "none", colour: ink, padding: 2 }),
    ]])], { width: 560 }),
  },
  {
    id: "accent-rule",
    name: "Accent rule",
    description: "A short stroke of brand colour anchors your name.",
    category: "minimal",
    build: (accent) => signature(accent, [row([[
      name({ size: 18 }),
      field("jobTitle"),
      rule(accent, { thickness: 3, length: 12, padding: 10 }),
      details(accent, ["phone", "mobile", "email", "website"], { labels: "short", padding: 2 }),
    ]])]),
  },
  {
    id: "uppercase",
    name: "Uppercase",
    description: "Tracked capitals and pipe-separated details for a crisp, modern feel.",
    category: "minimal",
    build: (accent) => signature(accent, [row([[
      name({ size: 14, caps: true }),
      field("jobTitle", { size: 11, colour: accent, caps: true }),
      details(accent, ["phone", "email", "website"], { layout: "inline", labels: "short", size: 11, padding: 8 }),
    ]])], { font: "helvetica" }),
  },
  {
    id: "executive",
    name: "Executive",
    description: "Serif type, a fine rule and fully labelled details.",
    category: "classic",
    build: (accent) => signature(accent, [row([[
      name({ size: 19, bold: false }),
      field("jobTitle", { size: 11, colour: accent, caps: true, padding: 2 }),
      rule(faint, { padding: 10 }),
      details(accent, ["phone", "mobile", "email", "website"], { labels: "full", padding: 0 }),
      field("companyDetails", { size: 11, padding: 8 }),
    ]])], { font: "georgia" }),
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Letterhead serif with an italic tagline beneath your name.",
    category: "classic",
    build: (accent) => signature(accent, [row([[
      name({ size: 20, bold: false }),
      field("jobTitle", { size: 11, caps: true, colour: accent }),
      text("Moving cargo with care, every mile.", { italic: true, size: 13, padding: 10 }),
      rule(faint, { padding: 4 }),
      details(accent, ["phone", "email", "website"], { layout: "inline", labels: "full", size: 11, padding: 6 }),
    ]])], { font: "georgia" }),
  },
  {
    id: "legal-footer",
    name: "Legal footer",
    description: "Room for your registered office and a confidentiality notice.",
    category: "classic",
    build: (accent) => signature(accent, [
      row([[name({ size: 16 }), field("jobTitle"), details(accent, ["phone", "email"], { labels: "short" })], [image("logo", 96, { align: "right" })]], { columnWidths: [66, 34] }),
      row([[
        rule(faint, { padding: 10 }),
        field("companyDetails", { size: 10, padding: 2 }),
        text("This email and any attachments are confidential and intended solely for the addressee.", { size: 10, colour: "#8b9793", padding: 4 }),
      ]]),
    ], { width: 520 }),
  },
  {
    id: "logo-beside",
    name: "Logo beside",
    description: "Your logo on the left and details on the right, divided by a fine rule.",
    category: "logo",
    build: (accent) => signature(accent, [row([
      [image("logo", 110)],
      [name({ size: 16 }), field("jobTitle"), details(accent, ["phone", "mobile", "email", "website"], { labels: "short" })],
    ], { columnWidths: [30, 70], valign: "middle", rule: faint })]),
  },
  {
    id: "centred",
    name: "Centred",
    description: "Symmetrical and calm, with your logo above your name.",
    category: "logo",
    build: (accent) => signature(accent, [row([centred([
      image("logo", 96, { padding: 6 }),
      name(),
      field("jobTitle"),
      details(accent, ["phone", "email", "website"], { layout: "inline", labels: "none", colour: muted, size: 11 }),
      socials(accent, { size: 10 }),
    ])])]),
  },
  {
    id: "logo-header",
    name: "Logo header",
    description: "Logo first, then a clean stack of details beneath it.",
    category: "logo",
    build: (accent) => signature(accent, [row([[
      image("logo", 136, { padding: 6 }),
      block("spacer", { padding: 4 }),
      name({ size: 16 }),
      field("jobTitle"),
      details(accent, ["phone", "email", "website"], { layout: "inline", labels: "short", size: 11 }),
    ]])]),
  },
  {
    id: "freight-desk",
    name: "Freight desk",
    description: "Logo, office details and accreditations for trading partners.",
    category: "logo",
    build: (accent) => signature(accent, [
      row([
        [image("logo", 112)],
        [name({ size: 16 }), field("jobTitle"), details(accent, ["phone", "mobile", "email"], { labels: "full" })],
      ], { columnWidths: [30, 70], valign: "middle", rule: faint }),
      row([[rule(faint, { padding: 8 }), field("companyDetails", { size: 11 }), block("badges", { width: 44, padding: 8 })]]),
    ], { width: 520 }),
  },
  {
    id: "portrait",
    name: "Portrait",
    description: "A round headshot that puts a face to the name.",
    category: "photo",
    build: (accent) => signature(accent, [row([
      [image("photo", 80)],
      [name(), field("jobTitle"), field("company", { colour: accent, size: 12 }), details(accent, ["phone", "email"], { labels: "short" })],
    ], { columnWidths: [22, 78], valign: "middle" })]),
  },
  {
    id: "spotlight",
    name: "Spotlight",
    description: "A centred headshot with your social profiles underneath.",
    category: "photo",
    build: (accent) => signature(accent, [row([centred([
      image("photo", 84, { padding: 6 }),
      name({ size: 18 }),
      field("jobTitle"),
      socials(accent, { padding: 10 }),
      details(accent, ["phone", "email"], { layout: "inline", labels: "none", colour: muted, size: 11, padding: 2 }),
    ])])]),
  },
  {
    id: "three-column",
    name: "Three columns",
    description: "Photo, identity and contact details side by side.",
    category: "photo",
    build: (accent) => signature(accent, [row([
      [image("photo", 64)],
      [name({ size: 15 }), field("jobTitle", { size: 11 }), field("company", { size: 11, colour: accent })],
      [details(accent, ["phone", "email", "website"], { labels: "short", size: 11, padding: 0 })],
    ], { valign: "middle", rule: faint })], { width: 580, columnGap: 16 }),
  },
  {
    id: "sales",
    name: "Sales",
    description: "Headshot, details, social links and a clear next step.",
    category: "photo",
    build: (accent) => signature(accent, [row([
      [image("photo", 76)],
      [
        name(),
        field("jobTitle"),
        details(accent, ["phone", "email"], { labels: "short" }),
        socials(accent, { size: 9, padding: 4, links: [{ network: "linkedin", href: "" }, { network: "whatsapp", href: "" }] }),
        button(accent, "Get a quote", { padding: 8 }),
      ],
    ], { columnWidths: [22, 78] })]),
  },
  {
    id: "book-a-call",
    name: "Book a call",
    description: "A clear button that turns every email into a meeting.",
    category: "statement",
    build: (accent) => signature(accent, [row([[
      name(),
      field("jobTitle"),
      details(accent, ["phone", "email"], { layout: "inline", labels: "short", size: 11 }),
      button(accent, "Book a call", { radius: 999, padding: 12 }),
    ]])]),
  },
  {
    id: "social-first",
    name: "Social profiles",
    description: "Your channels up front, details tucked neatly below.",
    category: "statement",
    build: (accent) => signature(accent, [
      row([[name(), field("jobTitle")], [socials(accent, { align: "right" })]], { columnWidths: [60, 40], valign: "middle" }),
      row([[rule(faint, { padding: 8 }), details(accent, ["phone", "email", "website"], { layout: "inline", labels: "short", size: 11, padding: 0 })]]),
    ]),
  },
  {
    id: "soft-card",
    name: "Soft card",
    description: "A tinted panel with rounded corners that lifts off the page.",
    category: "statement",
    build: (accent) => signature(accent, [row([
      [image("logo", 84)],
      [name({ size: 16 }), field("jobTitle"), details(accent, ["phone", "email", "website"], { labels: "short" })],
    ], { columnWidths: [26, 74], valign: "middle" })], {
      colour: mixSignatureColour(accent, "#ffffff", .93),
      padding: 18,
      radius: 12,
    }),
  },
  {
    id: "night",
    name: "Night",
    description: "A dark panel for bold, modern brands.",
    category: "statement",
    build: (accent) => {
      const light = mixSignatureColour(accent, "#ffffff", .5);
      return signature(accent, [row([[
        name({ size: 18, colour: "#ffffff" }),
        field("jobTitle", { colour: "#a9b6b2" }),
        rule("#34433f", { padding: 10 }),
        details(light, ["phone", "mobile", "email", "website"], { labels: "short", colour: "#e4eae8", padding: 0 }),
        socials(light, { padding: 10, size: 10 }),
      ]])], { colour: "#17211f", padding: 22, radius: 10 });
    },
  },
  {
    id: "brand-banner",
    name: "Brand banner",
    description: "Your details with a promotional banner beneath.",
    category: "banner",
    build: (accent) => signature(accent, [
      row([
        [image("logo", 96)],
        [name({ size: 16 }), field("jobTitle"), details(accent, ["phone", "email"], { labels: "short" })],
      ], { columnWidths: [28, 72], valign: "middle", rule: faint }),
      row([[image("banner", 440, { padding: 12 })]]),
    ]),
  },
];

export function signatureStarter(id: string) {
  return signatureStarters.find((starter) => starter.id === id);
}

/** Replaces the accent everywhere it was used, so a brand recolour stays one step. */
export function recolourSignatureAccent(document: SignatureDocument, to: string): SignatureDocument {
  const from = (document.accent ?? signatureDefaultAccent).toLowerCase();
  const swap = (value: string | undefined) => value && value.toLowerCase() === from ? to : value;
  return {
    ...document,
    accent: to,
    rows: document.rows.map((row) => ({
      ...row,
      columns: row.columns.map((column) => column.map((item) => ({
        ...item,
        colour: swap(item.colour)!,
        ...(item.fill !== undefined ? { fill: swap(item.fill) } : {}),
      }))),
    })),
  };
}

export function signatureNeedsBrandLogo(document: SignatureDocument) {
  return document.rows.some((row) => row.columns.some((column) =>
    column.some((item) => item.kind === "image" && item.imageRole === "logo" && !item.assetId)
  ));
}
export function fillSignatureBrandLogo(document: SignatureDocument, assetId: string): SignatureDocument {
  return {
    ...document,
    rows: document.rows.map((row) => ({
      ...row,
      columns: row.columns.map((column) => column.map((item) =>
        item.kind === "image" && item.imageRole === "logo" && !item.assetId
          ? { ...item, assetId, alt: item.alt || "Company logo" }
          : item
      )),
    })),
  };
}

const sampleValues: SignatureValues = {
  name: "Alex Morgan",
  jobTitle: "Operations manager",
  email: "alex.morgan@example.com",
  phone: "+44 20 7946 0123",
  mobile: "+44 7700 900123",
  company: "Northline Freight",
  website: "https://example.com",
  address: "Unit 4, Dock Road, Felixstowe",
  companyDetails: "Northline Freight Ltd\nUnit 4, Dock Road, Felixstowe IP11 3AB",
};
/** Real details where they exist; sample details fill the gaps so a preview is never half-empty. */
export function signaturePreviewValues(values?: Partial<SignatureValues>): SignatureValues {
  const filled = Object.fromEntries(Object.entries(values ?? {}).filter(([, value]) => typeof value === "string" && value.trim()));
  return { ...sampleValues, ...filled } as SignatureValues;
}

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const svgUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const initials = (value: string) =>
  value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "A";

function placeholderArt(accent: string, values: SignatureValues) {
  const soft = mixSignatureColour(accent, "#ffffff", .86);
  const deep = mixSignatureColour(accent, "#0b1413", .35);
  const company = escapeXml(values.company || "Your company");
  return {
    logo: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80"><rect x="4" y="16" width="48" height="48" rx="12" fill="${accent}"/><path d="M18 50 28 30l10 20" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><text x="64" y="49" font-family="Helvetica,Arial,sans-serif" font-size="22" font-weight="700" fill="${ink}">${company.slice(0, 16)}</text></svg>`),
    photo: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="${soft}"/><text x="80" y="95" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="46" font-weight="600" fill="${deep}">${escapeXml(initials(values.name))}</text></svg>`),
    banner: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="880" height="200" viewBox="0 0 880 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${deep}"/></linearGradient></defs><rect width="880" height="200" fill="url(#g)"/><circle cx="760" cy="40" r="140" fill="#fff" opacity=".08"/><circle cx="820" cy="190" r="90" fill="#fff" opacity=".06"/><text x="48" y="96" font-family="Helvetica,Arial,sans-serif" font-size="40" font-weight="700" fill="#fff">${company}</text><text x="48" y="136" font-family="Helvetica,Arial,sans-serif" font-size="22" fill="#fff" opacity=".8">Your promotional banner</text></svg>`),
    badge: (mark: string) => svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="44" fill="#f2f5f4" stroke="#c9d3d0" stroke-width="3"/><circle cx="48" cy="48" r="32" fill="none" stroke="#c9d3d0" stroke-width="2" stroke-dasharray="3 4"/><text x="48" y="56" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="22" font-weight="700" fill="#7b8884">${mark}</text></svg>`),
  };
}

/**
 * A preview-only copy: empty image slots receive illustrative art (or the saved brand logo)
 * so a template reads as finished. Never saved or sent.
 */
export function signaturePreviewDocument(
  document: SignatureDocument,
  values: SignatureValues,
  assets: Record<string, string> = {},
  brandLogoUrl?: string | null,
) {
  const art = placeholderArt(document.accent ?? signatureDefaultAccent, values);
  const previewAssets: Record<string, string> = { ...assets };
  const rows = document.rows.map((row) => ({
    ...row,
    columns: row.columns.map((column) => column.map((item) => {
      if (item.kind === "image" && !signatureImageUrl(item, assets)) {
        const id = `preview-${item.id}`;
        previewAssets[id] = item.imageRole === "photo" ? art.photo : item.imageRole === "banner" ? art.banner : brandLogoUrl || art.logo;
        return { ...item, assetId: id };
      }
      if (item.kind === "badges" && !(item.images || []).some((badge) => assets[badge.assetId])) {
        const images = ["ISO", "AEO", "★"].map((mark, index) => {
          const id = `preview-${item.id}-${index}`;
          previewAssets[id] = art.badge(mark);
          return { assetId: id, alt: "", href: "" };
        });
        return { ...item, images };
      }
      if (item.kind === "socials" && !(item.links || []).some((link) => link.href)) {
        return { ...item, links: (item.links || []).map((link) => ({ ...link, href: "https://example.com" })) };
      }
      if (item.kind === "button" && !item.href) return { ...item, href: "https://example.com" };
      return item;
    })),
  }));
  return { document: { ...document, rows }, assets: previewAssets };
}
