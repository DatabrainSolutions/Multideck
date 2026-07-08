using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmOrgLifecycleTag
{
    public Guid CrmorgLifeTagId { get; set; }

    public Guid CrmorgLifeTagOrgId { get; set; }

    public string CrmorgLifeTagTagCode { get; set; } = null!;

    public string? CrmorgLifeTagSourceTable { get; set; }

    public Guid? CrmorgLifeTagSourceId { get; set; }

    public string? CrmorgLifeTagReason { get; set; }

    public bool CrmorgLifeTagIsActive { get; set; }

    public DateTime CrmorgLifeTagCreatedAt { get; set; }

    public Guid? CrmorgLifeTagCreatedBy { get; set; }

    public virtual CmpUser? CrmorgLifeTagCreatedByNavigation { get; set; }

    public virtual OrgMaster CrmorgLifeTagOrg { get; set; } = null!;

    public virtual SysCrmorgLifecycleTag CrmorgLifeTagTagCodeNavigation { get; set; } = null!;
}
