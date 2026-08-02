import {
  cleanString,
  isPlainObject,
  normalizeStatusUrl,
  type JsonObject,
  type NormalizedSupportTicketRequest,
} from "./validation.ts"

export type DatabrainRequesterContext = {
  name: string
  email: string
  companyName: string | null
}

export type FunctionFailure = {
  status: number
  body: {
    code: string
    message: string
  }
}

export type ConfirmedTicketResponse = {
  status: 200 | 201
  body: {
    ticket: {
      ticketNumber: string
      status: string
      createdAt: string
      statusUrl: string | null
    }
    duplicate: boolean
  }
}

export function buildDatabrainTicketPayload(
  request: NormalizedSupportTicketRequest,
  requester: DatabrainRequesterContext,
) {
  const metadata: Record<string, string> = {
    topic: request.topic,
    requestedPriority: request.priority,
  }
  if (request.applicationUrl) metadata.applicationUrl = request.applicationUrl

  return {
    idempotencyKey: request.idempotencyKey,
    sourceApplication: "multideck",
    title: request.title,
    description: request.description,
    requester: {
      name: requester.name,
      email: requester.email,
    },
    clientName: requester.companyName,
    categorySlug: "general",
    priority: request.priority,
    metadata,
  }
}

export function mapDatabrainFailure(status: number): FunctionFailure {
  if (status === 400) {
    return {
      status: 400,
      body: {
        code: "validation_error",
        message: "Check the ticket details and try again.",
      },
    }
  }
  if (status === 409) {
    return {
      status: 409,
      body: {
        code: "idempotency_conflict",
        message: "This ticket changed after it first reached support. Start a new ticket to send the updated details.",
      },
    }
  }
  if (status === 413) {
    return {
      status: 413,
      body: {
        code: "ticket_too_large",
        message: "Shorten the ticket details and try again.",
      },
    }
  }

  return {
    status: 503,
    body: {
      code: "support_service_unavailable",
      message: "Support is temporarily unavailable. Your ticket details are still here; try again.",
    },
  }
}

export function parseConfirmedTicketResponse(body: JsonObject): ConfirmedTicketResponse | null {
  const ticket = isPlainObject(body.ticket) ? body.ticket : {}
  const ticketNumber = cleanString(ticket.ticketNumber, 80)
  const createdAt = cleanString(ticket.createdAt, 80)
  if (!ticketNumber || !createdAt) return null

  const duplicate = body.duplicate === true
  return {
    status: duplicate ? 200 : 201,
    body: {
      ticket: {
        ticketNumber,
        status: cleanString(ticket.status, 40) || "open",
        createdAt,
        statusUrl: normalizeStatusUrl(ticket.statusUrl),
      },
      duplicate,
    },
  }
}
