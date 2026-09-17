// Plain-English field-purpose summaries, not completion rules or eligibility advice.
// Reference requested by the user (2019 mirror):
// https://brexitlegalguide.co.uk/uk-import-declaration-completion-guide/
// Current HMRC source, checked 2026-09-14 (groups 1–8, Open Government Licence v3):
// https://www.gov.uk/government/publications/cds-uk-trade-tariff-volume-3-import-declaration-completion-guide
// Match the actual field as well as its DE: box numbers alone are not unique.

const fields: Record<string, string> = {
  "declaration category": "The declaration dataset, such as H1 for free circulation or H2 for customs warehousing.",
  "type of declaration": "Whether this is a standard, simplified or supplementary declaration, and whether the goods have arrived.",
  "procedure code": "The customs treatment requested and the procedure the goods were previously under.",
  "additional procedure code": "Extra conditions or reliefs that accompany the main procedure code.",
  "previous document category": "The class of earlier record: temporary storage, a simplified declaration or another previous document.",
  "previous document type": "The code identifying what kind of earlier document or declaration is referenced.",
  "previous document reference": "The number identifying the earlier document or declaration for these goods.",
  "document reference": "The reference number of the earlier document linked to these goods.",
  "additional information code": "A coded statement giving customs extra information about this declaration.",
  "statement code": "The code for the extra statement being made to customs.",
  "additional information description": "The supporting text or reference required by the selected statement code.",
  "gvms ai code": "The additional-information statement identifying a Goods Vehicle Movement Service movement.",
  "gvms ai code value (haulier eori or name)": "The haulier’s EORI or name accompanying the GVMS statement.",
  "additional document category": "The category prefix of the supporting document code.",
  "additional document type": "The code identifying the supporting document, certificate, licence or authorisation.",
  "additional document id": "The identifying number or reference on the supporting document.",
  "additional document name": "The name or description identifying the supporting document.",
  "lpco exemption code": "The applicable exemption or status for a licence, permit, certificate or other document.",
  "trader reference number": "Your consignment reference, linking this declaration to your commercial records.",
  "reference number or ucr": "The unique consignment reference linking the goods to the trader’s records.",
  "warehouse type": "The code identifying the kind of customs warehouse or storage facility.",
  "warehouse identifier": "The reference identifying the particular warehouse—not its type code.",
  "type of representation": "Whether the representative acts in the customer’s name or in their own name on the customer’s behalf.",
  "authorisation category": "The type of customs authorisation held by the party on this row.",
  "authorisation identifier": "The identification number of the party holding this authorisation.",
  "party id": "The VAT identification number of the domestic duty or tax party on this row.",
  "role code": "The tax role performed by the party on this row.",
  "trade terms": "The agreed Incoterm describing delivery responsibilities and costs between buyer and seller.",
  "incoterms additional": "The named delivery place accompanying the Incoterm, entered as a location code or text.",
  "tax type": "The duty or tax being declared, such as customs duty or import VAT.",
  "tax base quantity": "The quantity or value on which this tax is calculated.",
  "unit code": "The unit used for this tax base quantity.",
  "declared tax": "The payable amount for this tax line, where a manual amount is required.",
  "method of payment": "How the duty or tax on this line will be paid or accounted for.",
  "code identifying": "The kind of cost or adjustment being added to, or deducted from, the goods’ value.",
  "total amount": "The total invoiced value of the goods covered by the declaration.",
  "item price": "The invoiced amount for this goods line, in its stated currency.",
  "exchange rate": "The rate used to convert the invoiced currency when an exchange rate must be declared.",
  "customs valuation method": "The method used to establish the goods’ value for customs purposes.",
  "preference code": "The tariff treatment being claimed, including any preferential duty treatment.",
  "quota order number": "The tariff quota requested for this item. A number or available balance does not confirm allocation. Leave this field blank for GB-to-NI movements.",
  "country of destination": "The country where the goods are ultimately intended to go.",
  "destination country": "The country where these goods are ultimately intended to go.",
  "export country": "The country from which the goods were dispatched—not merely a country crossed in transit.",
  "non-preferential origin": "Where the goods originate under ordinary origin rules, which may differ from the dispatch country.",
  "preferential origin": "The country or country group shown on the proof of origin supporting your preference claim. This is separate from the dispatch country.",
  "type of location": "The category of place where customs can find or examine the goods.",
  "type of address": "How the goods’ location is identified, for example by a location code or address.",
  "goods location country": "The country containing the declared goods location.",
  "goods location identifier": "The code identifying where the goods are available to customs.",
  "goods location additional identifier": "An extra reference distinguishing a specific place within the goods location.",
  "name of place": "The named place where customs can locate the goods.",
  "customs office of presentation": "The customs office where the goods are presented.",
  "customs office of exit": "The customs office responsible for the goods leaving the customs territory.",
  "supervising office": "The customs office supervising the relevant special procedure or authorisation.",
  "description of goods": "A clear commercial description that lets customs identify and classify the goods.",
  "package kind": "The type of packaging used, such as cartons, pallets or drums.",
  "package marks": "The marks or numbers printed on the packages to identify them.",
  "package count": "The number of packages associated with this goods line.",
  "total packages": "The total number of packages in the consignment.",
  "gross mass": "The goods’ weight including packaging, but excluding transport equipment, in kilograms.",
  "total gross mass": "The consignment’s weight including packaging, but excluding transport equipment, in kilograms.",
  "net mass": "The goods’ weight without packaging, in kilograms.",
  "total net mass": "The combined weight of the goods without packaging, in kilograms.",
  "tariff quantity": "The supplementary quantity required by the commodity code, such as litres or number of items.",
  "un dangerous goods code": "The UN number identifying dangerous goods for transport.",
  "cus code": "The customs chemical identifier for a substance or preparation, where applicable.",
  "commodity code": "The tariff classification identifying the goods and their applicable measures.",
  "taric additional code": "An extra tariff code identifying a specific measure or treatment for the goods.",
  "national additional code": "An extra national code identifying applicable UK measures or tax treatment.",
  "transported in container": "Whether the goods are carried in a freight container.",
  "container id": "The identification number marked on the freight container.",
  "container identification number": "The identification number marked on the freight container.",
  "inland transport mode": "How the goods travel on the inland part of the journey.",
  "mode at border": "The means of transport crossing the border, such as road, sea or air.",
  "arrival transport type": "The kind of identifier used for the arriving transport, such as a vehicle registration.",
  "transport id": "The identifier of the transport carrying the goods on arrival.",
  "departure identification number": "The identifier of the means of transport at departure.",
  "border identification number": "The identifier of the active means of transport crossing the border.",
  "border transport nationality": "The country of registration of the active means of transport crossing the border.",
  "seal identifier": "The identification number of the seal securing the goods or transport unit.",
  "nature of transaction": "The commercial reason for the movement, such as a sale, return or transfer.",
  "statistical value": "The value used for trade statistics, including the relevant costs to the border, in pounds sterling.",
  "guarantee type": "The kind of guarantee or guarantee waiver covering the customs debt.",
  "grn or guarantee id": "The reference identifying the guarantee covering this movement.",
  "writing-off date of validity": "The validity date associated with the licence or document being used.",
  "writing-off issuing authority": "The authority that issued the licence or document.",
}

