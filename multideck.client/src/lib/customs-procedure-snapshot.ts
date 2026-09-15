import type { CustomsReferenceOption } from "./customs-reference-data"

// iCustoms UK CDS import dropdown snapshot, captured 2026-09-14.
// Not a live API or a declaration-category/combination eligibility validator.
// Duplicate codes are collapsed. Missing descriptions are explicit; abbreviated
// descriptions below are display labels, not a replacement for tariff guidance.
export const customsProcedureSnapshotDate = "2026-09-14"

function options(lines: string): CustomsReferenceOption[] {
  return lines.trim().split("\n").map(line => {
    const [code, name] = line.split("|")
    return { code, name: name || "Description not supplied by iCustoms", description: null }
  }).sort((a, b) => a.code.localeCompare(b.code))
}

export const importProcedureSnapshot = options(`
0100|Free circulation with onward dispatch
0121|Re-import after outward processing (OP) with onward dispatch
0151|Release to free circulation after inward processing (IP) with onward dispatch
0153|Release to free circulation after temporary admission (TA) with onward dispatch
0154|Release to free circulation after IP in another Member State with onward dispatch
0171|Release to free circulation from a customs warehouse (CW) with onward dispatch
0178|Release to free circulation from a free zone (FZ) with onward dispatch
0700|Release for free circulation with simultaneous entry to an excise warehouse
0721|Release for free circulation with simultaneous entry to an excise warehouse for goods re-imported after OP
0751|Release for free circulation with simultaneous entry to an excise warehouse after IP
0753|Release for free circulation with simultaneous entry to an excise warehouse after TA
0754|Release for free circulation with simultaneous entry to an excise warehouse after IP in another Member State
0771|Release for free circulation from a CW with simultaneous entry to an excise warehouse
0778|Release for free circulation from a FZ with simultaneous entry to an excise warehouse
4000|Release to free circulation
4051|Release to free circulation after IP
4053|Release to free circulation after TA
4054|Release to free circulation after IP in another Member State
4071|Release to free circulation from a CW
4078|Release to free circulation from a FZ
4200|Free circulation with onward supply
4221|Re-import after OP with onward supply
4251|Release to free circulation after IP with onward supply
4253|Release to free circulation after TA with onward supply
4254|Release to free circulation after IP in another Member State with onward supply
4271|Release to free circulation from a CW with onward supply
4278|Release to free circulation from a FZ with onward supply
4400|End-use relief
4421|End-use relief after OP
4422|End-use relief after OP, not covered under 4421
4451|End-use relief after IP
4453|End-use relief after TA
4454|End-use relief after IP in another Member State
4471|End-use relief on goods released from a CW
4478|End-use relief on goods released from a FZ
5100|Entry to IP
5111|Import of replacement goods to IP following the prior export of equivalent goods
5121|Entry to IP after OP
5151|Transfer of goods between IP authorisation holders
5153|Entry to IP after TA
5154|Transfer of goods between IP authorisation holders in different Member States
5171|Entry to IP on release from a CW
5178|Entry to IP on release from a FZ
5300|Entry to TA
5351|Entry to TA after IP
5353|Transfer of goods between TA authorisation holders
5354|Entry to TA after IP in another Member State
5371|Entry to TA on release from a CW
5378|Entry to TA on release from a FZ
6110|Release to returned goods relief (RGR) for goods previously permanently exported
6111|Release to RGR for IP equivalent goods previously permanently exported
6121|Re-import after OP
6122|Re-import after OP for goods not covered by 6121 (for example, OP textiles)
6123|Release to RGR
6131|Re-import of previously exported IP goods
7100|Entry to a CW
7110|Entry to a CW for goods previously permanently exported
7121|Entry to CW after OP
7122|Entry to CW after OP, for goods not covered by 7121 (for example OP textiles)
7123|Entry to CW after RGR
7151|Entry to CW after IP
7153|Entry to CW after TA
7154|Entry to CW after IP in another Member State
7171|Transfer between different customs warehouses
7178|Entry to CW on release from a FZ
0090|Final Supplementary Declaration
0009|CCR for goods arriving in the UK for onward transhipment within the EU where no customs duty or other charges are due
0003|Release to Free Circulation and/or Home Use with claims to duty reliefs
0006|N/A
0004|C21
0002|C21i
0005|
0007|
0008|
0020|
0024|
7800|
7851|
7853|
7871|
7878|
`)

