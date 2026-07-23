using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceComplianceDashboard
{
    public Guid? TcerunOrgOfficeId { get; set; }

    public string? TcerunRunTypeCode { get; set; }

    public string? TcerunStatusCode { get; set; }

    public string? TcerunHighestRiskLevelCode { get; set; }

    public DateOnly? TceDay { get; set; }

    public int? TceRunCount { get; set; }

    public int? TceSubjectCount { get; set; }

    public int? TceMatchCount { get; set; }

    public int? TceCaseCount { get; set; }

    public int? TceHoldCount { get; set; }

    public decimal? TceMaxScore { get; set; }
}
