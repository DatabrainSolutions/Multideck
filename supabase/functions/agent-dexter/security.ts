import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { requiresExplicitActionApproval } from "./email-approval.mjs"

type JsonObject = Record<string, unknown>
type Db = SupabaseClient<any, "public", any, any, any>

export type DexterActor = {
  authUserId: string
  userId: string
  companyId: string
}

export type DexterSecurityContext = {
  accessMode: "approve" | "full"
  grantId: string | null
  intentPlanId: string
  clientSessionId: string
  allowedActionCodes: string[]
  trustedTargetIds: string[]
  authorisedRecipientAddresses: string[]
}

export type PreparedActionInput = {
  conversationId: string | null
  clientSessionId: string
  intentPlanId: string
  grantId: string | null
  actionCode: string
  arguments: JsonObject
  title: string
  description: string
  changes: JsonObject[]
  accessMode: "approve" | "full"
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function clean(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : ""
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value)
}

function actionTargetIds(value: unknown, propertyName = "", target = new Set<string>(), depth = 0) {
  // An upload ID is provenance, not an operational record being changed. The
  // upload permission boundary runs before extraction; it confers no write scope.
  if (depth === 1 && propertyName === "_document_evidence") return target
  if (Array.isArray(value)) {
    if (/(?:^|_)ids$/i.test(propertyName) || /Ids$/.test(propertyName)) {
      value.filter(isUuid).forEach((id) => target.add(id))
    }
    value.forEach((item) => actionTargetIds(item, "", target, depth + 1))
    return target
  }
  if (!value || typeof value !== "object") {
    if ((/(?:^|_)id$/i.test(propertyName) || /Id$/.test(propertyName)) && isUuid(value)) target.add(value)
    return target
  }
  Object.entries(value as JsonObject).forEach(([key, item]) => actionTargetIds(item, key, target, depth + 1))
  return target
}

function emailAddressesFromDraft(argumentsValue: JsonObject) {
  const draft = argumentsValue.draft && typeof argumentsValue.draft === "object" && !Array.isArray(argumentsValue.draft)
    ? argumentsValue.draft as JsonObject
    : null
  if (!draft) return []
  const addresses = [draft.to, draft.cc, draft.bcc].flatMap((value) => Array.isArray(value) ? value : [])
    .flatMap((value) => value && typeof value === "object" && !Array.isArray(value)
      ? [clean((value as JsonObject).address, 320).toLowerCase()]
      : [])
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
  return [...new Set(addresses)]
}

function emailAddressesInText(value: string) {
  return [...new Set((value.toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/g) ?? [])
    .map((address) => address.slice(0, 320)))]
}

function collectEmails(value: unknown, target: Set<string>) {
  if (typeof value === "string") {
    emailAddressesInText(value).forEach((address) => target.add(address))
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectEmails(item, target))
    return
  }
  if (!value || typeof value !== "object") return
  Object.values(value as JsonObject).forEach((item) => collectEmails(item, target))
}

function collectTrustedRecordEmails(value: unknown, trustedTargetIds: Set<string>, target: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectTrustedRecordEmails(item, trustedTargetIds, target))
    return
  }
  if (!value || typeof value !== "object") return
  const record = value as JsonObject
  const recordId = clean(record.recordId, 80)
  if (isUuid(recordId) && trustedTargetIds.has(recordId)) {
    collectEmails(record, target)
    return
  }
  Object.values(record).forEach((item) => collectTrustedRecordEmails(item, trustedTargetIds, target))
}

async function securityEvent(admin: Db, actor: DexterActor, kind: string, severity: "info" | "warning" | "high", metadata: JsonObject = {}) {
  await admin.from("AI_DexterSecurityEvents").insert({
    AIDexterSecurityEvent_CompanyID: actor.companyId,
    AIDexterSecurityEvent_UserID: actor.userId,
    AIDexterSecurityEvent_Kind: clean(kind, 80),
    AIDexterSecurityEvent_Severity: severity,
    AIDexterSecurityEvent_MetadataJSON: metadata,
  })
}

function normalisePrompt(prompt: string) {
  return prompt.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9@._\-\s]/g, " ").replace(/\s+/g, " ").trim()
}

