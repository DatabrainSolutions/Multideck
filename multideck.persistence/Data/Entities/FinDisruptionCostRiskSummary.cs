using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDisruptionCostRiskSummary
{
    public Guid? FindisruptId { get; set; }

    public Guid? FindisruptCustomerOrgId { get; set; }

    public string? FindisruptCustomerName { get; set; }

    public Guid? FindisruptJobId { get; set; }

    public string? FindisruptSeverityCode { get; set; }

    public decimal? FindisruptPaymentRequiredAmount { get; set; }

    public string? FindisruptDisruptionDescription { get; set; }

    public string? FindisruptRecommendedActionCode { get; set; }

    public decimal? FindisruptLocalAdditionalCostRisk { get; set; }

    public int? FindisruptAdditionalCostRiskCount { get; set; }
}
