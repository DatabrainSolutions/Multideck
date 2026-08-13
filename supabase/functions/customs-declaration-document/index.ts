import {
  authenticateRequest,
  corsHeaders,
  FunctionError,
  generatedDocumentsBucket,
  isUuid,
  jsonResponse,
  maximumGeneratedFileBytes,
  signedUrlLifetimeSeconds,
  toFunctionError,
} from "../_shared/document-functions.ts";
import {
  customsDeclarationTemplate,
  type CustomsDocumentDirection,
} from "../_shared/customs-declaration-template.ts";
import { buildCustomsDeclarationDocumentDataset } from "../_shared/customs-declaration-document-data.ts";

type Json = Record<string, unknown>;

function string(value: unknown, maximum = 500) {
  return typeof value === "string"
    ? value.trim().slice(0, maximum)
    : value == null
    ? ""
    : String(value).trim().slice(0, maximum);
}

function carboneAuthorization() {
  const explicit = Deno.env.get("CARBONE_AUTH_HEADER")?.trim();
  if (explicit) return explicit;
  const username = Deno.env.get("CARBONE_USERNAME");
  const password = Deno.env.get("CARBONE_PASSWORD");
  if (username && password) return `Basic ${btoa(`${username}:${password}`)}`;
  const token = Deno.env.get("CARBONE_API_TOKEN")?.trim();
  if (token) return `Bearer ${token}`;
  throw new FunctionError(
    503,
    "Declaration PDFs are not configured for this workspace.",
    "Carbone authentication is unavailable",
  );
}

function carboneBaseUrl() {
  const configured = Deno.env.get("CARBONE_URL")?.trim().replace(/\/$/, "");
  if (!configured) {
    throw new FunctionError(
      503,
      "Declaration PDFs are not configured for this workspace.",
      "CARBONE_URL is unavailable",
    );
  }
  const url = new URL(configured);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  ) {
    throw new FunctionError(
      503,
      "Declaration PDFs are not configured safely.",
      "CARBONE_URL must use HTTPS",
    );
  }
  return url.toString().replace(/\/$/, "");
}

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

