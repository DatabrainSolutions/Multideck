using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmLeadKpisnapshot
{
    public Guid CrmleadKpiId { get; set; }

    public Guid CrmleadKpiLeadId { get; set; }

    public DateOnly CrmleadKpiAsOfDate { get; set; }

    public decimal? CrmleadKpiScore { get; set; }

    public decimal? CrmleadKpiEngagementScore { get; set; }

    public decimal? CrmleadKpiResponseScore { get; set; }

    public decimal? CrmleadKpiFitScore { get; set; }

    public decimal? CrmleadKpiConversionProbability { get; set; }

    public int? CrmleadKpiDaysSinceLastInteraction { get; set; }

    public string? CrmleadKpiRecommendedActionCode { get; set; }

    public string? CrmleadKpiAisummary { get; set; }

    public DateTime CrmleadKpiCalculatedAt { get; set; }

    public virtual CrmLead CrmleadKpiLead { get; set; } = null!;

    public virtual SysCrmnextBestActionType? CrmleadKpiRecommendedActionCodeNavigation { get; set; }
}
