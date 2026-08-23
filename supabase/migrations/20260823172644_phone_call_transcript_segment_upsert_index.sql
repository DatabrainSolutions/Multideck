-- PostgREST can only infer an ON CONFLICT target from an unconditional unique
-- index or constraint. The earlier partial index protected the same non-null
-- pairs but could not be used by transcript upserts, leaving verified provider
-- events retryable before caller identity and call reason were persisted.
-- PostgreSQL's default NULLS DISTINCT behaviour still allows legacy rows whose
-- provider provenance is unavailable.
drop index if exists public."UX_Comm_CallTranscriptSegments_source_segment";

create unique index "UX_Comm_CallTranscriptSegments_source_segment"
  on public."Comm_CallTranscriptSegments" (
    "CommCallSeg_SourceLegID",
    "CommCallSeg_ProviderSegmentID"
  );
