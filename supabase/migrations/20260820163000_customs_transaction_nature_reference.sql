begin;

-- CDS DE 8/5 uses the full transaction hierarchy. Retire the former broad
-- summary choices and publish every currently usable code from the UK Trade
-- Tariff, including the valid single-digit categories 3, 7 and 8.
update public."sys_CustomsFormOptions"
set "CFO_IsActive" = false
where "CFO_CatalogCode" = 'transaction_nature';

insert into public."sys_CustomsFormOptions" (
  "CFO_CatalogCode",
  "CFO_Code",
  "CFO_Name",
  "CFO_Description",
  "CFO_Direction",
  "CFO_SortOrder",
  "CFO_IsActive"
) values
  ('transaction_nature', '11', 'Outright sale or purchase', 'Transactions involving an actual transfer of ownership with financial compensation.', 'all', 11, true),
  ('transaction_nature', '12', 'Sale on approval, trial, consignment or commission', 'Transactions involving an actual transfer of ownership with financial compensation.', 'all', 12, true),
  ('transaction_nature', '13', 'Barter trade', 'Compensation in kind as part of an actual transfer of ownership.', 'all', 13, true),
  ('transaction_nature', '14', 'Financial leasing', 'Hire purchase arrangements where the risks and rewards of ownership are transferred.', 'all', 14, true),
  ('transaction_nature', '19', 'Other compensated transfer of ownership', 'Other transactions involving an actual transfer of ownership with financial or other compensation.', 'all', 19, true),
  ('transaction_nature', '21', 'Return of goods', 'Return following the original transaction.', 'all', 21, true),
  ('transaction_nature', '22', 'Replacement for returned goods', 'Replacement goods supplied after the original goods are returned.', 'all', 22, true),
  ('transaction_nature', '23', 'Replacement without return', 'Replacement goods supplied while the original goods are not returned.', 'all', 23, true),
  ('transaction_nature', '29', 'Other return or replacement', 'Other transactions involving the return or replacement of goods free of charge.', 'all', 29, true),
  ('transaction_nature', '3', 'Transfer of ownership without compensation', 'Transactions involving a transfer of ownership without financial compensation.', 'all', 30, true),
  ('transaction_nature', '41', 'Processing with expected return', 'Goods expected to return to the original country of export after processing.', 'all', 41, true),
  ('transaction_nature', '42', 'Processing without expected return', 'Goods not expected to return to the original country of export after processing.', 'all', 42, true),
  ('transaction_nature', '51', 'Return after processing', 'Goods returning to the original country of export after processing.', 'all', 51, true),
  ('transaction_nature', '52', 'No return after processing', 'Goods not returning to the original country of export after processing.', 'all', 52, true),
  ('transaction_nature', '7', 'Joint defence or intergovernmental programme', 'Transactions under joint defence projects or other joint intergovernmental production programmes.', 'all', 70, true),
  ('transaction_nature', '8', 'Construction or civil engineering contract', 'Supply of building materials and equipment under a general construction or civil engineering contract.', 'all', 80, true),
  ('transaction_nature', '91', 'Hire, loan or operating lease over 24 months', 'Hire, loan or operational leasing expected to last longer than 24 months.', 'all', 91, true),
  ('transaction_nature', '99', 'Other transaction', 'Other transaction that does not fit the preceding codes.', 'all', 99, true)
on conflict ("CFO_CatalogCode", "CFO_Code", "CFO_Direction") do update set
  "CFO_Name" = excluded."CFO_Name",
  "CFO_Description" = excluded."CFO_Description",
  "CFO_SortOrder" = excluded."CFO_SortOrder",
  "CFO_IsActive" = true;

commit;
