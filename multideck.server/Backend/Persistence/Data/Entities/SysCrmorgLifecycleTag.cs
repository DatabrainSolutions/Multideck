using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmorgLifecycleTag
{
    public string CrmorgTagCode { get; set; } = null!;

    public string CrmorgTagName { get; set; } = null!;

    public string? CrmorgTagDescription { get; set; }

    public bool CrmorgTagIsCustomerFacing { get; set; }

    public bool CrmorgTagIsActive { get; set; }

    public int CrmorgTagSortOrder { get; set; }

    public DateTime CrmorgTagCreatedAt { get; set; }

    public virtual ICollection<CrmOrgLifecycleTag> CrmOrgLifecycleTags { get; set; } = new List<CrmOrgLifecycleTag>();
}
