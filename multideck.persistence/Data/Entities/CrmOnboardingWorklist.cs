using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmOnboardingWorklist
{
    public Guid? CrmonboardRunId { get; set; }

    public Guid? CrmonboardRunAccountId { get; set; }

    public string? CrmonboardRunAccountName { get; set; }

    public Guid? CrmonboardRunOpportunityId { get; set; }

    public string? CrmopptyName { get; set; }

    public string? CrmonboardRunStatusCode { get; set; }

    public string? CrmonboardStatusName { get; set; }

    public Guid? CrmonboardRunOwnerUserId { get; set; }

    public string? CrmonboardRunOwnerEmail { get; set; }

    public DateTime? CrmonboardRunStartedAt { get; set; }

    public DateTime? CrmonboardRunTargetCompleteAt { get; set; }

    public long? CrmonboardRunTaskCount { get; set; }

    public long? CrmonboardRunCompletedTaskCount { get; set; }

    public DateTime? CrmonboardRunNextTaskDueAt { get; set; }
}
