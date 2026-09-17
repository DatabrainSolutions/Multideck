# French-origin tariff evidence for preferential-origin group support

Retrieved 15 September 2026 from the official UK Online Trade Tariff public API:

https://www.trade-tariff.service.gov.uk/uk/api/commodities/7323930010?as_of=2026-09-15&filter%5Bgeographical_area_id%5D=FR

The adjacent JSON retains the complete response. For a request filtered to FR, measure 20283341 is type 142, preference 300, geographical area 1013 (European Union). Standard duty 20009662 remains present, alongside other measures. This demonstrates that the API returns group preference measures when querying an individual member origin; it does not establish proof of origin, eligibility, or group membership for arbitrary countries.

HMRC Group 5 requires DE 5/16 to use EU where the relevant proof names the Union, while DE 5/15 identifies an individual origin country:

https://www.gov.uk/government/publications/cds-uk-trade-tariff-volume-3-import-declaration-completion-guide/group-5-dates-times-periods-places-countries-and-regions

The 2026-09-15.51 implementation resolves the declared EU group against retained official geographical evidence for the GB preference-300 path, preserves the individual-origin fiscal measures, and retains proof, conditions and date validation. Other differing origins remain gated. This fixture does not establish eligibility by itself and does not certify automatic declared-tax population.
