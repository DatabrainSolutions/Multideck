import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import {
  FunctionError,
  generatedDocumentsBucket,
  maximumGeneratedFileBytes,
} from "./document-functions.ts"

export type QuotePdfDataset = {
  company: {
    name: string
    logoDataUri: string
    registration: string
    vatNumber: string
    email: string
    website: string
    address: string
  }
  quote: {
    reference: string
    version: string
    issuedDate: string
    validUntil: string
    customerName: string
    contactName: string
    customerEmail: string
    customerAddress: string
    customerReference: string
  }
  journey: Array<{ label: string; value: string }>
  shipment: Array<{ label: string; value: string }>
  charges: Array<{ description: string; notes: string; quantity: string; rate: string; amount: string }>
  totals: Array<{ label: string; amount: string }>
  terms: string
  conditions: string
  customerNotes: string
}

export type GeneratedQuotePdf = {
  documentId: string
  bucket: string
  path: string
  fileName: string
  mimeType: "application/pdf"
  fileSizeBytes: number
}

// The HTML is deliberately kept beside the renderer. It is a real Carbone
// template, not a second browser-only representation of the quote.
export const quotePdfTemplate = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    @page { size: A4; margin: 14mm 15mm 15mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #16201f; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; font-size: 9.5px; line-height: 1.42; }
    @media screen {
      html { padding: 24px; background: #eef1ef; }
      body { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 15mm 15mm; background: #ffffff; box-shadow: 0 18px 46px rgba(18, 31, 28, 0.12); }
    }
    .document-head { display: table; width: 100%; margin-bottom: 22px; }
    .document-head > div { display: table-cell; vertical-align: top; }
    .document-title { color: #526864; font-size: 25px; font-weight: 650; letter-spacing: -0.7px; }
    .document-meta { display: table; margin-top: 15px; }
    .document-meta > div { display: table-cell; min-width: 96px; padding-right: 22px; vertical-align: top; }
    .logo-cell { width: 76px; text-align: right; }
    .logo { width: 64px; height: 64px; object-fit: contain; }
    .logo[src=""] { display: none; }
    .label { margin-bottom: 4px; color: #6d7c79; font-size: 7.5px; font-weight: 650; letter-spacing: 0.55px; text-transform: uppercase; }
    .value { color: #16201f; font-weight: 600; }
    .muted { color: #6d7c79; }
    .identity { width: 100%; margin-bottom: 18px; border-collapse: collapse; table-layout: fixed; }
    .identity td { width: 33.333%; padding: 0 22px 0 0; vertical-align: top; }
    .identity td:last-child { padding-right: 0; }
    .identity .value { font-size: 10.5px; }
    .identity p { margin: 3px 0 0; white-space: pre-line; }
    .journey { width: 100%; margin: 0 0 14px; border-collapse: collapse; table-layout: fixed; background: #f2f6f3; }
    .journey td { width: 25%; padding: 11px 12px; vertical-align: top; }
    .journey td + td { border-left: 1px solid #d9e2dd; }
    .shipment { width: 100%; margin-bottom: 20px; border-collapse: collapse; table-layout: fixed; border-top: 1px solid #82938f; border-bottom: 1px solid #d9e2df; }
    .shipment td { width: 25%; padding: 9px 12px 10px 0; vertical-align: top; }
    .shipment td + td { padding-left: 12px; }
    .pricing { margin: 0 -15mm 18px; padding: 14px 15mm 15px; background: #f5f7f4; break-inside: avoid; }
    .pricing-title { margin: 0 0 9px; color: #526864; font-size: 11px; font-weight: 650; }
    table.charges { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .charges th { padding: 0 7px 6px 0; border-bottom: 1px solid #82938f; color: #526864; font-size: 7.5px; font-weight: 650; letter-spacing: 0.35px; text-align: left; text-transform: uppercase; }
    .charges th:nth-child(2), .charges th:nth-child(3), .charges th:nth-child(4), .charges td:nth-child(2), .charges td:nth-child(3), .charges td:nth-child(4) { text-align: right; }
    .charges th:last-child, .charges td:last-child { padding-right: 0; }
    .charges td { padding: 7px 7px 7px 0; border-bottom: 1px solid #e1e6e2; vertical-align: top; }
    .charge-note { margin-top: 2px; color: #6d7c79; font-size: 8px; }
    .totals { width: 42%; margin: 9px 0 0 auto; border-collapse: collapse; }
    .totals td { padding: 4px 0 0 12px; text-align: right; }
    .totals .total-label { color: #526864; }
    .totals .total-amount { color: #0a7068; font-size: 12px; font-weight: 700; }
    .notes { display: table; width: 100%; break-inside: avoid; }
    .notes > div { display: table-cell; width: 50%; padding-right: 24px; vertical-align: top; }
    .notes > div:last-child { padding-right: 0; }
    .notes h2 { margin: 0 0 5px; color: #526864; font-size: 8px; font-weight: 650; letter-spacing: 0.45px; text-transform: uppercase; }
    .notes p { margin: 0; color: #596864; white-space: pre-line; }
    .customer-note { margin-top: 10px; padding-top: 9px; border-top: 1px solid #d9e2df; }
    .footer { margin-top: 20px; padding-top: 9px; border-top: 1px solid #d9e2df; color: #6d7c79; font-size: 7.5px; }
  </style>
</head>
<body>
  <carbone-pdf-options paper-size="A4" margin-top="0" margin-right="0" margin-bottom="0" margin-left="0" print-background="true" prefer-css-page-size="true" generate-tagged-pdf="true" />
  <div class="document-head">
    <div>
      <div class="document-title">Quote</div>
      <div class="document-meta">
        <div><div class="label">Quote number</div><div class="value">{d.quote.reference}</div></div>
        <div><div class="label">Date of issue</div><div class="value">{d.quote.issuedDate}</div></div>
        <div><div class="label">Valid until</div><div class="value">{d.quote.validUntil}</div></div>
      </div>
    </div>
    <div class="logo-cell">
      <img class="logo" src="{d.company.logoDataUri}" alt="">
    </div>
  </div>

  <table class="identity"><tr>
    <td><div class="label">Billed to</div><div class="value">{d.quote.customerName}</div><p>{d.quote.customerAddress}</p><p>{d.quote.contactName}<br>{d.quote.customerEmail}</p></td>
    <td><div class="label">From</div><div class="value">{d.company.name}</div><p>{d.company.address}</p><p>Registration {d.company.registration}<br>VAT {d.company.vatNumber}</p></td>
    <td><div class="label">Contact</div><div class="value">Customer ref {d.quote.customerReference}</div><p>{d.company.email}<br>{d.company.website}</p><p class="muted">Quote version {d.quote.version}</p></td>
  </tr></table>

  <table class="journey"><tr>
    <td><div class="label">{d.journey[0].label}</div><div class="value">{d.journey[0].value}</div></td>
    <td><div class="label">{d.journey[1].label}</div><div class="value">{d.journey[1].value}</div></td>
    <td><div class="label">{d.journey[2].label}</div><div class="value">{d.journey[2].value}</div></td>
    <td><div class="label">{d.journey[3].label}</div><div class="value">{d.journey[3].value}</div></td>
  </tr></table>

  <table class="shipment"><tr>
    <td><div class="label">{d.shipment[0].label}</div><div class="value">{d.shipment[0].value}</div></td>
    <td><div class="label">{d.shipment[1].label}</div><div class="value">{d.shipment[1].value}</div></td>
    <td><div class="label">{d.shipment[2].label}</div><div class="value">{d.shipment[2].value}</div></td>
    <td><div class="label">{d.shipment[3].label}</div><div class="value">{d.shipment[3].value}</div></td>
  </tr></table>

  <div class="pricing">
    <div class="pricing-title">Cost breakdown</div>
    <table class="charges">
      <colgroup><col style="width:52%"><col style="width:18%"><col style="width:12%"><col style="width:18%"></colgroup>
      <thead><tr><th>Description</th><th>Unit rate</th><th>Quantity</th><th>Amount</th></tr></thead>
      <tbody>
        <tr><td>{d.charges[i].description}<div class="charge-note">{d.charges[i].notes}</div></td><td>{d.charges[i].rate}</td><td>{d.charges[i].quantity}</td><td>{d.charges[i].amount}</td></tr>
        <tr style="display:none"><td>{d.charges[i+1]}</td><td></td><td></td><td></td></tr>
      </tbody>
    </table>
    <table class="totals"><tbody>
      <tr><td class="total-label">{d.totals[i].label}</td><td class="total-amount">{d.totals[i].amount}</td></tr>
      <tr style="display:none"><td>{d.totals[i+1]}</td><td></td></tr>
    </tbody></table>
  </div>

  <div class="notes">
    <div><h2>Terms</h2><p>{d.terms}</p></div>
    <div><h2>Rate and space conditions</h2><p>{d.conditions}</p></div>
  </div>
  <div class="customer-note"><div class="label">Notes</div><div class="muted">{d.customerNotes}</div></div>
  <div class="footer">{d.company.name} · {d.company.address} · {d.company.email} · {d.company.website}</div>
</body>
</html>`

function base64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (let offset = 0; offset < bytes.length; offset += 8_192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192))
  }
  return btoa(binary)
}

function carboneAuthorization() {
  const explicit = Deno.env.get("CARBONE_AUTH_HEADER")?.trim()
  if (explicit) return explicit
  const username = Deno.env.get("CARBONE_USERNAME")
  const password = Deno.env.get("CARBONE_PASSWORD")
  if (username && password) return `Basic ${btoa(`${username}:${password}`)}`
  const token = Deno.env.get("CARBONE_API_TOKEN")?.trim()
  if (token) return `Bearer ${token}`
  throw new FunctionError(500, "The quote PDF service is not configured.", "Carbone authentication is unavailable")
}

function carboneBaseUrl() {
  const configured = Deno.env.get("CARBONE_URL")?.trim().replace(/\/$/, "")
  if (!configured) throw new FunctionError(500, "The quote PDF service is not configured.", "CARBONE_URL is unavailable")
  const url = new URL(configured)
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new FunctionError(500, "The quote PDF service is not configured safely.", "CARBONE_URL must use HTTPS")
  }
  return url.toString().replace(/\/$/, "")
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")
}

function safeReference(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "quote"
}

export async function generateQuotePdf(input: {
  admin: SupabaseClient
  companyId: string
  userId: string
  quoteId: string
  quoteVersionId: string
  reference: string
  dataset: QuotePdfDataset
}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(Number(Deno.env.get("CARBONE_TIMEOUT_MS") ?? 90_000), 5_000), 120_000))
  let response: Response
  try {
    response = await fetch(`${carboneBaseUrl()}/render/template?download=true`, {
      method: "POST",
      headers: {
        "Authorization": carboneAuthorization(),
        "Content-Type": "application/json",
        "carbone-version": Deno.env.get("CARBONE_API_VERSION")?.trim() || "5",
      },
      body: JSON.stringify({
        data: input.dataset,
        template: base64Utf8(quotePdfTemplate),
        convertTo: "pdf",
        converter: "C",
        lang: "en",
        reportName: `Quote-${safeReference(input.reference)}`,
      }),
      signal: controller.signal,
    })
  } catch (error) {
    throw new FunctionError(502, "The quote PDF could not be created. Try again.", error instanceof DOMException && error.name === "AbortError" ? "Carbone quote render timed out" : "Carbone quote render request failed")
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) {
    const providerRequestId = response.headers.get("x-request-id")?.trim().slice(0, 160)
    const providerBody = await response.text().catch(() => "")
    let providerMessage = ""
    try {
      const parsed = JSON.parse(providerBody) as { error?: unknown; message?: unknown }
      const candidate = typeof parsed.message === "string"
        ? parsed.message
        : typeof parsed.error === "string"
          ? parsed.error
          : ""
      providerMessage = candidate.replace(/\s+/g, " ").slice(0, 400)
    } catch {
      providerMessage = ""
    }
    const diagnostic = [
      `Carbone quote render returned HTTP ${response.status}`,
      providerRequestId ? `request ${providerRequestId}` : "",
      providerMessage,
    ].filter(Boolean).join(": ")
    throw new FunctionError(502, "The quote PDF could not be created. Try again.", diagnostic)
  }
  const contentLength = Number(response.headers.get("Content-Length") ?? 0)
  if (contentLength > maximumGeneratedFileBytes) throw new FunctionError(502, "The quote PDF is too large.", "Carbone quote PDF exceeded 50 MiB")
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.byteLength || bytes.byteLength > maximumGeneratedFileBytes || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new FunctionError(502, "The renderer returned an invalid quote PDF.", "Rendered quote PDF validation failed")
  }

  const documentId = crypto.randomUUID()
  const createdAt = new Date()
  const fileName = `Quote-${safeReference(input.reference)}.pdf`
  const environment = (Deno.env.get("MULTIDECK_ENVIRONMENT")?.trim() || "production").replace(/[^a-z0-9_-]/gi, "-")
  const path = ["v1", environment, input.companyId, "generated", "quote", input.quoteId, input.quoteVersionId, `${documentId}.pdf`].join("/")
  const digest = await sha256(bytes)
  const { error: uploadError } = await input.admin.storage.from(generatedDocumentsBucket).upload(path, bytes, {
    contentType: "application/pdf",
    cacheControl: "0",
    upsert: false,
    metadata: { documentid: documentId.replaceAll("-", ""), concern: "quote", aggregatetype: "CusQuote_Header", aggregateid: input.quoteId.replaceAll("-", ""), sha256: digest },
  })
  if (uploadError) throw new FunctionError(502, "The quote PDF could not be stored.", "Supabase Storage quote PDF upload failed")

  const { error: catalogueError } = await input.admin.from("DOC_StoredObjects").insert({
    DOCStoredObject_ID: documentId,
    DOCStoredObject_ConcernCode: "quote",
    DOCStoredObject_OrganisationID: null,
    DOCStoredObject_AggregateType: "CusQuote_Header",
    DOCStoredObject_AggregateID: input.quoteId,
    DOCStoredObject_ProviderCode: "supabase_storage",
    DOCStoredObject_Container: generatedDocumentsBucket,
    DOCStoredObject_BlobName: path,
    DOCStoredObject_OriginalFileName: fileName,
    DOCStoredObject_MimeType: "application/pdf",
    DOCStoredObject_FileSizeBytes: bytes.byteLength,
    DOCStoredObject_SHA256: digest,
    DOCStoredObject_StatusCode: "active",
    DOCStoredObject_CreatedAt: createdAt.toISOString(),
    DOCStoredObject_CreatedBy: input.userId,
  })
  if (catalogueError) {
    await input.admin.storage.from(generatedDocumentsBucket).remove([path])
    throw new FunctionError(500, "The quote PDF could not be catalogued.", "Quote PDF catalogue insert failed")
  }
  return { documentId, bucket: generatedDocumentsBucket, path, fileName, mimeType: "application/pdf", fileSizeBytes: bytes.byteLength } satisfies GeneratedQuotePdf
}

export async function removeGeneratedQuotePdf(admin: SupabaseClient, document: GeneratedQuotePdf) {
  await admin.from("DOC_StoredObjects").delete().eq("DOCStoredObject_ID", document.documentId)
  await admin.storage.from(document.bucket).remove([document.path])
}
