using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SubEntitlementSummary
{
    public Guid? EntitlementId { get; set; }

    public string? EnvironmentCode { get; set; }

    public string? SubscriptionStatusCode { get; set; }

    public string? ModuleCode { get; set; }

    public string? ModuleName { get; set; }

    public string? EntitlementStatusCode { get; set; }

    public bool? IsEnabled { get; set; }

    public int? UserLimit { get; set; }

    public int? RecordLimit { get; set; }
}
