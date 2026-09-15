import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2";
import { HttpError } from "./backend.ts";
import { calculationHistoryCursor } from "./customs-calculation-history.mts";
import { extractProviderTaxEvidence } from "./customs-provider-tax-evidence.mts";
import { confirmProviderXmlCurrencies } from "./customs-provider-xml-currency.ts";
import { retainedSubmissionCalculationLink, retainedCalculationMatches } from "./customs-submission-calculation-link.mts";
import { compareFinalProviderAssessment } from "./customs-provider-assessment.mts";
import type { CalculationResult } from "./customs-duty-calculation.mts";

/** Call only after the existing declaration read authorisation and import check.
 * Return a narrow projection, never raw provider XML, bank IDs or request data. */
export async function providerEvidenceHistory(admin: SupabaseClient, declarationId: string, before?: string) {
  let filter: string | undefined;
  if (before) {
    try {
      const { createdAt, id } = calculationHistoryCursor(before);
      filter = `recorded_at.lt.${createdAt},and(recorded_at.eq.${createdAt},id.lt.${id})`;
    } catch { throw new HttpError(422, "The evidence position is invalid. Reload provider evidence."); }
  }
  let query = admin.from("Customs_ProviderResponseHistory")
    .select("id,submission_id,recorded_at,source_updated_at,capture_kind,response_payload,declaration_snapshot")
    .eq("declaration_id", declarationId)
    .order("recorded_at", { ascending: false }).order("id", { ascending: false }).limit(6);
  if (filter) query = query.or(filter);
  const { data, error } = await query;
  if (error) throw new HttpError(503, "Provider evidence could not be loaded. Existing calculations are unchanged; try again.");
  const page = (data ?? []).slice(0, 5), last = page.at(-1);
  const calculationIds = [...new Set(page.map(row => retainedSubmissionCalculationLink(row.declaration_snapshot)?.calculationId).filter((id): id is string => !!id))];
  const calculations = calculationIds.length ? await admin.from("Customs_CalculationAudit")
    .select("id,declaration_id,kind,created_at,draft_snapshot,evidence")
    .eq("declaration_id", declarationId).eq("kind", "calculation").in("id", calculationIds).limit(5) : { data: [], error: null };
  if (calculations.error) throw new HttpError(503, "The calculation linked to this submission could not be loaded. Try again; no figures have changed.");
  return {
    history: page.map(row => {
      const snapshot = row.declaration_snapshot;
      const matchesDeclaration = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
        && snapshot.declaration?.id === declarationId;
      const evidence = matchesDeclaration ? confirmProviderXmlCurrencies(row.response_payload, extractProviderTaxEvidence(row.response_payload, snapshot)) : {
        notices: [], issues: ["The retained snapshot is missing or names a different declaration. Tax evidence cannot be attributed safely."], reconciliationReady: false as const,
      };
      const saved = calculations.data?.find(candidate => retainedCalculationMatches(snapshot, candidate, declarationId));
      const comparisons = evidence.notices.map(notice => {
        if (!saved || !saved.evidence?.result) return { notificationId: notice.notificationId, status: "needs-information" as const,
          issues: ["No verified calculation is linked to this submitted revision."], comparison: null, totalsBasis: null };
        try {
          return { notificationId: notice.notificationId, ...compareFinalProviderAssessment(notice, saved.evidence.result as CalculationResult) };
        } catch {
          return { notificationId: notice.notificationId, status: "needs-information" as const, issues: ["The retained calculation cannot be compared safely. Review its original evidence."], comparison: null, totalsBasis: null };
        }
      });
      return {
      id: row.id as string, submissionId: row.submission_id as string,
      recordedAt: row.recorded_at as string, sourceUpdatedAt: row.source_updated_at as string | null,
      captureKind: row.capture_kind as "observed" | "existing-snapshot",
      calculationLink: matchesDeclaration ? retainedSubmissionCalculationLink(snapshot) : null,
      comparisons,
      ...evidence,
    };
    }),
    nextCursor: (data?.length ?? 0) > 5 && last ? `${last.recorded_at}|${last.id}` : null,
  };
}
