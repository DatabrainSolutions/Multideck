import sanitizeHtml from "npm:sanitize-html@2.17.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2";
import {
  eligibleSignatures,
  renderSignature,
  signatureCompanyText,
  signatureAssetIds,
  type SignatureDocument,
  type SignatureSelection,
  type SignatureTemplate,
  type SignatureValues,
  validateSignatureDocument,
} from "../../../shared/email-signatures.ts";
import {
  base64Encode,
  cleanString,
  InboxHttpError,
  type OutboundAttachment,
  publicProvider,
  sha256Hex,
} from "./core.ts";
import {
  type Actor,
  credential,
  hasPermission,
  requireMailbox,
  requirePermission,
} from "./runtime.ts";
type Db = SupabaseClient;
type Row = Record<string, any>;
async function data<T = any>(
  query: PromiseLike<{ data: T; error: any }>,
): Promise<T> {
  const r = await query;
  if (r.error) {
    throw new InboxHttpError(
      r.error.code === "40001" ? 409 : r.error.code === "42501" ? 403 : 503,
      r.error.code === "40001"
        ? "This signature changed. Refresh before saving your changes."
        : "Signature settings could not be saved or loaded.",
      "signature_storage_error",
    );
  }
  return r.data;
}
async function active(admin: Db, actor: Actor) {
  const u = await data(
    admin.from("cmp_Users").select(
      "User_ID,Company_ID,Auth_User_ID,User_AccessStatus",
    ).eq("User_ID", actor.userId).maybeSingle(),
  );
  if (
    !u || u.Company_ID !== actor.companyId ||
    u.Auth_User_ID !== actor.authUserId ||
    (u.User_AccessStatus && u.User_AccessStatus !== "active")
  ) {
    throw new InboxHttpError(
      403,
      "Your workspace access is no longer active.",
      "permission_denied",
    );
  }
}
export function signatureTemplate(row: Row): SignatureTemplate {
  return {
    id: row.id,
    name: row.name,
    document: row.document,
    revision: row.revision,
    publishedRevision: row.published_revision,
    publishedDocument: row.published_document,
    assignments: row.assignments,
    publishedAssignments: row.published_assignments,
    ownerUserId: row.owner_user_id,
    sourceTemplateId: row.source_template_id,
    archived: row.archived,
    updatedAt: row.updated_at,
  };
}
export function cleanSignatureImport(html: string) {
  return sanitizeHtml(html.slice(0, 60000), {
    allowedTags: [
      "p",
      "div",
      "span",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "a",
      "table",
      "tbody",
      "thead",
      "tr",
      "td",
      "th",
      "hr",
    ],
    allowedAttributes: {
      "*": ["style"],
      a: ["href"],
      td: ["width", "colspan", "rowspan"],
      th: ["width", "colspan"],
      table: ["width", "cellpadding", "cellspacing", "role"],
    },
    allowedSchemes: ["https", "mailto", "tel"],
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        "color": [/^#[0-9a-f]{3,6}$/i, /^rgb\([\d,\s]+\)$/],
        "background-color": [/^#[0-9a-f]{3,6}$/i],
        "font-size": [/^\d{1,2}(px|pt)$/],
        "font-weight": [/^(normal|bold|[1-9]00)$/],
        "text-align": [/^(left|center|right)$/],
        "padding": [/^[\d\s.px]+$/],
        "border-collapse": [/^collapse$/],
      },
    },
  });
}
async function context(admin: Db, actor: Actor) {
  await active(admin, actor);
  const manager = await hasPermission(admin, actor, "Email.Signatures.Manage");
  if (!manager) await requirePermission(admin, actor, "Email.Send");
  const [
    policy,
    profiles,
    users,
    depts,
    links,
    company,
    rows,
    offices,
    officeLinks,
    profileSources,
  ] = await Promise
    .all([
      data(
        admin.from("email_signature_policies").select("*").eq(
          "company_id",
          actor.companyId,
        ).maybeSingle(),
      ),
      data(
        admin.from("email_signature_profiles").select("*").eq(
          "company_id",
          actor.companyId,
        ),
      ),
      data(
        admin.from("cmp_Users").select(
          "User_ID,User_Firstname,User_Lastname,User_Email,User_JobTitle,User_AccessStatus",
        ).eq("Company_ID", actor.companyId),
      ),
      data(
        admin.from("cmp_Departments").select("Department_ID,Department_Name")
          .eq("Company_ID", actor.companyId).eq("Department_IsActive", true),
      ),
      data(admin.from("cmp_Users_Departments").select("User_ID,Department_ID")),
      data(
        admin.from("cmp_Company").select("Company_Name").eq(
          "Company_ID",
          actor.companyId,
        ).maybeSingle(),
      ),
      data(
        admin.from("email_signature_templates").select("*").eq(
          "company_id",
          actor.companyId,
        ).eq("archived", false).order("created_at"),
      ),
      data(
        admin.from("cmp_Offices").select("Office_ID,Office_Address").eq(
          "Company_ID",
          actor.companyId,
        ).order("Office_Name"),
      ),
      data(admin.from("cmp_Users_Offices").select("User_ID,Office_ID")),
      data(admin.rpc("email_signature_profile_sources", {p_company: actor.companyId})),
    ]);
  const people = (users ?? []).filter((u: Row) =>
    !u.User_AccessStatus || u.User_AccessStatus === "active"
  ).map((u: Row) => {
    const profile = (profiles ?? []).find((p: Row) => p.user_id === u.User_ID);
    const source = (profileSources ?? []).find((p: Row) => p.user_id === u.User_ID);
    const profileValues = {
      name: source?.name || [u.User_Firstname,u.User_Lastname].filter(Boolean).join(" ") || u.User_Email,
      jobTitle: u.User_JobTitle || "", email: u.User_Email, phone: source?.phone || "", mobile: source?.mobile || "", website: source?.website || policy?.website || "", company: company?.Company_Name || "",
      address: (offices ?? []).find((o: Row) => (officeLinks ?? []).some((l: Row) => l.User_ID === u.User_ID && l.Office_ID === o.Office_ID))?.Office_Address || "",
    };
    return {
      id: u.User_ID,
      profileValues, overrides: profile?.overrides || {}, profileRevision: profile?.revision || 0,
      ...profileValues, ...(profile?.overrides || {}),
      allowCustomisation: profile?.allow_customisation ?? null,
      departmentIds: (links ?? []).filter((l: Row) =>
        l.User_ID === u.User_ID &&
        (depts ?? []).some((d: Row) =>
          d.Department_ID === l.Department_ID
        )
      ).map((l: Row) => l.Department_ID),
    };
  });
  const me = people.find((p: Row) => p.id === actor.userId);
  if (!me) {
    throw new InboxHttpError(
      403,
      "Active staff profile required.",
      "permission_denied",
    );
  }
  const allowCustomisation = me.allowCustomisation ??
    policy?.allow_customisation ?? true;
  const templates = (rows ?? []).map(signatureTemplate);
  return {
    manager,
    policy: policy || { allow_customisation: true, website: "", revision: 0 },
    people,
    depts,
    company: company?.Company_Name || "",
    me,
    allowCustomisation,
    templates,
  };
}
function values(
  ctx: Awaited<ReturnType<typeof context>>,
  person: Row,
  address?: string,
): SignatureValues {
  return {
    name: person.name,
    jobTitle: person.jobTitle,
    email: person.overrides?.email ?? address ?? person.email,
    phone: person.phone,
    mobile: person.mobile,
    company: person.company ?? ctx.company,
    website: person.website ?? ctx.policy.website ?? "",
    address: person.address || "",
    companyDetails: signatureCompanyText(ctx.policy.company_details, ctx.company, ctx.policy.website),
  };
}
async function assetMap(
  admin: Db,
  actor: Actor,
  document: SignatureDocument,
  owner: string | null,
  preview: boolean,
) {
  const ids = signatureAssetIds(document);
  if (ids.length > 8) {
    throw new InboxHttpError(
      400,
      "Use up to eight images in a signature.",
      "signature_asset_limit",
    );
  }
  const urls: Record<string, string> = {};
  const attachments: OutboundAttachment[] = [];
  if (!ids.length) return { urls, attachments };
  const rows = await data(
    admin.from("email_signature_assets").select("*").eq(
      "company_id",
      actor.companyId,
    ).in("id", ids),
  );
  if (
    (rows ?? []).length !== ids.length ||
    (rows ?? []).some((r: Row) => r.owner_user_id && r.owner_user_id !== owner)
  ) {
    throw new InboxHttpError(
      403,
      "A signature image is unavailable. Replace it before continuing.",
      "signature_asset_missing",
    );
  }
  if (
    (rows ?? []).reduce((sum: number, r: Row) => sum + r.size_bytes, 0) >
      10 * 1024 * 1024
  ) {
    throw new InboxHttpError(
      400,
      "Signature images must total less than 10 MB.",
      "signature_asset_limit",
    );
  }
  for (const r of rows ?? []) {
    if (preview) {
      const signed = await data(
        admin.storage.from("email-signatures").createSignedUrl(r.path, 600),
      );
      urls[r.id] = signed!.signedUrl;
    } else {
      const file = await data(
        admin.storage.from("email-signatures").download(r.path),
      );
      const bytes = new Uint8Array(await file!.arrayBuffer());
      const contentId = `signature-${r.id}@multideck`;
      urls[r.id] = `cid:${contentId}`;
      attachments.push({
        fileName: r.file_name,
        mimeType: r.mime_type,
        bytes,
        contentId,
        isInline: true,
      });
    }
  }
  return { urls, attachments };
}
export async function signatureChoices(
  admin: Db,
  actor: Actor,
  mailboxId: string,
) {
  const ctx = await context(admin, actor);
  const { mailbox } = await requireMailbox(admin, actor, mailboxId, "send");
  const eligible = eligibleSignatures(
    ctx.templates,
    actor.userId,
    ctx.me.departmentIds,
    ctx.allowCustomisation,
  );
  const profile = values(ctx, ctx.me, mailbox.CommMailbox_Address);
  const choices = await Promise.all(eligible.map(async (t) => {
    const doc = t.publishedDocument!;
    const { urls } = await assetMap(admin, actor, doc, t.ownerUserId, true);
    const rendered = renderSignature(doc, profile, urls);
    return {
      id: t.id,
      name: t.name,
      revision: t.publishedRevision!,
      fingerprint: await sha256Hex(
        JSON.stringify([t.id, t.publishedRevision, profile]),
      ),
      ...rendered,
      personal: !!t.ownerUserId,
    };
  }));
  const pref = await data(
    admin.from("email_signature_defaults").select("template_id").eq(
      "user_id",
      actor.userId,
    ).eq("mailbox_id", mailboxId).maybeSingle(),
  );
  return {
    choices,
    defaultId: choices.some((c) => c.id === pref?.template_id)
      ? pref!.template_id
      : choices.length === 1
      ? choices[0].id
      : null,
    allowCustomisation: ctx.allowCustomisation,
  };
}
export async function resolveSignature(
  admin: Db,
  actor: Actor,
  mailbox: Row,
  selection: SignatureSelection | undefined,
) {
  await active(admin, actor);
  if (selection?.enabled === false) {
    return {
      html: "",
      text: "",
      attachments: [] as OutboundAttachment[],
      selection,
    };
  }
  const ctx = await context(admin, actor);
  const eligible = eligibleSignatures(
    ctx.templates,
    actor.userId,
    ctx.me.departmentIds,
    ctx.allowCustomisation,
  );
  if (!eligible.length && !selection?.templateId) {
    return {
      html: "",
      text: "",
      attachments: [] as OutboundAttachment[],
      selection,
    };
  }
  const template = eligible.find((t) => t.id === selection?.templateId);
  if (!template) {
    throw new InboxHttpError(
      409,
      "Choose and review your email signature, or turn it off for this email.",
      "signature_review_required",
    );
  }
  const profile = values(ctx, ctx.me, mailbox.CommMailbox_Address);
  const fingerprint = await sha256Hex(
    JSON.stringify([template.id, template.publishedRevision, profile]),
  );
  if (
    selection?.revision !== template.publishedRevision ||
    selection.fingerprint !== fingerprint
  ) {
    throw new InboxHttpError(
      409,
      "Your signature changed. Refresh its preview before sending.",
      "signature_review_required",
    );
  }
  const assets = await assetMap(
    admin,
    actor,
    template.publishedDocument!,
    template.ownerUserId,
    false,
  );
  return {
    ...renderSignature(template.publishedDocument!, profile, assets.urls),
    attachments: assets.attachments,
    selection,
  };
}
export async function signatureRoute(
  admin: Db,
  actor: Actor,
  path: string[],
  method: string,
  body: Row,
  url: URL,
) {
  const ctx = await context(admin, actor);
  if (path[1] === "team" && method === "GET") {
    if (!ctx.manager) throw new InboxHttpError(403,"Signature manager required.","permission_denied");
    return { people: ctx.people, departments: ctx.depts, templates: ctx.templates.filter(t=>!t.ownerUserId), policy: ctx.policy };
  }
  if (path[1] === "team" && method === "PATCH") {
    if (!ctx.manager) throw new InboxHttpError(403,"Signature manager required.","permission_denied");
    const field = cleanString(body.field,40);
    if (!["name","jobTitle","email","phone","mobile","address","website","company"].includes(field) || (body.value !== null && (typeof body.value !== "string" || body.value.length > 500)) || !Number.isInteger(body.expectedRevision)) throw new InboxHttpError(400,"Check the signature field and try again.","invalid_field");
    const value = body.value === null ? null : body.value.trim();
    if (field === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new InboxHttpError(400,"Enter a valid email address.","invalid_email");
    if (field === "website" && value && !/^https:\/\/[^\s<>]+$/i.test(value)) throw new InboxHttpError(400,"Use a website beginning with https://.","invalid_website");
    await data(admin.rpc("email_signature_team_patch",{p_actor:actor.userId,p_user:body.userId,p_field:field,p_value:value,p_expected:body.expectedRevision}));
    const updated=await context(admin,actor);
    return updated.people.find((p:Row)=>p.id===body.userId);
  }
  if (path.length === 1 && method === "GET") {
    const eligible = eligibleSignatures(
      ctx.templates,
      actor.userId,
      ctx.me.departmentIds,
      ctx.allowCustomisation,
    );
    const templates = ctx.manager
      ? ctx.templates.filter((t) =>
        !t.ownerUserId || t.ownerUserId === actor.userId
      )
      : ctx.templates.filter((t) =>
        t.ownerUserId === actor.userId || eligible.some((e) => e.id === t.id)
      ).map((t) =>
        t.ownerUserId ? t : {
          ...t,
          document: t.publishedDocument!,
          revision: t.publishedRevision!,
          assignments: [],
          publishedAssignments: [],
        }
      );
    const assets = await data(
      admin.from("email_signature_assets").select("*").eq(
        "company_id",
        actor.companyId,
      ),
    );
    const referencedAssets = new Set(
      templates.flatMap((t) => signatureAssetIds(t.document)),
    );
    const allowedAssets = (assets ?? []).filter((a: Row) =>
      a.owner_user_id === actor.userId ||
      (!a.owner_user_id && (ctx.manager || referencedAssets.has(a.id)))
    );
    const assetUrls: Record<string, string> = {};
    for (const a of allowedAssets) {
      const signed = await data(
        admin.storage.from("email-signatures").createSignedUrl(a.path, 600),
      );
      assetUrls[a.id] = signed!.signedUrl;
    }
    return {
      templates,
      assetUrls,
      manager: ctx.manager,
      allowCustomisation: ctx.allowCustomisation,
      userId: actor.userId,
      company: ctx.company,
      policy: ctx.policy,
      people: ctx.manager ? ctx.people : [ctx.me],
      departments: ctx.manager
        ? (ctx.depts ?? []).map((d: Row) => ({
          id: d.Department_ID,
          name: d.Department_Name,
        }))
        : [],
    };
  }
  if (path[1] === "sent" && method === "GET") {
    await requirePermission(admin, actor, "Email.Read");
    const mailboxId = url.searchParams.get("mailboxId") || "";
    await requireMailbox(admin, actor, mailboxId, "read");
    const messages = await data(
      admin.from("Comm_Messages").select(
        "CommMessage_ID,CommMessage_Subject,CommMessage_SentAt",
      ).eq("CommMessage_MailboxID", mailboxId).eq(
        "CommMessage_IsInbound",
        false,
      ).eq("CommMessage_IsDraft", false).eq("CommMessage_IsDeleted", false).eq(
        "CommMessage_IsBodyRedacted",
        false,
      ).order("CommMessage_SentAt", { ascending: false }).limit(25),
    );
    return (messages ?? []).map((m: Row) => ({
      id: m.CommMessage_ID,
      subject: m.CommMessage_Subject || "(No subject)",
      sentAt: m.CommMessage_SentAt,
    }));
  }
  if (path[1] === "choices" && method === "GET") {
    return await signatureChoices(
      admin,
      actor,
      url.searchParams.get("mailboxId") || "",
    );
  }
  if (path[1] === "default" && method === "PATCH") {
    const choices = await signatureChoices(admin, actor, body.mailboxId);
    if (!choices.choices.some((c) => c.id === body.templateId)) {
      throw new InboxHttpError(
        403,
        "Choose an available signature.",
        "permission_denied",
      );
    }
    await data(
      admin.from("email_signature_defaults").upsert({
        user_id: actor.userId,
        mailbox_id: body.mailboxId,
        template_id: body.templateId,
      }),
    );
    return { saved: true };
  }
  if (path[1] === "preview" && method === "POST") {
    const person = ctx.people.find((p: Row) =>
      p.id === (ctx.manager ? body.userId : actor.userId)
    ) || ctx.me;
    const doc = validateSignatureDocument(body.document);
    for (const r of doc.rows) {
      for (const c of r.columns) {
        for (const b of c) {
          if (b.kind === "import") {
            b.text = cleanSignatureImport(b.text);
          }
        }
      }
    }
    const owner = body.personal ? actor.userId : null;
    const assets = await assetMap(admin, actor, doc, owner, true);
    return renderSignature(doc, values(ctx, person), assets.urls);
  }
  if (path[1] === "assets" && method === "POST") {
    if (!ctx.manager && !ctx.allowCustomisation) {
      throw new InboxHttpError(
        403,
        "Your company manages your signature.",
        "permission_denied",
      );
    }
    const bytes = Uint8Array.from(
      atob(cleanString(body.contentBase64, 2800000)),
      (c) => c.charCodeAt(0),
    );
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 &&
      bytes[3] === 71;
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const gif = String.fromCharCode(...bytes.slice(0, 6)).match(/^GIF8[79]a$/);
    const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    const mime = png
      ? "image/png"
      : jpg
      ? "image/jpeg"
      : gif
      ? "image/gif"
      : webp
      ? "image/webp"
      : null;
    if (!mime || bytes.length > 2097152 || bytes.length < 12) {
      throw new InboxHttpError(
        400,
        "Upload a PNG, JPEG, WebP or GIF image up to 2 MB.",
        "signature_image_invalid",
      );
    }
    const id = crypto.randomUUID();
    const storagePath = `${actor.companyId}/${id}`;
    const owner = body.personal || !ctx.manager ? actor.userId : null;
    await data(
      admin.storage.from("email-signatures").upload(storagePath, bytes, {
        contentType: mime,
        upsert: false,
      }),
    );
    try {
      await data(
        admin.from("email_signature_assets").insert({
          id,
          company_id: actor.companyId,
          owner_user_id: owner,
          created_by: actor.userId,
          path: storagePath,
          mime_type: mime,
          file_name: cleanString(body.fileName, 180) || "signature-image",
          size_bytes: bytes.length,
        }),
      );
    } catch (e) {
      await admin.storage.from("email-signatures").remove([storagePath]);
      throw e;
    }
    const signed = await data(
      admin.storage.from("email-signatures").createSignedUrl(storagePath, 600),
    );
    return { id, url: signed!.signedUrl };
  }
  if (path[1] === "import" && method === "POST") {
    if (!ctx.allowCustomisation && !ctx.manager) {
      throw new InboxHttpError(
        403,
        "Your company manages your signature.",
        "permission_denied",
      );
    }
    let html = cleanString(body.html, 60000);
    let source = "Pasted signature";
    if (body.mailboxId) {
      await requirePermission(admin, actor, "Email.Read");
      const { mailbox, connection } = await requireMailbox(
        admin,
        actor,
        body.mailboxId,
        "read",
      );
      if (body.messageId) {
        const message = await data(
          admin.from("Comm_Messages").select(
            "CommMessage_BodyHTML,CommMessage_BodyText,CommMessage_IsInbound,CommMessage_IsBodyRedacted,CommMessage_IsDraft",
          ).eq("CommMessage_ID", body.messageId).eq(
            "CommMessage_MailboxID",
            body.mailboxId,
          ).eq("CommMessage_IsDeleted", false).maybeSingle(),
        );
        if (
          !message || message.CommMessage_IsInbound ||
          message.CommMessage_IsBodyRedacted || message.CommMessage_IsDraft
        ) {
          throw new InboxHttpError(
            404,
            "Choose a sent email from this mailbox.",
            "signature_source_missing",
          );
        }
        html = message.CommMessage_BodyHTML ||
          sanitizeHtml(message.CommMessage_BodyText || "", {
            allowedTags: [],
            allowedAttributes: {},
          });
        source = "Sent email";
      } else {
        if (publicProvider(connection.CommConn_ProviderTypeCode) !== "gmail") {
          throw new InboxHttpError(
            409,
            "For Outlook, paste your signature or select it from a sent email.",
            "signature_import_unsupported",
          );
        }
        const creds = await credential(admin, connection);
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${
            encodeURIComponent(mailbox.CommMailbox_Address)
          }`,
          { headers: { Authorization: `Bearer ${creds.accessToken}` } },
        );
        if (!response.ok) {
          throw new InboxHttpError(
            409,
            "Reconnect Gmail to allow signature import, or paste your signature.",
            "signature_import_reconnect",
          );
        }
        html = (await response.json()).signature || "";
        source = "Gmail";
      }
    }
    return {
      html: cleanSignatureImport(html),
      source,
      importedAt: new Date().toISOString(),
      imagesRemoved: /<img\b/i.test(html),
    };
  }
  if (path[1] === "company" && method === "PATCH") {
    if (!ctx.manager) throw new InboxHttpError(403, "Only signature managers can edit company details.", "permission_denied");
    const details: Record<string,string> = {};
    for (const field of ["name", "website", "phone", "email", "address"]) {
      if (typeof body[field] !== "string" || body[field].length > 1000) throw new InboxHttpError(400, "Check the company details.", "invalid_details");
      details[field] = body[field].trim();
    }
    if (details.website && !/^https:\/\/[^\s<>"']+$/i.test(details.website)) throw new InboxHttpError(400, "Use a website beginning with https://.", "invalid_website");
    if (details.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) throw new InboxHttpError(400, "Enter a valid company email address.", "invalid_email");
    await data(admin.rpc("email_signature_company_details", {p_actor: actor.userId, p_details: details, p_revision: body.expectedRevision}));
    return {saved:true};
  }
  if (path[1] === "policy" && method === "PATCH") {
    if (!ctx.manager) {
      throw new InboxHttpError(
        403,
        "Only signature managers can change this setting.",
        "permission_denied",
      );
    }
    if (
      body.allowCustomisation === false &&
      !ctx.templates.some((t) =>
        !t.ownerUserId && t.publishedRevision &&
        t.publishedAssignments.some((a) => a.kind === "everyone")
      )
    ) {
      throw new InboxHttpError(
        400,
        "Apply a company signature to everyone before restricting customisation.",
        "signature_template_required",
      );
    }
    await data(admin.rpc("email_signature_policy", {
      p_actor: actor.userId,
      p_user: body.userId || null,
      p_allow: typeof body.allowCustomisation === "boolean"
        ? body.allowCustomisation
        : null,
      p_website: cleanString(body.website, 2000),
    }));
    return { saved: true };
  }
  if (path[1] === "profile" && method === "PATCH") {
    throw new InboxHttpError(409,"Edit your profile in Settings, or use Signature team details for admin overrides.","signature_profile_moved");
  }

  if (
    path[1] === "templates" && path[2] && path[3] === "versions" &&
    method === "GET"
  ) {
    const t = ctx.templates.find((t) => t.id === path[2]);
    if (!t || (t.ownerUserId ? t.ownerUserId !== actor.userId : !ctx.manager)) {
      throw new InboxHttpError(
        403,
        "Signature access denied.",
        "permission_denied",
      );
    }
    return await data(
      admin.from("email_signature_versions").select(
        "revision,document,assignments,created_at",
      ).eq("template_id", t.id).eq("company_id", actor.companyId).order(
        "revision",
        { ascending: false },
      ).limit(30),
    );
  }
  if (path[1] === "templates" && method === "POST") {
    let document: SignatureDocument;
    try {
      document = validateSignatureDocument(body.document);
    } catch (e) {
      throw new InboxHttpError(
        400,
        (e as Error).message,
        "signature_document_invalid",
      );
    }
    for (const r of document.rows) {
      for (const c of r.columns) {
        for (const b of c) {
          if (b.kind === "import") b.text = cleanSignatureImport(b.text);
        }
      }
    }
    const personal = body.personal === true;
    const existing = ctx.templates.find((t) => t.id === body.id);
    if (!ctx.manager && !personal && !existing?.ownerUserId) {
      throw new InboxHttpError(
        403,
        "Only managers can change company signatures.",
        "permission_denied",
      );
    }
    if (
      !existing && body.sourceTemplateId &&
      !eligibleSignatures(
        ctx.templates,
        actor.userId,
        ctx.me.departmentIds,
        ctx.allowCustomisation,
      ).some((t) => t.id === body.sourceTemplateId)
    ) {
      throw new InboxHttpError(
        403,
        "Source signature unavailable.",
        "permission_denied",
      );
    }
    const assignments = Array.isArray(body.assignments) ? body.assignments : [];
    for (const a of assignments) {
      if (
        !(a.kind === "everyone" && a.id === null) &&
        !(a.kind === "user" && ctx.people.some((p: Row) => p.id === a.id)) &&
        !(a.kind === "department" &&
          (ctx.depts ?? []).some((d: Row) => d.Department_ID === a.id))
      ) {
        throw new InboxHttpError(
          400,
          "Choose current people or departments.",
          "signature_assignment_invalid",
        );
      }
    }
    await assetMap(
      admin,
      actor,
      document,
      existing?.ownerUserId || (personal ? actor.userId : null),
      true,
    );
    const name = cleanString(body.name, 120);
    if (!name) {
      throw new InboxHttpError(
        400,
        "Name this signature.",
        "signature_name_required",
      );
    }
    const saved = await data(admin.rpc("email_signature_commit", {
      p_actor: actor.userId,
      p_id: body.id || crypto.randomUUID(),
      p_expected: body.revision || 0,
      p_payload: {
        name,
        document,
        assignments,
        personal,
        sourceTemplateId: body.sourceTemplateId || null,
        archived: body.archived === true,
      },
      p_publish: body.publish === true,
    }));
    return signatureTemplate(saved);
  }
  throw new InboxHttpError(
    404,
    "Signature action unavailable.",
    "route_not_found",
  );
}
