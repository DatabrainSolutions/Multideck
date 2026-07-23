using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmQuoteFollowupAiinsight
{
    public Guid CrmqfaiId { get; set; }

    public Guid CrmqfaiFollowupId { get; set; }

    public string CrmqfaiAiinsightTypeCode { get; set; } = null!;

    public Guid? CrmqfaiAitaskRunId { get; set; }

    public string CrmqfaiTitle { get; set; } = null!;

    public string? CrmqfaiSummary { get; set; }

    public string? CrmqfaiRecommendedActionCode { get; set; }

    public decimal? CrmqfaiConfidenceScore { get; set; }

    public decimal? CrmqfaiRiskScore { get; set; }

    public string CrmqfaiStatusCode { get; set; } = null!;

    public string CrmqfaiEvidenceJson { get; set; } = null!;

    public DateTime CrmqfaiCreatedAt { get; set; }

    public DateTime? CrmqfaiReviewedAt { get; set; }

    public Guid? CrmqfaiReviewedBy { get; set; }

    public virtual SysCrminsightType CrmqfaiAiinsightTypeCodeNavigation { get; set; } = null!;

    public virtual AiTaskRun? CrmqfaiAitaskRun { get; set; }

    public virtual CrmQuoteFollowup CrmqfaiFollowup { get; set; } = null!;

    public virtual SysCrmnextBestActionType? CrmqfaiRecommendedActionCodeNavigation { get; set; }

    public virtual CmpUser? CrmqfaiReviewedByNavigation { get; set; }

    public virtual SysCrminsightStatus CrmqfaiStatusCodeNavigation { get; set; } = null!;
}
