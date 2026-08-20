export type CustomerTariffDocumentCharge = {
  description: string
  basis: string
  amount: number
}

export type CustomerTariffDocumentItem = {
  name: string
  mode: string
  carrier: string
  origin: string
  destination: string
  service: string
  cargo: string
  currency: string
  sellTotal: number
  charges: CustomerTariffDocumentCharge[]
}

export type CustomerTariffDocumentRow = {
  mode: string
  name: string
  service: string
  lane: string
  carrier: string
  charge: string
  basis: string
  amount: string
}

export type CustomerTariffDocumentDataset = {
  title: string
  customer: string
  packCode: string
  versionNo: number
  validFrom: string
  validTo: string
  cycle: string
  issuedOn: string
  currency: string
  sellTotal: string
  rows: CustomerTariffDocumentRow[]
}

export function customerTariffDocumentTemplate() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
@page { size: A4 portrait; margin: 16mm 14mm 18mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; color: #12202b; background: #fff; font-family: "SF Pro Text", "Segoe UI", sans-serif; }
body { font-size: 10.5pt; line-height: 1.45; }
h1 { font-size: 22pt; font-weight: 500; letter-spacing: -0.03em; margin: 0; }
h2 { font-size: 12pt; font-weight: 500; margin: 18pt 0 8pt; }
p, td, th { font-size: 10.5pt; }
.meta { color: #5b6b75; margin-top: 6pt; }
.banner { display: flex; justify-content: space-between; gap: 16pt; padding-bottom: 12pt; border-bottom: 2pt solid #0f766e; }
.mark { font-size: 11pt; font-weight: 500; color: #0f766e; }
table { width: 100%; border-collapse: collapse; }
th { text-align: start; font-weight: 500; color: #5b6b75; padding: 6pt 8pt; border-bottom: 0.75pt solid #d7dee3; }
td { padding: 7pt 8pt; border-bottom: 0.5pt solid #e8eef1; vertical-align: top; }
.num { text-align: end; white-space: nowrap; }
.lane { color: #5b6b75; }
.footer { margin-top: 22pt; color: #5b6b75; font-size: 9pt; }
</style></head><body>
<carbone-pdf-options paper-size="A4" margin-top="0" margin-bottom="0" margin-left="0" margin-right="0" print-background="true" prefer-css-page-size="true" />
<header class="banner">
  <div>
    <p class="mark">Multideck</p>
    <h1>{d.title}</h1>
    <p class="meta">{d.customer} · {d.packCode} · v{d.versionNo}</p>
  </div>
  <div>
    <p class="meta">Valid {d.validFrom} to {d.validTo}</p>
    <p class="meta">{d.cycle} · Issued {d.issuedOn}</p>
  </div>
</header>
<table>
  <thead><tr><th>Mode</th><th>Service</th><th>Lane</th><th>Carrier</th><th>Charge</th><th class="num">Sell</th></tr></thead>
  <tbody>
    {d.rows[i].name:before(<tr>)}
      <td>{d.rows[i].mode}</td>
      <td>{d.rows[i].name}<div class="lane">{d.rows[i].service}</div></td>
      <td dir="auto">{d.rows[i].lane}</td>
      <td>{d.rows[i].carrier}</td>
      <td>{d.rows[i].charge}<div class="lane">{d.rows[i].basis}</div></td>
      <td class="num">{d.rows[i].amount}</td>
    {d.rows[i].name:after(</tr>)}
  </tbody>
</table>
<p class="footer">This document shows customer sell rates only. It does not include supplier cost. Total {d.sellTotal} {d.currency}.</p>
</body></html>`
}

export function buildCustomerTariffDocumentDataset(input: {
  title: string
  customer: string
  packCode: string
  versionNo: number
  validFrom: string
  validTo: string
  cycle: string
  issuedOn: string
  currency: string
  items: CustomerTariffDocumentItem[]
}): CustomerTariffDocumentDataset {
  const rows: CustomerTariffDocumentRow[] = []
  let sellTotal = 0
  for (const item of input.items) {
    sellTotal += item.sellTotal
    const charges = item.charges.length
      ? item.charges
      : [{ description: "Sell total", basis: "Pack item", amount: item.sellTotal }]
    for (const charge of charges) {
      rows.push({
        mode: item.mode.toUpperCase(),
        name: item.name,
        service: [item.service, item.cargo].filter(Boolean).join(" · "),
        lane: `${item.origin} → ${item.destination}`,
        carrier: item.carrier,
        charge: charge.description,
        basis: charge.basis,
        amount: `${charge.amount.toFixed(2)} ${item.currency}`,
      })
    }
  }
  return {
    title: input.title || "Customer tariff",
    customer: input.customer,
    packCode: input.packCode,
    versionNo: input.versionNo,
    validFrom: input.validFrom,
    validTo: input.validTo,
    cycle: input.cycle,
    issuedOn: input.issuedOn,
    currency: input.currency,
    sellTotal: sellTotal.toFixed(2),
    rows,
  }
}
