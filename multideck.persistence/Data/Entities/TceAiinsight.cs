using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceAiinsight
{
    public Guid TceaiId { get; set; }

    public Guid? TceaiRunId { get; set; }

    public Guid? TceaiSubjectId { get; set; }

    public Guid? TceaiMatchId { get; set; }

    public Guid? TceaiCaseId { get; set; }

    public Guid? TceaiClassificationId { get; set; }

    public Guid? TceaiPreferenceClaimId { get; set; }

    public Guid? TceaiLicenseId { get; set; }

    public Guid? TceaiChecklistId { get; set; }

    public Guid? TceaiCheckItemId { get; set; }

    public Guid? TceaiGateId { get; set; }

    public Guid? TceaiEventId { get; set; }

    public Guid? TceaiAitaskRunId { get; set; }

    public string TceaiInsightTypeCode { get; set; } = null!;

    public string TceaiTitle { get; set; } = null!;

    public string? TceaiSummary { get; set; }

    public string? TceaiRecommendation { get; set; }

    public decimal? TceaiConfidenceScore { get; set; }

    public string? TceaiRiskLevelCode { get; set; }

    public bool? TceaiIsAccepted { get; set; }

    public DateTime? TceaiReviewedAt { get; set; }

    public Guid? TceaiReviewedBy { get; set; }

    public Guid? TceaiActionWorkflowTaskId { get; set; }

    public string TceaiSourceJson { get; set; } = null!;

    public DateTime TceaiCreatedAt { get; set; }

    public virtual WorkflowTask? TceaiActionWorkflowTask { get; set; }

    public virtual AiTaskRun? TceaiAitaskRun { get; set; }

    public virtual TceComplianceCase? TceaiCase { get; set; }

    public virtual TceComplianceCheckItem? TceaiCheckItem { get; set; }

    public virtual TceComplianceChecklist? TceaiChecklist { get; set; }

    public virtual TceHsclassification? TceaiClassification { get; set; }

    public virtual TceIntegrationEvent? TceaiEvent { get; set; }

    public virtual TceReleaseGate? TceaiGate { get; set; }

    public virtual TceLicense? TceaiLicense { get; set; }

    public virtual TceScreeningMatch? TceaiMatch { get; set; }

    public virtual TcePreferenceClaim? TceaiPreferenceClaim { get; set; }

    public virtual CmpUser? TceaiReviewedByNavigation { get; set; }

    public virtual SysTceriskLevel? TceaiRiskLevelCodeNavigation { get; set; }

    public virtual TceScreeningRun? TceaiRun { get; set; }

    public virtual TceScreeningSubject? TceaiSubject { get; set; }
}
