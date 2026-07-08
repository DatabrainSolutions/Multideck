using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SubPlanModule
{
    public Guid SubplanModuleId { get; set; }

    public Guid SubplanModulePlanId { get; set; }

    public string SubplanModuleModuleCode { get; set; } = null!;

    public bool SubplanModuleIsIncluded { get; set; }

    public bool SubplanModuleIsOptionalAddOn { get; set; }

    public string SubplanModuleLimitJson { get; set; } = null!;

    public virtual SysSubmoduleCode SubplanModuleModuleCodeNavigation { get; set; } = null!;

    public virtual SubPlan SubplanModulePlan { get; set; } = null!;
}
