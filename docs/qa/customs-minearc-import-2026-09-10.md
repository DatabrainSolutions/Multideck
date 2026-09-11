# MineARC invoice import repair — 10 September 2026

## Changes

The OCR request now sends validated PDF bytes as a base64 document URI. Private Storage signed URLs contain JWTs which the model gateway redacts; sending the redacted URL caused Mistral OCR to fail. Gateway secret redaction remains intact, and preview URLs retain the existing private Storage flow.

Draft creation also failed because the declaration SELECT policy queried the declaration being inserted through a stable function during INSERT RETURNING. The replacement policy checks the row's creator directly, retaining company membership, active caller, Customs.Read and soft-delete restrictions. Existing write authorisation remains in place.

These are repairs to existing capabilities. Dexter chat and Watching for you gain no new action or watch; existing approvals, audit and access boundaries remain applicable.

## Verification

- OCR unit tests: 7 passed, including byte-for-byte preservation through gateway redaction and continued JWT redaction.
- Focused OCR extraction contract: passed. The full contract file has an unrelated existing purchase-order copy assertion failure.
- Isolated PostgreSQL regression: passed for INSERT RETURNING, same-company access, soft deletion, and denial for other companies, inactive, unprivileged and unlinked users.
- Transactional checks against the connected backend: export/import draft creation and export update passed; unprivileged reads/writes were denied. Test transaction rolled back.
- Chrome on dev.multideck.app: Commercial Invoice 142712.pdf reached review with 89 invoice lines; 54 grouped declaration lines were added to the existing blank item. The saved draft reopened with 55 items.
- Chrome on dev.multideck.app: Commercial Invoice 142711.pdf reached review with both expected lines, values AUD 3,920 and AUD 4,480.
- git diff --check passed.

## Deployment and boundaries

OCR function version 74 and the draft visibility migration were deployed to the backend used by dev.multideck.app (project aqtwypsuijxlnvtxpuxe). The browser checks exercised those live backend changes. Local source changes have not been committed or pushed by this task.

Saved verification draft: MD-CDS-EX-20260910-0039, declaration fdcfa4fe-29e3-4db6-8a0f-9ca944943654. No declaration was submitted to customs. Extraction and persistence were verified; this was not a customs classification or filing accuracy review.
