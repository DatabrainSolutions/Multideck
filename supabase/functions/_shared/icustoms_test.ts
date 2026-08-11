import {
  buildICustomsB1ExportXml,
  buildICustomsH1ImportXml,
  type ExportDeclarationInput,
  ICustomsClient,
  providerIssues,
  validateICustomsB1Export,
  validateICustomsH1Import,
} from "./icustoms.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validDeclaration(): ExportDeclarationInput {
  return {
    declarationCategory: "B1",
    declarationType: "A",
    traderReference: "MDTEST001",
    totalAmount: "1000",
    currency: "GBP",
    totalPackages: "10",
    totalGrossMass: "100",
    totalNetMass: "90",
    exporter: "GB123456789000",
    exporterName: "Sandbox Exporter Ltd",
    exporterAddressLine: "1 Export Street",
    exporterCity: "London",
    exporterPostcode: "E17DB",
    exporterCountry: "GB",
    consignee: "FR123456789000",
    consigneeName: "Sandbox Consignee SAS",
    consigneeAddressLine: "2 Import Rue",
    consigneeCity: "Paris",
    consigneePostcode: "75001",
    consigneeCountry: "FR",
    declarant: "GB123456789000",
    declarantName: "Sandbox Declarant Ltd",
    declarantAddressLine: "3 Customs Street",
    declarantCity: "London",
    declarantPostcode: "E17DB",
    declarantCountry: "GB",
    exportCountry: "GB",
    destinationCountry: "FR",
    borderMode: "1",
    exitOffice: "GB000001",
    goodsLocationName: "Dover & District",
    goodsLocationType: "A",
    transactionNature: "1",
    previousDocumentCategory: "Z",
    previousDocumentType: "MRN",
    previousDocumentReference: "25GB00000000000001",
    isContainerised: "0",
    items: [{
      commodityCode: "0803101000",
      description: "Fresh plantain <bananas>",
      packageKind: "BX",
      packageMarks: "MD-TEST-001",
      packageCount: "10",
      nonPreferentialOrigin: "GB",
      procedureCode: "1000",
      additionalProcedureCode: "000",
      grossMass: "100",
      netMass: "90",
      itemPrice: "1000",
      currency: "GBP",
      statisticalValue: "1000",
      previousDocumentType: "MRN",
      previousDocumentReference: "25GB00000000000001",
    }],
  };
}

function validImportDeclaration(): ExportDeclarationInput {
  return {
    declarationCategory: "H1",
    declarationType: "A",
    traderReference: "MDIMPORT001",
    totalAmount: "1000",
    currency: "GBP",
    totalPackages: "10",
    totalGrossMass: "100",
    totalNetMass: "90",
    representationType: "2",
    authorisationIdentifier: "GB150454489082",
    authorisationCategory: "MOU",
    exporter: "IE4809539S",
    exporterName: "Sandbox Exporter Ltd",
    exporterAddressLine: "12 Main Street",
    exporterCity: "Dublin",
    exporterPostcode: "A65F4E2",
    exporterCountry: "IE",
    importer: "GB603202734852",
    importerName: "Sandbox Importer Ltd",
    importerAddressLine: "1 Import Street",
    importerCity: "London",
    importerPostcode: "E17DB",
    importerCountry: "GB",
    declarant: "GB603202734852",
    declarantName: "Sandbox Declarant Ltd",
    declarantAddressLine: "3 Customs Street",
    declarantCity: "London",
    declarantPostcode: "E17DB",
    declarantCountry: "GB",
    exportCountry: "CN",
    destinationCountry: "GB",
    borderNationality: "GB",
    borderMode: "1",
    arrivalIdentificationType: "10",
    arrivalIdentificationNumber: "12345",
    goodsLocationName: "WLALONBTW",
    goodsLocationIdentifier: "GBWLA",
    goodsLocationType: "A",
    transactionNature: "1",
    tradeTerms: "CIF",
    isContainerised: "0",
    items: [{
      commodityCode: "0803101000",
      description: "Fresh plantain bananas",
      nationalCode: "VATZ",
      packageKind: "BX",
      packageMarks: "MD-IMPORT-001",
      packageCount: "10",
      nonPreferentialOrigin: "CN",
      procedureCode: "4000",
      additionalProcedureCode: "C28",
      tariffQuantity: "1000",
      grossMass: "100",
      netMass: "90",
      itemPrice: "1000",
      currency: "GBP",
      statisticalValue: "1000",
      customsValuationMethod: "1",
      preferenceCode: "100",
      previousDocumentCategory: "Z",
      previousDocumentType: "355",
      previousDocumentReference: "20GB34F7Y1O2CX8PT2",
      additionalDocumentCategory: "N",
      additionalDocumentType: "935",
      additionalDocumentId: "00540370054047",
      lpcoExemptionCode: "AC",
    }],
  };
}

