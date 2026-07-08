using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmKpidefinition
{
    public Guid CrmkpiId { get; set; }

    public string CrmkpiCode { get; set; } = null!;

    public string CrmkpiName { get; set; } = null!;

    public string? CrmkpiDescription { get; set; }

    public string CrmkpiEntityTypeCode { get; set; } = null!;

    public string CrmkpiMeasureType { get; set; } = null!;

    public string? CrmkpiUnit { get; set; }

    public bool CrmkpiHigherIsBetter { get; set; }

    public string CrmkpiDefinitionJson { get; set; } = null!;

    public bool CrmkpiIsActive { get; set; }

    public DateTime CrmkpiCreatedAt { get; set; }

    public virtual ICollection<CrmKpiresult> CrmKpiresults { get; set; } = new List<CrmKpiresult>();

    public virtual ICollection<CrmKpitarget> CrmKpitargets { get; set; } = new List<CrmKpitarget>();

    public virtual SysCrmkpientityType CrmkpiEntityTypeCodeNavigation { get; set; } = null!;
}
