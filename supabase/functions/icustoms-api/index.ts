import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2.108.2";
import {
  adminClient,
  authenticate,
  body,
  corsHeaders,
  currentInternalUser,
  failure,
  HttpError,
  json,
  routeParts,
} from "../_shared/backend.ts";
import {
  buildICustomsDeclarationXml,
  buildICustomsDraftShellXml,
  type ExportDeclarationInput,
  ICustomsClient,
  iCustomsCommodityDetail,
  iCustomsCommoditySuggestions,
  iCustomsDraftPath,
  ICustomsProviderError,
  type ICustomsResponse,
  inferICustomsStatus,
  providerCorrelationId,
  providerIssues,
  providerRecord,
  providerReference,
  readICustomsConfig,
  validateICustomsDeclaration,
} from "../_shared/icustoms.ts";

type Json = Record<string, unknown>;
type Actor = { User_ID: string; Company_ID: string; User_FullName?: string };

class CustomsSubmissionGateError extends HttpError {
  constructor(public issues: string[]) {
    super(
      422,
      "Declaration needs attention",
    );
  }
}

const SANDBOX_CONNECTION_ID = "c96a43a9-866a-4d27-ace1-5a6b82085dcb";
const COMMODITY_CACHE_TTL_MS = 15 * 60 * 1000;
const COMMODITY_CACHE_LIMIT = 100;

let providerClient: ICustomsClient | null = null;
const commoditySearchCache = new Map<string, {
  expiresAt: number;
  value: ReturnType<typeof iCustomsCommoditySuggestions>;
}>();
const commodityDetailCache = new Map<string, {
  expiresAt: number;
  value: ReturnType<typeof iCustomsCommodityDetail>;
}>();

function connectedICustomsClient() {
  providerClient ??= new ICustomsClient(readICustomsConfig());
  return providerClient;
}

function cachedCommodityValue<T>(
  cache: Map<string, { expiresAt: number; value: T }>,
  key: string,
) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

function cacheCommodityValue<T>(
  cache: Map<string, { expiresAt: number; value: T }>,
  key: string,
  value: T,
) {
  if (cache.size >= COMMODITY_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey === "string") cache.delete(oldestKey);
  }
  cache.set(key, { expiresAt: Date.now() + COMMODITY_CACHE_TTL_MS, value });
}

function text(value: unknown, maximum = 240) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function uuid(value: unknown) {
  const resolved = text(value, 36);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(resolved)
    ? resolved
    : "";
}

function requestMetadata(xml: string, operation: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(xml)).then((
    digest,
  ) => ({
    operation,
    contentType: "application/xml",
    payloadHashSha256: Array.from(new Uint8Array(digest)).map((byte) =>
      byte.toString(16).padStart(2, "0")
    ).join(""),
    payloadBytes: new TextEncoder().encode(xml).byteLength,
  }));
}

async function declarationForUser(
  admin: SupabaseClient,
  user: User,
  declarationId: string,
  requireDraft = false,
) {
  let query = admin
    .from("Customs_Declarations")
    .select("*")
    .eq("CUST_id", declarationId)
    .eq("CUST_CreatedBy", user.id)
    .eq("CUST_IsDeleted", false);
  if (requireDraft) query = query.eq("CUST_Status", "draft");
  const { data, error } = await query.maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) {
    throw new HttpError(
      404,
      requireDraft
        ? "That Customs declaration is unavailable or can no longer be edited."
        : "That Customs declaration was not found.",
    );
  }
  const connectedDeclaration = (data.CUST_DeclarationKind === "cds_export" &&
    data.CUST_Direction === "export") ||
    (data.CUST_DeclarationKind === "cds_import" &&
      data.CUST_Direction === "import");
  if (!connectedDeclaration || data.CUST_JurisdictionCode !== "GB") {
    throw new HttpError(
      409,
      "This connected path accepts UK CDS export and import declarations only.",
    );
  }
  return data as Json;
}

