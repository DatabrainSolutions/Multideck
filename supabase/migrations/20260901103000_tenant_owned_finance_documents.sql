-- Finance documents and cash records always belong to the signed-in tenant
-- company. Operators and Dexter must never choose or supply another issuer.

begin;

update public."sys_AIDexterActions"
set "AIDexterAction_Description" = 'Create one reviewed invoice or credit draft for the signed-in tenant company through the Finance boundary. Statutory treatments require local advice; the zero-rate DEMO-NONTAX treatment is accepted only for a verified ERPNext sandbox and remains subject to normal human posting approval.',
    "AIDexterAction_ParametersJSON" = '{"type":"object","properties":{"type":{"type":"string","enum":["sl_invoice","credit_note","pl_invoice","debit_note"]},"partyOrgId":{"type":"string"},"documentDate":{"type":"string"},"dueDate":{"type":["string","null"]},"currencyCode":{"type":"string"},"exchangeRate":{"type":"number","exclusiveMinimum":0},"sourceJobId":{"type":["string","null"]},"lines":{"type":"array","minItems":1,"maxItems":100,"items":{"type":"object","properties":{"description":{"type":"string"},"quantity":{"type":"number","exclusiveMinimum":0},"unitAmount":{"type":"number","minimum":0},"taxCode":{"type":["string","null"]},"chargeCode":{"type":["string","null"]},"lineType":{"type":"string","enum":["service","ancillary"]}},"required":["description","quantity","unitAmount","taxCode","chargeCode","lineType"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["type","partyOrgId","documentDate","dueDate","currencyCode","exchangeRate","sourceJobId","lines","reason"],"additionalProperties":false}'::jsonb,
    "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'create_finance_document_draft';

update public."sys_AIDexterActions"
set "AIDexterAction_Description" = 'Create one reviewed customer receipt or supplier payment draft for the signed-in tenant company, including exact open-document allocations, through the Finance validation boundary.',
    "AIDexterAction_ParametersJSON" = '{"type":"object","properties":{"type":{"type":"string","enum":["customer_receipt","supplier_payment"]},"partyOrgId":{"type":"string"},"bankAccountId":{"type":"string"},"transactionDate":{"type":"string"},"currencyCode":{"type":"string"},"exchangeRate":{"type":"number","exclusiveMinimum":0},"amount":{"type":"number","exclusiveMinimum":0},"reference":{"type":["string","null"]},"allocations":{"type":"array","maxItems":100,"items":{"type":"object","properties":{"documentId":{"type":"string"},"amount":{"type":"number","exclusiveMinimum":0}},"required":["documentId","amount"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["type","partyOrgId","bankAccountId","transactionDate","currencyCode","exchangeRate","amount","reference","allocations","reason"],"additionalProperties":false}'::jsonb,
    "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'create_finance_cash_draft';

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" = 'Event-driven tenant-company finance document, tax-readiness, receipt, payment, allocation, provider-sync and approved configuration changes.',
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'finance';

commit;
