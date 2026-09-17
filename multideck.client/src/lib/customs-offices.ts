// Named office choices from iCustoms, 14 September 2026. Retired entries
// without a name are omitted; saved codes remain visible in the combobox.
export const customsOffices = `GBABD001|Aberdeen, Ruby House
GBAVO001|Avonmouth, Custom House
GBBEL002|Belfast, Carne House
GBBEL003|Belfast, Custom House
GBBEL004|Belfast, Erskine House (NIRU and BIRDS)
GBBHM001|Birmingham, 2 Broadway
GBBHM002|Birmingham, City Centre House
GBBLT001|Bolton, Stonecross House
GBBOE001|Bootle, Litherland House
GBBOE002|Bootle, St. John's House
GBBOE003|Bootle, St. John's House
GBBRD001|Bradford, Centenary Court
GBBRS001|Bristol, 101 Victoria Street
GBBRS002|Bristol, Temple Quay House
GBBRS003|Bristol, The Crescent centre
GBBTH001|Bathgate, Pyramids Business Centre
GBCDF001|Cardiff, Brunel House
GBCDF002|Cardiff, Ty Glas
GBCLD001|Cumbernauld, Accounts Office
GBCNB001|Canterbury, Charter House
GBCRG001|Craigavon, Marlborough House
GBCRO001|Croydon, 1 Ruskin Square
GBCVT001|Coventry, Sherbourne House
GBDUN002|Dundee, Sidlaw House
GBDVR001|Dover, Priory Court
GBEDI001|Edinburgh, Elgin House
GBEDI002|Edinburgh, Grayfield House
GBEDI003|Edinburgh, Meldrum House
GBEKB001|East Kilbride, Plaza Tower
GBEKB002|East Kilbride, Queensway House
GBERI001|Erith, Chaucer House
GBEXE001|Exeter, Longbrook House
GBGLW001|Glasgow, Cotton House
GBGLW002|Glasgow, Portcullis House
GBGSY001|Grimsby, Imperial House
GBGTC001|Gartcosh, Scottish Crime Campus
GBHUL001|Hull, Cherry Court
GBHUL002|Hull, Custom House
GBIPS001|Ipswich, Haven House
GBIPS002|Ipswich, St Clare House
GBLBA001|Leeds, Peter Bennett House
GBLBA002|Leeds, 1 Munroe Court
GBLBA003|Leeds, Castle House
GBLBA004|Leeds, Windsor House
GBLCN001|Lincoln, Lawress Hall
GBLCS001|Leicester, Saxon House
GBLDY001|Londonderry, Foyle House
GBLIV001|Liverpool, Graeme House (Inward and Outward Processing)
GBLIV002|Liverpool, India Buildings (Freeport Authorisations)
GBLON001|London, 10 South Colonnade
GBLON002|London, 100 Parliament Street
GBLON003|London, Bush House
GBLON004|London, Custom House
GBLON005|London, Custom House Annexe
GBLON007|London, Euston Tower
GBLUT001|Luton, King House
GBMDT001|Maidstone, Medvale House
GBMNC001|Manchester, Albert Bridge House
GBMNC002|Manchester, Manchester Airport
GBNCL001|Newcastle, Benton Park View
GBNHP001|Northampton, Princess House
GBNTG001|Nottingham, Barkley House
GBNTG002|Nottingham, Castle Meadow Campus
GBNTG003|Nottingham, Ferrers House
GBNTG004|Nottingham, FitzRoy House (AEO Central Site)
GBNTG005|Nottingham, Howard House
GBNTG006|Nottingham, Yorke House
GBPET001|Peterborough, Churchgate
GBPME001|Portsmouth, Lynx House
GBPRE003|Preston, St Mark's House
GBPRE004|Preston, St Mary's House
GBPRE005|Preston, The Guild Centre
GBPRE006|Preston, Unicentre
GBPTE001|Peterlee, Emerald Court
GBRDN001|Reading, Sapphire Plaza
GBREH001|Redhill, Warwick House
GBRIH001|Brierley Hill, Merry Hill Contact Centre
GBSAA001|Southend on Sea, Alexander House
GBSFY001|Salford, Ralli Quays (NTAS)
GBSFY002|Salford, Trinity Bridge House (Warehousing, End Use and Temporary Admission)
GBSHE001|Sheffield, Concept House
GBSHI001|Shipley, Accounts Office
GBSOL003|Solihull, Sapphire East
GBSTT001|Stockton-on-Tees, George Stephenson House
GBSWA001|Swansea, Ty Nant
GBTEF001|Telford, Abbey House
GBTEF003|Telford, Plaza 2 - Floor 2
GBTON001|Livingston, Barbara Ritchie House
GBWAF001|Watford, Cambridge House
GBWNN001|Washington, Waterview Park
GBWOT001|Worthing, Durrington Bridge House
GBWOT002|Worthing, HMRC Barrington Road
GBWOV001|Wolverhampton, Crown House
GBWRN001|Warrington, Mersey Bank House
GBWXH001|Wrexham, Plas Gororau
IMDGS001|Douglas, Custom House, Isle of Man`.split("\n").map((line) => {
  const [value, description] = line.split("|")
  return { value, label: `${value} - ${description}`, keywords: description }
})
