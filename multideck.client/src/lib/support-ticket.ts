import { supabase } from "@/lib/supabase"

export type CreateSupportTicketRequest = {
  idempotencyKey: string
  topic: string
  priority: string
  title: string
  description: string
  applicationUrl: string
}

export type SupportTicket = {
  ticketNumber: string
  status: string
  createdAt: string
  statusUrl: string | null
}

export type CreateSupportTicketResponse = {
  ticket: SupportTicket
  duplicate: boolean
}

export class SupportTicketError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = "SupportTicketError"
  }
}

type FunctionErrorBody = {
  code?: unknown
  message?: unknown
}

async function supportTicketError(error: unknown) {
  let status = 503
  let code = "support_service_unavailable"
  let message = "Support is temporarily unavailable. Your ticket details are still here; try again."

  if (error && typeof error === "object" && "context" in error && error.context instanceof Response) {
    const response = error.context
    status = response.status

    try {
      const body = await response.clone().json() as FunctionErrorBody
      if (typeof body.code === "string") code = body.code
      if (typeof body.message === "string") message = body.message
    } catch {
      // Keep the safe fallback rather than exposing an unparsed function response.
    }
  }

  return new SupportTicketError(code, message, status)
}

export async function createSupportTicket(
  request: CreateSupportTicketRequest,
): Promise<CreateSupportTicketResponse> {
  if (!supabase) {
    throw new SupportTicketError(
      "support_service_unavailable",
      "Support is temporarily unavailable. Your ticket details are still here; try again.",
      503,
    )
  }

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 13_000)

  try {
    const { data, error } = await supabase.functions.invoke<CreateSupportTicketResponse>(
      "create-support-ticket",
      {
        body: request,
        signal: controller.signal,
      },
    )

    if (error) throw await supportTicketError(error)
    if (!data?.ticket?.ticketNumber) {
      throw new SupportTicketError(
        "support_service_invalid_response",
        "Support did not confirm a ticket number. Your ticket details are still here; try again.",
        502,
      )
    }

    return data
  } catch (error) {
    if (error instanceof SupportTicketError) throw error
    if (
      (error instanceof DOMException && error.name === "AbortError")
      || (error instanceof Error && error.name === "AbortError")
    ) {
      throw new SupportTicketError(
        "support_service_timeout",
        "Support took too long to respond. Your ticket details are still here; try again.",
        504,
      )
    }

    throw await supportTicketError(error)
  } finally {
    window.clearTimeout(timeoutId)
  }
}
