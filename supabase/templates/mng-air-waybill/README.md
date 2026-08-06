# MNG Air Waybill Carbone template

This is a separate two-page, carrier-specific Multideck template recreated from
`SHEAXJ045060-891936_ABFWBJ0.pdf`.

- Page 1 preserves the MNG Airlines red form, carrier identity and `ORIGINAL 2
  (FOR CONSIGNEE)` copy label. The completed sample shipment is removed and
  replaced by fixed-size Carbone fields.
- Page 2 preserves the complete carrier limitation notice and Conditions of
  Contract exactly as supplied.
- Commercial values that are not available in Multideck's approved job snapshot
  remain blank; the template does not invent rates, charges or declared values.
- The template code is `MNG_AWB`, so it is published beside the generic Master
  Air Waybill rather than replacing it.

Build the source DOCX from the repository root:

```sh
supabase/templates/mng-air-waybill/build-template.sh
```

The generated `MNG_Air_Waybill_Carbone_Template.docx` is uploaded through the
authenticated Document Studio boundary. Carbone credentials remain server-side.
After each change, verify an authenticated Carbone PDF is A4, exactly two pages,
and that every value remains inside its original box.
