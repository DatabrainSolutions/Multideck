using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmSalesRepKpidashboard
{
    public Guid? CrmsalesRepKpiId { get; set; }

    public Guid? CrmsalesRepKpiUserId { get; set; }

    public string? UserEmail { get; set; }

    public DateOnly? CrmsalesRepKpiPeriodStartDate { get; set; }

    public DateOnly? CrmsalesRepKpiPeriodEndDate { get; set; }

    public int? CrmsalesRepKpiNewLeads { get; set; }

    public decimal? CrmsalesRepKpiFirstResponseAvgMinutes { get; set; }

    public int? CrmsalesRepKpiQualifiedLeads { get; set; }

    public int? CrmsalesRepKpiOpportunitiesCreated { get; set; }

    public int? CrmsalesRepKpiQuotesSent { get; set; }

    public decimal? CrmsalesRepKpiQuoteFollowupSlacompliantPct { get; set; }

    public int? CrmsalesRepKpiWonOpportunities { get; set; }

    public int? CrmsalesRepKpiLostOpportunities { get; set; }

    public decimal? CrmsalesRepKpiWinRatePct { get; set; }

    public decimal? CrmsalesRepKpiExpectedValueAmount { get; set; }

    public decimal? CrmsalesRepKpiWonValueAmount { get; set; }

    public string? CrmsalesRepKpiCurrencyCode { get; set; }

    public string? CrmsalesRepKpiAisummary { get; set; }

    public DateTime? CrmsalesRepKpiCalculatedAt { get; set; }
}
