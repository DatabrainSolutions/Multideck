using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RptMvpexecutiveOverview
{
    public long? JobMetricCount { get; set; }

    public long? ProfitMetricCount { get; set; }

    public long? WipaccrualMetricCount { get; set; }

    public long? DebtorMetricCount { get; set; }

    public long? SalesMetricCount { get; set; }

    public long? QuoteMetricCount { get; set; }

    public long? WorkflowMetricCount { get; set; }

    public long? TrackingMetricCount { get; set; }

    public long? ComplianceMetricCount { get; set; }

    public DateTime? LastCalculatedAt { get; set; }
}
