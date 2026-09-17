import { inboxRequest as rawInboxRequest } from "./inbox-api";
function inboxRequest<T = unknown>(path: string, init: RequestInit = {}) {
  return rawInboxRequest<T>(path, {
    ...init,
    normalize: (payload) => payload as T,
  });
}
import type {
  SignatureChoice,
  SignatureDocument,
  SignatureSelection,
  SignatureTemplate,
} from "../../../shared/email-signatures";
export * from "../../../shared/email-signatures";
export type SignaturePerson = {
  id: string;
  name: string;
  email: string;
  jobTitle: string;
  company?: string;
  website?: string;
  address?: string;
  phone: string;
  mobile: string;
  departmentIds: string[];
  allowCustomisation: boolean | null;
};
export type SignatureWorkspace = {
  templates: SignatureTemplate[];
  assetUrls: Record<string, string>;
  manager: boolean;
  allowCustomisation: boolean;
  userId: string;
  company: string;
  policy: { allow_customisation: boolean; website: string; revision: number; company_details?: import("../../../shared/email-signatures").SignatureCompanyDetails };
  people: SignaturePerson[];
  departments: { id: string; name: string }[];
};
export const getSignatureWorkspace = () =>
  inboxRequest<SignatureWorkspace>("/signatures");
export const getSignatureChoices = (mailboxId: string) =>
  inboxRequest<
    {
      choices: SignatureChoice[];
      defaultId: string | null;
      allowCustomisation: boolean;
    }
  >(`/signatures/choices?mailboxId=${encodeURIComponent(mailboxId)}`);
export const saveSignatureTemplate = (
  template: Partial<SignatureTemplate> & {
    name: string;
    document: SignatureDocument;
  },
  publish = false,
) =>
  inboxRequest<SignatureTemplate>("/signatures/templates", {
    method: "POST",
    body: JSON.stringify({
      ...template,
      personal: !!template.ownerUserId,
      publish,
    }),
  });
export const setSignatureDefault = (mailboxId: string, templateId: string) =>
  inboxRequest("/signatures/default", {
    method: "PATCH",
    body: JSON.stringify({ mailboxId, templateId }),
  });
export const updateSignaturePolicy = (
  input: {
    userId?: string;
    allowCustomisation: boolean | null;
    website?: string;
  },
) =>
  inboxRequest("/signatures/policy", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
export const updateSignatureProfile = (
  input: { userId: string; phone: string; mobile: string },
) =>
  inboxRequest("/signatures/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
export const getSignatureVersions = (id: string) =>
  inboxRequest<
    {
      revision: number;
      document: SignatureDocument;
      assignments: SignatureTemplate["assignments"];
      created_at: string;
    }[]
  >(`/signatures/templates/${id}/versions`);
export const importSignature = (
  input: { html?: string; mailboxId?: string; messageId?: string },
) =>
  inboxRequest<
    { html: string; source: string; importedAt: string; imagesRemoved: boolean }
  >("/signatures/import", { method: "POST", body: JSON.stringify(input) });
export async function uploadSignatureImage(file: File, personal: boolean) {
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 2 MB.");
  }
  const contentBase64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("The image could not be read."));
    r.readAsDataURL(file);
  });
  return inboxRequest<{ id: string; url: string }>("/signatures/assets", {
    method: "POST",
    body: JSON.stringify({ fileName: file.name, contentBase64, personal }),
  });
}
export function signatureSelection(
  choice: SignatureChoice,
  enabled = true,
): SignatureSelection {
  return {
    enabled,
    templateId: choice.id,
    revision: choice.revision,
    fingerprint: choice.fingerprint,
  };
}

export const getSignatureSentEmails = (mailboxId: string) =>
  inboxRequest<{ id: string; subject: string; sentAt: string }[]>(
    `/signatures/sent?mailboxId=${encodeURIComponent(mailboxId)}`,
  );

/** Copy only the saved Admin brand image into managed signature storage. Rasterise SVG for email clients. */
export async function signatureBrandImageFile(url: string): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      "The brand logo could not be loaded. Try again or upload an image.",
    );
  }
  const blob = await response.blob();
  if (blob.size > 5 * 1024 * 1024) {
    throw new Error("The brand logo is too large. Upload an image under 2 MB.");
  }
  if (
    ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(blob.type)
  ) {
    const extension = blob.type.split("/")[1];
    return new File([blob], `company-logo.${extension}`, { type: blob.type });
  }
  if (blob.type !== "image/svg+xml") {
    throw new Error("Upload a PNG or JPG version of your brand logo.");
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(
      1,
      1200 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Upload a PNG version of your brand logo.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("Upload a PNG version of your brand logo.")),
        "image/png",
      )
    );
    return new File([png], "company-logo.png", { type: "image/png" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