// The provider's lower-case 'aaa' test entry is excluded: it is not a valid
// uppercase CDS code. All other observed additional-procedure codes are retained.
export const importAdditionalProcedureSnapshot = options(`
A04|Re-export or dispatch to discharge inward processing (VAT only)
B02|Processed products returning after repair under guarantee, free of charge (Article 260)
B03|Processed products returning after replacement under guarantee — Standard Exchange System (Article 261)
B06|Processed products returning — VAT only
C01|Personal property when transferring normal residence to the Union
C02|Trousseaux and household effects imported on marriage
C03|Presents customarily given on marriage
C04|Inherited personal property — individuals normally resident in the Union
C06|School outfits, educational materials and related household effects
C07|Consignments of negligible value
C08|Consignments sent from one private individual to another
C09|Capital goods and equipment on transfer of activities from a third country into the Union
C10|Capital goods and equipment — liberal professions and non-profit organisations
C11|Educational, scientific and cultural materials listed in Annex I to Regulation (EC) 1186/2009
C13|Educational, scientific and cultural materials and apparatus for non-commercial purposes
C14|Non-commercial equipment for scientific research organisations based outside the Union
C15|Laboratory animals and biological or chemical substances for research
C16|Human therapeutic substances and blood-grouping or tissue-typing reagents
C17|Instruments and apparatus for medical research, diagnosis or treatment
C18|Reference substances for quality control of medicinal products
C19|Pharmaceutical products used at international sports events
C20|Basic necessities for State or approved charitable/philanthropic organisations
C21|Articles for blind people listed in Annex III to Regulation (EC) 1186/2009
C22|Annex IV articles imported by blind people for their own use
C23|Annex IV articles for blind people imported by institutions or organisations
C24|Articles imported by other disabled people for their own use
C25|Articles for other disabled people imported by institutions or organisations
C26|Goods imported for disaster victims
C27|Decorations awarded by third-country governments to Union residents
C28|Gifts received by visitors to a third country on an official visit
C29|Goods to be used by monarchs or heads of state
C30|Negligible-value samples for trade promotion
C31|Printed advertising matter
C32|Small representative samples of non-Union goods for a trade fair or similar event
C33|Goods for examination, analysis or testing
C34|Consignments to copyright or industrial/commercial patent protection organisations
C35|Tourist information literature
C36|Miscellaneous documents and articles
C37|Materials for stowage and protection of goods during transport
C38|Litter, fodder and feeding stuffs for animals during transport
C39|Fuel and lubricants in land motor vehicles and special containers
C40|Materials for war cemeteries and memorials
C41|Coffins, funerary urns and ornamental funerary articles
C42|Personal property entered before establishing normal residence in the Union — subject to undertaking
C43|Personal property of a person intending to transfer residence to the Union — subject to undertaking
C44|Inherited personal property — Union-based non-profit legal persons
C45|Agricultural and forestry products from adjoining third-country properties
C46|Fishing, fish-farming and hunting products from adjoining third-country areas
C47|Seeds, fertilisers and treatments for Union property adjoining a third country
C48|Goods in personal luggage exempted from VAT
C49|Goods donated to charitable/philanthropic organisations for occasional fund-raising events
C50|Equipment and office materials donated to charitable/philanthropic organisations
C51|Symbolic cups, medals and similar awards received in a third country by Union residents
C52|Symbolic cups, medals and similar articles donated from a third country for presentation in the Union
C53|Symbolic awards, trophies and souvenirs for free distribution to third-country residents
C54|Gifts brought by persons paying an official visit to the Union
C55|Goodwill gifts sent by third-country official/public-interest bodies
C56|Free advertising articles with no intrinsic commercial value
C57|Goods for demonstrating non-Union machines and apparatus at trade fairs
C58|Low-value materials for temporary third-country exhibition stands
C59|Free printed matter and advertising articles for exhibitions
C60|Marriage trousseaux and household effects entered in the two months before the wedding — subject to security
C61|Marriage presents entered in the two months before the wedding — subject to security
D01|Pallets, including accessories and equipment
D02|Containers, including accessories and equipment
D13|Pedagogic material and scientific equipment
D15|Empty packings
D25|Works of art, collectors’ items and antiques
D30|Means of transport for persons established outside, or transferring residence outside, the Union
D51|Temporary admission with partial duty relief
000|No other Additional Procedure Code applies
002|
1VW|VAT-only goods exported or dispatched from customs warehousing
1RV|
E01|
1RL|
F15|
97F|Final Supplementary Declaration
1PP|
1H7|
1NN|
21V|
15F|Trade with Special Fiscal Territories and territories in a Customs Union with the EU
F47|
51P|
F45|VAT exemption on final importation of certain goods (Directive 2009/132/EC)
1RE|Relief from Excise Duty
96M|
91U|Under-shipments — inventory record cleansing
36C|Coffins, human remains, funerary urns and ornamental funerary articles
F05|Returned goods relief from import duties and VAT (Article 203 and Directive 2006/112/EC)
62T|N/A
11A|ATA Carnets — non-licensable goods
F06|Excise goods moving under duty suspension from the place of importation (Directive 2008/118/EC)
F44|Inward processing — customs debt under Article 86(3)
F01|Returned goods relief from import duties (Article 203)
D19|Temporary admission — goods subject to acceptance tests under a sales contract
D23|Temporary admission — goods for events or sale
D18|Temporary admission — goods for tests, experiments or demonstrations
1CL|Climate Change Levy — full relief or 14-day election procedure
F07|Processed products returning after re-export following inward processing
F21|Sea-fishing and other products taken from third-country territorial seas
F22|Products obtained from sea-fishing and other products taken from third-country territorial seas
19Z|
XXX|
`)

export function withImportProcedureSnapshot(existing: CustomsReferenceOption[], snapshot: CustomsReferenceOption[]) {
  // Retain additional database codes, while using the captured provider wording
  // in preference to the small starter catalogue's descriptions.
  return [...new Map([...existing, ...snapshot].map(option => [option.code, option])).values()]
    .sort((a, b) => a.code.localeCompare(b.code))
}
