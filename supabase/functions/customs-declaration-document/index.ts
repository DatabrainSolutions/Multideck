import {
  authenticateRequest,
  corsHeaders,
  FunctionError,
  isUuid,
  jsonResponse,
  signedUrlLifetimeSeconds,
  toFunctionError,
} from "../_shared/document-functions.ts";

type Json = Record<string, unknown>;

function string(value: unknown, maximum = 500) {
  return typeof value === "string"
    ? value.trim().slice(0, maximum)
    : value == null
    ? ""
    : String(value).trim().slice(0, maximum);
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
      throw new FunctionError(400, "Choose a valid declaration.", "Declaration UUID validation failed");
    }

    const { data: authorised, error: authorisationError } = await context.admin.rpc(
      "customs_declaration_authorised",
      {
        caller_auth_user_id: context.userId,
        requested_declaration_id: declarationId,
        require_write: false,
        require_draft: false,
      },
    );
    if (authorisationError) throw authorisationError;
    if (!authorised) {
      throw new FunctionError(404, "That declaration was not found.", "Customs declaration access was not authorised");
    }

    const { data: declaration, error: declarationError } = await context.admin
      .from("Customs_Declarations")
      .select("CUST_DeclarationDocumentID")
      .eq("CUST_id", declarationId)
      .eq("CUST_IsDeleted", false)
      .maybeSingle();
    if (declarationError) throw declarationError;
    if (!declaration) {
      throw new FunctionError(404, "That declaration was not found.", "Authorised Customs declaration was not found");
    }

    const activeDocumentId = string(declaration.CUST_DeclarationDocumentID, 36);
    if (!activeDocumentId) {
      throw new FunctionError(
        409,
        "Waiting for the declaration document from iCustoms.",
        "The declaration has no active webhook document pointer",
      );
    }

    const { data: document, error: documentError } = await context.admin
      .from("Customs_DeclarationDocuments")
      .select("*")
      .eq("CUSTD_CustomsID", declarationId)
      .eq("CUSTD_ID", activeDocumentId)
      .maybeSingle();
    if (documentError) throw documentError;
    if (!document) {
      throw new FunctionError(
        409,
        "Waiting for the declaration document from iCustoms.",
        "The active declaration document pointer did not resolve to this declaration",
      );
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
        "The document is ready, but its secure link could not be created. Try again.",
        "Declaration document signed URL failed",
      );
    }

    return jsonResponse(request, {
      documentId: document.CUSTD_ID,
      fileName,
      mimeType: document.CUSTD_MimeType,
      fileSizeBytes: document.CUSTD_FileSizeBytes,
      mrn: document.CUSTD_MRN,
      isOfficial: Boolean(document.CUSTD_IsOfficial),
      environment: string(document.CUSTD_ProviderEnvironment) ||
        (document.CUSTD_IsOfficial ? "production" : "sandbox"),
      source: string(document.CUSTD_SourceCode) || "historical",
      receivedAt: document.CUSTD_ReceivedAt,
      retainedUntil: document.CUSTD_RetainUntil,
      signedUrl: signed.signedUrl,
      expiresAt: new Date(Date.now() + signedUrlLifetimeSeconds * 1000).toISOString(),
    });
  } catch (error) {
    const safe = toFunctionError(error);
    console.error("Customs declaration document link failed", {
      status: safe.status,
      reason: safe.auditMessage,
    });
    return jsonResponse(request, { error: safe.clientMessage }, safe.status);
  }
});
