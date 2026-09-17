import { confirmProviderXmlCurrencies } from "./customs-provider-xml-currency.ts";
import { extractProviderTaxEvidence } from "./customs-provider-tax-evidence.mts";

const xml = '<Response><FunctionCode>13</FunctionCode><Status><NameCode>67</NameCode></Status><Declaration><GoodsShipment><GovernmentAgencyGoodsItem><SequenceNumeric>1</SequenceNumeric><Commodity><DutyTaxFee><TypeCode>A00</TypeCode><AdValoremTaxBaseAmount currencyID="GBP">100</AdValoremTaxBaseAmount><Payment><TaxAssessedAmount currencyID="GBP">12</TaxAssessedAmount><PaymentAmount currencyID="GBP">0</PaymentAmount></Payment></DutyTaxFee></Commodity></GovernmentAgencyGoodsItem></GoodsShipment></Declaration></Response>';
function read(source: string, identity: Record<string, string> = {}, snapshot: unknown = { schemaVersion: 1, items: [{ itemNumber: 1, payload: { id: "item-one" } }] }) {
  const payload = { notification: [{ notification_id: "fixture", status_name_code: "Indicative Customs Debt", hmrc_xml_response: source, hmrc_response: { Response: { FunctionCode: "13", Status: { NameCode: "67" }, Declaration: { GoodsShipment: { GovernmentAgencyGoodsItem: { SequenceNumeric: "1", Commodity: { DutyTaxFee: { TypeCode: "A00", AdValoremTaxBaseAmount: "100", Payment: { TaxAssessedAmount: "12", PaymentAmount: "0" } } } } } } } } }] };
  Object.assign(payload.notification[0].hmrc_response.Response.Declaration, identity);
  return confirmProviderXmlCurrencies(payload, extractProviderTaxEvidence(payload, snapshot));
}
const assert = (condition: unknown) => { if (!condition) throw new Error("Assertion failed"); };
Deno.test("XML attributes confirm matched currencies, never payment as liability or finality", () => {
  const result = read(xml);
  assert(result.notices[0].facts[0].currency === "GBP");
  assert(result.notices[0].facts[0].assessedAmount === "12");
  assert(result.notices[0].facts[0].paymentAmount === "0");
  assert(result.notices[0].classification === "indicative");
  assert(result.reconciliationReady === false);
  assert(read('<MetaData xmlns="urn:wco:datamodel:WCO:DocumentMetaData-DMS:2">' + xml + '</MetaData>').notices[0].facts[0].currency === "GBP");
});
Deno.test("conflicting, malformed, oversized and entity XML never confirms currency", () => {
  for (const source of [xml.replace('currencyID="GBP"', 'currencyID="USD"'), xml.replace('>12<', '>13<'), xml.replace('<FunctionCode>13', '<FunctionCode>9'), xml.replace('</Response>', ''), '<!DOCTYPE Response>' + xml, xml.replace('>12<', '>&entity;<'), ' '.repeat(1_000_001), '<a>'.repeat(41) + xml + '</a>'.repeat(41)]) {
    assert(read(source).notices[0].facts[0].currency === null);
  }
});

Deno.test("ambiguous XML tax rows cannot confirm a currency by position", () => {
  const tax = xml.match(/<DutyTaxFee>[\s\S]*?<\/DutyTaxFee>/)![0];
  assert(read(xml.replace(tax, tax + tax)).notices[0].facts[0].currency === null);
});

Deno.test("matching amounts cannot confirm currencies across declaration identities or revisions", () => {
  const identified = xml.replace("<Declaration>", "<Declaration><ID>MRN-EXAMPLE</ID><FunctionalReferenceID>LRN-EXAMPLE</FunctionalReferenceID><VersionID>2</VersionID>");
  const identity = { ID: "MRN-EXAMPLE", FunctionalReferenceID: "LRN-EXAMPLE", VersionID: "2" };
  assert(read(identified, identity).notices[0].facts[0].currency === "GBP");
  for (const altered of [{ ...identity, ID: "ANOTHER-MRN" }, { ...identity, FunctionalReferenceID: "ANOTHER-LRN" }, { ...identity, VersionID: "1" }, {}]) {
    assert(read(identified, altered).notices[0].facts[0].currency === null);
  }
  assert(read(xml, identity).notices[0].facts[0].currency === null);
  assert(read(identified.replace("<VersionID>2</VersionID>", "<VersionID>2</VersionID><VersionID>2</VersionID>"), identity).notices[0].facts[0].currency === null);
});