Deno.test("buildICustomsH1ImportXml follows the documented H1 contract", () => {
  const xml = buildICustomsH1ImportXml(validImportDeclaration());
  assert(
    xml.includes("<DeclarationCategory>H1</DeclarationCategory>"),
    "Expected the H1 declaration category.",
  );
  assert(xml.includes("<TypeCode>IMA</TypeCode>"), "Expected IMA.");
  assert(
    xml.includes("<AgentFunctionCode>2</AgentFunctionCode>") &&
      xml.includes("<AuthorisationHolder>"),
    "Expected representation and authorisation data.",
  );
  assert(
    xml.includes("<ArrivalTransportMeans>") &&
      xml.includes("<Importer>"),
    "Expected Import transport and party blocks.",
  );
  assert(
    xml.includes("<DutyRegimeCode>100</DutyRegimeCode>") &&
      xml.includes("<MethodCode>1</MethodCode>"),
    "Expected preference and valuation fields on the goods item.",
  );
  assert(
    xml.includes("<CategoryCode>Z</CategoryCode>") &&
      xml.includes("<LineNumeric>1</LineNumeric>"),
    "Expected the item-level previous document reference.",
  );
  assert(
    xml.includes("<ConditionCode>CIF</ConditionCode>") &&
      xml.includes("<LocationID>GBWLA</LocationID>"),
    "Expected the documented trade terms.",
  );
  assert(
    !xml.includes("<TotalNetMass"),
    "The documented H1 XML path carries net mass on each goods item, not as a header field.",
  );
  assert(
    xml.includes(
      "<GoodsLocation><Name>WLALONBTW</Name><TypeCode>A</TypeCode>",
    ) &&
      !xml.includes(
        "<GoodsLocation><Name>WLALONBTW</Name><ID>GBWLA</ID>",
      ),
    "The trade-terms UN/LOCODE must not be sent as the numeric goods-location additional identifier.",
  );
  assert(
    !xml.includes("<TotalGrossMass>"),
    "The H1 contract uses TotalGrossMassMeasure only.",
  );
});

Deno.test("H1 import uses item net masses without requiring a header net mass", () => {
  const declaration = validImportDeclaration();
  declaration.totalNetMass = "";

  const issues = validateICustomsH1Import(declaration);
  assert(
    !issues.some((issue) =>
      issue.toLowerCase().includes("declaration net mass")
    ),
    "H1 must not require the unsupported header net-mass field.",
  );
  assert(
    !buildICustomsH1ImportXml(declaration).includes("<TotalNetMass"),
    "H1 must continue to carry net mass on each goods item only.",
  );
});

Deno.test("providerIssues exposes actionable HMRC errors without raw provider metadata", () => {
  const issues = providerIssues({
    notification: [{
      conversation_id: "must-not-leave-the-server",
      hmrc_xml_response: "<private />",
      pointers: [{
        cds_error: "CDS12077",
        cds_error_description: "A related value is missing.",
        cds_error_description_explaination: "Review the paired data element.",
        data_element_no: "4/16",
        element_name: "MethodCode",
        sequence_numeric: "2",
        item_id: 12345,
      }],
    }],
  });

  assert(issues.length === 1, "Expected one normalised provider issue.");
  assert(issues[0].itemNumber === 2, "Expected the affected goods item.");
  assert(issues[0].dataElement === "4/16", "Expected the CDS data element.");
  assert(
    !("conversation_id" in issues[0]) && !("item_id" in issues[0]),
    "Raw provider metadata must not be returned to the browser.",
  );
});

