# Unified Quote Goods — local microstep

Older Quotes without `cargoLines` used shipment-total inputs instead of the shared cargo editor. All Details views now use `QuoteCargoEditor`. Missing legacy lists are projected as one labelled summary row, preserving totals without claiming historical individual allocations. Explicit empty lists remain empty.

The projection does not call onChange on mount. Editing or adding goods in an editable draft persists the list through the existing callback. Submitted versions remain read-only and their snapshots/PDFs are not rewritten. Earlier shipment-level handling remains available separately, rather than silently assigning detailed hazardous declarations to an individual line.

Verification: TypeScript passed; targeted Goods contract and submitted-version checks passed (9 checks). Chrome localhost JQ20020 V2 displayed 450 cartons and 15000 kg in the shared expandable editor. Typing into the submitted quantity left 450 unchanged. No database migration, push, deployment, send, acceptance or conversion performed.

The broader Details contract suite has two existing failures (autosave call shape and customer-reference mapping), reproduced against HEAD. Not changed in this microstep. Draft save/reload, mobile layout, and user comparison with JQ20024 still require acceptance testing.