const ACTION_INTENTS: Record<string, RegExp> = {
  create_email_draft: /\b(draft|write|compose|prepare|reply|respond|forward)\b.{0,100}\b(e-?mail|message|reply|response)\b|\b(draft|write|compose|prepare)\b.{0,100}\bto\b.{0,100}@/,
  send_email: /\bsend\b.{0,100}\b(e-?mail|message|reply|response|it|this)\b|\be-?mail\b.{0,80}\b(now|today|immediately|straight away)\b|\bplease send\b/,
  create_booking: /\b(create|add|start|make|open|new)\b.{0,80}\b(booking|shipment|job)\b|\bnew (booking|shipment|job)\b/,
  update_booking: /\b(update|edit|change|amend|correct|set|move)\b.{0,80}\b(booking|shipment|job|route)\b/,
  update_booking_cargo: /\b(update|edit|change|amend|correct|set|clear)\b.{0,80}\b(cargo|goods|packages?|weight|dimensions?|shipment)\b/,
  update_booking_container: /\b(update|edit|change|amend|correct|set|clear|record)\b.{0,80}\b(containers?|vgm|tare|reefer|verified gross mass)\b/,
  update_booking_route: /\b(update|edit|change|amend|correct|set|clear|record)\b.{0,80}\b(rout(?:e|ing)|legs?|vessel|voyage|flight|trailer|rail|waybill|bill of lading|departure|arrival|pickup|delivery)\b/,
  change_booking_route_mode: /\b(change|switch|set|correct|update)\b.{0,80}\b(rout(?:e|ing)|legs?)\b.{0,80}\b(mode|sea|air|road|rail|courier|multimodal)\b/,
  update_booking_shipment_value: /\b(update|edit|change|correct|set|clear|record)\b.{0,80}\b(shipment goods value|shipment value|goods value|value of (?:the )?goods)\b/,
  update_quote_cargo: /\b(update|edit|change|amend|correct|set|clear)\b(?=.{0,160}\bquote\b)(?=.{0,160}\b(cargo|goods|packages?|weight|dimensions?|commodity)\b)/,
  create_customs_declaration: /\b(create|add|start|make|open|new|draft)\b.{0,80}\b(customs|declaration|cds|import|export)\b/,
  update_customs_declaration: /\b(update|edit|change|amend|correct|complete|fill)\b.{0,80}\b(customs|declaration|cds|import|export)\b/,
  create_icustoms_draft: /\b(create|save|send|prepare)\b.{0,80}\b(icustoms|provider)\b.{0,40}\b(draft|declaration)\b|\bprovider draft\b/,
  submit_customs_declaration: /\b(submit|file|send)\b.{0,80}\b(customs|declaration|cds|icustoms)\b/,
  create_purchase_order: /\b(create|add|start|make|open|new|draft)\b.{0,80}\b(purchase order|po)\b|\bnew (purchase order|po)\b/,
  create_warehouse_order: /\b(create|add|start|make|open|new)\b.{0,80}\b(warehouse order|goods in|goods out|inbound|outbound)\b/,
  update_warehouse_order: /\b(update|edit|change|amend|correct|set)\b.{0,80}\b(warehouse order|inbound|outbound|goods in|goods out)\b/,
  receive_warehouse_order: /\b(receive|receipt|book in|goods in)\b.{0,80}\b(order|stock|goods|shipment|delivery)\b|\bpost.{0,30}\breceipt\b/,
  dispatch_warehouse_order: /\b(dispatch|goods out|ship|release)\b.{0,80}\b(order|stock|goods|shipment|delivery)\b|\bpost.{0,30}\bdispatch\b/,
  cancel_warehouse_order: /\bcancel\b.{0,80}\b(warehouse order|inbound|outbound|goods in|goods out|order)\b/,
  quarantine_inventory: /\b(quarantine|hold|isolate)\b.{0,80}\b(stock|inventory|item|goods)\b/,
  change_warehouse_inventory_status: /\b(change|set|mark|update)\b.{0,80}\b(stock|inventory|item|goods)\b.{0,50}\b(status|available|quarantine|damaged|held)\b/,
  move_warehouse_inventory: /\b(move|transfer|relocate)\b.{0,80}\b(stock|inventory|item|goods)\b/,
  move_warehouse_handling_unit: /\b(move|transfer|relocate)\b.{0,80}\b(pallet|handling unit|hu)\b/,
  create_warehouse_facility: /\b(create|add|new)\b.{0,80}\b(warehouse|facility)\b/,
  update_warehouse_facility: /\b(update|edit|change|amend|correct)\b.{0,80}\b(warehouse|facility)\b/,
  create_warehouse_location: /\b(create|add|new)\b.{0,80}\b(location|bin|bay)\b/,
  update_warehouse_location: /\b(update|edit|change|amend|correct)\b.{0,80}\b(location|bin|bay)\b/,
  create_warehouse_item: /\b(create|add|new)\b.{0,80}\b(item|sku|product)\b/,
  update_warehouse_item: /\b(update|edit|change|amend|correct)\b.{0,80}\b(item|sku|product)\b/,
  create_warehouse_handling_unit: /\b(create|add|new)\b.{0,80}\b(pallet|handling unit|hu)\b/,
  record_warehouse_sample: /\b(record|add|log|take)\b.{0,80}\b(sample\b|sampling\b)/,
  report_warehouse_location_empty: /\b(report|mark|set)\b.{0,80}\b(location|bin|bay)\b.{0,40}\bempty\b/,
  resolve_warehouse_location_exception: /\b(resolve|close|clear)\b.{0,80}\b(location|bin|bay|exception)\b/,
  update_lead: /\b(update|edit|change|amend|correct|assign|set)\b.{0,80}\b(lead|prospect)\b/,
  update_deal: /\b(update|edit|change|amend|correct|assign|set|move)\b.{0,80}\b(deal|opportunity|pipeline)\b/,
  update_quote: /\b(update|edit|change|amend|correct|set)\b.{0,80}\b(quote|quotation)\b/,
  mark_quote_lost: /\b(mark|record|set)\b.{0,40}\b(quote|quotation)\b.{0,40}\b(lost|declined|unsuccessful)\b|\b(lost|declined)\b.{0,40}\b(quote|quotation)\b/,
  create_todo_task: /\b(create|add|remember|remind|schedule|new)\b.{0,80}\b(to[- ]?do|todo|task|action item)\b|\b(remind me|add to my to[- ]?do)\b/,
  update_todo_task: /\b(update|edit|change|amend|reschedule|move|rename|set)\b.{0,80}\b(to[- ]?do|todo|task|action item)\b/,
  complete_todo_task: /\b(complete|finish|done|reopen|tick off|mark)\b.{0,80}\b(to[- ]?do|todo|task|action item)\b/,
  delete_todo_task: /\b(delete|remove)\b.{0,80}\b(to[- ]?do|todo|task|action item)\b/,
  attach_email_document_to_customer: /\b(attach|save|add|file)\b.{0,80}\b(document|file|attachment)\b.{0,80}\b(customer|account)\b/,
}

