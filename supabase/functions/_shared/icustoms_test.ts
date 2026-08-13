import {
  buildICustomsB1ExportXml,
  buildICustomsH1ImportXml,
  type ExportDeclarationInput,
  ICustomsClient,
  iCustomsCommodityDetail,
  iCustomsCommoditySuggestions,
  providerIssues,
  validateICustomsB1Export,
  validateICustomsH1Import,
} from "./icustoms.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function occurrences(value: string, fragment: string) {
  return value.split(fragment).length - 1;
}

function validDeclaration(): ExportDeclarationInput {
  return {
    declarationCategory: "B1",
    declarationType: "A",
    traderReference: "MDTEST001",
    internalReference: "MD-INTERNAL-001",
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
    carrier: "GB Carrier Ltd",
    declarant: "GB123456789000",
    declarantName: "Sandbox Declarant Ltd",
    declarantAddressLine: "3 Customs Street",
    declarantCity: "London",
    declarantPostcode: "E17DB",
    declarantCountry: "GB",
    representative: "GB123456789000",
    representationType: "2",
    authorisationIdentifier: "GB123456789000",
    authorisationCategory: "EXRR",
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
    headerAdditionalInformationCode: "RRS01",
    headerAdditionalInformationDescription: "EXPORTER",
    isContainerised: "0",
    items: [{
      commodityCode: "0803101000",
      description: "Fresh plantain <bananas>",
      packageKind: "BX",
      packageMarks: "MD-TEST-001",
      packageCount: "10",
      nonPreferentialOrigin: "GB",
      procedureCode: "1040",
      additionalProcedureCode: "000",
      grossMass: "100",
      netMass: "90",
      itemPrice: "1000",
      currency: "GBP",
      statisticalValue: "1000",
      previousDocumentType: "MRN",
      previousDocumentReference: "25GB00000000000001",
      consignor: "GB Consignor Ltd",
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

Deno.test("buildICustomsB1ExportXml keeps common parties, destinations and previous documents at header level", () => {
  const xml = buildICustomsB1ExportXml(validDeclaration());
  assert(
    occurrences(xml, "<Consignee>") === 1,
    "Expected one header-level consignee.",
  );
  assert(
    occurrences(xml, "<Destination>") === 1,
    "Expected one header-level destination.",
  );
  assert(
    occurrences(xml, "<PreviousDocument>") === 1,
    "Expected one header-level previous document.",
  );
  assert(
    xml.includes("<Agent>") &&
      xml.includes("<AgentFunctionCode>2</AgentFunctionCode>"),
    "Expected export representation data.",
  );
  assert(
    xml.includes("<CategoryCode>EXRR</CategoryCode>"),
    "Expected the export authorisation holder.",
  );
  assert(
    xml.includes(
      "<Consignment><Carrier><Name>GB Carrier Ltd</Name></Carrier></Consignment>",
    ),
    "Expected the saved carrier in the declaration-level iCustoms consignment.",
  );
  assert(
    xml.includes("<Consignor><Name>GB Consignor Ltd</Name></Consignor>"),
    "Expected the saved consignor on the export goods item.",
  );
  assert(
    xml.includes(
      "<AdditionalInformation><StatementCode>RRS01</StatementCode><StatementDescription>EXPORTER</StatementDescription></AdditionalInformation>",
    ),
    "Expected declaration-level additional information.",
  );
  assert(
    xml.includes("<CurrentCode>10</CurrentCode>") &&
      xml.includes("<PreviousCode>40</PreviousCode>"),
    "Expected the documented export procedure split.",
  );
});

Deno.test("multi-item B1 exports keep the consignee at item level only", () => {
  const declaration = validDeclaration();
  const firstItem = (declaration.items as Array<Record<string, unknown>>)[0];
  declaration.totalAmount = "2000";
  declaration.totalPackages = "20";
  declaration.totalGrossMass = "200";
  declaration.totalNetMass = "180";
  declaration.items = [
    { ...firstItem, consignee: declaration.consignee },
    {
      ...firstItem,
      consignee: declaration.consignee,
      consignor: "GB Consignor Two Ltd",
      packageMarks: "MD-TEST-002",
    },
  ];

  const xml = buildICustomsB1ExportXml(declaration);
  const header = xml.slice(0, xml.indexOf("<GovernmentAgencyGoodsItem>"));
  assert(
    !header.includes("<Consignee>"),
    "Expected no header consignee when a multi-item export supplies one on every line.",
  );
  assert(
    occurrences(xml, "<Consignee>") === 2,
    "Expected one item-level consignee per goods line.",
  );
  assert(
    occurrences(xml, "<Consignor>") === 2,
    "Expected every goods line to keep its persisted consignor.",
  );
});

Deno.test("B1 accepts the WCO DUCR format for DCR previous documents", () => {
  const declaration = validDeclaration();
  declaration.previousDocumentType = "DCR";
  declaration.previousDocumentReference = "6GB603202734852-MD0003";
  const item = (declaration.items as Array<Record<string, unknown>>)[0];
  item.previousDocumentType = "DCR";
  item.previousDocumentReference = "6GB603202734852-MD0003";
  assert(
    !validateICustomsB1Export(declaration).some((issue) =>
      issue.toLowerCase().includes("previous document reference") ||
      issue.toLowerCase().includes("ducr format")
    ),
    "Expected the WCO DUCR reference to pass validation.",
  );
  assert(
    buildICustomsB1ExportXml(declaration).includes(
      "<ID>6GB603202734852-MD0003</ID>",
    ),
    "Expected the DUCR hyphen to be preserved in XML.",
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

Deno.test("iCustomsCommoditySuggestions normalises and deduplicates 10-digit results", () => {
  const suggestions = iCustomsCommoditySuggestions({
    activityid: "private-provider-activity",
    response: [{
      query: "hardback books",
      country: "UK",
      commodities: [
        {
          "HS-Code": "4901100000",
          Description: "Printed books",
          Confidence: 28,
        },
        { "HS-Code": "4901100000", Description: "Duplicate", Confidence: 99 },
        { "HS-Code": "invalid", Description: "Invalid", Confidence: 50 },
        {
          "HS-Code": "4901990000",
          Description: "Other printed books",
          Confidence: 96,
        },
      ],
    }],
  });
  assert(
    suggestions.length === 2,
    "Expected unique, valid commodity suggestions.",
  );
  assert(
    suggestions[0].code === "4901100000",
    "Expected provider result order to be preserved.",
  );
  assert(
    suggestions[1].confidence === 96,
    "Expected the bounded provider confidence value.",
  );
  assert(
    !("activityid" in suggestions[0]),
    "Provider activity identifiers must stay server-side.",
  );
});

Deno.test("iCustomsCommodityDetail returns direction-specific certificate mappings", () => {
  const payload = {
    data: {
      attributes: {
        goods_nomenclature_item_id: "4901100000",
        description_plain: "In single sheets, whether or not folded",
        declarable: true,
        validity_start_date: "1972-01-01T00:00:00.000Z",
        validity_end_date: null,
      },
      relationships: {
        import_measures: { data: [{ id: "import-measure", type: "measure" }] },
        export_measures: { data: [{ id: "export-measure", type: "measure" }] },
      },
      meta: {
        duty_calculator: {
          applicable_vat_options: {
            VATZ: "VAT zero rate",
            VAT: "Value added tax (20.0%)",
          },
        },
      },
    },
    included: [
      {
        id: "summary",
        type: "import_trade_summary",
        attributes: { basic_third_country_duty: "<span>0.00</span> %" },
      },
      {
        id: "import-measure",
        type: "measure",
        relationships: {
          measure_conditions: {
            data: [{ id: "import-waiver", type: "measure_condition" }],
          },
        },
      },
      {
        id: "export-measure",
        type: "measure",
        relationships: {
          measure_conditions: {
            data: [{ id: "export-waiver", type: "measure_condition" }],
          },
        },
      },
      {
        id: "import-waiver",
        type: "measure_condition",
        attributes: {
          document_code: "Y920",
          certificate_description:
            "Goods other than those described in the footnotes",
          guidance_cds:
            "Complete statement 'Not covered by footnote'. - No document status code is required.",
          action: "Import allowed",
        },
      },
      {
        id: "export-waiver",
        type: "measure_condition",
        attributes: {
          document_code: "Y999",
          certificate_description: "Export licence not required",
          guidance_cds:
            "Complete statement 'CDS Waiver'. - No document status code is required.",
          action: "Export allowed",
        },
      },
    ],
  };

  const importDetail = iCustomsCommodityDetail(payload, "import");
  assert(
    importDetail.code === "4901100000" && importDetail.declarable,
    "Expected a declarable tariff record.",
  );
  assert(importDetail.dutyRate === "0.00 %", "Expected HTML-free duty data.");
  assert(
    importDetail.vatOptions.some((option) =>
      option.code === "VAT" && option.rate === "20.0"
    ),
    "Expected VAT options.",
  );
  assert(
    importDetail.certificates.length === 1 &&
      importDetail.certificates[0].code === "Y920",
    "Expected import-only certificates.",
  );
  assert(
    importDetail.certificates[0].category === "Y" &&
      importDetail.certificates[0].type === "920",
    "Expected CDS category/type mapping.",
  );
  assert(
    importDetail.certificates[0].statement === "Not covered by footnote" &&
      !importDetail.certificates[0].referenceRequired,
    "Expected the waiver declaration statement without a false document-reference requirement.",
  );

  const exportDetail = iCustomsCommodityDetail(payload, "export");
  assert(
    exportDetail.certificates.length === 1 &&
      exportDetail.certificates[0].code === "Y999",
    "Expected export-only certificates.",
  );
  assert(
    exportDetail.dutyRate === null && exportDetail.vatOptions.length === 0,
    "Export detail must not present import tax data.",
  );
});

Deno.test("H1 validation accepts a certificate waiver statement without a document ID", () => {
  const declaration = validImportDeclaration();
  const item = (declaration.items as Array<Record<string, unknown>>)[0];
  item.additionalDocumentCategory = "Y";
  item.additionalDocumentType = "920";
  item.additionalDocumentId = "";
  item.additionalDocumentName = "Not covered by footnote";
  const issues = validateICustomsH1Import(declaration);
  assert(
    !issues.some((issue) => issue.includes("additional document 1")),
    "A provider-backed waiver statement should not invent a document reference.",
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

Deno.test("validateICustomsB1Export requires the internal reference and permits a blank trader reference", () => {
  const declaration = validDeclaration();
  declaration.traderReference = "";
  const issuesWithoutTraderReference = validateICustomsB1Export(declaration);
  assert(
    !issuesWithoutTraderReference.some((issue) =>
      issue.toLowerCase().includes("trader reference")
    ),
    "Expected the trader reference to be optional.",
  );

  declaration.internalReference = "";
  const issuesWithoutInternalReference = validateICustomsB1Export(declaration);
  assert(
    issuesWithoutInternalReference.includes("Add an internal reference."),
    "Expected the internal reference to be required for exports.",
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

Deno.test("buildICustomsB1ExportXml includes optional supporting documents", () => {
  const declaration = validDeclaration();
  Object.assign((declaration.items as Array<Record<string, unknown>>)[0], {
    additionalDocumentCategory: "N",
    additionalDocumentType: "935",
    additionalDocumentId: "DOC1",
  });
  const issues = validateICustomsB1Export(declaration);
  assert(
    !issues.some((issue) => issue.includes("additional document")),
    "Expected the complete optional document to validate.",
  );
  assert(
    buildICustomsB1ExportXml(declaration).includes(
      "<AdditionalDocument><CategoryCode>N</CategoryCode><ID>DOC1</ID>",
    ),
    "Expected the export document to be included in the goods item.",
  );
});

Deno.test("buildICustomsH1ImportXml maps repeatable iCustoms item groups in entered order", () => {
  const declaration = validImportDeclaration();
  declaration.totalPackages = "13";
  Object.assign((declaration.items as Array<Record<string, unknown>>)[0], {
    taricCode: "A001",
    additionalTaricCodes: [{ id: "taric-2", code: "A002" }],
    nationalCode: "VATZ",
    additionalNationalCodes: [{ id: "national-2", code: "VAT1" }],
    additionalPackageDetails: [{
      id: "package-2",
      kind: "PK",
      marks: "MD-IMPORT-002",
      count: "3",
    }],
    additionalProcedureCodes: [{ id: "procedure-2", code: "1CD" }],
    additionalPreviousDocuments: [{
      id: "previous-2",
      category: "Z",
      type: "MRN",
      reference: "25GB00000000000002",
    }],
    additionalDocuments: [{
      id: "document-2",
      category: "N",
      type: "936",
      reference: "DOC2",
      name: "Second licence",
      lpcoExemptionCode: "",
      writeOff: "Licensing Authority",
      validityDate: "2026-12-31",
    }],
    additionalInformationStatements: [{
      id: "information-1",
      statementCode: "00500",
    }, { id: "information-2", statementCode: "00501" }],
    dutyCalculations: [{
      id: "duty-1",
      taxType: "A00",
      paymentMethod: "A",
      baseQuantity: "100",
      unitCode: "KGM",
      declaredTax: "25",
    }, {
      id: "duty-2",
      taxType: "B00",
      paymentMethod: "A",
      baseQuantity: "90",
      unitCode: "KGM",
      declaredTax: "5",
    }],
    valuationAdjustments: [{
      id: "adjustment-1",
      code: "AB",
      currency: "GBP",
      amount: "12.50",
    }, { id: "adjustment-2", code: "CD", currency: "GBP", amount: "2.50" }],
    itemExporters: [{ id: "exporter-1", partyId: "IE4809539S" }, {
      id: "exporter-2",
      partyId: "IE4809539T",
    }],
    itemSellers: [{ id: "seller-1", partyId: "SELLER1" }],
    itemBuyers: [{ id: "buyer-1", partyId: "BUYER1" }],
    domesticDutyTaxParties: [{
      id: "fiscal-1",
      partyId: "GB123456789",
      roleCode: "FR1",
    }, { id: "fiscal-2", partyId: "GB987654321", roleCode: "FR3" }],
    mutualRecognitionParties: [{ id: "mutual-1", partyId: "AEO123" }, {
      id: "mutual-2",
      partyId: "AEO456",
    }],
  });

  const issues = validateICustomsH1Import(declaration);
  assert(
    !issues.length,
    `Expected repeatable rows to validate: ${issues.join(" | ")}`,
  );
  const xml = buildICustomsH1ImportXml(declaration);
  assert(
    occurrences(xml, "<AdditionalTaricCode>") === 2,
    "Expected two TARIC codes.",
  );
  assert(
    occurrences(xml, "<AdditionalNationalCode>") === 2,
    "Expected two national codes.",
  );
  assert(
    occurrences(xml, "<Packaging>") === 2 &&
      xml.includes(
        "<SequenceNumeric>2</SequenceNumeric><MarksNumbersID>MD-IMPORT-002</MarksNumbersID>",
      ),
    "Expected sequential package groups.",
  );
  assert(
    occurrences(xml, "<GovernmentAdditionalProcedure>") === 2,
    "Expected two additional procedures.",
  );
  assert(
    occurrences(xml, "<PreviousDocument>") === 2,
    "Expected two item previous documents.",
  );
  assert(
    occurrences(xml, "<AdditionalDocument>") === 2 &&
      xml.includes(
        "<EffectiveDateTime><DateTime>2026-12-31</DateTime></EffectiveDateTime>",
      ),
    "Expected both supporting documents and their validity data.",
  );
  assert(
    occurrences(xml, "<AdditionalInformation>") === 2,
    "Expected two additional information statements.",
  );
  assert(
    occurrences(xml, "<DutyTaxFee>") === 2,
    "Expected two duty calculations.",
  );
  assert(
    occurrences(xml, "<ValuationAdjustment>") === 2,
    "Expected two additions or deductions.",
  );
  assert(
    occurrences(xml, "<DomesticDutyTaxParty>") === 2,
    "Expected two domestic duty tax parties.",
  );
  assert(
    occurrences(xml, "<AEOMutualRecognitionParty>") === 2,
    "Expected two mutual recognition parties.",
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

Deno.test("ICustomsClient uses the observed commodity search and tariff endpoints", async () => {
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
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  const client = new ICustomsClient({
    baseUrl: "https://ihub-tdr.customscloud.co",
    environment: "sandbox",
    apiKey: "test-key",
    apiSecret: "test-secret",
  }, transport);

  await client.searchCommodities("hardback books", "GB");
  await client.tariffDetails("4901100000");

  assert(
    calls[1].url.endsWith("/api/iclassification/v1.0.0/aisearch"),
    "Expected the iCustoms commodity-classification endpoint.",
  );
  assert(
    calls[1].init?.body ===
      JSON.stringify([{ query: "hardback books", country: "UK" }]),
    "Expected the UK classification request contract.",
  );
  assert(
    calls[2].url.endsWith("/api/v2/tariDetails") &&
      calls[2].init?.body === JSON.stringify({ commodity_code: "4901100000" }),
    "Expected the iCustoms tariff-detail request contract.",
  );
});

Deno.test("ICustomsClient decodes the tariff service's JSON string response", async () => {
  let call = 0;
  const payload = {
    data: {
      attributes: {
        goods_nomenclature_item_id: "4901100000",
        description: "In single sheets, whether or not folded",
        declarable: true,
      },
    },
  };
  const transport = ((_url: string | URL | Request, _init?: RequestInit) => {
    call += 1;
    if (call === 1) {
      return Promise.resolve(
        new Response(JSON.stringify({ token: "sandbox-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(JSON.stringify(payload)), {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
  }) as typeof fetch;
  const client = new ICustomsClient({
    baseUrl: "https://ihub-tdr.customscloud.co",
    environment: "sandbox",
    apiKey: "test-key",
    apiSecret: "test-secret",
  }, transport);

  const response = await client.tariffDetails("4901100000");
  const detail = iCustomsCommodityDetail(response.body, "import");

  assert(
    detail.code === "4901100000",
    "Expected the double-encoded provider payload to be decoded.",
  );
  assert(
    detail.description === "In single sheets, whether or not folded",
    "Expected decoded tariff attributes.",
  );
});

Deno.test("ICustomsClient parses tariff records larger than the former preview limit", async () => {
  let call = 0;
  const payload = {
    data: {
      attributes: {
        goods_nomenclature_item_id: "4901100000",
        description: "In single sheets, whether or not folded",
        declarable: true,
      },
    },
    included: Array.from({ length: 1_200 }, (_, index) => ({
      id: `measure-${index}`,
      type: "measure",
      attributes: { description: "Tariff measure detail".repeat(5) },
    })),
  };
  const transport = ((_url: string | URL | Request, _init?: RequestInit) => {
    call += 1;
    if (call === 1) {
      return Promise.resolve(
        new Response(JSON.stringify({ token: "sandbox-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  const client = new ICustomsClient({
    baseUrl: "https://ihub-tdr.customscloud.co",
    environment: "sandbox",
    apiKey: "test-key",
    apiSecret: "test-secret",
  }, transport);

  const response = await client.tariffDetails("4901100000");
  const detail = iCustomsCommodityDetail(response.body, "import");

  assert(
    JSON.stringify(payload).length > 100_000,
    "Expected a realistic large tariff fixture.",
  );
  assert(
    detail.code === "4901100000",
    "Expected the full tariff response to be parsed before applying the safety cap.",
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
      consignor: "GB Consignor Ltd",
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
