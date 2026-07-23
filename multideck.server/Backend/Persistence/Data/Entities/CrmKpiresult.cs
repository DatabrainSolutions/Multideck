using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmKpiresult
{
    public Guid CrmkpiresultId { get; set; }

    public Guid CrmkpiresultKpiid { get; set; }

    public Guid? CrmkpiresultTargetId { get; set; }

    public string CrmkpiresultEntityTypeCode { get; set; } = null!;

    public Guid? CrmkpiresultEntityId { get; set; }

    public DateOnly CrmkpiresultPeriodStartDate { get; set; }

    public DateOnly CrmkpiresultPeriodEndDate { get; set; }

    public decimal CrmkpiresultResultValue { get; set; }

    public decimal? CrmkpiresultTargetValue { get; set; }

    public string? CrmkpiresultStatusCode { get; set; }

    public string? CrmkpiresultExplanation { get; set; }

    public string CrmkpiresultSourceJson { get; set; } = null!;

    public DateTime CrmkpiresultCalculatedAt { get; set; }

    public virtual SysCrmkpientityType CrmkpiresultEntityTypeCodeNavigation { get; set; } = null!;

    public virtual CrmKpidefinition CrmkpiresultKpi { get; set; } = null!;

    public virtual SysCrmkpiresultStatus? CrmkpiresultStatusCodeNavigation { get; set; }

    public virtual CrmKpitarget? CrmkpiresultTarget { get; set; }
}
