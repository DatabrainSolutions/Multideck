using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmMarketFeedbackTheme
{
    public Guid CrmfeedbackThemeId { get; set; }

    public string CrmfeedbackThemeCategoryCode { get; set; } = null!;

    public string CrmfeedbackThemeTitle { get; set; } = null!;

    public string? CrmfeedbackThemeSummary { get; set; }

    public string? CrmfeedbackThemeModeCode { get; set; }

    public string? CrmfeedbackThemeTradeLane { get; set; }

    public DateOnly? CrmfeedbackThemePeriodStartDate { get; set; }

    public DateOnly? CrmfeedbackThemePeriodEndDate { get; set; }

    public int CrmfeedbackThemeFeedbackCount { get; set; }

    public decimal? CrmfeedbackThemeAverageSentimentScore { get; set; }

    public decimal? CrmfeedbackThemeImpactScore { get; set; }

    public string? CrmfeedbackThemeRecommendedPitchChange { get; set; }

    public Guid? CrmfeedbackThemeAitaskRunId { get; set; }

    public DateTime CrmfeedbackThemeCreatedAt { get; set; }

    public virtual ICollection<CrmMarketFeedbackEvidence> CrmMarketFeedbackEvidences { get; set; } = new List<CrmMarketFeedbackEvidence>();

    public virtual AiTaskRun? CrmfeedbackThemeAitaskRun { get; set; }

    public virtual SysCrmfeedbackCategory CrmfeedbackThemeCategoryCodeNavigation { get; set; } = null!;
}
