-- Remove only the five departments added by 20260819180000_add_quote_departments.sql.

delete from public."cmp_Departments" departments
where departments."Department_Name" in ('Imports', 'Operations Staff', 'Road Freight', 'Sales', 'Warehouse')
  and exists (
    select 1 from public."cmp_Departments" customs
    where customs."Company_ID" = departments."Company_ID"
      and customs."Department_Name" = 'Customs'
  );
