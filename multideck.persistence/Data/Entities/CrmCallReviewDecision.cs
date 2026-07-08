using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmCallReviewDecision
{
    public Guid CrmcallDecisionId { get; set; }

    public Guid CrmcallDecisionCallReviewId { get; set; }

    public Guid? CrmcallDecisionActionCandidateId { get; set; }

    public string CrmcallDecisionDecision { get; set; } = null!;

    public string? CrmcallDecisionOriginalText { get; set; }

    public string? CrmcallDecisionEditedText { get; set; }

    public string? CrmcallDecisionReason { get; set; }

    public DateTime CrmcallDecisionDecidedAt { get; set; }

    public Guid? CrmcallDecisionDecidedBy { get; set; }

    public virtual CrmCallActionCandidate? CrmcallDecisionActionCandidate { get; set; }

    public virtual CrmCallReview CrmcallDecisionCallReview { get; set; } = null!;

    public virtual CmpUser? CrmcallDecisionDecidedByNavigation { get; set; }
}