export function operatorAuthorisesAction(prompt: string, actionCode: string) {
  const pattern = ACTION_INTENTS[actionCode]
  return Boolean(pattern?.test(normalisePrompt(prompt)))
}

export function allowedActionsForPrompt(prompt: string, availableActionCodes: string[], accessMode: "approve" | "full") {
  if (accessMode === "approve") return [...availableActionCodes]
  return availableActionCodes.filter((code) => operatorAuthorisesAction(prompt, code))
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function loadDexterActor(admin: Db, authUserId: string): Promise<DexterActor> {
  const { data, error } = await admin.from("cmp_Users")
    .select("User_ID,Company_ID,User_AccessStatus")
    .eq("Auth_User_ID", authUserId)
    .maybeSingle()
  if (error || !data?.User_ID || !data?.Company_ID || (data.User_AccessStatus && data.User_AccessStatus !== "active")) {
    throw new Error("dexter_actor_unavailable")
  }
  return { authUserId, userId: data.User_ID, companyId: data.Company_ID }
}

async function ownsConversation(admin: Db, actor: DexterActor, conversationId: string) {
  const { data } = await admin.from("AI_Conversations").select("AICNV_ID")
    .eq("AICNV_ID", conversationId)
    .eq("AICNV_CompanyID", actor.companyId)
    .eq("AICNV_OwnerUserID", actor.userId)
    .eq("AICNV_Channel", "chat")
    .is("AICNV_EndedAt", null)
    .maybeSingle()
  return Boolean(data)
}

async function actorCanManageDexter(admin: Db, actor: DexterActor) {
  const { data, error } = await admin.rpc("_multideck_dexter_has_permissions", {
    p_user_id: actor.userId,
    p_permissions: ["AgentDexter.Manage"],
  })
  return !error && data === true
}

export async function setConversationAccessMode(
  admin: Db,
  actor: DexterActor,
  conversationId: string | null,
  clientSessionId: string,
  mode: "approve" | "full",
) {
  if (!isUuid(clientSessionId)) throw new Error("invalid_client_session")
  if (conversationId && (!isUuid(conversationId) || !(await ownsConversation(admin, actor, conversationId)))) {
    throw new Error("conversation_unavailable")
  }
  if (mode === "full" && !(await actorCanManageDexter(admin, actor))) throw new Error("permission_denied")
  await admin.from("AI_DexterConversationGrants").update({
    AIDexterGrant_Status: "revoked",
    AIDexterGrant_RevokedAt: new Date().toISOString(),
  }).eq("AIDexterGrant_CompanyID", actor.companyId)
    .eq("AIDexterGrant_UserID", actor.userId)
    .eq("AIDexterGrant_ClientSessionID", clientSessionId)
    .eq("AIDexterGrant_Status", "active")

  if (mode === "approve") return { mode, grantId: null, expiresAt: null }

  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
  const grantId = crypto.randomUUID()
  const { error } = await admin.from("AI_DexterConversationGrants").insert({
    AIDexterGrant_ID: grantId,
    AIDexterGrant_CompanyID: actor.companyId,
    AIDexterGrant_UserID: actor.userId,
    AIDexterGrant_ConversationID: conversationId,
    AIDexterGrant_ClientSessionID: clientSessionId,
    AIDexterGrant_Mode: "full",
    AIDexterGrant_Status: "active",
    AIDexterGrant_ExpiresAt: expiresAt,
  })
  if (error) throw new Error("grant_unavailable")
  return { mode, grantId, expiresAt }
}

async function validFullGrant(
  admin: Db,
  actor: DexterActor,
  grantId: string,
  clientSessionId: string,
  conversationId: string | null,
) {
  if (!isUuid(grantId) || !isUuid(clientSessionId)) return false
  let query = admin.from("AI_DexterConversationGrants").select("AIDexterGrant_ID")
    .eq("AIDexterGrant_ID", grantId)
    .eq("AIDexterGrant_CompanyID", actor.companyId)
    .eq("AIDexterGrant_UserID", actor.userId)
    .eq("AIDexterGrant_ClientSessionID", clientSessionId)
    .eq("AIDexterGrant_Mode", "full")
    .eq("AIDexterGrant_Status", "active")
    .gt("AIDexterGrant_ExpiresAt", new Date().toISOString())
  query = conversationId
    ? query.eq("AIDexterGrant_ConversationID", conversationId)
    : query.is("AIDexterGrant_ConversationID", null)
  const { data } = await query.maybeSingle()
  return Boolean(data)
}

export async function resolveConversationAccessMode(input: {
  admin: Db
  actor: DexterActor
  grantId: string | null
  clientSessionId: string
  conversationId: string | null
}) : Promise<"approve" | "full"> {
  if (!isUuid(input.clientSessionId) || !input.grantId) return "approve"
  if (!(await actorCanManageDexter(input.admin, input.actor))) {
    await input.admin.from("AI_DexterConversationGrants").update({
      AIDexterGrant_Status: "revoked",
      AIDexterGrant_RevokedAt: new Date().toISOString(),
    }).eq("AIDexterGrant_ID", input.grantId)
      .eq("AIDexterGrant_CompanyID", input.actor.companyId)
      .eq("AIDexterGrant_UserID", input.actor.userId)
      .eq("AIDexterGrant_Status", "active")
    return "approve"
  }
  return await validFullGrant(
    input.admin,
    input.actor,
    input.grantId,
    input.clientSessionId,
    input.conversationId,
  ) ? "full" : "approve"
}

export async function createSecurityContext(input: {
  admin: Db
  actor: DexterActor
  conversationId: string | null
  clientSessionId: string
  grantId: string | null
  prompt: string
  specialist: string
  availableActionCodes: string[]
  trustedTargetIds: string[]
  trustedRecipientAddresses: string[]
}) : Promise<DexterSecurityContext> {
  if (!isUuid(input.clientSessionId)) throw new Error("invalid_client_session")
  const accessMode = await resolveConversationAccessMode(input)
  const allowedActionCodes = allowedActionsForPrompt(input.prompt, input.availableActionCodes, accessMode)
  const intentPlanId = crypto.randomUUID()
  const { error } = await input.admin.from("AI_DexterIntentPlans").insert({
    AIDexterIntent_ID: intentPlanId,
    AIDexterIntent_CompanyID: input.actor.companyId,
    AIDexterIntent_UserID: input.actor.userId,
    AIDexterIntent_ConversationID: input.conversationId,
    AIDexterIntent_ClientSessionID: input.clientSessionId,
    AIDexterIntent_PromptSHA256: await sha256(input.prompt),
    AIDexterIntent_AllowedActionsJSON: allowedActionCodes,
    AIDexterIntent_TargetConstraintsJSON: [...new Set(input.trustedTargetIds.filter(isUuid))],
    AIDexterIntent_RecipientConstraintsJSON: [...new Set(input.trustedRecipientAddresses
      .map((value) => clean(value, 320).toLowerCase())
      .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))],
    AIDexterIntent_Specialist: clean(input.specialist, 30) || "auto",
    AIDexterIntent_AccessMode: accessMode,
    AIDexterIntent_ExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  })
  if (error) throw new Error("intent_plan_unavailable")
  return {
    accessMode,
    grantId: accessMode === "full" ? input.grantId : null,
    intentPlanId,
    clientSessionId: input.clientSessionId,
    allowedActionCodes,
    trustedTargetIds: [...new Set(input.trustedTargetIds.filter(isUuid))],
    authorisedRecipientAddresses: [...new Set(input.trustedRecipientAddresses
      .map((value) => clean(value, 320).toLowerCase())
      .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))],
  }
}

