using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmSalesPitchAnalysis
{
    public Guid CrmpitchAnalysisId { get; set; }

    public string CrmpitchAnalysisTargetScope { get; set; } = null!;

    public Guid? CrmpitchAnalysisUserId { get; set; }

    public Guid? CrmpitchAnalysisAccountId { get; set; }

    public string? CrmpitchAnalysisModeCode { get; set; }

    public string? CrmpitchAnalysisTradeLane { get; set; }

    public DateOnly? CrmpitchAnalysisPeriodStartDate { get; set; }

    public DateOnly? CrmpitchAnalysisPeriodEndDate { get; set; }

    public string? CrmpitchAnalysisSuccessPatterns { get; set; }

    public string? CrmpitchAnalysisObjectionPatterns { get; set; }

    public string? CrmpitchAnalysisWhatWorks { get; set; }

    public string? CrmpitchAnalysisWhatToImprove { get; set; }

    public Guid? CrmpitchAnalysisAitaskRunId { get; set; }

    public DateTime CrmpitchAnalysisCreatedAt { get; set; }

    public virtual ICollection<CrmSalesPitchRecommendation> CrmSalesPitchRecommendations { get; set; } = new List<CrmSalesPitchRecommendation>();

    public virtual CrmAccountProfile? CrmpitchAnalysisAccount { get; set; }

    public virtual AiTaskRun? CrmpitchAnalysisAitaskRun { get; set; }

    public virtual CmpUser? CrmpitchAnalysisUser { get; set; }
}
