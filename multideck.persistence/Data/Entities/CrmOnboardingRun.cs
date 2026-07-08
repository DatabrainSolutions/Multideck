using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmOnboardingRun
{
    public Guid CrmonboardRunId { get; set; }

    public Guid CrmonboardRunAccountId { get; set; }

    public Guid? CrmonboardRunOpportunityId { get; set; }

    public Guid? CrmonboardRunPlanId { get; set; }

    public string CrmonboardRunStatusCode { get; set; } = null!;

    public Guid? CrmonboardRunOwnerUserId { get; set; }

    public DateTime? CrmonboardRunStartedAt { get; set; }

    public DateTime? CrmonboardRunTargetCompleteAt { get; set; }

    public DateTime? CrmonboardRunCompletedAt { get; set; }

    public string? CrmonboardRunCustomerSuccessSummary { get; set; }

    public string CrmonboardRunMetadataJson { get; set; } = null!;

    public DateTime CrmonboardRunCreatedAt { get; set; }

    public Guid? CrmonboardRunCreatedBy { get; set; }

    public virtual ICollection<CrmOnboardingTask> CrmOnboardingTasks { get; set; } = new List<CrmOnboardingTask>();

    public virtual CrmAccountProfile CrmonboardRunAccount { get; set; } = null!;

    public virtual CmpUser? CrmonboardRunCreatedByNavigation { get; set; }

    public virtual CrmOpportunity? CrmonboardRunOpportunity { get; set; }

    public virtual CmpUser? CrmonboardRunOwnerUser { get; set; }

    public virtual CrmOnboardingPlan? CrmonboardRunPlan { get; set; }

    public virtual SysCrmonboardingStatus CrmonboardRunStatusCodeNavigation { get; set; } = null!;
}