export async function prepareServerAction(admin: Db, actor: DexterActor, input: PreparedActionInput) {
  const { data: intent, error: intentError } = await admin.from("AI_DexterIntentPlans")
    .select("AIDexterIntent_AllowedActionsJSON,AIDexterIntent_TargetConstraintsJSON,AIDexterIntent_RecipientConstraintsJSON,AIDexterIntent_AccessMode,AIDexterIntent_ExpiresAt")
    .eq("AIDexterIntent_ID", input.intentPlanId)
    .eq("AIDexterIntent_CompanyID", actor.companyId)
    .eq("AIDexterIntent_UserID", actor.userId)
    .gt("AIDexterIntent_ExpiresAt", new Date().toISOString())
    .maybeSingle()
  const allowed = Array.isArray(intent?.AIDexterIntent_AllowedActionsJSON) ? intent.AIDexterIntent_AllowedActionsJSON : []
  const targetConstraints = Array.isArray(intent?.AIDexterIntent_TargetConstraintsJSON) ? intent.AIDexterIntent_TargetConstraintsJSON : []
  const recipientConstraints = Array.isArray(intent?.AIDexterIntent_RecipientConstraintsJSON)
    ? intent.AIDexterIntent_RecipientConstraintsJSON.map((value: unknown) => clean(value, 320).toLowerCase()).filter(Boolean)
    : []
  const proposedTargetIds = [...actionTargetIds(input.arguments)]
  if (intentError || !intent || intent.AIDexterIntent_AccessMode !== input.accessMode || !allowed.includes(input.actionCode)) {
    await securityEvent(admin, actor, "intent_mismatch", "warning", { actionCode: input.actionCode, intentPlanId: input.intentPlanId })
    throw new Error("action_outside_operator_intent")
  }
  if (input.accessMode === "full" &&
      !requiresExplicitActionApproval(input.actionCode, input.accessMode) &&
      proposedTargetIds.some((targetId) => !targetConstraints.includes(targetId))) {
    await securityEvent(admin, actor, "target_substitution_denied", "high", {
      actionCode: input.actionCode,
      intentPlanId: input.intentPlanId,
      targetCount: proposedTargetIds.length,
    })
    throw new Error("target_outside_operator_intent")
  }
  const proposedRecipients = emailAddressesFromDraft(input.arguments)
  if (input.accessMode === "full" && ["create_email_draft", "send_email"].includes(input.actionCode) &&
      (proposedRecipients.length === 0 || proposedRecipients.some((address) => !recipientConstraints.includes(address)))) {
    await securityEvent(admin, actor, "recipient_substitution_denied", "high", {
      actionCode: input.actionCode,
      intentPlanId: input.intentPlanId,
      recipientCount: proposedRecipients.length,
    })
    throw new Error("recipient_outside_operator_intent")
  }
  const id = crypto.randomUUID()
  const target = proposedTargetIds[0] ?? ""
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString()
  const preparedRow = {
    AIDexterPrepared_ID: id,
    AIDexterPrepared_CompanyID: actor.companyId,
    AIDexterPrepared_UserID: actor.userId,
    AIDexterPrepared_ConversationID: input.conversationId,
    AIDexterPrepared_ClientSessionID: input.clientSessionId,
    AIDexterPrepared_IntentID: input.intentPlanId,
    AIDexterPrepared_GrantID: input.grantId,
    AIDexterPrepared_ActionCode: input.actionCode,
    AIDexterPrepared_ArgumentsJSON: input.arguments,
    AIDexterPrepared_TargetID: isUuid(target) ? target : null,
    AIDexterPrepared_TargetJSON: {
      ...(isUuid(target) ? { recordId: target } : {}),
      ...(proposedTargetIds.length ? { recordIds: proposedTargetIds } : {}),
      ...(proposedRecipients.length ? { recipients: proposedRecipients } : {}),
    },
    AIDexterPrepared_Title: clean(input.title, 240),
    AIDexterPrepared_Description: clean(input.description, 1_000),
    AIDexterPrepared_ChangesJSON: input.changes,
    AIDexterPrepared_AccessMode: input.accessMode,
    AIDexterPrepared_Status: "prepared",
    AIDexterPrepared_ExpiresAt: expiresAt,
  }
  if (input.actionCode === "change_booking_route_mode") {
    // The database trigger binds the review to current saved references. Return
    // the exact persisted card, never model-supplied copy hiding the reset.
    const { data, error } = await admin.from("AI_DexterPreparedActions").insert(preparedRow)
      .select("AIDexterPrepared_Title,AIDexterPrepared_Description,AIDexterPrepared_ChangesJSON").single()
    if (error || typeof data?.AIDexterPrepared_Title !== "string" || typeof data?.AIDexterPrepared_Description !== "string" ||
        !Array.isArray(data?.AIDexterPrepared_ChangesJSON) || !data.AIDexterPrepared_ChangesJSON.every((item: unknown) => item !== null && typeof item === "object" && !Array.isArray(item))) {
      throw new Error("prepared_action_unavailable")
    }
    return { id, expiresAt, review: { title: data.AIDexterPrepared_Title, description: data.AIDexterPrepared_Description, changes: data.AIDexterPrepared_ChangesJSON as JsonObject[] } }
  }
  const { error } = await admin.from("AI_DexterPreparedActions").insert(preparedRow)
  if (error) throw new Error("prepared_action_unavailable")
  return { id, expiresAt }
}

