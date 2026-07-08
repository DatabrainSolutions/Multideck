using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmTask
{
    public Guid CrmtaskId { get; set; }

    public Guid CrmtaskWorkflowTaskId { get; set; }

    public Guid? CrmtaskAccountId { get; set; }

    public Guid? CrmtaskLeadId { get; set; }

    public Guid? CrmtaskOpportunityId { get; set; }

    public Guid? CrmtaskQuoteFollowupId { get; set; }

    public Guid? CrmtaskCallReviewId { get; set; }

    public string? CrmtaskSalesContext { get; set; }

    public DateTime CrmtaskCreatedAt { get; set; }

    public virtual CrmAccountProfile? CrmtaskAccount { get; set; }

    public virtual CrmCallReview? CrmtaskCallReview { get; set; }

    public virtual CrmLead? CrmtaskLead { get; set; }

    public virtual CrmOpportunity? CrmtaskOpportunity { get; set; }

    public virtual CrmQuoteFollowup? CrmtaskQuoteFollowup { get; set; }

    public virtual WorkflowTask CrmtaskWorkflowTask { get; set; } = null!;
}
