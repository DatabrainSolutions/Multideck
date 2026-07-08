using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmSalesPitchImprovementQueue
{
    public Guid? CrmpitchRecId { get; set; }

    public string? CrmpitchRecStatusCode { get; set; }

    public string? CrmpitchRecTitle { get; set; }

    public string? CrmpitchRecRecommendationText { get; set; }

    public string? CrmpitchRecObjectionHandled { get; set; }

    public string? CrmpitchRecSuggestedPhrase { get; set; }

    public string? CrmpitchRecModeCode { get; set; }

    public string? CrmpitchRecTradeLane { get; set; }

    public decimal? CrmpitchRecConfidenceScore { get; set; }

    public string? CrmpitchAnalysisTargetScope { get; set; }

    public Guid? CrmpitchAnalysisUserId { get; set; }

    public Guid? CrmpitchAnalysisAccountId { get; set; }

    public DateTime? CrmpitchRecCreatedAt { get; set; }
}
