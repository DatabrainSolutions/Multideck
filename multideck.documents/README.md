# Multideck document storage

This project owns binary document storage only. Business modules remain responsible for
authorisation, workflow status and their own domain records. The API server records every
uploaded blob in `DOC_StoredObjects` through `IDocumentObjectService`.

## Storage layout

All containers are private. Concerns are separated into configurable containers:

- `general` and `jobs` -> `multideck-documents`
- `warehouse` -> `multideck-warehouse`
- `customs` -> `multideck-customs`
- `finance` -> `multideck-finance`
- `communications` -> `multideck-communications`
- `generated` -> `multideck-generated`
- `processing` -> `multideck-processing`

Blob names use deterministic virtual-directory prefixes:

```text
v1/{environment}/{organisation-or-shared}/{concern}/{aggregate-type}/{aggregate-id}/{yyyy}/{MM}/{document-id}.{ext}
```

The original filename is not used as an object key. It is retained in PostgreSQL and supplied
as Content-Disposition when a download link is generated. This avoids leaking filenames into
paths and prevents renames from moving blobs.

## Access model

- Uploads pass through the API so it can authorise, validate, hash and audit them.
- Downloads use short-lived, HTTPS-only, read-only SAS URLs after the API authorises access.
- SAS URLs are bearer credentials and must not be persisted or logged.
- `DOC_StoredObjects` has RLS enabled with no direct authenticated policies. Document access is
  deliberately mediated by business services, where order/job/customer scope is known.

For local development, set `Documents:Azure:ConnectionString` with .NET user-secrets. Production
should inject configuration from a secret store and move to managed identity/user-delegation SAS
when the Azure hosting identity is available.