export async function authoriseTrustedRecordRecipients(
  admin: Db,
  actor: DexterActor,
  intentPlanId: string,
  evidence: unknown,
) {
  if (!isUuid(intentPlanId)) return []
  const { data: intent } = await admin.from("AI_DexterIntentPlans")
    .select("AIDexterIntent_TargetConstraintsJSON,AIDexterIntent_RecipientConstraintsJSON")
    .eq("AIDexterIntent_ID", intentPlanId)
    .eq("AIDexterIntent_CompanyID", actor.companyId)
    .eq("AIDexterIntent_UserID", actor.userId)
    .gt("AIDexterIntent_ExpiresAt", new Date().toISOString())
    .maybeSingle()
  if (!intent) return []
  const trustedTargets = new Set(Array.isArray(intent.AIDexterIntent_TargetConstraintsJSON)
    ? intent.AIDexterIntent_TargetConstraintsJSON.filter(isUuid)
    : [])
  if (trustedTargets.size === 0) return []
  const discovered = new Set<string>()
  collectTrustedRecordEmails(evidence, trustedTargets, discovered)
  if (discovered.size === 0) return []
  const existing = Array.isArray(intent.AIDexterIntent_RecipientConstraintsJSON)
    ? intent.AIDexterIntent_RecipientConstraintsJSON.map((value: unknown) => clean(value, 320).toLowerCase()).filter(Boolean)
    : []
  const recipients = [...new Set([...existing, ...discovered])]
  const { error } = await admin.from("AI_DexterIntentPlans").update({
    AIDexterIntent_RecipientConstraintsJSON: recipients,
  }).eq("AIDexterIntent_ID", intentPlanId)
    .eq("AIDexterIntent_CompanyID", actor.companyId)
    .eq("AIDexterIntent_UserID", actor.userId)
  return error ? [] : [...discovered]
}

