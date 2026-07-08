using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmNextBestActionQueue
{
    public Guid? CrmnbaId { get; set; }

    public string? CrmnbaActionTypeCode { get; set; }

    public string? CrmnbatypeName { get; set; }

    public string? CrmnbaTitle { get; set; }

    public string? CrmnbaReason { get; set; }

    public Guid? CrmnbaAssignedUserId { get; set; }

    public string? CrmnbaAssignedUserEmail { get; set; }

    public Guid? CrmnbaAccountId { get; set; }

    public string? CrmnbaAccountName { get; set; }

    public Guid? CrmnbaLeadId { get; set; }

    public Guid? CrmnbaOpportunityId { get; set; }

    public Guid? CrmnbaQuoteFollowupId { get; set; }

    public DateTime? CrmnbaDueAt { get; set; }

    public decimal? CrmnbaConfidenceScore { get; set; }

    public string? CrmnbaStatus { get; set; }

    public Guid? CrmnbaWorkflowTaskId { get; set; }

    public DateTime? CrmnbaCreatedAt { get; set; }
}
