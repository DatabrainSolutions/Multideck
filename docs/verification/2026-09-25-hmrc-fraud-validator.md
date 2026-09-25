# HMRC fraud-header Test API contract — local verification

The backend-only `requestHmrcVatFraudValidation` helper uses HMRC's sandbox **Test Fraud Prevention Headers API**. It obtains an application-restricted token with the client-credentials grant, then sends the 16 checked `WEB_APP_VIA_SERVER` headers to the sandbox `validate` endpoint. This token is separate from the business's Government Gateway VAT consent token. The helper returns only a bounded result code, specification version and header-name/error-code diagnostics; it does not return tokens, header values or HMRC free-text messages.

After a real sandbox VAT API request, `requestHmrcVatFraudFeedback` can read HMRC's latest `vat-mtd` endpoint feedback for `WEB_APP_VIA_SERVER`. It reduces returned paths to endpoint types and removes the VRN, token, raw header values and free-text errors. A missing request, missing header, warning or invalid cross-header check cannot produce a green result. A future route must scope any feedback to the owning HMRC application and tenant before exposing it to an operator.

The helper is not connected to an Edge route. No live sandbox call has been made. A valid-format response from HMRC's Test API would not prove header provenance, production acceptance or permission to submit VAT. The verified ingress source port, public hop chain and real product licence evidence remain unresolved. The eventual caller must obtain those values from a trusted tenant-owned path before invoking this helper.

Local checks: `node --test supabase/tests/uk-vat-fraud-validation.test.mjs` passed 6 tests. The validation and feedback cases use injected HTTP responses and synthetic headers. `git diff --check` passed for the helper.

Primary sources: [HMRC Test Fraud Prevention Headers API](https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/txm-fph-validator-api/1.0), [its OpenAPI contract](https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/txm-fph-validator-api/1.0/oas/file), and [application-restricted authorisation](https://developer.service.hmrc.gov.uk/api-documentation/docs/authorisation/application-restricted-endpoints).
