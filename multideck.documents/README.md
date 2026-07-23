# Multideck document storage

This project owns binary document storage only. Business modules remain responsible for
authorisation, workflow status and their own domain records. The API server records every
uploaded object in `DOC_StoredObjects` through `IDocumentObjectService`.

## Storage layout

All Supabase Storage buckets are private. Concerns are separated into configurable buckets:

- `general` and `jobs` -> `multideck-documents`
- `warehouse` -> `multideck-warehouse`
- `customs` -> `multideck-customs`
- `finance` -> `multideck-finance`
- `communications` -> `multideck-communications`
- `generated` -> `multideck-generated`
- `processing` -> `multideck-processing`

Object paths use deterministic virtual-directory prefixes:

```text
v1/{environment}/{organisation-or-shared}/{concern}/{aggregate-type}/{aggregate-id}/{yyyy}/{MM}/{document-id}.{ext}
```

The original filename is not used as an object path. It is retained in PostgreSQL and supplied
as the download filename when a signed URL is generated. This avoids leaking filenames into
paths and prevents renames from moving objects.

The existing `DOCStoredObject_Container` and `DOCStoredObject_BlobName` database column names are
retained for compatibility. They contain the Supabase bucket and object path respectively.

## Access model

- Uploads pass through the API so it can authorise, validate, hash and audit them.
- Downloads use short-lived, read-only Supabase signed URLs after the API authorises access.
- Signed URLs are bearer credentials and must not be persisted or logged.
- `DOC_StoredObjects` has RLS enabled with no direct authenticated policies. Document access is
  deliberately mediated by business services, where order/job/customer scope is known.
- The API uses a server-only Supabase secret key. It must never be exposed to the client.

The configured private buckets are created on the first upload if they do not already exist.

## Configuration

The storage adapter reuses `Supabase:Url` and prefers the current `Supabase:SecretKey`. It also
accepts the legacy `Supabase:ServiceRoleKey`. A document-specific URL or key can be supplied as
`Documents:Supabase:Url` and `Documents:Supabase:ApiKey`.

Keep secrets out of `appsettings.json`. For local development, use .NET user-secrets:

```bash
dotnet user-secrets --project multideck.server set "Documents:Supabase:ApiKey" "sb_secret_..."
```

Bucket mappings, the environment prefix and the signed-link lifetime live under
`Documents:Supabase`.
