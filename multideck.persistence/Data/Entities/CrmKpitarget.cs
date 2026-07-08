using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmKpitarget
{
    public Guid CrmkpitargetId { get; set; }

    public Guid CrmkpitargetKpiid { get; set; }

    public string CrmkpitargetEntityTypeCode { get; set; } = null!;

    public Guid? CrmkpitargetEntityId { get; set; }

    public Guid? CrmkpitargetOrgOfficeId { get; set; }

    public decimal CrmkpitargetTargetValue { get; set; }

    public string CrmkpitargetPeriodCode { get; set; } = null!;

    public DateOnly CrmkpitargetEffectiveFrom { get; set; }

    public DateOnly? CrmkpitargetEffectiveTo { get; set; }

    public DateTime CrmkpitargetCreatedAt { get; set; }

    public Guid? CrmkpitargetCreatedBy { get; set; }

    public virtual ICollection<CrmKpiresult> CrmKpiresults { get; set; } = new List<CrmKpiresult>();

    public virtual CmpUser? CrmkpitargetCreatedByNavigation { get; set; }

    public virtual SysCrmkpientityType CrmkpitargetEntityTypeCodeNavigation { get; set; } = null!;

    public virtual CrmKpidefinition CrmkpitargetKpi { get; set; } = null!;

    public virtual CmpOffice? CrmkpitargetOrgOffice { get; set; }
}
