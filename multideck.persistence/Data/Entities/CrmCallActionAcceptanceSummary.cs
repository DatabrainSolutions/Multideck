using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmCallActionAcceptanceSummary
{
    public DateOnly? CrmcallActionPeriodMonth { get; set; }

    public Guid? CrmcallReviewOwnerUserId { get; set; }

    public string? CrmcallReviewOwnerEmail { get; set; }

    public string? CrmcallActionActionTypeCode { get; set; }

    public long? CrmcallActionTotalCount { get; set; }

    public long? CrmcallActionAcceptedCount { get; set; }

    public long? CrmcallActionRejectedCount { get; set; }

    public long? CrmcallActionEditedCount { get; set; }

    public decimal? CrmcallActionAvgConfidence { get; set; }
}
