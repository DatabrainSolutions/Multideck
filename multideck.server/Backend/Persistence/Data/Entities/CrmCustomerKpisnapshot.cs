using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmCustomerKpisnapshot
{
    public Guid CrmcustomerKpiId { get; set; }

    public Guid CrmcustomerKpiOrgId { get; set; }

    public DateOnly CrmcustomerKpiPeriodStartDate { get; set; }

    public DateOnly CrmcustomerKpiPeriodEndDate { get; set; }

    public int CrmcustomerKpiQuotesRequested { get; set; }

    public int CrmcustomerKpiQuotesWon { get; set; }

    public int CrmcustomerKpiJobsCreated { get; set; }

    public decimal? CrmcustomerKpiRevenueAmount { get; set; }

    public decimal? CrmcustomerKpiMarginAmount { get; set; }

    public string? CrmcustomerKpiCurrencyCode { get; set; }

    public decimal? CrmcustomerKpiAvgResponseHours { get; set; }

    public decimal? CrmcustomerKpiSentimentScore { get; set; }

    public decimal? CrmcustomerKpiChurnRiskScore { get; set; }

    public decimal? CrmcustomerKpiGrowthScore { get; set; }

    public string? CrmcustomerKpiAisummary { get; set; }

    public DateTime CrmcustomerKpiCalculatedAt { get; set; }

    public virtual OrgMaster CrmcustomerKpiOrg { get; set; } = null!;
}