async function sha256(value: Uint8Array | string) {
  const source = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  const bytes = Uint8Array.from(source);
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function safeFileName(direction: CustomsDocumentDirection, mrn: string) {
  const reference = mrn.replace(/[^A-Za-z0-9]/g, "").slice(0, 40) || "accepted";
  return `CDS-${direction === "import" ? "Import" : "Export"}-${reference}.pdf`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Method not allowed" }, 405);
  }

  try {
    const context = await authenticateRequest(request);
    const input = await request.json() as Json;
    const declarationId = string(input.declarationId, 36);
    if (!isUuid(declarationId)) {
      throw new FunctionError(
        400,
        "Choose a valid declaration.",
        "Declaration UUID validation failed",
      );
    }

    const { data: declaration, error: declarationError } = await context.admin
      .from("Customs_Declarations")
      .select("*").eq("CUST_id", declarationId).eq(
        "CUST_CreatedBy",
        context.userId,
      ).eq("CUST_IsDeleted", false).maybeSingle();
    if (declarationError) throw declarationError;
    if (!declaration) {
      throw new FunctionError(
        404,
        "That declaration was not found.",
        "Owned Customs declaration was not found",
      );
    }

    const { data: submission, error: submissionError } = await context.admin
      .from("ICUS_Submissions")
      .select("*").eq("ICUSS_CustomsID", declarationId).order(
        "ICUSS_CreatedAt",
        { ascending: false },
      ).limit(1).maybeSingle();
    if (submissionError) throw submissionError;
    const accepted = submission?.ICUSS_Status === "accepted";
    if (!accepted || !submission?.ICUSS_MRN) {
      throw new FunctionError(
        409,
        "The declaration PDF becomes available after Customs accepts the declaration and returns an MRN.",
        "Official declaration PDF requested before acceptance",
      );
    }

    const { data: itemRows, error: itemRowsError } = await context.admin.from(
      "Customs_Items",
    )
      .select("CUSTI_ItemNumber, CUSTI_ItemPayloadJSON")
      .eq("CUSTI_CustomsID", declarationId)
      .order("CUSTI_ItemNumber", { ascending: true });
    if (itemRowsError) throw itemRowsError;

    const { data: connection, error: connectionError } = await context.admin
      .from("ICUS_ApiConnections")
      .select("ICUSC_Environment")
      .eq("ICUSC_id", submission.ICUSS_ApiConnectionID)
      .maybeSingle();
    if (connectionError) throw connectionError;
    const providerEnvironment = connection?.ICUSC_Environment === "production"
      ? "production"
      : "sandbox";
    const { dataset, provenance, usesAcceptedSnapshot, providerStatus } =
      buildCustomsDeclarationDocumentDataset(
        declaration as Json,
        submission as Json,
        (itemRows ?? []) as Json[],
        providerEnvironment,
      );
    const direction = dataset.direction;
    const template = customsDeclarationTemplate(direction);
    const templateHash = await sha256(template);
    const renderContract = { version: 2, converter: "C", templateHash };
    const sourceJson = JSON.stringify({ dataset, provenance, renderContract });
    const sourceHash = await sha256(sourceJson);
    const { data: existing, error: existingError } = await context.admin.from(
      "Customs_DeclarationDocuments",
    )
      .select("*").eq("CUSTD_CustomsID", declarationId).eq(
        "CUSTD_SourceSHA256",
        sourceHash,
      ).maybeSingle();
    if (existingError) throw existingError;

    let document = existing as Json | null;
    if (!document) {
      const response = await fetch(
        `${carboneBaseUrl()}/render/template?download=true`,
        {
          method: "POST",
          headers: {
            Authorization: carboneAuthorization(),
            "Content-Type": "application/json",
            "carbone-version": Deno.env.get("CARBONE_API_VERSION")?.trim() ||
              "5",
          },
          body: JSON.stringify({
            data: dataset,
            template: base64(template),
            convertTo: "pdf",
            converter: "C",
            lang: "en-gb",
            reportName: safeFileName(direction, string(submission.ICUSS_MRN))
              .replace(/\.pdf$/i, ""),
          }),
          signal: AbortSignal.timeout(90_000),
        },
      );
      if (!response.ok) {
        const providerDetail = (await response.text()).replace(/\s+/g, " ")
          .slice(0, 1_500);
        throw new FunctionError(
          502,
          "The declaration PDF could not be created. Try again.",
          `Carbone returned HTTP ${response.status}${
            providerDetail ? `: ${providerDetail}` : ""
          }`,
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (
        !bytes.length || bytes.length > maximumGeneratedFileBytes ||
        new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
      ) {
        throw new FunctionError(
          502,
          "The declaration PDF could not be verified. Try again.",
          "Rendered declaration failed PDF validation",
        );
      }

      const id = crypto.randomUUID();
      const fileName = safeFileName(direction, string(submission.ICUSS_MRN));
      const appEnvironment =
        (Deno.env.get("MULTIDECK_ENVIRONMENT")?.trim() || "production").replace(
          /[^a-z0-9_-]/gi,
          "-",
        );
      const storagePath =
        `v2/${appEnvironment}/${providerEnvironment}/customs/${declarationId}/${sourceHash}.pdf`;
      const { error: uploadError } = await context.admin.storage.from(
        generatedDocumentsBucket,
      )
        .upload(storagePath, bytes, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploadError) {
        throw new FunctionError(
          502,
          "The declaration PDF could not be stored. Try again.",
          uploadError.message,
        );
      }

      const createdAt = new Date();
      const retainUntil = new Date(createdAt);
      retainUntil.setUTCFullYear(retainUntil.getUTCFullYear() + 7);
      const official = providerEnvironment === "production" &&
        usesAcceptedSnapshot;
      const fileHash = await sha256(bytes);
      const { data: inserted, error: insertError } = await context.admin.from(
        "Customs_DeclarationDocuments",
      ).insert({
        CUSTD_ID: id,
        CUSTD_CustomsID: declarationId,
        CUSTD_Direction: direction,
        CUSTD_SourceSHA256: sourceHash,
        CUSTD_IsOfficial: official,
        CUSTD_ProviderStatus: providerStatus,
        CUSTD_MRN: submission.ICUSS_MRN,
        CUSTD_FileName: fileName,
        CUSTD_StorageBucket: generatedDocumentsBucket,
        CUSTD_StoragePath: storagePath,
        CUSTD_MimeType: "application/pdf",
        CUSTD_FileSizeBytes: bytes.length,
        CUSTD_FileSHA256: fileHash,
        CUSTD_RetainUntil: retainUntil.toISOString(),
        CUSTD_CreatedAt: createdAt.toISOString(),
        CUSTD_CreatedBy: context.userId,
      }).select("*").single();
      if (insertError) {
        await context.admin.storage.from(generatedDocumentsBucket).remove([
          storagePath,
        ]);
        throw insertError;
      }
      document = inserted as Json;

      await context.admin.from("Customs_AuditLog").insert({
        CUSTAU_CustomsID: declarationId,
        CUSTAU_Action: "declaration_pdf_created",
        CUSTAU_TableName: "Customs_DeclarationDocuments",
        CUSTAU_RecordID: id,
        CUSTAU_ChangedBy: context.userId,
        CUSTAU_NewValues: {
          documentId: id,
          mrn: submission.ICUSS_MRN,
          fileHash,
          official,
          environment: providerEnvironment,
          sourceHash,
          templateHash,
          retainUntil: retainUntil.toISOString(),
        },
        CUSTAU_Source: "customs-declaration-document",
        CUSTAU_Notes: official
          ? "An immutable accepted CDS declaration PDF was created from the exact submitted snapshot and retained for seven years."
          : "A non-official Customs verification PDF was created from sandbox or legacy persisted data and retained for seven years.",
      });
    }

    const bucket = string(document.CUSTD_StorageBucket);
    const path = string(document.CUSTD_StoragePath);
    const fileName = string(document.CUSTD_FileName);
    const { data: signed, error: signedError } = await context.admin.storage
      .from(bucket)
      .createSignedUrl(path, signedUrlLifetimeSeconds, { download: fileName });
    if (signedError || !signed?.signedUrl) {
      throw new FunctionError(
        500,
        "The PDF is ready, but its secure link could not be created.",
        "Declaration PDF signed URL failed",
      );
    }

    return jsonResponse(request, {
      documentId: document.CUSTD_ID,
      fileName,
      mimeType: document.CUSTD_MimeType,
      fileSizeBytes: document.CUSTD_FileSizeBytes,
      mrn: document.CUSTD_MRN,
      isOfficial: Boolean(document.CUSTD_IsOfficial),
      environment: providerEnvironment,
      retainedUntil: document.CUSTD_RetainUntil,
      signedUrl: signed.signedUrl,
      expiresAt: new Date(Date.now() + signedUrlLifetimeSeconds * 1000)
        .toISOString(),
    });
  } catch (error) {
    const safe = toFunctionError(error);
    console.error("Customs declaration PDF failed", {
      status: safe.status,
      reason: safe.auditMessage,
    });
    return jsonResponse(request, { error: safe.clientMessage }, safe.status);
  }
});
