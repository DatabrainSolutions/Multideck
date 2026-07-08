using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmSalesPitchRecommendation
{
    public Guid CrmpitchRecId { get; set; }

    public Guid? CrmpitchRecAnalysisId { get; set; }

    public string CrmpitchRecStatusCode { get; set; } = null!;

    public string CrmpitchRecTitle { get; set; } = null!;

    public string CrmpitchRecRecommendationText { get; set; } = null!;

    public string? CrmpitchRecObjectionHandled { get; set; }

    public string? CrmpitchRecSuggestedPhrase { get; set; }

    public string? CrmpitchRecModeCode { get; set; }

    public string? CrmpitchRecTradeLane { get; set; }

    public decimal? CrmpitchRecConfidenceScore { get; set; }

    public DateTime? CrmpitchRecApprovedAt { get; set; }

    public Guid? CrmpitchRecApprovedBy { get; set; }

    public DateTime CrmpitchRecCreatedAt { get; set; }

    public virtual CrmSalesPitchAnalysis? CrmpitchRecAnalysis { get; set; }

    public virtual CmpUser? CrmpitchRecApprovedByNavigation { get; set; }

    public virtual SysCrmpitchRecommendationStatus CrmpitchRecStatusCodeNavigation { get; set; } = null!;
}