const parties: Record<string, string> = {
  importer: "The person or organisation importing the goods.",
  exporter: "The person or organisation exporting the goods.",
  declarant: "The person or organisation in whose name the declaration is made.",
  representative: "The person or organisation appointed to act for the declarant.",
  consignee: "The person or organisation receiving the goods.",
  consignor: "The person or organisation sending the goods.",
  seller: "The party selling the goods under the commercial contract.",
  buyer: "The party buying the goods under the commercial contract.",
  carrier: "The transport operator carrying the goods.",
}

export function customsFieldHelp(label: string, dataElement?: string): string | undefined {
  const name = label.toLowerCase().replace(/’/g, "'").replace(/\s+/g, " ").trim()
  // These identical labels mean different things in different data elements.
  if (name === "currency code") return dataElement === "4/9"
    ? "The currency in which this particular adjustment was invoiced."
    : dataElement === "8/3" ? "The currency of the amount covered by this guarantee."
      : "The currency used for the invoiced goods value."
  if (name === "amount") return dataElement === "8/3"
    ? "The amount of duty and other charges covered by this guarantee."
    : "The value of this addition or deduction; use a percentage only for a percentage-based code."
  if (name === "company" || name === "eori number") {
    const party = Object.entries({ exporter: ["3/1", "3/2"], importer: ["3/15", "3/16"], declarant: ["3/17", "3/18"], representative: ["3/19", "3/20"], consignee: ["3/9", "3/10"], seller: ["3/24", "3/25"], buyer: ["3/26", "3/27"] }).find(([, elements]) => elements.includes(dataElement ?? ""))?.[0]
    if (!party) return undefined
    return name === "company" ? `The organisation used as the ${party} on this declaration.` : `The ${party}’s customs registration (EORI) number.`
  }
  if (fields[name]) return fields[name]
  for (const [party, description] of Object.entries(parties)) {
    if (name === party) return description
    if (!name.startsWith(`${party} `)) continue
    const suffix = name.slice(party.length + 1)
    if (suffix.includes("eori")) return `The ${party}’s customs registration (EORI) number.`
    if (suffix.includes("name")) return `The ${party}’s full legal name.`
    if (suffix.includes("country")) return `The country in the ${party}’s address.`
    if (suffix.includes("postcode")) return `The postal or ZIP code in the ${party}’s address.`
    if (suffix.includes("town") || suffix.includes("city")) return `The town or city in the ${party}’s address.`
    if (suffix.includes("address")) return `The street and building details in the ${party}’s address.`
  }
  return undefined
}
