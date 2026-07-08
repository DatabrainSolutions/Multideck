using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RptMvpmetricLatest
{
    public string? MetricCode { get; set; }

    public string? MetricName { get; set; }

    public string? CategoryCode { get; set; }

    public string? ModuleCode { get; set; }

    public string? Unit { get; set; }

    public Guid? OrgOfficeId { get; set; }

    public Guid? LegalEntityId { get; set; }

    public Guid? BrandId { get; set; }

    public DateOnly? PeriodStartDate { get; set; }

    public DateOnly? PeriodEndDate { get; set; }

    public decimal? Value { get; set; }

    public decimal? TargetValue { get; set; }

    public string? StatusCode { get; set; }

    public DateTime? CalculatedAt { get; set; }
}
