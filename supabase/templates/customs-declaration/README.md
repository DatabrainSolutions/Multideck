# CDS declaration Carbone templates

These vector A4 HTML templates reproduce the accepted CDS import and export
copies supplied by Mark for Jenkar. The originals remain in the ignored local
`tmp/customs-declaration-template-source` directory and are never committed.

The authoritative source is
`supabase/functions/_shared/customs-declaration-template.ts`. It produces a
separate import or export template with:

- the same black hairline form grid, Times typography, compact labels and
  italic values as the supplied documents;
- an MRN barcode and human-readable MRN header;
- repeatable complete goods-item blocks using Carbone `[i]` / `[i+1]` loops;
- import-only tax/additions sections and the conditional exchange-rate appendix;
- an acceptance/audit block populated only from the server-owned accepted
  declaration snapshot.

Generate inspectable `.html` copies from the repository root:

```sh
node --experimental-strip-types supabase/templates/customs-declaration/build-templates.mjs
```

Production does not send these files or browser form data directly to Carbone.
The authenticated `customs-declaration-document` Edge Function reads the
operator-owned declaration and its goods items on the server, renders the
template through Carbone's Chromium converter, validates the PDF signature,
and stores the accepted PDF in private Supabase Storage for at least seven
years.

After a layout change, generate both HTML files, render both with a sanitised
accepted-declaration dataset, and compare the resulting A4 pages against
Mark's one-page export and two-page import references.