async function latestSubmission(admin: SupabaseClient, declarationId: string) {
  const { data, error } = await admin
    .from("ICUS_Submissions")
    .select("*")
    .eq("ICUSS_CustomsID", declarationId)
    .order("ICUSS_CreatedAt", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return data as Json | null;
}

function publicSubmission(row: Json | null) {
  if (!row) return null;
  return {
    status: row.ICUSS_Status,
    mrn: row.ICUSS_MRN,
    lrn: row.ICUSS_LRN,
    errorMessage: publicProviderErrorMessage(row),
    issues: providerIssues(row.ICUSS_ResponsePayloadJSON),
    attemptCount: row.ICUSS_AttemptCount,
    submittedAt: row.ICUSS_SubmittedAt,
    acknowledgedAt: row.ICUSS_AcknowledgedAt,
    completedAt: row.ICUSS_CompletedAt,
    updatedAt: row.ICUSS_UpdatedAt,
  };
}

function publicDeclaration(row: Json, submission: Json | null) {
  return {
    id: row.CUST_id,
    reference: row.CUST_LocalReferenceNumber,
    status: row.CUST_Status,
    correlationId: correlationFrom(row, submission) || null,
    hasCustomsDraft: Boolean(correlationFrom(row, submission)),
    provider: publicSubmission(submission),
  };
}

function publicProviderErrorMessage(row: Json) {
  if (!row.ICUSS_ErrorMessage && row.ICUSS_Status !== "error") return null;
  const status = Number(row.ICUSS_ResponseStatusCode);
  const code = text(row.ICUSS_ErrorCode, 100);
  if ([401, 403].includes(status) || /auth|credential|config/i.test(code)) {
    return "The customs service connection needs attention. Your declaration is still saved in Multideck.";
  }
  if ([408, 425, 429].includes(status) || status >= 500) {
    return "The customs service is temporarily unavailable. Your declaration is still saved in Multideck; try again.";
  }
  return "The customs service could not process this request. Your declaration is still saved in Multideck; review the declaration and try again.";
}

async function audit(
  admin: SupabaseClient,
  actor: Actor,
  declarationId: string,
  action: string,
  notes: string,
  oldValues: Json | null,
  newValues: Json | null,
) {
  const { error } = await admin.from("Customs_AuditLog").insert({
    CUSTAU_CustomsID: declarationId,
    CUSTAU_Action: action,
    CUSTAU_TableName: "Customs_Declarations",
    CUSTAU_RecordID: declarationId,
    CUSTAU_ChangedBy: actor.User_ID,
    CUSTAU_OldValues: oldValues,
    CUSTAU_NewValues: newValues,
    CUSTAU_Source: "icustoms-api",
    CUSTAU_Notes: notes,
  });
  if (error) throw new HttpError(500, error.message);
}

function connectionState() {
  const baseUrl = Deno.env.get("ICUSTOMS_BASE_URL")?.trim() ||
    "https://ihub-tdr.customscloud.co";
  const configured = Boolean(
    Deno.env.get("ICUSTOMS_API_KEY")?.trim() &&
      Deno.env.get("ICUSTOMS_API_SECRET")?.trim(),
  );
  return {
    configured,
    environment: baseUrl.includes("-tdr.") ? "sandbox" : "production",
  };
}

async function createSubmission(
  admin: SupabaseClient,
  actor: Actor,
  declarationId: string,
  idempotencyKey: string,
  path: string,
  requestPayload: Json,
  declarationKind: string,
  contentType = "application/xml",
) {
  const { data, error } = await admin.from("ICUS_Submissions").insert({
    ICUSS_ApiConnectionID: SANDBOX_CONNECTION_ID,
    ICUSS_CustomsID: declarationId,
    ICUSS_JurisdictionCode: "GB",
    ICUSS_DeclarationKind: declarationKind,
    ICUSS_Status: "queued",
    ICUSS_IdempotencyKey: idempotencyKey,
    ICUSS_RequestMethod: "POST",
    ICUSS_RequestPath: path,
    ICUSS_RequestHeadersJSON: { "content-type": contentType },
    ICUSS_RequestPayloadJSON: requestPayload,
    ICUSS_AttemptCount: 1,
    ICUSS_CreatedBy: actor.User_ID,
    ICUSS_UpdatedBy: actor.User_ID,
  }).select("*").single();
  if (error) throw new HttpError(500, error.message);
  return data as Json;
}

async function idempotentSubmission(
  admin: SupabaseClient,
  declarationId: string,
  idempotencyKey: string,
) {
  if (!idempotencyKey) return null;
  const { data, error } = await admin
    .from("ICUS_Submissions")
    .select("*")
    .eq("ICUSS_CustomsID", declarationId)
    .eq("ICUSS_IdempotencyKey", idempotencyKey)
    .in("ICUSS_Status", [
      "draft",
      "acknowledged",
      "submitted",
      "accepted",
      "rejected",
      "cancelled",
    ])
    .order("ICUSS_CreatedAt", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return data as Json | null;
}

async function recordProviderFailure(
  admin: SupabaseClient,
  actor: Actor,
  submission: Json,
  error: unknown,
) {
  const providerError = error instanceof ICustomsProviderError ? error : null;
  const { error: updateError } = await admin.from("ICUS_Submissions").update({
    ICUSS_Status: "error",
    ICUSS_ResponseStatusCode: providerError?.status ?? 500,
    ICUSS_ResponsePayloadJSON: providerRecord(providerError?.responseBody),
    ICUSS_ErrorCode: providerError?.code ?? "icustoms_unexpected_error",
    ICUSS_ErrorMessage: text(
      error instanceof Error ? error.message : "The iCustoms request failed.",
      1000,
    ),
    ICUSS_UpdatedAt: new Date().toISOString(),
    ICUSS_UpdatedBy: actor.User_ID,
  }).eq("ICUSS_id", submission.ICUSS_id);
  if (updateError) {
    console.error(
      "Could not record the iCustoms provider failure",
      updateError.message,
    );
  }
}

function correlationFrom(declaration: Json, submission: Json | null) {
  return text(declaration.CUST_iCustomsExternalID, 160) ||
    text(submission?.ICUSS_iCustomsDeclarationID, 160);
}

function workspaceDraftId(value: unknown) {
  const record = providerRecord(value);
  const general = providerRecord(record.gen ?? record.general);
  const direct = text(
    general.id ?? record.general_id ?? record.generalId ?? record.UUID ??
      record.uuid,
    160,
  );
  if (direct) return direct;
  const data = providerRecord(record.data);
  return text(data.general_id ?? data.generalId ?? data.id, 160) ||
    providerReference(record.data, ["general_id", "generalId"]);
}

function providerDeclarationIsMissing(value: unknown) {
  const record = providerRecord(value);
  if (record.success !== false) return false;
  const providerStatus = Number(record.status);
  const message = text(record.message, 500).toLocaleLowerCase("en-GB");
  return providerStatus === 401 || message.includes("no declaration") ||
    message.includes("not found") || message.includes("does not exist");
}

async function saveProviderSuccess(
  admin: SupabaseClient,
  actor: Actor,
  declaration: Json,
  submission: Json,
  response: ICustomsResponse,
  providerStatus: string,
  correlationId: string,
  lifecyclePhase: "draft" | "submission" = "submission",
) {
  const now = new Date().toISOString();
  const providerBody = providerRecord(response.body);
  const submissionStatus = lifecyclePhase === "draft"
    ? "draft"
    : ["released", "cleared"].includes(providerStatus)
    ? "accepted"
    : ["acknowledged", "submitted", "accepted", "rejected", "error"].includes(
        providerStatus,
      )
    ? providerStatus
    : "acknowledged";
  const submissionValues: Json = {
    ICUSS_Status: submissionStatus,
    ICUSS_ProviderStatus: providerStatus,
    ICUSS_iCustomsDeclarationID: correlationId,
    ICUSS_iCustomsSubmissionID:
      providerReference(response.body, ["submission_id", "submissionId"]) ||
      null,
    ICUSS_HMRCSubmissionID: providerReference(response.body, [
      "hmrc_submission_id",
      "hmrcSubmissionId",
    ]) || null,
    ICUSS_MRN: providerReference(response.body, [
      "mrn",
      "master_reference_number",
      "hmrc_id",
    ]) ||
      null,
    ICUSS_LRN:
      providerReference(response.body, ["lrn", "local_reference_number"]) ||
      null,
    ICUSS_ResponseStatusCode: response.status,
    ICUSS_ResponseHeadersJSON: response.headers,
    ICUSS_ResponsePayloadJSON: providerBody,
    ICUSS_ErrorCode: null,
    ICUSS_ErrorMessage: null,
    ICUSS_UpdatedAt: now,
    ICUSS_UpdatedBy: actor.User_ID,
  };
  if (submissionStatus === "acknowledged") {
    submissionValues.ICUSS_AcknowledgedAt = now;
  }
  if (["submitted", "accepted", "rejected"].includes(submissionStatus)) {
    submissionValues.ICUSS_SubmittedAt = submission.ICUSS_SubmittedAt ?? now;
  }
  if (["accepted", "rejected"].includes(submissionStatus)) {
    submissionValues.ICUSS_CompletedAt = now;
  }
  const { data: savedSubmission, error: submissionError } = await admin.from(
    "ICUS_Submissions",
  ).update(submissionValues).eq("ICUSS_id", submission.ICUSS_id).select("*")
    .single();
  if (submissionError) throw new HttpError(500, submissionError.message);

  const declarationStatus = lifecyclePhase === "draft"
    ? "draft"
    : providerStatus === "acknowledged"
    ? "draft"
    : ["submitted", "accepted", "rejected", "cleared", "released"].includes(
        providerStatus,
      )
    ? providerStatus
    : declaration.CUST_Status;
  const { data: savedDeclaration, error: declarationError } = await admin.from(
    "Customs_Declarations",
  ).update({
    CUST_Status: declarationStatus,
    CUST_iCustomsExternalID: correlationId,
    CUST_iCustomsStatusSnapshot: providerStatus,
    CUST_CustomsReferenceNumber: submissionValues.ICUSS_MRN ??
      declaration.CUST_CustomsReferenceNumber,
    CUST_MasterReferenceNumber: submissionValues.ICUSS_MRN ??
      declaration.CUST_MasterReferenceNumber,
    CUST_UpdatedAt: now,
  }).eq("CUST_id", declaration.CUST_id).select("*").single();
  if (declarationError) throw new HttpError(500, declarationError.message);
  return {
    declaration: savedDeclaration as Json,
    submission: savedSubmission as Json,
  };
}

async function providerDraft(
  admin: SupabaseClient,
  user: User,
  actor: Actor,
  declarationId: string,
  input: Json,
) {
  const declaration = await declarationForUser(
    admin,
    user,
    declarationId,
    true,
  );
  const idempotencyKey = text(input.idempotencyKey, 160) ||
    `draft-${declarationId}-${crypto.randomUUID()}`;
  const previous = await idempotentSubmission(
    admin,
    declarationId,
    idempotencyKey,
  );
  if (previous) {
    return {
      declaration: publicDeclaration(declaration, previous),
      idempotentReplay: true,
    };
  }

  const draft = providerRecord(
    declaration.CUST_GenericPayloadJSON,
  ) as ExportDeclarationInput;
  const direction = declaration.CUST_Direction === "import"
    ? "import"
    : "export";
  const xml = buildICustomsDeclarationXml(draft, direction);
  const latest = await latestSubmission(admin, declarationId);
  // A submitted provider record is immutable. After an HMRC rejection the
  // corrected Multideck declaration starts a fresh provider draft, while
  // ordinary draft edits continue updating the original correlation.
  const correlationId = text(latest?.ICUSS_Status, 40) === "rejected"
    ? ""
    : correlationFrom(declaration, latest);
  const path = iCustomsDraftPath(correlationId);
  const submission = await createSubmission(
    admin,
    actor,
    declarationId,
    idempotencyKey,
    path,
    await requestMetadata(xml, correlationId ? "update_draft" : "create_draft"),
    text(declaration.CUST_DeclarationKind, 40),
  );
  try {
    const client = connectedICustomsClient();
    const response = await client.saveDraft(correlationId || null, xml);
    const resolvedCorrelationId = correlationId ||
      providerCorrelationId(response.body);
    if (!resolvedCorrelationId) {
      throw new ICustomsProviderError(
        502,
        "The customs service created the draft without returning its reference.",
        "icustoms_correlation_missing",
        response.body,
      );
    }
    const saved = await saveProviderSuccess(
      admin,
      actor,
      declaration,
      submission,
      response,
      "acknowledged",
      resolvedCorrelationId,
      "draft",
    );
    await audit(
      admin,
      actor,
      declarationId,
      correlationId ? "icustoms_draft_updated" : "icustoms_draft_created",
      correlationId
        ? "The iCustoms sandbox draft was updated."
        : "The iCustoms sandbox draft was created.",
      { status: declaration.CUST_Status },
      {
        status: saved.declaration.CUST_Status,
        iCustomsStatus: saved.declaration.CUST_iCustomsStatusSnapshot,
      },
    );
    return {
      declaration: publicDeclaration(saved.declaration, saved.submission),
      idempotentReplay: false,
    };
  } catch (error) {
    await recordProviderFailure(admin, actor, submission, error);
    throw error;
  }
}

async function startProviderDraft(
  admin: SupabaseClient,
  user: User,
  actor: Actor,
  declarationId: string,
  input: Json,
) {
  const declaration = await declarationForUser(
    admin,
    user,
    declarationId,
    true,
  );
  const latest = await latestSubmission(admin, declarationId);
  const existingCorrelation = correlationFrom(declaration, latest);
  if (existingCorrelation) {
    return {
      declaration: publicDeclaration(declaration, latest),
      idempotentReplay: true,
    };
  }
  if (text(latest?.ICUSS_Status, 40) === "queued") {
    return {
      declaration: publicDeclaration(declaration, latest),
      idempotentReplay: true,
    };
  }

  const idempotencyKey = text(input.idempotencyKey, 160) ||
    `start-draft-${declarationId}-${crypto.randomUUID()}`;
  const previous = await idempotentSubmission(
    admin,
    declarationId,
    idempotencyKey,
  );
  if (previous) {
    return {
      declaration: publicDeclaration(declaration, previous),
      idempotentReplay: true,
    };
  }
  const direction = declaration.CUST_Direction === "import"
    ? "import"
    : "export";
  const path = iCustomsDraftPath(null);
  const xml = buildICustomsDraftShellXml(
    direction,
    text(declaration.CUST_LocalReferenceNumber, 160),
  );
  const submission = await createSubmission(
    admin,
    actor,
    declarationId,
    idempotencyKey,
    path,
    await requestMetadata(xml, "create_draft_shell"),
    text(declaration.CUST_DeclarationKind, 40),
  );
  try {
    const response = await connectedICustomsClient().createDraft(xml);
    const responseRecord = providerRecord(response.body);
    if (responseRecord.success === false) {
      throw new ICustomsProviderError(
        response.status || 502,
        text(responseRecord.message, 500) ||
          "The customs service could not start this draft.",
        "icustoms_workspace_draft_failed",
        response.body,
      );
    }
    const correlationId = providerCorrelationId(response.body);
    if (!correlationId) {
      throw new ICustomsProviderError(
        502,
        "The customs service created the draft without returning its reference.",
        "icustoms_correlation_missing",
        response.body,
      );
    }
    const saved = await saveProviderSuccess(
      admin,
      actor,
      declaration,
      submission,
      response,
      "draft",
      correlationId,
      "draft",
    );
    const internalDraftId = workspaceDraftId(response.body);
    if (internalDraftId) {
      const { error } = await admin.from("ICUS_Submissions").update({
        ICUSS_iCustomsSubmissionID: internalDraftId,
        ICUSS_UpdatedAt: new Date().toISOString(),
        ICUSS_UpdatedBy: actor.User_ID,
      }).eq("ICUSS_id", saved.submission.ICUSS_id);
      if (error) throw new HttpError(500, error.message);
      saved.submission.ICUSS_iCustomsSubmissionID = internalDraftId;
    }
    await audit(
      admin,
      actor,
      declarationId,
      "icustoms_workspace_draft_created",
      "The editable iCustoms draft was created when the operator opened the declaration.",
      { status: declaration.CUST_Status },
      { status: saved.declaration.CUST_Status, correlationId },
    );
    return {
      declaration: publicDeclaration(saved.declaration, saved.submission),
      idempotentReplay: false,
    };
  } catch (error) {
    await recordProviderFailure(admin, actor, submission, error);
    throw error;
  }
}

async function deleteProviderDraft(
  admin: SupabaseClient,
  user: User,
  actor: Actor,
  declarationId: string,
) {
  const declaration = await declarationForUser(
    admin,
    user,
    declarationId,
    true,
  );
  const latest = await latestSubmission(admin, declarationId);
  if (text(latest?.ICUSS_Status, 40) === "queued") {
    throw new HttpError(
      409,
      "The iCustoms draft is still starting. Try deleting it again in a moment.",
    );
  }

  const correlationId = correlationFrom(declaration, latest);
  let internalDraftId = text(latest?.ICUSS_iCustomsSubmissionID, 160);
  let providerDeleted = false;
  if (correlationId) {
    const client = connectedICustomsClient();
    if (!internalDraftId) {
      const details = await client.declarationDetails(
        declaration.CUST_Direction === "import" ? "import" : "export",
        correlationId,
      );
      if (providerDeclarationIsMissing(details.body)) {
        providerDeleted = true;
      } else {
        const detailRecord = providerRecord(details.body);
        if (detailRecord.success === false) {
          throw new ICustomsProviderError(
            Number(detailRecord.status) || 502,
            text(detailRecord.message, 500) ||
              "The customs service could not inspect this draft.",
            "icustoms_workspace_draft_lookup_failed",
            details.body,
          );
        }
        internalDraftId = workspaceDraftId(details.body);
      }
      if (!providerDeleted && !internalDraftId) {
        throw new ICustomsProviderError(
          502,
          "The customs service did not return the draft identifier needed for deletion. The draft remains available.",
          "icustoms_workspace_draft_id_missing",
        );
      }
    }
    if (!providerDeleted) {
      try {
        const response = await client.deleteWorkspaceDraft(internalDraftId);
        const responseRecord = providerRecord(response.body);
        if (responseRecord.success === false) {
          throw new ICustomsProviderError(
            response.status || 502,
            text(responseRecord.message, 500) ||
              "The customs service could not delete this draft.",
            "icustoms_workspace_draft_delete_failed",
            response.body,
          );
        }
      } catch (error) {
        if (!(error instanceof ICustomsProviderError) || error.status !== 404) {
          throw error;
        }
      }
      try {
        const verification = await client.declarationDetails(
          declaration.CUST_Direction === "import" ? "import" : "export",
          correlationId,
        );
        if (!providerDeclarationIsMissing(verification.body)) {
          throw new ICustomsProviderError(
            502,
            "iCustoms still has this draft, so Multideck has kept the recovery record.",
            "icustoms_workspace_draft_still_exists",
          );
        }
        providerDeleted = true;
      } catch (error) {
        if (!(error instanceof ICustomsProviderError) || error.status !== 404) {
          throw error;
        }
        providerDeleted = true;
      }
    }
  }

  const now = new Date().toISOString();
  const { data: deleted, error: deleteError } = await admin.from(
    "Customs_Declarations",
  ).update({
    CUST_IsDeleted: true,
    CUST_UpdatedAt: now,
    CUST_UpdatedBy: actor.User_ID,
  }).eq("CUST_id", declarationId).eq("CUST_CreatedBy", user.id).eq(
    "CUST_Status",
    "draft",
  ).eq("CUST_IsDeleted", false).select("CUST_id").maybeSingle();
  if (deleteError) throw new HttpError(500, deleteError.message);
  if (!deleted) {
    throw new HttpError(
      409,
      "That Customs declaration is unavailable or can no longer be deleted.",
    );
  }
  if (latest?.ICUSS_id) {
    const { error } = await admin.from("ICUS_Submissions").update({
      ICUSS_Status: "cancelled",
      ICUSS_ProviderStatus: providerDeleted ? "deleted" : "not_created",
      ICUSS_CompletedAt: now,
      ICUSS_UpdatedAt: now,
      ICUSS_UpdatedBy: actor.User_ID,
    }).eq("ICUSS_id", latest.ICUSS_id);
    if (error) throw new HttpError(500, error.message);
  }
  await audit(
    admin,
    actor,
    declarationId,
    "draft_deleted",
    providerDeleted
      ? "The abandoned iCustoms draft and its Multideck mirror were deleted."
      : "The local recovery record was deleted; no iCustoms draft had been created.",
    {
      status: declaration.CUST_Status,
      iCustomsCorrelationId: correlationId || null,
    },
    { isDeleted: true, providerDeleted },
  );
  return { deleted: true, providerDeleted };
}

async function submitDeclaration(
  admin: SupabaseClient,
  user: User,
  actor: Actor,
  declarationId: string,
  input: Json,
) {
  if (input.confirm !== true) {
    throw new HttpError(
      400,
      "Confirm that you want to submit this declaration in Test Mode.",
    );
  }
  const declaration = await declarationForUser(
    admin,
    user,
    declarationId,
    true,
  );
  const latest = await latestSubmission(admin, declarationId);
  const idempotencyKey = text(input.idempotencyKey, 160) ||
    `submit-${declarationId}-${crypto.randomUUID()}`;
  const replay = await idempotentSubmission(
    admin,
    declarationId,
    idempotencyKey,
  );
  if (replay) {
    return {
      declaration: publicDeclaration(declaration, replay),
      idempotentReplay: true,
    };
  }
  const correlationId = correlationFrom(declaration, latest);
  if (!correlationId || !latest) {
    throw new HttpError(
      409,
      "Create the customs test draft before submitting it.",
    );
  }
  if (
    ["submitted", "accepted", "rejected", "cancelled"].includes(
      text(latest.ICUSS_Status, 40),
    )
  ) {
    throw new HttpError(
      409,
      "This declaration has already entered the provider submission lifecycle and cannot be submitted again.",
    );
  }
  const direction = declaration.CUST_Direction === "import"
    ? "import"
    : "export";
  const submissionIssues = validateICustomsDeclaration(
    providerRecord(
      declaration.CUST_GenericPayloadJSON,
    ) as ExportDeclarationInput,
    direction,
  );
  if (submissionIssues.length) {
    throw new CustomsSubmissionGateError(submissionIssues);
  }
  const { data: acceptedItemRows, error: acceptedItemRowsError } = await admin
    .from("Customs_Items")
    .select("CUSTI_ItemNumber, CUSTI_ItemPayloadJSON")
    .eq("CUSTI_CustomsID", declarationId)
    .order("CUSTI_ItemNumber", { ascending: true });
  if (acceptedItemRowsError) {
    throw new HttpError(500, acceptedItemRowsError.message);
  }
  const declarationSnapshot = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    declaration: {
      id: declaration.CUST_id,
      direction: declaration.CUST_Direction,
      declarationKind: declaration.CUST_DeclarationKind,
      localReferenceNumber: declaration.CUST_LocalReferenceNumber,
      genericPayload: providerRecord(declaration.CUST_GenericPayloadJSON),
    },
    items: (acceptedItemRows ?? []).map((row) => ({
      itemNumber: row.CUSTI_ItemNumber,
      payload: providerRecord(row.CUSTI_ItemPayloadJSON),
    })),
  };
  const { data: submission, error: prepareError } = await admin.from(
    "ICUS_Submissions",
  ).update({
    ICUSS_Status: "submitting",
    ICUSS_IdempotencyKey: idempotencyKey,
    ICUSS_RequestMethod: "POST",
    ICUSS_RequestPath: `/api/cds/v1/submit/${correlationId}`,
    ICUSS_RequestHeadersJSON: {},
    ICUSS_RequestPayloadJSON: { operation: "submit", correlationId },
    ICUSS_DeclarationSnapshotJSON: declarationSnapshot,
    ICUSS_AttemptCount: Number(latest.ICUSS_AttemptCount ?? 0) + 1,
    ICUSS_UpdatedAt: new Date().toISOString(),
    ICUSS_UpdatedBy: actor.User_ID,
  }).eq("ICUSS_id", latest.ICUSS_id).select("*").single();
  if (prepareError) throw new HttpError(500, prepareError.message);
  try {
    const response = await connectedICustomsClient().submit(
      correlationId,
    );
    const saved = await saveProviderSuccess(
      admin,
      actor,
      declaration,
      submission as Json,
      response,
      "submitted",
      correlationId,
    );
    await audit(
      admin,
      actor,
      declarationId,
      "icustoms_submitted",
      "The declaration was submitted once to the iCustoms sandbox.",
      { status: declaration.CUST_Status },
      {
        status: saved.declaration.CUST_Status,
        iCustomsStatus: saved.declaration.CUST_iCustomsStatusSnapshot,
      },
    );
    return {
      declaration: publicDeclaration(saved.declaration, saved.submission),
      idempotentReplay: false,
    };
  } catch (error) {
    await recordProviderFailure(admin, actor, submission as Json, error);
    throw error;
  }
}

async function refreshDeclaration(
  admin: SupabaseClient,
  user: User,
  actor: Actor,
  declarationId: string,
) {
  const declaration = await declarationForUser(admin, user, declarationId);
  const latest = await latestSubmission(admin, declarationId);
  const correlationId = correlationFrom(declaration, latest);
  if (!correlationId || !latest) {
    throw new HttpError(
      409,
      "This declaration does not have a customs test draft yet.",
    );
  }
  const response = await connectedICustomsClient().notifications(
    correlationId,
  );
  const status = inferICustomsStatus(
    response.body,
    text(latest.ICUSS_Status, 40) || "acknowledged",
  );
  const saved = await saveProviderSuccess(
    admin,
    actor,
    declaration,
    latest,
    response,
    status,
    correlationId,
  );
  const { error: eventError } = await admin.from("ICUS_SubmissionEvents")
    .insert({
      ICUSE_SubmissionID: latest.ICUSS_id,
      ICUSE_EventType: "notification_refresh",
      ICUSE_EventStatus: status,
      ICUSE_EventCode:
        providerReference(response.body, ["code", "notification_code"]) || null,
      ICUSE_EventMessage: text(providerRecord(response.body).message, 2000) ||
        null,
      ICUSE_EventPayloadJSON: providerRecord(response.body),
    });
  if (eventError) throw new HttpError(500, eventError.message);
  await audit(
    admin,
    actor,
    declarationId,
    "icustoms_notification_refreshed",
    "The latest iCustoms/HMRC notification state was recorded.",
    { status: declaration.CUST_Status },
    { status: saved.declaration.CUST_Status, iCustomsStatus: status },
  );
  return {
    declaration: publicDeclaration(saved.declaration, saved.submission),
  };
}

async function searchCommodities(input: Json) {
  const query = text(input.query, 180);
  if (query.length < 2) {
    throw new HttpError(
      400,
      "Enter at least two characters or a 10-digit commodity code.",
    );
  }
  const country = text(input.country, 2).toUpperCase() || "GB";
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new HttpError(400, "Choose a valid import country.");
  }
  const cacheKey = `${country}:${query.toLocaleLowerCase("en-GB")}`;
  const cached = cachedCommodityValue(commoditySearchCache, cacheKey);
  if (cached) {
    return {
      suggestions: cached,
      source: "iCustoms UK commodity classification",
    };
  }
  const response = await connectedICustomsClient().searchCommodities(
    query,
    country,
  );
  const suggestions = iCustomsCommoditySuggestions(response.body);
  cacheCommodityValue(commoditySearchCache, cacheKey, suggestions);
  return {
    suggestions,
    source: "iCustoms UK commodity classification",
  };
}

