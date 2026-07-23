using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinReconciliationItem
{
    public Guid FinreconId { get; set; }

    public string FinreconLocalTable { get; set; } = null!;

    public Guid FinreconLocalId { get; set; }

    public string? FinreconExternalProviderCode { get; set; }

    public string? FinreconExternalObjectType { get; set; }

    public string? FinreconExternalId { get; set; }

    public string FinreconStatusCode { get; set; } = null!;

    public string FinreconSeverityCode { get; set; } = null!;

    public string FinreconTitle { get; set; } = null!;

    public string? FinreconDescription { get; set; }

    public string FinreconLocalValueJson { get; set; } = null!;

    public string FinreconExternalValueJson { get; set; } = null!;

    public DateTime FinreconCreatedAt { get; set; }

    public DateTime? FinreconResolvedAt { get; set; }

    public virtual SysFinanceInsightSeverity FinreconSeverityCodeNavigation { get; set; } = null!;
}
