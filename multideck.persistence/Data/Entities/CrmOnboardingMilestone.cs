using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmOnboardingMilestone
{
    public Guid CrmonboardMilestoneId { get; set; }

    public Guid CrmonboardMilestonePlanId { get; set; }

    public string CrmonboardMilestoneCode { get; set; } = null!;

    public string CrmonboardMilestoneName { get; set; } = null!;

    public string? CrmonboardMilestoneDescription { get; set; }

    public int? CrmonboardMilestoneDefaultDueOffsetDays { get; set; }

    public int CrmonboardMilestoneSortOrder { get; set; }

    public bool CrmonboardMilestoneIsRequired { get; set; }

    public string CrmonboardMilestoneMetadataJson { get; set; } = null!;

    public virtual ICollection<CrmOnboardingTask> CrmOnboardingTasks { get; set; } = new List<CrmOnboardingTask>();

    public virtual CrmOnboardingPlan CrmonboardMilestonePlan { get; set; } = null!;
}
