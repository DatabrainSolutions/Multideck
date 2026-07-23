using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmCallEntityLink
{
    public Guid CrmcallEntityId { get; set; }

    public Guid CrmcallEntityCallReviewId { get; set; }

    public string CrmcallEntityEntityType { get; set; } = null!;

    public string CrmcallEntityEntityValue { get; set; } = null!;

    public string? CrmcallEntityTargetTable { get; set; }

    public Guid? CrmcallEntityTargetId { get; set; }

    public decimal? CrmcallEntityConfidenceScore { get; set; }

    public bool CrmcallEntityIsConfirmed { get; set; }

    public DateTime CrmcallEntityCreatedAt { get; set; }

    public virtual CrmCallReview CrmcallEntityCallReview { get; set; } = null!;
}
