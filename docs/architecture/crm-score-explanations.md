# CRM score explanations

Company health and churn percentages remain the canonical values on `CRM_AccountProfiles`. The company record may explain a percentage only when a current `CRM_AIInsights` row:

- has the corresponding health or churn insight type;
- records the exact score currently shown;
- is not closed, dismissed, rejected, resolved, expired, or archived; and
- links at least one source record that the same operator can already read in the bounded company-detail response.

The customer Edge Function resolves those references against the account's permission-visible CRM activities, emails, and active shipments. It generates the destination URL from the resolved record rather than accepting a model-authored URL. Insight evidence text and internal ranking data are not exposed. If any of these checks fail, the UI keeps the percentage visible but does not show the proposed reason.

## Dexter and Watching for you boundary

This feature is a read-only presentation of the existing account score, CRM insight, and source records. It creates no score, insight, write action, or new operational event. Dexter already reads the account health and churn values through the `customers` domain, while the existing deterministic customer watch adapter emits changes to those values. The explanation summary is deliberately not added to Dexter until its SQL domain can apply the same source-resolution and mailbox-permission checks as the customer Edge Function; Dexter must not restate an unsupported CRM insight as a score explanation. No additional Watching for you signal or recurring LLM evaluation is added because displaying an existing explanation is not a state change.
