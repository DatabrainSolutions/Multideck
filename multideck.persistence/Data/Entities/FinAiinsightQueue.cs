using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinAiinsightQueue
{
    public Guid? FinaiinsightId { get; set; }

    public string? FinaiinsightInsightTypeCode { get; set; }

    public string? FinaiinsightStatusCode { get; set; }

    public string? FinaiinsightSeverityCode { get; set; }

    public string? FinaiinsightTitle { get; set; }

    public Guid? FinaiinsightCustomerOrgId { get; set; }

    public string? FinaiinsightCustomerName { get; set; }

    public Guid? FinaiinsightJobId { get; set; }

    public Guid? FinaiinsightDocumentId { get; set; }

    public decimal? FinaiinsightAmountAtRisk { get; set; }

    public decimal? FinaiinsightAdditionalCostRiskAmount { get; set; }

    public decimal? FinaiinsightConfidenceScore { get; set; }

    public decimal? FinaiinsightRiskScore { get; set; }

    public DateTime? FinaiinsightCreatedAt { get; set; }

    public int? FinaiinsightActionCount { get; set; }
}
