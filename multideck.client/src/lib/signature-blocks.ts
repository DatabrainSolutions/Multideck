import {
  newSignatureBlock,
  signatureDefaultAccent,
  signatureKinds,
  type SignatureBlock,
  type SignatureDocument,
  type SignatureRow,
} from "@/lib/email-signatures";
import type { SignatureGlyphKind } from "@/components/multideck/signature-block-glyph";

export type SignaturePaletteKind =
  | "identity"
  | "details"
  | "contact"
  | "company"
  | "text"
  | "tagline"
  | "hours"
  | "disclaimer"
  | "logo"
  | "photo"
  | "banner"
  | "badges"
  | "socials"
  | "button"
  | "divider"
  | "spacer";

export const signaturePaletteGroups: { label: string; items: SignaturePaletteKind[] }[] = [
  { label: "About you", items: ["identity", "details", "contact", "company"] },
  { label: "Images", items: ["logo", "photo", "banner", "badges"] },
  { label: "Words", items: ["text", "tagline", "hours", "disclaimer"] },
  { label: "Actions", items: ["socials", "button"] },
  { label: "Layout", items: ["divider", "spacer"] },
];

export const signaturePaletteLabels: Record<SignaturePaletteKind, string> = {
  identity: "Name & role",
  details: "Contact list",
  contact: "Single detail",
  company: "Company details",
  text: "Text",
  tagline: "Tagline",
  hours: "Working hours",
  disclaimer: "Legal note",
  logo: "Logo",
  photo: "Headshot",
  banner: "Banner",
  badges: "Trust badges",
  socials: "Social profiles",
  button: "Button",
  divider: "Divider",
  spacer: "Space",
};

export function signaturePaletteBlock(kind: SignaturePaletteKind, accent = signatureDefaultAccent): SignatureBlock {
  const muted = "#66736f";
  switch (kind) {
    case "company":
      return { ...newSignatureBlock("contact"), field: "companyDetails", size: 12, colour: muted };
    case "tagline":
      return { ...newSignatureBlock("text"), text: "Your tagline", italic: true, colour: muted };
    case "hours":
      return { ...newSignatureBlock("text"), text: "Working hours: Monday to Friday, 08:00–17:30", size: 11, colour: muted };
    case "disclaimer":
      return { ...newSignatureBlock("text"), text: "Add your company disclaimer here.", size: 10, colour: muted, padding: 12 };
    case "logo":
      return { ...newSignatureBlock("image"), imageRole: "logo", alt: "Company logo" };
    case "photo":
      return { ...newSignatureBlock("image"), imageRole: "photo", imageSource: "person", width: 72, radius: 999 };
    case "banner":
      return { ...newSignatureBlock("image"), imageRole: "banner", width: 440, radius: 6, padding: 10 };
    case "details":
    case "socials":
    case "button":
      return { ...newSignatureBlock(kind), fill: accent };
    case "identity":
    case "contact":
    case "text":
    case "badges":
    case "divider":
    case "spacer":
      return newSignatureBlock(kind);
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export function signatureBlockGlyph(block: SignatureBlock): SignatureGlyphKind {
  if (block.kind === "image") return block.imageRole ?? "image";
  if (block.kind === "contact" && block.field === "companyDetails") return "company";
  return block.kind;
}

export function signatureBlockLabel(block: SignatureBlock) {
  if (block.kind === "image") {
    return block.imageRole === "logo" ? "Logo" : block.imageRole === "photo" ? "Headshot" : block.imageRole === "banner" ? "Banner" : "Image";
  }
  if (block.kind === "contact" && block.field === "companyDetails") return "Company details";
  return signatureKinds[block.kind];
}

/** Changes a row's column count; blocks in removed columns move into the last remaining one. */
export function setSignatureRowColumns(document: SignatureDocument, rowId: string, count: number): SignatureDocument {
  const size = Math.max(1, Math.min(4, Math.round(count)));
  return {
    ...document,
    rows: document.rows.map((row): SignatureRow => {
      if (row.id !== rowId || row.columns.length === size) return row;
      const columns = row.columns.slice(0, size).map((column) => [...column]);
      if (row.columns.length > size) columns[size - 1].push(...row.columns.slice(size).flat());
      while (columns.length < size) columns.push([]);
      const next: SignatureRow = { ...row, columns };
      delete next.columnWidths;
      return next;
    }),
  };
}
