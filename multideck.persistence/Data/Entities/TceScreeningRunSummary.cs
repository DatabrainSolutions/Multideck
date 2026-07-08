using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceScreeningRunSummary
{
    public Guid? TcerunId { get; set; }

    public string? TcerunNumber { get; set; }

    public string? TcerunRunTypeCode { get; set; }

    public string? TcerunStatusCode { get; set; }

    public Guid? TcerunJobId { get; set; }

    public int? JobNumber { get; set; }

    public Guid? TcerunCustomerOrgId { get; set; }

    public string? TcerunCustomerName { get; set; }

    public Guid? TcerunOrgOfficeId { get; set; }

    public DateTime? TcerunTriggeredAt { get; set; }

    public DateTime? TcerunCompletedAt { get; set; }

    public int? TcerunSubjectCount { get; set; }

    public int? TcerunSubjectRows { get; set; }

    public int? TcerunMatchRows { get; set; }

    public int? TcerunOpenCases { get; set; }

    public decimal? TcerunHighestScore { get; set; }

    public string? TcerunHighestRiskLevelCode { get; set; }
}
