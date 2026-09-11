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
  | "text"
  | "image"
  | "badges"
  | "social"
  | "divider"
  | "spacer"
  | "import";
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
};
export type SignatureRow = { id: string; columns: SignatureBlock[][]; columnWidths?: number[] };
export type SignatureDocument = {
  version: 1;
  width: number;
  columnGap?: number;
  colour: string;
  rows: SignatureRow[];
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
  text: "Text",
  image: "Image",
  badges: "Trust badges",
  social: "Social link",
  divider: "Divider",
  spacer: "Space",
  import: "Imported signature",
};
export function newSignatureBlock(kind: SignatureBlockKind): SignatureBlock {
  return {
    id: crypto.randomUUID(),
    kind,
    text: kind === "text" ? "Your message" : "",
    field: kind === "identity" ? "name" : kind === "contact" ? "email" : "",
    label: "",
    assetId: null,
    href: "",
    alt: "",
    width: kind === "badges" ? 72 : kind === "image" ? 120 : 440,
    ...(kind === "badges" ? { images: [] } : {}),
    size: kind === "identity" ? 18 : 13,
    colour: "#253c39",
    align: "left",
    bold: kind === "identity",
    padding: kind === "spacer" ? 12 : 4,
  };
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
export function safeSignatureLink(value: string) {
  if (!value) return "";
  if (
    /^(https:\/\/|mailto:|tel:)/i.test(value) &&
    !/[\u0000-\u0020<>"']/.test(value)
  ) return value;
  return "";
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
  return {
    version: 1,
    width: num(doc.width, 480, 240, 640),
    columnGap: num(doc.columnGap, 20, 0, 48),
    colour: colour(doc.colour, "#ffffff"),
    rows: doc.rows.map((row) => {
      const rowId = id(row.id);
      if (
        !Array.isArray(row.columns) || row.columns.length < 1 ||
        row.columns.length > 4
      ) throw new Error("Choose between one and four columns.");
      return {
        id: rowId,
        columnWidths: signatureColumnWidths(row),
        columns: row.columns.map((column) => {
          if (!Array.isArray(column)) {
            throw new Error("Invalid signature column.");
          }
          return column.map((b) => {
            if (++count > 60 || !b || !Object.hasOwn(signatureKinds, b.kind)) {
              throw new Error(
                "A signature can have up to 60 supported blocks.",
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
            } as SignatureBlock;
          });
        }),
      };
    }),
  };
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
    const available = next.width - (next.columnGap ?? 20) * (row.columns.length - 1);
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
export function renderSignatureBlock(
  b: SignatureBlock,
  values: SignatureValues,
  assets: Record<string, string> = {},
) {
  const e = escapeSignatureHtml;
  let value = b.field ? values[b.field] || "" : b.text;
  let html = "", text = "";
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
    if (!b.assetId || !assets[b.assetId]) return { html: "", text: "" };
    html = `<img src="${e(assets[b.assetId])}" alt="${
      e(b.alt)
    }" width="${b.width}" style="display:block;border:0;width:${b.width}px;max-width:100%;height:auto">`;
    text = b.alt;
  } else if (b.kind === "divider") {
    html =
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid ${b.colour};font-size:1px;line-height:1px">&nbsp;</td></tr></table>`;
  } else if (b.kind === "spacer") {
    html =
      `<div style="height:${b.padding}px;line-height:${b.padding}px">&nbsp;</div>`;
  } else if (b.kind === "import") {
    html = b.text;
    text = b.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  } else {
    if (!value.trim()) return { html: "", text: "" };
    text = `${b.label ? `${b.label} ` : ""}${value}`;
    html = e(text).replace(/\n/g, "<br>");
  }
  const href = safeSignatureLink(
    b.href ||
      (b.field === "email" && value
        ? `mailto:${value}`
        : b.field === "website"
        ? value
        : ""),
  );
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
    };overflow-wrap:anywhere">${html}</div>`,
    text,
  };
}
export function renderSignature(
  document: SignatureDocument,
  values: SignatureValues,
  assets: Record<string, string> = {},
) {
  const rows = document.rows.map(row => {
    const widths = signatureColumnWidths(row);
    return row.columns.map((column,index) => column.map(block => renderSignatureBlock(
      block.kind === "image" ? {...block,width:Math.min(block.width, Math.floor((document.width - (document.columnGap ?? 20) * (row.columns.length - 1)) * widths[index] / 100))} : block,
      values, assets,
    )));
  });
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${document.width}" style="width:${document.width}px;max-width:100%;background:${document.colour};font-family:Arial,Helvetica,sans-serif;border-collapse:collapse"><tbody>${rows.map((columns,rowIndex) => {
      const widths = signatureColumnWidths(document.rows[rowIndex]);
      return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-collapse:collapse"><tr>${columns.map((blocks,index) => `<td width="${widths[index]}%" valign="top" style="width:${widths[index]}%;vertical-align:top;overflow-wrap:anywhere;${index < columns.length-1 ? `padding-right:${document.columnGap ?? 20}px;` : ""}">${blocks.map(block=>block.html).join("")}</td>`).join("")}</tr></table></td></tr>`;
    }).join("")}</tbody></table>`,
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