Deno.test("validateICustomsH1Import requires structured parties and item document references", () => {
  const declaration = validImportDeclaration();
  declaration.importerName = "";
  declaration.declarantAddressLine = "";
  declaration.declarantCity = "";
  declaration.declarantPostcode = "";
  declaration.declarantCountry = "";
  (declaration.items as Array<Record<string, unknown>>)[0]
    .previousDocumentReference = "DOC-ITEM";
  const issues = validateICustomsH1Import(declaration);
  assert(
    issues.includes("This contact is missing: Name."),
    "Expected the structured importer error.",
  );
  assert(
    issues.includes(
      "This contact is missing: Street, City, Postcode, Country.",
    ),
    "Expected the structured address error shown by iCustoms.",
  );
  assert(
    issues.includes(
      "Item 1: use up to 35 letters and numbers for the previous document reference.",
    ),
    "Expected the 35-character alphanumeric item document rule.",
  );
});

Deno.test("buildICustomsB1ExportXml maps the existing B1 export flow without corrupting whole numbers", () => {
  const xml = buildICustomsB1ExportXml(validDeclaration());
  assert(
    xml.startsWith("<iCustoms><Declaration>"),
    "Expected the documented iCustoms XML root.",
  );
  assert(
    xml.includes("<DeclarationCategory>B1</DeclarationCategory>"),
    "Expected the B1 declaration category.",
  );
  assert(
    xml.includes("<TypeCode>EXA</TypeCode>"),
    "Expected the export and additional declaration types to be combined.",
  );
  assert(
    xml.includes('currencyID="GBP">1000</InvoiceAmount>'),
    "Expected 1000 to remain 1000.",
  );
  assert(
    xml.includes("<TotalPackageQuantity>10</TotalPackageQuantity>"),
    "Expected the whole package count to remain intact.",
  );
  assert(xml.includes("MDTEST001"), "Expected the trader reference.");
  assert(
    xml.includes("Fresh plantain &lt;bananas&gt;"),
    "Expected goods descriptions to be XML-safe.",
  );
  assert(
    xml.includes(
      "<GoodsLocation><Name>Dover &amp; District</Name><TypeCode>A</TypeCode><Address><TypeCode>U</TypeCode><CountryCode>GB</CountryCode></Address></GoodsLocation>",
    ),
    "Expected the required goods-location type and address wrapper.",
  );
  assert(
    xml.includes(
      "<Declarant><Name>Sandbox Declarant Ltd</Name><ID>GB123456789000</ID><Address><CityName>London</CityName><CountryCode>GB</CountryCode><Line>3 Customs Street</Line><PostcodeID>E17DB</PostcodeID></Address></Declarant>",
    ),
    "Expected the complete declarant contact block required by iCustoms.",
  );
});

Deno.test("validateICustomsB1Export reconciles declaration and goods-line totals", () => {
  const declaration = validDeclaration();
  declaration.totalAmount = "999";
  declaration.totalPackages = "9";
  const issues = validateICustomsB1Export(declaration);
  assert(
    issues.some((issue) => issue.includes("declaration amount")),
    "Expected an invoice total mismatch.",
  );
  assert(
    issues.some((issue) => issue.includes("package total")),
    "Expected a package total mismatch.",
  );
});

Deno.test("validateICustomsB1Export requires alphanumeric document references up to 35 characters", () => {
  const declaration = validDeclaration();
  declaration.previousDocumentReference = "DOC-HEADER";
  (declaration.items as Array<Record<string, unknown>>)[0]
    .previousDocumentReference = "DOC-ITEM";
  const issues = validateICustomsB1Export(declaration);
  assert(
    issues.some((issue) =>
      issue ===
        "Use up to 35 letters and numbers for the previous document reference."
    ),
    "Expected the header document reference to reject punctuation.",
  );
  assert(
    issues.some((issue) =>
      issue ===
        "Item 1: use up to 35 letters and numbers for the previous document reference."
    ),
    "Expected the item document reference to reject punctuation.",
  );
});

