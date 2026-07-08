using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmOnboardingPlan
{
    public Guid CrmonboardPlanId { get; set; }

    public string CrmonboardPlanCode { get; set; } = null!;

    public string CrmonboardPlanName { get; set; } = null!;

    public Guid? CrmonboardPlanOrgOfficeId { get; set; }

    public string? CrmonboardPlanModeCode { get; set; }

    public string? CrmonboardPlanServiceCode { get; set; }

    public bool CrmonboardPlanIsDefault { get; set; }

    public bool CrmonboardPlanIsActive { get; set; }

    public string CrmonboardPlanMetadataJson { get; set; } = null!;

    public DateTime CrmonboardPlanCreatedAt { get; set; }

    public virtual ICollection<CrmOnboardingMilestone> CrmOnboardingMilestones { get; set; } = new List<CrmOnboardingMilestone>();

    public virtual ICollection<CrmOnboardingRun> CrmOnboardingRuns { get; set; } = new List<CrmOnboardingRun>();

    public virtual CmpOffice? CrmonboardPlanOrgOffice { get; set; }
}