Deno.test("different regimes and rates identify distinct tax rows without relying on order", () => {
  const taxes = [
    { TypeCode: "A00", DutyRegimeCode: "320", TaxRateNumeric: "5.80", AdValoremTaxBaseAmount: "280.00", Payment: { TaxAssessedAmount: "16.24", PaymentAmount: "16.24" } },
    { TypeCode: "A00", DutyRegimeCode: "100", TaxRateNumeric: "14.00", AdValoremTaxBaseAmount: "1120.00", Payment: { TaxAssessedAmount: "156.80", PaymentAmount: "156.80" } },
  ];
  // A multi-measure identity test, not permission to map CDS-derived quota items
  // back to an original item. These rows already have the same confirmed item.
  const taxXml = (tax: typeof taxes[number]) => `<DutyTaxFee><TypeCode>${tax.TypeCode}</TypeCode><DutyRegimeCode>${tax.DutyRegimeCode}</DutyRegimeCode><TaxRateNumeric>${tax.TaxRateNumeric}</TaxRateNumeric><AdValoremTaxBaseAmount currencyID="GBP">${tax.AdValoremTaxBaseAmount}</AdValoremTaxBaseAmount><Payment><TaxAssessedAmount currencyID="GBP">${tax.Payment.TaxAssessedAmount}</TaxAssessedAmount><PaymentAmount currencyID="GBP">${tax.Payment.PaymentAmount}</PaymentAmount></Payment></DutyTaxFee>`;
  const source = xml.replace(/<DutyTaxFee>[\s\S]*?<\/DutyTaxFee>/, [...taxes].reverse().map(taxXml).join(""));
  const payload = { notification: [{ notification_id: "multi", hmrc_xml_response: source, hmrc_response: { Response: { FunctionCode: "13", Status: { NameCode: "67" }, Declaration: { GoodsShipment: { GovernmentAgencyGoodsItem: { SequenceNumeric: "1", Commodity: { DutyTaxFee: taxes } } } } } } }] };
  const inspect = () => confirmProviderXmlCurrencies(payload, extractProviderTaxEvidence(payload, { schemaVersion: 1, items: [{ itemNumber: 1, payload: { id: "item-one" } }] }));
  assert(inspect().notices[0].facts.every(fact => fact.currency === "GBP"));
  payload.notification[0].hmrc_xml_response = source.replace("<TaxRateNumeric>5.80", "<TaxRateNumeric>6.00");
  const changed = inspect().notices[0].facts;
  assert(changed[0].currency === null);
  assert(changed[1].currency === "GBP");
  payload.notification[0].hmrc_xml_response = source.replace("<DutyRegimeCode>320", "<DutyRegimeCode>100");
  assert(inspect().notices[0].facts[0].currency === null);
});

Deno.test("an XML-only rate cannot be ignored while confirming an amount", () => {
  assert(read(xml.replace("<TypeCode>A00</TypeCode>", "<TypeCode>A00</TypeCode><TaxRateNumeric>99</TaxRateNumeric>")).notices[0].facts[0].currency === null);
});

Deno.test("source currency remains readable when the response item has no submission link", () => {
  const result = read(xml, {}, { schemaVersion: 1, items: [{ itemNumber: 2, payload: { id: "different-submitted-item" } }] });
  assert(result.notices[0].facts[0].currency === "GBP");
  assert(result.notices[0].facts[0].itemId === null);
  assert(result.reconciliationReady === false);
  assert(result.notices[0].issues.some(issue => issue.includes("cannot be linked")));
});
