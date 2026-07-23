using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCreditStopRecommendationSummary
{
    public Guid? FinstopRecId { get; set; }

    public Guid? FinstopRecCustomerOrgId { get; set; }

    public string? FinstopRecCustomerName { get; set; }

    public Guid? FinstopRecJobId { get; set; }

    public string? FinstopRecActionCode { get; set; }

    public string? FinstopRecSeverityCode { get; set; }

    public string? FinstopRecStatusCode { get; set; }

    public decimal? FinstopRecCurrentExposureAmount { get; set; }

    public decimal? FinstopRecOverdueAmount { get; set; }

    public decimal? FinstopRecCreditLimitAmount { get; set; }

    public string? FinstopRecReason { get; set; }

    public DateTime? FinstopRecRecommendedAt { get; set; }
}