export async function getPreparedAction(
  admin: Db,
  actor: DexterActor,
  preparedActionId: string,
  conversationId: string | null,
) {
  if (!isUuid(preparedActionId)) return null
  let query = admin.from("AI_DexterPreparedActions").select("*")
    .eq("AIDexterPrepared_ID", preparedActionId)
    .eq("AIDexterPrepared_CompanyID", actor.companyId)
    .eq("AIDexterPrepared_UserID", actor.userId)
  query = conversationId
    ? query.eq("AIDexterPrepared_ConversationID", conversationId)
    : query.is("AIDexterPrepared_ConversationID", null)
  const { data } = await query.maybeSingle()
  return data ?? null
}

export async function declinePreparedAction(
  admin: Db,
  actor: DexterActor,
  preparedActionId: string,
  conversationId: string | null,
) {
  let query = admin.from("AI_DexterPreparedActions").update({
    AIDexterPrepared_Status: "declined",
    AIDexterPrepared_CompletedAt: new Date().toISOString(),
  }).eq("AIDexterPrepared_ID", preparedActionId)
    .eq("AIDexterPrepared_CompanyID", actor.companyId)
    .eq("AIDexterPrepared_UserID", actor.userId)
    .eq("AIDexterPrepared_Status", "prepared")
  query = conversationId
    ? query.eq("AIDexterPrepared_ConversationID", conversationId)
    : query.is("AIDexterPrepared_ConversationID", null)
  const { data } = await query
    .select("AIDexterPrepared_ID")
    .maybeSingle()
  return Boolean(data)
}

