using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmNextBestAction
{
    public Guid CrmnbaId { get; set; }

    public string CrmnbaActionTypeCode { get; set; } = null!;

    public Guid? CrmnbaAiinsightId { get; set; }

    public Guid? CrmnbaAccountId { get; set; }

    public Guid? CrmnbaLeadId { get; set; }

    public Guid? CrmnbaOpportunityId { get; set; }

    public Guid? CrmnbaQuoteFollowupId { get; set; }

    public Guid? CrmnbaAssignedUserId { get; set; }

    public string CrmnbaTitle { get; set; } = null!;

    public string? CrmnbaReason { get; set; }

    public DateTime? CrmnbaDueAt { get; set; }

    public decimal? CrmnbaConfidenceScore { get; set; }

    public string CrmnbaStatus { get; set; } = null!;

    public Guid? CrmnbaWorkflowTaskId { get; set; }

    public DateTime CrmnbaCreatedAt { get; set; }

    public DateTime? CrmnbaDecidedAt { get; set; }

    public Guid? CrmnbaDecidedBy { get; set; }

    public virtual CrmAccountProfile? CrmnbaAccount { get; set; }

    public virtual SysCrmnextBestActionType CrmnbaActionTypeCodeNavigation { get; set; } = null!;

    public virtual CrmAiinsight? CrmnbaAiinsight { get; set; }

    public virtual CmpUser? CrmnbaAssignedUser { get; set; }

    public virtual CmpUser? CrmnbaDecidedByNavigation { get; set; }

    public virtual CrmLead? CrmnbaLead { get; set; }

    public virtual CrmOpportunity? CrmnbaOpportunity { get; set; }

    public virtual CrmQuoteFollowup? CrmnbaQuoteFollowup { get; set; }

    public virtual WorkflowTask? CrmnbaWorkflowTask { get; set; }
}
