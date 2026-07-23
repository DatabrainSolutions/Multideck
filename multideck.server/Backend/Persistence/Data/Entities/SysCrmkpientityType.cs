using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmkpientityType
{
    public string CrmkpientityTypeCode { get; set; } = null!;

    public string CrmkpientityTypeName { get; set; } = null!;

    public string? CrmkpientityTypeDescription { get; set; }

    public bool CrmkpientityTypeIsActive { get; set; }

    public int CrmkpientityTypeSortOrder { get; set; }

    public virtual ICollection<CrmKpidefinition> CrmKpidefinitions { get; set; } = new List<CrmKpidefinition>();

    public virtual ICollection<CrmKpiresult> CrmKpiresults { get; set; } = new List<CrmKpiresult>();

    public virtual ICollection<CrmKpitarget> CrmKpitargets { get; set; } = new List<CrmKpitarget>();
}
