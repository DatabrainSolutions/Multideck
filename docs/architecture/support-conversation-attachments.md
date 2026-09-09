# Support conversation attachments

Conversation uploads use Main Cloud's private `cloud-conversation-files` bucket, not tenant operational Storage. The authenticated App intake boundary derives the tenant and reporter; Cloud derives the verified staff identity. Signed links are issued only for messages returned by the existing ticket permission boundary. Internal-note files remain staff-only.

Limits: five files per message, 50 MiB per file, 100 MiB combined. Upload completion checks bytes, size, digest and supported file signatures before a message can attach the file. Message creation and file linking are atomic; retries reuse the message identity.

PDF files open in the existing PDF document viewer, with an explicit Download action. PDF rendering happens in the browser. Other office documents remain downloads; no third-party document-viewing service receives private links.

## Dexter exception

The existing explicit support-conversation exception remains in force: Dexter cannot read conversation bodies, attachments or signed links, or send ticket replies. The existing capability prompts state this limitation and direct operators to Settings > Support. This avoids exposing a cross-project private file surface through generic Dexter data access. Minimal reporter-safe ticket status remains available.

Attachment-only and text-with-attachment replies reuse the existing message callback and deterministic status/watch event. They do not introduce polling or additional LLM calls. Files are not included in classification, email bodies, callback payloads or watch evidence.