Deno.test("validateICustomsB1Export keeps the generated DUCR suffix within the iCustoms limit", () => {
  const declaration = validDeclaration();
  declaration.traderReference = "MD-TEST-TOO-LONG-001";
  const issues = validateICustomsB1Export(declaration);
  assert(
    issues.some((issue) => issue.includes("19 uppercase")),
    "Expected the iCustoms trader-reference suffix rule.",
  );
});

Deno.test("validateICustomsB1Export fails closed for optional documents the current flow cannot encode safely", () => {
  const declaration = validDeclaration();
  (declaration.items as Array<Record<string, unknown>>)[0]
    .additionalDocumentId = "DOC-1";
  const issues = validateICustomsB1Export(declaration);
  assert(
    issues.some((issue) => issue.includes("optional additional documents")),
    "Expected an explicit unsupported-field issue.",
  );
});

Deno.test("ICustomsClient authenticates once and sends the draft with a bearer token", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const transport = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) {
      return Promise.resolve(
        new Response(JSON.stringify({ token: "sandbox-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({
          status: "SUCCESS",
          co_relation_id: "sandbox-correlation",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
  }) as typeof fetch;
  const client = new ICustomsClient({
    baseUrl: "https://ihub-tdr.customscloud.co",
    environment: "sandbox",
    apiKey: "test-key",
    apiSecret: "test-secret",
  }, transport);

  const response = await client.createDraft("<iCustoms />");
  assert(response.status === 201, "Expected the provider response status.");
  assert(
    calls.length === 2,
    "Expected one authentication request and one draft request.",
  );
  assert(
    calls[0].url.endsWith("/api/auth/v1/access"),
    "Expected the documented authentication endpoint.",
  );
  assert(
    calls[1].url.endsWith("/api/cds/v1/draft"),
    "Expected the documented draft endpoint.",
  );
  assert(
    new Headers(calls[1].init?.headers).get("Authorization") ===
      "Bearer sandbox-token",
    "Expected the bearer token on the draft request.",
  );
});

Deno.test("ICustomsClient re-authenticates once after a 401", async () => {
  let call = 0;
  const transport = ((_url: string | URL | Request, _init?: RequestInit) => {
    call += 1;
    if (call === 1 || call === 3) {
      return Promise.resolve(
        new Response(JSON.stringify({ token: `token-${call}` }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    if (call === 2) {
      return Promise.resolve(
        new Response(JSON.stringify({ detail: "expired" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({
          status: "SUCCESS",
          co_relation_id: "sandbox-correlation",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  }) as typeof fetch;
  const client = new ICustomsClient({
    baseUrl: "https://ihub-tdr.customscloud.co",
    environment: "sandbox",
    apiKey: "test-key",
    apiSecret: "test-secret",
  }, transport);

  await client.createDraft("<iCustoms />");
  assert(
    call === 4,
    "Expected authentication, one 401, re-authentication, and one retry.",
  );
});

Deno.test("ICustomsClient updates the same provider draft with every edited goods item", async () => {
  const declaration = validDeclaration();
  declaration.traderReference = "MDEDITED002";
  declaration.totalAmount = "1250";
  declaration.totalPackages = "12";
  declaration.totalGrossMass = "120";
  declaration.totalNetMass = "105";
  declaration.items = [
    {
      ...(declaration.items as Array<Record<string, unknown>>)[0],
      description: "Edited first goods item",
      packageCount: "10",
      grossMass: "100",
      netMass: "90",
      itemPrice: "1000",
      statisticalValue: "1000",
    },
    {
      commodityCode: "0901110000",
      description: "New second goods item",
      packageKind: "BX",
      packageMarks: "MD-TEST-002",
      packageCount: "2",
      nonPreferentialOrigin: "GB",
      procedureCode: "1000",
      additionalProcedureCode: "000",
      grossMass: "20",
      netMass: "15",
      itemPrice: "250",
      currency: "GBP",
      statisticalValue: "250",
      previousDocumentType: "MRN",
      previousDocumentReference: "25GB00000000000001",
    },
  ];
  const xml = buildICustomsB1ExportXml(declaration);
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const transport = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) {
      return Promise.resolve(
        new Response(JSON.stringify({ token: "sandbox-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({
          status: "SUCCESS",
          co_relation_id: "same-sandbox-correlation",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  }) as typeof fetch;
  const client = new ICustomsClient({
    baseUrl: "https://ihub-tdr.customscloud.co",
    environment: "sandbox",
    apiKey: "test-key",
    apiSecret: "test-secret",
  }, transport);

  await client.saveDraft("same-sandbox-correlation", xml);

  assert(calls.length === 2, "Expected authentication and one update request.");
  assert(
    calls[1].url.endsWith(
      "/api/cds/v1/update/same-sandbox-correlation",
    ),
    "Expected the existing provider correlation ID on the update endpoint.",
  );
  assert(
    !calls[1].url.endsWith("/api/cds/v1/draft"),
    "An edit must not create a second provider draft.",
  );
  const sentXml = String(calls[1].init?.body ?? "");
  assert(
    sentXml.includes("MDEDITED002"),
    "Expected the edited declaration field in the complete update payload.",
  );
  assert(
    sentXml.includes("Edited first goods item") &&
      sentXml.includes("New second goods item"),
    "Expected every edited goods item in the complete update payload.",
  );
  assert(
    sentXml.match(/<GovernmentAgencyGoodsItem>/g)?.length === 2,
    "Expected exactly two goods items in the provider update.",
  );
});

Deno.test("an H1 edit sends every current item to the same iCustoms draft", async () => {
  const declaration = validImportDeclaration();
  declaration.traderReference = "MDIMPORTEDIT002";
  declaration.totalAmount = "1250";
  declaration.totalPackages = "12";
  declaration.totalGrossMass = "120";
  declaration.totalNetMass = "105";
  declaration.items = [
    {
      ...(declaration.items as Array<Record<string, unknown>>)[0],
      description: "Edited first import item",
    },
    {
      commodityCode: "0901110000",
      description: "New second import item",
      packageKind: "BX",
      packageMarks: "MD-IMPORT-002",
      packageCount: "2",
      nonPreferentialOrigin: "BR",
      procedureCode: "4000",
      additionalProcedureCode: "000",
      grossMass: "20",
      netMass: "15",
      itemPrice: "250",
      currency: "GBP",
      statisticalValue: "250",
      customsValuationMethod: "1",
      preferenceCode: "100",
      previousDocumentCategory: "Z",
      previousDocumentType: "355",
      previousDocumentReference: "20GB34F7Y1O2CX8PT3",
    },
  ];
  const xml = buildICustomsH1ImportXml(declaration);
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const transport = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) {
      return Promise.resolve(
        new Response(JSON.stringify({ token: "sandbox-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({
          status: "SUCCESS",
          co_relation_id: "same-import-correlation",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  }) as typeof fetch;
  const client = new ICustomsClient({
    baseUrl: "https://ihub-tdr.customscloud.co",
    environment: "sandbox",
    apiKey: "test-key",
    apiSecret: "test-secret",
  }, transport);

  await client.saveDraft("same-import-correlation", xml);

  assert(
    calls[1].url.endsWith("/api/cds/v1/update/same-import-correlation"),
    "Expected the existing Import correlation ID on the update endpoint.",
  );
  const sentXml = String(calls[1].init?.body ?? "");
  assert(
    sentXml.includes("MDIMPORTEDIT002") &&
      sentXml.includes("Edited first import item") &&
      sentXml.includes("New second import item"),
    "Expected the edited header and both current Import items.",
  );
  assert(
    sentXml.match(/<GovernmentAgencyGoodsItem>/g)?.length === 2,
    "Expected exactly two Import goods items in the update.",
  );
});