export async function refreshPreparedEmailAction(admin: Db, actor: DexterActor, messageId: string, preparedActionId: string) {
  if (!isUuid(messageId) || !isUuid(preparedActionId)) return false
  const { data: hasPermissions } = await admin.rpc("_multideck_dexter_has_permissions", {
    p_user_id: actor.userId,
    p_permissions: ["AgentDexter.Manage", "Email.Send"],
  })
  if (hasPermissions !== true) return false
  const { data: message } = await admin.from("AI_Messages")
    .select("AIMSG_ConversationID,AIMSG_Role,AIMSG_ContentJSON")
    .eq("AIMSG_ID", messageId)
    .eq("AIMSG_Role", "assistant")
    .maybeSingle()
  if (!message || !isUuid(message.AIMSG_ConversationID)) return false
  const { data: conversation } = await admin.from("AI_Conversations")
    .select("AICNV_ID")
    .eq("AICNV_ID", message.AIMSG_ConversationID)
    .eq("AICNV_CompanyID", actor.companyId)
    .eq("AICNV_OwnerUserID", actor.userId)
    .maybeSingle()
  if (!conversation) return false

  const content = message.AIMSG_ContentJSON && typeof message.AIMSG_ContentJSON === "object"
    ? message.AIMSG_ContentJSON as Record<string, any>
    : {}
  const draft = content.metadata?.emailDraft
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return false
  const expectedAction = draft.requestedAction === "send" ? "send_email" : "create_email_draft"
  const now = new Date().toISOString()
  const { data: prepared } = await admin.from("AI_DexterPreparedActions")
    .select("AIDexterPrepared_ID")
    .eq("AIDexterPrepared_ID", preparedActionId)
    .eq("AIDexterPrepared_CompanyID", actor.companyId)
    .eq("AIDexterPrepared_UserID", actor.userId)
    .eq("AIDexterPrepared_ConversationID", conversation.AICNV_ID)
    .eq("AIDexterPrepared_ActionCode", expectedAction)
    .eq("AIDexterPrepared_Status", "prepared")
    .gt("AIDexterPrepared_ExpiresAt", now)
    .maybeSingle()
  if (!prepared) {
    await securityEvent(admin, actor, "prepared_email_refresh_denied", "warning", { messageId, preparedActionId })
    return false
  }
  const recipientCount = [draft.to, draft.cc, draft.bcc]
    .reduce((total, value) => total + (Array.isArray(value) ? value.length : 0), 0)
  const recipients = emailAddressesFromDraft({ draft })
  const { data: updated } = await admin.from("AI_DexterPreparedActions").update({
    AIDexterPrepared_ArgumentsJSON: { draft },
    AIDexterPrepared_TargetJSON: { recipients },
    AIDexterPrepared_ChangesJSON: [
      { field: "Recipients", before: null, after: recipientCount },
      { field: "Subject", before: null, after: clean(draft.subject, 500) },
      { field: "Message", before: null, after: `${clean(draft.bodyText, 50_000).length} characters` },
    ],
  }).eq("AIDexterPrepared_ID", preparedActionId)
    .eq("AIDexterPrepared_Status", "prepared")
    .select("AIDexterPrepared_ID")
    .maybeSingle()
  return Boolean(updated)
}

export async function claimExternalPreparedAction(
  admin: Db,
  actor: DexterActor,
  preparedActionId: string,
  conversationId: string | null,
) {
  if (!isUuid(preparedActionId)) return null
  const { data, error } = await admin.rpc("multideck_dexter_claim_external_prepared_action", {
    p_prepared_action_id: preparedActionId,
    p_company_id: actor.companyId,
    p_user_id: actor.userId,
    p_conversation_id: conversationId,
  })
  if (error || !data || typeof data !== "object" || Array.isArray(data) || data.ok !== true ||
      !data.prepared || typeof data.prepared !== "object" || Array.isArray(data.prepared)) return null
  return data.prepared as Record<string, any>
}

