# Superseded scanner dependency

On 10 September 2026 the operator explicitly requested direct AI document reading instead of a mandatory malware-scanning service. The mandatory external scanner was removed from new Dexter uploads. File size, binary signature/type and archive validation, private storage, actor/owner/company/permission checks, expiry and write approvals remain. New uploads are labelled `validated`, never `clean`; existing quarantined and rejected files stay blocked.

PDFs and images are now supplied directly to the existing AI provider. Mistral remains available for office-document conversion and explicit OCR. The original scanner setup notes below are historical and are no longer required to run Dexter PDF upload.

Verified 10 September 2026 against development Supabase project `aqtwypsuijxlnvtxpuxe`: the secret inventory succeeds, but `DEXTER_MALWARE_SCAN_URL` and `DEXTER_MALWARE_SCAN_TOKEN` are absent. Actual browser uploads return “Document scanning is temporarily unavailable. Try again later.” No existing scanner implementation or alternative scanner configuration was found in the App repository. This is not a browser extension issue.

## Required connection

Connect an authenticated document-scanning service by setting those two secrets in the development project's server-side secret store. Keep the token out of chat, client configuration, source control and logs. The endpoint must perform a real content scan; do not substitute an always-clean response or disable the existing check.

The current adapter sends an HTTP POST containing the original file bytes, with:

- `Authorization: Bearer <server-side scanner token>`
- `Content-Type`: the validated file media type
- `X-File-Name`: URL-encoded safe filename
- `X-Content-SHA256`: SHA-256 of those bytes

A clean verdict must arrive within 20 seconds with a successful HTTP status and JSON `{ "clean": true, "status": "clean" }`. Other verdicts fail closed. Requests can contain supported documents/images up to 25 MB. The scanner is an external data processor, so its ownership, retention and access policy must be appropriate for customer documents before configuration. Existing private-storage, ownership, permission, scan-state and expiry checks remain in force.

## Verification after connection

1. Upload the synthetic `tmp/pdfs/dexter-qa-freight-enquiry.pdf` through localhost Dexter. Verify visible progress, completion and its preview.
2. Ask Dexter to extract the shipment facts, compare them with the PDF, and prepare a relevant labelled development action for review. Approve only that intended action and read back its saved record.
3. Reopen the conversation and verify the saved PDF preview, zoom and keyboard close. Confirm the same file remains available through the owner-checked preview endpoint.
4. Verify an unavailable scanner and a rejected file preserve the draft and allow recovery. Recheck denial for another user, revoked access, expired uploads and unclean scan state.

The frontend attachment improvements, permission-unit tests, development preview endpoint and unavailable-file browser path are already covered in the goal QA record. Accepted upload, extraction/action and successful saved-file reopening remain unverified until the scanner is connected.
