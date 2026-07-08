using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmAiinsight
{
    public Guid ClmaiId { get; set; }

    public Guid? ClmaiIncidentId { get; set; }

    public Guid? ClmaiClaimId { get; set; }

    public Guid? ClmaiPolicyId { get; set; }

    public Guid? ClmaiAitaskRunId { get; set; }

    public string ClmaiInsightTypeCode { get; set; } = null!;

    public string ClmaiTitle { get; set; } = null!;

    public string? ClmaiSummary { get; set; }

    public string? ClmaiRecommendation { get; set; }

    public decimal? ClmaiConfidenceScore { get; set; }

    public decimal? ClmaiRiskScore { get; set; }

    public decimal? ClmaiImpactAmount { get; set; }

    public string ClmaiCurrencyCodeSnapshot { get; set; } = null!;

    public bool? ClmaiIsAccepted { get; set; }

    public DateTime? ClmaiReviewedAt { get; set; }

    public Guid? ClmaiReviewedBy { get; set; }

    public Guid? ClmaiActionWorkflowTaskId { get; set; }

    public string ClmaiSourceJson { get; set; } = null!;

    public DateTime ClmaiCreatedAt { get; set; }

    public virtual WorkflowTask? ClmaiActionWorkflowTask { get; set; }

    public virtual AiTaskRun? ClmaiAitaskRun { get; set; }

    public virtual ClmClaim? ClmaiClaim { get; set; }

    public virtual ClmIncident? ClmaiIncident { get; set; }

    public virtual ClmInsurancePolicy? ClmaiPolicy { get; set; }

    public virtual CmpUser? ClmaiReviewedByNavigation { get; set; }
}
