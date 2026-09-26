# Finance approval policy

Each legal entity owns an append-only approval policy revision per workflow. An absent policy means **Always review**. Finance Setup → Controls & audit presents the current revision and requires a reason for every change. Only a user with `Finance.Configuration.Manage` can save a policy through the authenticated Finance Edge boundary. Browser roles cannot read or write the policy table or execute its RPCs directly.

| Mode | Result |
| --- | --- |
| Always review | Submission enters the existing human review queue. |
| Review exceptions | Eligible work completes automatically within the base-currency amount cap and, where configured, a verified variance cap. Advisory or hard exceptions require review. |
| Automatic within limits | Eligible work completes automatically within the amount and variance caps. Hard exceptions still require review. |

The server evaluates the latest revision from `FIN_ApprovalPolicies`. A missing or malformed amount, exception evidence, or configured variance comparison fails closed. The policy answer includes its ID, revision, mode and reason. Automatic transitions record that answer in immutable `Audit_Events`, alongside the normal lifecycle audit and authorization decision. The approval policy does not grant user permissions: each workflow still checks the actor, company, legal entity, source records and its normal posting requirements.

Document and cash submission call the existing transition functions atomically. Their automatic path requires a current open accounting period, enabled native ledger, valid base-currency transaction, and a connected provider when the external mirror is required. Credit notes, debit notes and foreign-currency entries remain in review. Both paths continue to use the existing tax, allocation, native posting, queue and mirror guards. A configured variance cap without a valid source comparison also requires review.

Purchase orders, deterministic supplier matching, payment runs, charge corrections, charge cases, cost recognition, bank matching, VAT signoff, opening cutover and accounting close use the same policy decision helper in their own follow-on migrations. AI suggestions are evidence for the operator or deterministic match rule, never an independent approval authority. Opening balances, opening FX, recognition mandates, VAT signoff and period close still require an explicit operator action; the policy may waive a second reviewer for an eligible, bounded case after the same source and period checks. No policy automatically locks a period, approves a tax treatment or activates a mandate in the background. Bank statement verification remains an explicit control.

The earlier Finance Setup fields `requireFinanceReview` and `autoPostLowRiskItems` remain stored for compatibility but are no longer shown as approval switches. They never authorized a server transition. Workflow policies are the authoritative controls.

Dexter can read the latest policy revision for a legal entity through the Finance domain, with its source ID and timestamp. A Finance watch targeted to the legal entity can react to saved workflow, mode, revision and limit changes. Policy configuration and approval remain unavailable as Dexter writes; chat directs the operator to Finance Setup. Watch evaluation uses the saved database event and does not repeatedly call an LLM.
