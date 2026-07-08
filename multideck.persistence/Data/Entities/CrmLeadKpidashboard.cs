using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmLeadKpidashboard
{
    public Guid? CrmleadKpiId { get; set; }

    public Guid? CrmleadKpiLeadId { get; set; }

    public string? CrmleadCompanyName { get; set; }

    public string? CrmleadPersonName { get; set; }

    public Guid? CrmleadOwnerUserId { get; set; }

    public DateOnly? CrmleadKpiAsOfDate { get; set; }

    public decimal? CrmleadKpiScore { get; set; }

    public decimal? CrmleadKpiEngagementScore { get; set; }

    public decimal? CrmleadKpiResponseScore { get; set; }

    public decimal? CrmleadKpiFitScore { get; set; }

    public decimal? CrmleadKpiConversionProbability { get; set; }

    public int? CrmleadKpiDaysSinceLastInteraction { get; set; }

    public string? CrmleadKpiRecommendedActionCode { get; set; }

    public string? CrmleadKpiAisummary { get; set; }

    public DateTime? CrmleadKpiCalculatedAt { get; set; }
}
