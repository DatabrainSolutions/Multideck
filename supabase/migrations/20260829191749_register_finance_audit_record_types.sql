-- Finance lifecycle functions emit immutable audit events. Register every
-- record type they emit so the audit foreign key protects, rather than blocks,
-- invoice, credit, receipt, payment and configuration workflows.

begin;

insert into public."sys_WorkflowRecordTypes"(
  "WorkflowRecordType_Code",
  "WorkflowRecordType_Name",
  "WorkflowRecordType_SourceTable",
  "WorkflowRecordType_Description",
  "WorkflowRecordType_IsActive",
  "WorkflowRecordType_SortOrder"
)
values
  ('sl_invoice', 'Sales invoice', 'FIN_Documents', 'Sales-ledger invoice from draft through provider submission.', true, 121),
  ('credit_note', 'Customer credit note', 'FIN_Documents', 'Sales-ledger customer credit from draft through provider submission.', true, 122),
  ('pl_invoice', 'Purchase invoice', 'FIN_Documents', 'Purchase-ledger supplier invoice from draft through provider submission.', true, 123),
  ('debit_note', 'Supplier credit note', 'FIN_Documents', 'Purchase-ledger supplier credit from draft through provider submission.', true, 124),
  ('customer_receipt', 'Customer receipt', 'FIN_CashTransactions', 'Customer receipt and allocation lifecycle record.', true, 125),
  ('supplier_payment', 'Supplier payment', 'FIN_CashTransactions', 'Supplier payment and allocation lifecycle record.', true, 126),
  ('finance_configuration', 'Finance configuration', 'FIN_AdministrationRevisions', 'Reviewed legal-entity finance, currency and provider configuration.', true, 127)
on conflict ("WorkflowRecordType_Code") do update
set "WorkflowRecordType_Name" = excluded."WorkflowRecordType_Name",
    "WorkflowRecordType_SourceTable" = excluded."WorkflowRecordType_SourceTable",
    "WorkflowRecordType_Description" = excluded."WorkflowRecordType_Description",
    "WorkflowRecordType_IsActive" = true,
    "WorkflowRecordType_SortOrder" = excluded."WorkflowRecordType_SortOrder";

commit;