export async function completeExternalPreparedAction(input: {
  admin: Db
  actor: DexterActor
  prepared: Record<string, any>
  result: unknown
  error: { code?: string; message?: string } | null
}) {
  const completedAt = new Date().toISOString()
  const succeeded = !input.error
  const result = succeeded && input.result && typeof input.result === "object" ? input.result : {}
  const actionCode = clean(input.prepared.AIDexterPrepared_ActionCode, 50)
  const preparedArguments = input.prepared.AIDexterPrepared_ArgumentsJSON
  const emailDraft = preparedArguments?.draft && typeof preparedArguments.draft === "object" ? preparedArguments.draft : null
  const auditArguments = actionCode === "send_email" || actionCode === "create_email_draft"
    ? {
        mailboxSelected: Boolean(clean(emailDraft?.mailboxId, 80)),
        recipientCount: [emailDraft?.to, emailDraft?.cc, emailDraft?.bcc]
          .reduce((total, value) => total + (Array.isArray(value) ? value.length : 0), 0),
        subjectLength: clean(emailDraft?.subject, 500).length,
        bodyLength: clean(emailDraft?.bodyText, 50_000).length,
      }
    : preparedArguments
  await input.admin.from("AI_DexterPreparedActions").update({
    AIDexterPrepared_Status: succeeded ? "succeeded" : "failed",
    AIDexterPrepared_ResultJSON: result,
    AIDexterPrepared_ErrorCode: succeeded ? null : clean(input.error?.code, 100) || "external_action_failed",
    AIDexterPrepared_ErrorMessage: succeeded ? null : clean(input.error?.message, 500) || "The external action failed.",
    AIDexterPrepared_CompletedAt: completedAt,
  }).eq("AIDexterPrepared_ID", input.prepared.AIDexterPrepared_ID)

  await input.admin.from("AI_DexterActionAudit").insert({
    AIDexterAudit_CompanyID: input.actor.companyId,
    AIDexterAudit_UserID: input.actor.userId,
    AIDexterAudit_ActionCode: input.prepared.AIDexterPrepared_ActionCode,
    AIDexterAudit_AccessMode: input.prepared.AIDexterPrepared_AccessMode,
    AIDexterAudit_ArgumentsJSON: auditArguments,
    AIDexterAudit_ResultJSON: result,
    AIDexterAudit_PreparedActionID: input.prepared.AIDexterPrepared_ID,
    AIDexterAudit_IntentID: input.prepared.AIDexterPrepared_IntentID,
    AIDexterAudit_ConversationID: input.prepared.AIDexterPrepared_ConversationID,
    AIDexterAudit_Status: succeeded ? "succeeded" : "failed",
    AIDexterAudit_IdempotencyKey: input.prepared.AIDexterPrepared_IdempotencyKey,
    AIDexterAudit_ErrorCode: succeeded ? null : clean(input.error?.code, 100) || "external_action_failed",
    AIDexterAudit_ErrorMessage: succeeded ? null : clean(input.error?.message, 500) || "The external action failed.",
    AIDexterAudit_AttemptedAt: input.prepared.AIDexterPrepared_AttemptedAt ?? completedAt,
    AIDexterAudit_CompletedAt: completedAt,
  })
}

export async function bindSecurityRecords(input: {
  admin: Db
  actor: DexterActor
  conversationId: string
  clientSessionId: string
  grantId?: string | null
  intentPlanId?: string | null
  preparedActionId?: string | null
}) {
  if (!isUuid(input.conversationId) || !(await ownsConversation(input.admin, input.actor, input.conversationId))) return
  const bind = { AIDexterPrepared_ConversationID: input.conversationId }
  if (input.preparedActionId) {
    await input.admin.from("AI_DexterPreparedActions").update(bind)
      .eq("AIDexterPrepared_ID", input.preparedActionId)
      .eq("AIDexterPrepared_CompanyID", input.actor.companyId)
      .eq("AIDexterPrepared_UserID", input.actor.userId)
      .eq("AIDexterPrepared_ClientSessionID", input.clientSessionId)
      .is("AIDexterPrepared_ConversationID", null)
    await input.admin.from("AI_DexterActionAudit").update({ AIDexterAudit_ConversationID: input.conversationId })
      .eq("AIDexterAudit_PreparedActionID", input.preparedActionId)
      .eq("AIDexterAudit_CompanyID", input.actor.companyId)
      .eq("AIDexterAudit_UserID", input.actor.userId)
  }
  if (input.intentPlanId) {
    await input.admin.from("AI_DexterIntentPlans").update({ AIDexterIntent_ConversationID: input.conversationId })
      .eq("AIDexterIntent_ID", input.intentPlanId)
      .eq("AIDexterIntent_CompanyID", input.actor.companyId)
      .eq("AIDexterIntent_UserID", input.actor.userId)
      .eq("AIDexterIntent_ClientSessionID", input.clientSessionId)
      .is("AIDexterIntent_ConversationID", null)
  }
  if (input.grantId) {
    await input.admin.from("AI_DexterConversationGrants").update({ AIDexterGrant_ConversationID: input.conversationId })
      .eq("AIDexterGrant_ID", input.grantId)
      .eq("AIDexterGrant_CompanyID", input.actor.companyId)
      .eq("AIDexterGrant_UserID", input.actor.userId)
      .eq("AIDexterGrant_ClientSessionID", input.clientSessionId)
      .is("AIDexterGrant_ConversationID", null)
  }
}