async function commodityDetails(input: Json) {
  const commodityCode = text(input.commodityCode, 20).replace(/\D/g, "");
  if (!/^\d{10}$/.test(commodityCode)) {
    throw new HttpError(400, "Enter a valid 10-digit commodity code.");
  }
  const direction = input.direction === "import"
    ? "import"
    : input.direction === "export"
    ? "export"
    : null;
  if (!direction) {
    throw new HttpError(400, "Choose whether this is an import or export.");
  }
  const cacheKey = `${direction}:${commodityCode}`;
  let detail = cachedCommodityValue(commodityDetailCache, cacheKey);
  const detailWasCached = Boolean(detail);
  if (!detail) {
    const response = await connectedICustomsClient().tariffDetails(
      commodityCode,
    );
    detail = iCustomsCommodityDetail(response.body, direction);
  }
  if (!/^\d{10}$/.test(detail.code)) {
    throw new ICustomsProviderError(
      502,
      "The customs service did not return a valid commodity record.",
      "icustoms_commodity_invalid",
    );
  }
  if (!detailWasCached) {
    cacheCommodityValue(commodityDetailCache, cacheKey, detail);
  }
  return {
    detail,
    source: "iCustoms UK Online Tariff",
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  try {
    const admin = adminClient();
    const { user } = await authenticate(request, admin);
    const actor = await currentInternalUser(admin, user) as Actor;
    const parts = routeParts(request, "icustoms-api");
    const method = request.method.toUpperCase();

    if (method === "GET" && parts[0] === "connection") {
      return json(request, connectionState());
    }
    if (
      method === "POST" && parts[0] === "commodities" && parts[1] === "search"
    ) {
      return json(request, await searchCommodities(await body<Json>(request)));
    }
    if (
      method === "POST" && parts[0] === "commodities" && parts[1] === "details"
    ) {
      return json(request, await commodityDetails(await body<Json>(request)));
    }
    if (parts[0] !== "declarations" || !uuid(parts[1])) {
      throw new HttpError(404, "Customs service route not found.");
    }
    const declarationId = parts[1];
    if (method === "GET" && parts.length === 2) {
      const declaration = await declarationForUser(admin, user, declarationId);
      return json(request, {
        declaration: publicDeclaration(
          declaration,
          await latestSubmission(admin, declarationId),
        ),
        connection: connectionState(),
      });
    }
    if (method === "POST" && parts[2] === "validate") {
      const declaration = await declarationForUser(
        admin,
        user,
        declarationId,
        true,
      );
      const direction = declaration.CUST_Direction === "import"
        ? "import"
        : "export";
      const issues = validateICustomsDeclaration(
        providerRecord(
          declaration.CUST_GenericPayloadJSON,
        ) as ExportDeclarationInput,
        direction,
      );
      return json(request, { ready: issues.length === 0, issues });
    }
    if (method === "POST" && parts[2] === "provider-draft") {
      return json(
        request,
        await providerDraft(
          admin,
          user,
          actor,
          declarationId,
          await body<Json>(request),
        ),
      );
    }
    if (method === "POST" && parts[2] === "provider-draft-start") {
      return json(
        request,
        await startProviderDraft(
          admin,
          user,
          actor,
          declarationId,
          await body<Json>(request),
        ),
      );
    }
    if (method === "DELETE" && parts[2] === "provider-draft") {
      return json(
        request,
        await deleteProviderDraft(admin, user, actor, declarationId),
      );
    }
    if (method === "POST" && parts[2] === "submit") {
      return json(
        request,
        await submitDeclaration(
          admin,
          user,
          actor,
          declarationId,
          await body<Json>(request),
        ),
      );
    }
    if (method === "POST" && parts[2] === "refresh") {
      return json(
        request,
        await refreshDeclaration(admin, user, actor, declarationId),
      );
    }
    throw new HttpError(404, "Customs service route not found.");
  } catch (error) {
    if (error instanceof CustomsSubmissionGateError) {
      return json(request, {
        detail: error.message,
        code: "customs_submission_gate_failed",
        issues: error.issues,
      }, error.status);
    }
    if (error instanceof ICustomsProviderError) {
      return json(request, {
        detail: error.message,
        code: error.code,
        providerStatus: error.status,
        ...(providerRecord(error.responseBody).issues
          ? { issues: providerRecord(error.responseBody).issues }
          : {}),
      }, error.status >= 400 && error.status < 600 ? error.status : 502);
    }
    return failure(request, error);
  }
});
