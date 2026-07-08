using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBondedDepositor
{
    public Guid WmsbondDepositorId { get; set; }

    public Guid WmsbondDepositorAuthorisationId { get; set; }

    public Guid WmsbondDepositorOrgId { get; set; }

    public string WmsbondDepositorRoleCode { get; set; } = null!;

    public string? WmsbondDepositorReference { get; set; }

    public bool WmsbondDepositorIsActive { get; set; }

    public DateTime WmsbondDepositorCreatedAt { get; set; }

    public virtual WmsBondedAuthorisation WmsbondDepositorAuthorisation { get; set; } = null!;

    public virtual OrgMaster WmsbondDepositorOrg { get; set; } = null!;
}
