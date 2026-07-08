using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmMarketFeedbackSummary
{
    public string? CrmfeedbackCategoryCode { get; set; }

    public string? CrmfeedbackCategoryName { get; set; }

    public string? CrmfeedbackModeCode { get; set; }

    public string? CrmfeedbackTradeLane { get; set; }

    public DateOnly? CrmfeedbackPeriodMonth { get; set; }

    public long? CrmfeedbackCount { get; set; }

    public long? CrmfeedbackActionableCount { get; set; }

    public decimal? CrmfeedbackAvgSentimentScore { get; set; }

    public decimal? CrmfeedbackAvgImpactScore { get; set; }

    public decimal? CrmfeedbackAvgConfidenceScore { get; set; }
}
