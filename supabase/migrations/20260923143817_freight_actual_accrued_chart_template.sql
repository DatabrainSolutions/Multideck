begin;

-- CargoWise-compatible account identifiers are text, not four-digit ranges.
-- The template is a compact starting chart; customer-specific accounts can
-- still be added through the audited Finance administration workflow.
alter table public."FIN_ChartTemplateAccounts"
  drop constraint "CK_FIN_ChartTemplateAccounts_range";
alter table public."FIN_ChartTemplateAccounts"
  add constraint "CK_FIN_ChartTemplateAccounts_code"
  check ("FINChartTemplateAccount_Code" ~ '^[0-9]{4}(\.[0-9]{2}\.[0-9]{2})?$');

insert into public."FIN_ChartTemplates"
  ("FINChartTemplate_Code","FINChartTemplate_Name","FINChartTemplate_IndustryCode","FINChartTemplate_Version","FINChartTemplate_Description")
values
  ('freight-accrual-v1','Freight actual and accrued chart','freight_forwarding',1,
   'Compact CargoWise-compatible chart with separate balance-sheet controls and actual/accrued freight P&L accounts.')
on conflict ("FINChartTemplate_Code") do update set
  "FINChartTemplate_Name"=excluded."FINChartTemplate_Name",
  "FINChartTemplate_Description"=excluded."FINChartTemplate_Description",
  "FINChartTemplate_IsActive"=true;

with accounts(code,name,account_type,category,is_control,required,sort_order) as (
  values
    ('4900.00.00','Retained earnings','Equity','equity',true,true,10),
    ('5110.00.00','Share capital','Equity','equity',false,false,20),
    ('6110.10.10','GBP bank','Bank','asset',true,true,30),
    ('6110.10.40','EUR bank','Bank','asset',true,false,40),
    ('6110.10.50','USD bank','Bank','asset',true,false,50),
    ('6210.00.00','Trade receivables','Receivable','asset',true,true,60),
    ('6240.00.00','Accrued revenue and WIP','Current Asset','asset',true,true,70),
    ('6310.00.00','Input tax receivable','Tax','asset',true,true,80),
    ('6410.00.00','Prepayments','Current Asset','asset',false,false,90),
    ('8210.00.00','Trade payables','Payable','liability',true,true,100),
    ('8310.00.00','Output tax payable','Tax','liability',true,true,110),
    ('8410.10.00','Accrued job costs','Current Liability','liability',true,true,120),
    ('1010.10.10','Freight revenue actual','Income Account','income',false,true,200),
    ('1010.10.20','Freight revenue accrued','Income Account','income',false,true,210),
    ('1010.20.10','Freight costs actual','Cost of Goods Sold','direct_cost',false,true,220),
    ('1010.20.20','Freight costs accrued','Cost of Goods Sold','direct_cost',false,true,230),
    ('1020.10.10','Agency revenue actual','Income Account','income',false,false,240),
    ('1020.10.20','Agency revenue accrued','Income Account','income',false,false,250),
    ('1020.20.10','Agency costs actual','Cost of Goods Sold','direct_cost',false,false,260),
    ('1020.20.20','Agency costs accrued','Cost of Goods Sold','direct_cost',false,false,270),
    ('1030.10.10','Port and terminal revenue actual','Income Account','income',false,false,280),
    ('1030.10.20','Port and terminal revenue accrued','Income Account','income',false,false,290),
    ('1030.20.10','Port and terminal costs actual','Cost of Goods Sold','direct_cost',false,false,300),
    ('1030.20.20','Port and terminal costs accrued','Cost of Goods Sold','direct_cost',false,false,310),
    ('1040.10.10','Documentation revenue actual','Income Account','income',false,false,320),
    ('1040.10.20','Documentation revenue accrued','Income Account','income',false,false,330),
    ('1040.20.10','Documentation costs actual','Cost of Goods Sold','direct_cost',false,false,340),
    ('1040.20.20','Documentation costs accrued','Cost of Goods Sold','direct_cost',false,false,350),
    ('1200.10.10','Warehouse revenue actual','Income Account','income',false,false,360),
    ('1200.10.20','Warehouse revenue accrued','Income Account','income',false,false,370),
    ('1200.20.10','Warehouse costs actual','Cost of Goods Sold','direct_cost',false,false,380),
    ('1200.20.20','Warehouse costs accrued','Cost of Goods Sold','direct_cost',false,false,390),
    ('1300.10.10','Transport revenue actual','Income Account','income',false,false,400),
    ('1300.10.20','Transport revenue accrued','Income Account','income',false,false,410),
    ('1300.20.10','Transport costs actual','Cost of Goods Sold','direct_cost',false,false,420),
    ('1300.20.20','Transport costs accrued','Cost of Goods Sold','direct_cost',false,false,430),
    ('1110.10.10','Other service revenue actual','Income Account','income',false,false,440),
    ('1110.10.20','Other service revenue accrued','Income Account','income',false,false,450),
    ('1110.20.10','Other service costs actual','Cost of Goods Sold','direct_cost',false,false,460),
    ('1110.20.20','Other service costs accrued','Cost of Goods Sold','direct_cost',false,false,470),
    ('3020.00.00','Wages and salaries','Expense Account','expense',false,false,500),
    ('3510.00.00','Rent and rates','Expense Account','expense',false,false,510),
    ('3910.00.00','Bank charges','Expense Account','finance',false,false,520)
)
insert into public."FIN_ChartTemplateAccounts"
  ("FINChartTemplateAccount_TemplateID","FINChartTemplateAccount_Code","FINChartTemplateAccount_Name",
   "FINChartTemplateAccount_TypeCode","FINChartTemplateAccount_CategoryCode",
   "FINChartTemplateAccount_IsControlAccount","FINChartTemplateAccount_Required","FINChartTemplateAccount_SortOrder")
select template."FINChartTemplate_ID",a.code,a.name,a.account_type,a.category,a.is_control,a.required,a.sort_order
from accounts a
join public."FIN_ChartTemplates" template on template."FINChartTemplate_Code"='freight-accrual-v1'
on conflict ("FINChartTemplateAccount_TemplateID","FINChartTemplateAccount_Code") do update set
  "FINChartTemplateAccount_Name"=excluded."FINChartTemplateAccount_Name",
  "FINChartTemplateAccount_TypeCode"=excluded."FINChartTemplateAccount_TypeCode",
  "FINChartTemplateAccount_CategoryCode"=excluded."FINChartTemplateAccount_CategoryCode",
  "FINChartTemplateAccount_IsControlAccount"=excluded."FINChartTemplateAccount_IsControlAccount",
  "FINChartTemplateAccount_Required"=excluded."FINChartTemplateAccount_Required",
  "FINChartTemplateAccount_SortOrder"=excluded."FINChartTemplateAccount_SortOrder";

commit;
