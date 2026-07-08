using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceJobComplianceSummary
{
    public Guid? JobId { get; set; }

    public int? JobNumber { get; set; }

    public Guid? JobCustomer { get; set; }

    public string? JobCustomerName { get; set; }

    public int? TcejobScreeningRunCount { get; set; }

    public int? TcejobRiskyRunCount { get; set; }

    public int? TcejobOpenCaseCount { get; set; }

    public int? TcejobActiveHoldCount { get; set; }

    public int? TcejobClassificationCount { get; set; }

    public int? TcejobPreferenceClaimCount { get; set; }

    public int? TcejobOpenChecklistCount { get; set; }

    public int? TcejobOpenCheckItemCount { get; set; }

    public int? TcejobBlockingGateCount { get; set; }

    public decimal? TcejobHighestScreeningScore { get; set; }
}
