using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmQuoteFollowupResponse
{
    public Guid CrmqfresponseId { get; set; }

    public Guid CrmqfresponseFollowupId { get; set; }

    public Guid? CrmqfresponseAttemptId { get; set; }

    public string CrmqfresponseResponseType { get; set; } = null!;

    public string? CrmqfresponseResponseText { get; set; }

    public Guid? CrmqfresponseCompetitorOrgId { get; set; }

    public string? CrmqfresponseCompetitorNameSnapshot { get; set; }

    public decimal? CrmqfresponsePriceGapAmount { get; set; }

    public int? CrmqfresponseTransitGapDays { get; set; }

    public DateTime CrmqfresponseReceivedAt { get; set; }

    public Guid? CrmqfresponseRecordedBy { get; set; }

    public Guid? CrmqfresponseSourceAiTaskRunId { get; set; }

    public virtual CrmQuoteFollowupAttempt? CrmqfresponseAttempt { get; set; }

    public virtual OrgMaster? CrmqfresponseCompetitorOrg { get; set; }

    public virtual CrmQuoteFollowup CrmqfresponseFollowup { get; set; } = null!;

    public virtual CmpUser? CrmqfresponseRecordedByNavigation { get; set; }

    public virtual AiTaskRun? CrmqfresponseSourceAiTaskRun { get; set; }
}
